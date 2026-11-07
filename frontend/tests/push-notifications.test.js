import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import { loadSource } from "./source-loader.js";

const publicKey = Buffer.from([4, ...Array(64).fill(1)]).toString("base64url");

async function device(options = {}) {
    const calls = [];
    let browserSubscription = options.existing ? subscription() : null;
    function subscription() {
        return {
            endpoint: "https://fcm.googleapis.com/fcm/send/test-device",
            toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "test", auth: "test" }, expirationTime: null }; },
            unsubscribe: async () => { calls.push("unsubscribe"); browserSubscription = null; return true; },
            ...options.subscription,
        };
    }
    const worker = { scope: "https://rare.test/", active: {}, pushManager: {
        getSubscription: async () => browserSubscription,
        subscribe: async (value) => { calls.push(["subscribe", value]); return browserSubscription = subscription(); },
    } };
    const Notification = { permission: options.denied ? "denied" : "granted", requestPermission: async () => {
        calls.push("permission"); return options.denied ? "denied" : "granted";
    } };
    const navigator = {
        userAgent: options.ios ? "iPhone" : "Android", platform: "", maxTouchPoints: 1,
        standalone: Boolean(options.installed), onLine: !options.offline,
        serviceWorker: { getRegistration: async () => options.noWorker ? undefined : worker, ready: Promise.resolve(worker) },
    };
    const api = {
        publicKey: async () => { calls.push("key"); return { public_key: publicKey }; },
        register: async (value) => { calls.push(["register", value]); if (options.registerError) throw options.registerError; return { enabled: true }; },
        status: async () => { calls.push("status"); return { enabled: !options.unowned }; },
        remove: async (endpoint) => { calls.push(["remove", endpoint]); if (options.removeError) throw options.removeError; },
        ...options.api,
    };
    const context = vm.createContext({ navigator, Notification,
        window: { isSecureContext: !options.insecure, matchMedia: () => ({ matches: Boolean(options.installed) }), PushManager: {}, Notification },
        setTimeout, clearTimeout, Uint8Array, atob,
    });
    const module = new vm.SourceTextModule(await readFile(new URL("../src/utils/pushNotifications.js", import.meta.url), "utf8"), {
        context, initializeImportMeta: (meta) => { meta.env = { BASE_URL: "/" }; },
    });
    await module.link(() => new vm.SyntheticModule(["pushApi"], function () { this.setExport("pushApi", api); }, { context }));
    await module.evaluate();
    return { api: module.namespace, calls, worker, context };
}

test("reading device status never prompts; enabling requests permission directly and registers once", async () => {
    const ui = await device();
    assert.equal((await ui.api.currentPushState()).enabled, false);
    assert.equal(ui.calls.length, 0);
    const pending = ui.api.enableDevicePush();
    assert.equal(ui.calls[0], "permission");
    assert.equal((await pending).enabled, true);
    const subscribe = ui.calls.find((value) => value[0] === "subscribe")[1];
    assert.equal(subscribe.userVisibleOnly, true);
    assert.equal(subscribe.applicationServerKey.length, 65);
    assert.equal(ui.calls.filter((value) => value[0] === "register").length, 1);
});

test("existing device is reassociated through authenticated API without another browser subscription", async () => {
    const ui = await device({ existing: true, unowned: true });
    assert.equal((await ui.api.currentPushState()).enabled, false);
    assert.equal((await ui.api.enableDevicePush()).enabled, true);
    assert(!ui.calls.some((value) => value[0] === "subscribe"));
    assert.equal(ui.calls.filter((value) => value[0] === "register").length, 1);
});

test("iPhone installation, offline, insecure context and denied permission prevent registration", async () => {
    for (const options of [{ ios: true }, { offline: true }, { insecure: true }, { denied: true }, { noWorker: true }]) {
        const ui = await device(options);
        await assert.rejects(ui.api.enableDevicePush());
        assert(!ui.calls.some((value) => value[0] === "register"));
        if (options.ios) assert.match(ui.api.pushSupport(), /Home Screen/);
    }
    assert.equal((await device({ ios: true, installed: true })).api.pushSupport(), "");
});

test("disable attempts both server revocation and browser unsubscribe even when API is offline", async () => {
    const ui = await device({ existing: true, removeError: new Error("offline") });
    await assert.rejects(ui.api.disableDevicePush(), /cleanup/);
    assert(ui.calls.some((value) => value[0] === "remove"));
    assert(ui.calls.includes("unsubscribe"));
});

test("expired-session cleanup unsubscribes locally without making another authenticated request", async () => {
    const ui = await device({ existing: true });
    await ui.api.disableDevicePush({ localOnly: true });
    assert.deepEqual(ui.calls, ["unsubscribe"]);
    await ui.api.disableDevicePush();
    assert.deepEqual(ui.calls, ["unsubscribe"]);
});

test("failed registration removes a new browser subscription and attempts backend cleanup", async () => {
    const ui = await device({ registerError: new Error("failed save") });
    await assert.rejects(ui.api.enableDevicePush(), /failed save/);
    assert(ui.calls.includes("unsubscribe"));
    assert(ui.calls.some((value) => value[0] === "remove"));
});

test("logout cancels an enable operation waiting for configuration before subscribing", async () => {
    let resolve;
    const ui = await device({ api: { publicKey: () => new Promise((done) => { resolve = done; }) } });
    const enabling = ui.api.enableDevicePush();
    while (!resolve) await Promise.resolve();
    await ui.api.disableDevicePush({ localOnly: true });
    resolve({ public_key: publicKey });
    await assert.rejects(enabling, /cancelled/);
    assert(!ui.calls.some((value) => value[0] === "register" || value[0] === "subscribe"));
});

test("rotated application key asks for disable/enable instead of falsely reporting successful setup", async () => {
    const ui = await device({ existing: true, subscription: { options: { applicationServerKey: new Uint8Array(65).buffer } } });
    await assert.rejects(ui.api.enableDevicePush(), /key changed/);
    assert(!ui.calls.some((value) => value[0] === "register"));
});

test("logout still clears local authentication when both device cleanup and backend logout fail", async () => {
    const calls = [];
    const { exports } = await loadSource("context/AuthContext.jsx", { overrides: {
        react: { ...React, useState: (initial) => [initial, () => {}], useRef: (initial) => ({ current: initial }),
            useEffect() {}, useCallback: (callback) => callback, useMemo: (callback) => callback() },
        "api/client.js": { clearAuthTokens: () => calls.push("clear"), getRefreshToken: () => "test-refresh",
            setAuthTokens() {}, setUnauthorizedHandler() {} },
        "api/authApi.js": { authApi: { logout: async () => { calls.push("logout"); throw new Error("offline"); } } },
        "utils/pushNotifications.js": { disableDevicePush: async (options) => {
            calls.push(options?.localOnly ? "local unsubscribe" : "server and browser revoke"); throw new Error("offline");
        } },
        "components/LoadingScreen.jsx": { default: () => null },
    } });
    const tree = exports.AuthProvider({ children: null });
    await tree.props.value.logout();
    assert.deepEqual(calls, ["server and browser revoke", "logout", "local unsubscribe", "clear"]);
});

async function serviceWorker(scope = "https://rare.test/") {
    const handlers = {}, shown = [], opened = [];
    const self = { registration: { scope, showNotification: async (...args) => shown.push(args) },
        addEventListener: (type, handler) => { handlers[type] = handler; },
        clients: { matchAll: async () => [], openWindow: async (url) => opened.push(url) },
    };
    vm.runInNewContext(await readFile(new URL("../public/push-events.js", import.meta.url), "utf8"), { self, URL });
    return { handlers, shown, opened, self,
        async push(data) { let pending; handlers.push({ data: { json: () => data }, waitUntil: (promise) => { pending = promise; } }); await pending; },
        async click(url) { let pending; handlers.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: (promise) => { pending = promise; } }); await pending; },
    };
}

test("push handler shows generic content, tags by notification ID and ignores external payload URLs", async () => {
    const sw = await serviceWorker("https://rare.test/work/");
    await sw.push({ id: "12345678-1234-1234-1234-123456789012", title: "PRIVATE", body: "JWT SECRET", destination: "https://evil.test" });
    const [title, options] = sw.shown[0];
    assert.equal(title, "RARE");
    assert(!JSON.stringify(options).includes("SECRET"));
    assert.equal(options.tag, "rare-notification:12345678-1234-1234-1234-123456789012");
    assert.equal(options.data.url, "https://rare.test/work/");
    await sw.click("javascript:alert(1)");
    assert.deepEqual(sw.opened, ["https://rare.test/work/"]);
});

test("notification click focuses an existing app window and navigates only to an allowed internal page", async () => {
    const sw = await serviceWorker();
    const navigated = [], focused = [];
    sw.self.clients.matchAll = async () => [{ url: "https://rare.test/admin/dashboard", navigate: async (url) => {
        navigated.push(url); return { focus: async () => focused.push(true) };
    } }];
    await sw.push({ destination: "admin/notifications" });
    await sw.click(sw.shown[0][1].data.url);
    assert.deepEqual(navigated, ["https://rare.test/admin/notifications"]);
    assert.equal(focused.length, 1);
    assert.equal(sw.opened.length, 0);
});

test("malformed push still shows a generic notification and foreign windows are never navigated", async () => {
    const sw = await serviceWorker();
    let pending;
    sw.handlers.push({ data: { json() { throw new Error("malformed"); } }, waitUntil: (value) => { pending = value; } });
    await pending;
    assert.equal(sw.shown.length, 1);
    sw.self.clients.matchAll = async () => [{ url: "https://evil.test/" }];
    await sw.click("https://evil.test/admin/notifications");
    assert.deepEqual(sw.opened, ["https://rare.test/"]);
});
