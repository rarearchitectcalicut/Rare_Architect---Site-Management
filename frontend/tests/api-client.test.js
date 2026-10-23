import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import axios from "axios";

async function createClient(adapter) {
    const context = vm.createContext({
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    });
    const axiosModule = new vm.SyntheticModule(["default"], function () {
        this.setExport("default", {
            create: (config) => axios.create({ ...config, adapter }),
        });
    }, { context });
    const source = await readFile(new URL("../src/api/client.js", import.meta.url), "utf8");
    const module = new vm.SourceTextModule(source, {
        context,
        initializeImportMeta: (meta) => { meta.env = { VITE_API_BASE_URL: "https://api.test/" }; },
    });
    await module.link(() => axiosModule);
    await module.evaluate();
    module.namespace.setAuthTokens({ access: "expired", refresh: "refresh-token" });
    return module.namespace;
}

function unauthorized(config) {
    return new axios.AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, {
        status: 401, data: { detail: "Token is invalid or expired" }, config,
    });
}

function response(config, data) {
    return { status: 200, data, config, headers: {}, statusText: "OK" };
}

test("refreshes an expired token and retries the task change request with its payload", async () => {
    let refreshes = 0;
    const client = await createClient(async (config) => {
        if (config.url === "auth/refresh/") {
            refreshes++;
            return response(config, { access: "renewed" });
        }
        if (config.headers.Authorization === "Bearer expired") throw unauthorized(config);
        assert.equal(config.headers.Authorization, "Bearer renewed");
        assert.deepEqual(JSON.parse(config.data), {
            new_values: { title: "Revised task" }, reason: "Correction",
        });
        return response(config, { id: "request-id" });
    });
    const result = await client.api.post("tasks/task-id/change-requests/", {
        new_values: { title: "Revised task" }, reason: "Correction",
    });
    assert.equal(result.data.id, "request-id");
    assert.equal(refreshes, 1);
});

test("a delayed notification 401 reuses the renewed token without another refresh", async () => {
    let refreshes = 0;
    let rejectNotification;
    let notificationStarted;
    const started = new Promise((resolve) => { notificationStarted = resolve; });
    const client = await createClient(async (config) => {
        if (config.url === "auth/refresh/") {
            refreshes++;
            return response(config, { access: "renewed" });
        }
        if (config.headers.Authorization === "Bearer expired") {
            if (config.url === "notifications/unread-count/") {
                notificationStarted();
                return new Promise((_, reject) => {
                    rejectNotification = () => reject(unauthorized(config));
                });
            }
            throw unauthorized(config);
        }
        assert.equal(config.headers.Authorization, "Bearer renewed");
        return response(config, {});
    });
    const notification = client.api.get("notifications/unread-count/");
    await started;
    await client.api.post("tasks/task-id/change-requests/", {});
    rejectNotification();
    await notification;
    assert.equal(refreshes, 1);
});

test("ends the session if the renewed token is also rejected, without looping", async () => {
    let refreshes = 0;
    let sessionCleared = 0;
    const client = await createClient(async (config) => {
        if (config.url === "auth/refresh/") {
            refreshes++;
            return response(config, { access: "renewed" });
        }
        throw unauthorized(config);
    });
    client.setUnauthorizedHandler(() => { sessionCleared++; });
    await assert.rejects(client.api.post("tasks/task-id/change-requests/", {}));
    assert.equal(refreshes, 1);
    assert.equal(sessionCleared, 1);
    assert.equal(client.getRefreshToken(), null);
});
