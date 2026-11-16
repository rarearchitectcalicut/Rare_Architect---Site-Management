import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { loadSource } from "./source-loader.js";

function hooksHarness() {
    const slots = [], effects = [];
    let cursor = 0, mounted = true, lateWrites = 0;
    const changed = (a, b) => !a || b.some((value, i) => value !== a[i]);
    return {
        hooks: {
            useState(initial) {
                const i = cursor++;
                if (!slots[i]) {
                    const slot = { value: typeof initial === "function" ? initial() : initial };
                    slot.set = (next) => { if (!mounted) lateWrites++; slot.value = typeof next === "function" ? next(slot.value) : next; };
                    slots[i] = slot;
                }
                return [slots[i].value, slots[i].set];
            },
            useRef(initial) { return slots[cursor++] ??= { current: initial }; },
            useCallback(value, deps) {
                const i = cursor++;
                if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value };
                return slots[i].value;
            },
            useMemo(create, deps) {
                const i = cursor++;
                if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: create() };
                return slots[i].value;
            },
            useEffect(create, deps) {
                const i = cursor++;
                if (changed(slots[i]?.deps, deps)) effects.push(() => {
                    slots[i]?.cleanup?.();
                    slots[i] = { deps, create, cleanup: create() };
                });
            },
        },
        render(create) { cursor = 0; const tree = create(); while (effects.length) effects.shift()(); return tree; },
        replayEffects() { slots.forEach((slot) => { if (slot?.create) { slot.cleanup?.(); slot.cleanup = slot.create(); } }); },
        unmount() { slots.forEach((slot) => slot?.cleanup?.()); mounted = false; },
        get lateWrites() { return lateWrites; },
    };
}

function find(node, predicate) {
    if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
    if (!node || typeof node !== "object") return undefined;
    return predicate(node) ? node : find(node.props?.children, predicate);
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const user = { id: "supervisor", role: "SUPERVISOR", must_change_password: true };

async function authHarness(getMe, refresh = "valid-refresh") {
    const state = hooksHarness();
    let tree, clears = 0, requests = 0, handler;
    const { exports } = await loadSource("context/AuthContext.jsx", { overrides: {
        react: { ...React, ...state.hooks },
        "api/authApi.js": { authApi: {
            getMe: () => { requests++; return getMe(); },
            login: async () => ({ access: "new-access", refresh: "new-refresh" }),
            logout: async () => { throw new Error("Offline logout"); },
        } },
        "api/client.js": {
            getRefreshToken: () => refresh,
            setAuthTokens: (tokens) => { refresh = tokens.refresh; },
            clearAuthTokens: () => { clears++; refresh = null; },
            setUnauthorizedHandler: (value) => { handler = value; },
        },
        "utils/pushNotifications.js": { disableDevicePush: async () => {} },
    }, append: "\nconst console = { error() {} };" });
    const ui = {
        render() { tree = state.render(() => exports.AuthProvider({ children: "protected children" })); return tree; },
        find: (predicate) => find(tree, predicate),
        get value() { return tree.props.value; },
        get refresh() { return refresh; },
        get clears() { return clears; },
        get requests() { return requests; },
        get handler() { return handler; },
        state,
    };
    ui.render();
    return ui;
}

for (const status of [undefined, 403, 429, 500, 503]) {
    test(`session restoration failure ${status ?? "network"} retains tokens and retries without exposing protected content`, async () => {
        let fail = true;
        const ui = await authHarness(async () => {
            if (fail) throw status ? { response: { status } } : new Error("Offline");
            return user;
        });
        await flush(); ui.render();
        assert.equal(ui.clears, 0);
        assert.equal(ui.refresh, "valid-refresh");
        assert.equal(ui.value.isAuthenticated, false);
        assert(ui.find((node) => node.props?.role === "alert"));
        assert.notEqual(ui.render().props.children, "protected children");
        fail = false;
        ui.find((node) => node.type === "button" && node.props.children === "Retry").props.onClick();
        ui.render(); await flush(); ui.render();
        assert.equal(ui.requests, 2);
        assert.equal(ui.value.user, user);
        assert.equal(ui.value.user.must_change_password, true);
        assert.equal(ui.render().props.children, "protected children");
        ui.state.unmount();
    });
}

test("401 restoration and invalid roles still clear authentication", async () => {
    for (const result of ["401", "invalid-role"]) {
        const ui = await authHarness(async () => {
            if (result === "401") throw { response: { status: 401 } };
            return { ...user, role: "UNSUPPORTED" };
        });
        await flush(); ui.render();
        assert.equal(ui.clears, 1);
        assert.equal(ui.refresh, null);
        assert.equal(ui.value.user, null);
        assert.equal(ui.find((node) => node.props?.role === "alert"), undefined);
        ui.state.unmount();
    }
});

test("explicit sign out from restoration recovery clears tokens even when backend logout fails", async () => {
    const ui = await authHarness(async () => { throw new Error("Offline"); });
    await flush(); ui.render();
    await ui.find((node) => node.type === "button" && node.props.children === "Sign out").props.onClick();
    ui.render();
    assert.equal(ui.refresh, null);
    assert.equal(ui.value.isAuthenticated, false);
    assert.equal(ui.find((node) => node.props?.role === "alert"), undefined);
    ui.state.unmount();
});

test("profile failure after successful login retains newly issued tokens and can recover", async () => {
    let fail = true;
    const ui = await authHarness(async () => { if (fail) throw { response: { status: 503 } }; return user; }, null);
    await flush(); ui.render();
    await assert.rejects(ui.value.login("1234567890", "password"));
    ui.render();
    assert.equal(ui.refresh, "new-refresh");
    assert.equal(ui.clears, 0);
    assert.equal(ui.value.isAuthenticated, false);
    fail = false;
    ui.find((node) => node.type === "button" && node.props.children === "Retry").props.onClick();
    ui.render(); await flush(); ui.render();
    assert.equal(ui.value.user, user);
    ui.state.unmount();
});

test("restoration shares Strict Mode requests and ignores results after unmount", async () => {
    let resolve;
    const ui = await authHarness(() => new Promise((done) => { resolve = done; }));
    ui.state.replayEffects();
    assert.equal(ui.requests, 1);
    ui.state.unmount();
    resolve(user); await flush();
    assert.equal(ui.state.lateWrites, 0);
    assert.equal(ui.handler, null);
});

test("a visitor without saved tokens does not request a profile", async () => {
    const ui = await authHarness(async () => user, null);
    await flush(); ui.render();
    assert.equal(ui.requests, 0);
    assert.equal(ui.value.isAuthenticated, false);
    assert.equal(ui.find((node) => node.props?.role === "alert"), undefined);
    ui.state.unmount();
});
