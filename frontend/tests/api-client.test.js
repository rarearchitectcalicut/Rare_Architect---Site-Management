import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import axios from "axios";

async function createClient(adapter, { baseUrl = "https://api.test/", dev = false } = {}) {
    const context = vm.createContext({
        URL,
        location: { origin: "http://localhost:5173" },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    });
    const axiosModule = new vm.SyntheticModule(["default"], function () {
        this.setExport("default", {
            create: (config) => axios.create({ ...config, adapter }),
        });
    }, { context });
    const source = await readFile(new URL("../src/api/client.js", import.meta.url), "utf8");
    const module = new vm.SourceTextModule(source, {
        context,
        initializeImportMeta: (meta) => { meta.env = { VITE_API_BASE_URL: baseUrl, DEV: dev }; },
    });
    await module.link(() => axiosModule);
    await module.evaluate();
    module.namespace.setAuthTokens({ access: "expired", refresh: "refresh-token" });
    return module.namespace;
}

test("routes a local development API through the Vite proxy", async () => {
    let requestBaseUrl;
    const client = await createClient(async (config) => {
        requestBaseUrl = config.baseURL;
        return response(config, {});
    }, { baseUrl: "http://127.0.0.1:8000/api/v1/", dev: true });

    await client.api.get("projects/");

    assert.equal(requestBaseUrl, "/api/v1/");
});

test("keeps the configured API URL for production builds", async () => {
    let requestBaseUrl;
    const client = await createClient(async (config) => {
        requestBaseUrl = config.baseURL;
        return response(config, {});
    }, { baseUrl: "http://127.0.0.1:8000/api/v1/" });

    await client.api.get("projects/");

    assert.equal(requestBaseUrl, "http://127.0.0.1:8000/api/v1/");
});

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

for (const failure of ["network", "timeout", 429, 500, 503, 403, "malformed"]) {
    test(`refresh ${failure} preserves tokens and an explicit retry can recover`, async () => {
        let fail = true, cleared = 0, refreshes = 0;
        const client = await createClient(async (config) => {
            if (config.url === "auth/refresh/") {
                refreshes++;
                if (fail) {
                    if (failure === "malformed") return response(config, {});
                    throw new axios.AxiosError("Temporary failure", failure === "timeout" ? "ECONNABORTED" : "ERR_NETWORK", config, null,
                        typeof failure === "number" ? { status: failure, data: {}, config } : undefined);
                }
                return response(config, { access: "renewed" });
            }
            if (config.headers.Authorization === "Bearer expired") throw unauthorized(config);
            return response(config, { recovered: true });
        });
        client.setUnauthorizedHandler(() => cleared++);
        await assert.rejects(client.api.get("projects/"));
        assert.equal(client.getRefreshToken(), "refresh-token");
        assert.equal(cleared, 0);
        fail = false;
        assert.equal((await client.api.get("projects/")).data.recovered, true);
        assert.equal(refreshes, 2);
    });
}

test("a definitively rejected refresh clears authentication", async () => {
    let cleared = 0;
    const client = await createClient(async (config) => { throw unauthorized(config); });
    client.setUnauthorizedHandler(() => cleared++);
    await assert.rejects(client.api.get("projects/"));
    assert.equal(client.getRefreshToken(), null);
    assert.equal(cleared, 1);
});

test("failed refresh from a previous session cannot clear newer credentials", async () => {
    let rejectRefresh, started;
    const ready = new Promise((resolve) => { started = resolve; });
    const client = await createClient(async (config) => {
        if (config.url === "auth/refresh/") {
            started();
            return new Promise((_, reject) => { rejectRefresh = () => reject(unauthorized(config)); });
        }
        throw unauthorized(config);
    });
    const pending = client.api.get("projects/");
    await ready;
    client.setAuthTokens({ access: "new-session", refresh: "new-refresh" });
    rejectRefresh();
    await assert.rejects(pending);
    assert.equal(client.getRefreshToken(), "new-refresh");
});
