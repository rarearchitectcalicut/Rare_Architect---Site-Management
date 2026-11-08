import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const built = new URL("../dist/", import.meta.url);
const workerCode = await readFile(new URL("sw.js", built), "utf8");
const pushCode = await readFile(new URL("push-events.js", built), "utf8");
assert.equal(pushCode, await readFile(new URL("../public/push-events.js", import.meta.url), "utf8"));
const handlers = {}, imported = [], routes = [], precached = [];
let skipped = 0, claimed = 0;
const self = { define() {}, registration: { scope: "https://rare.test/" },
    addEventListener(type, handler) { handlers[type] = handler; },
    skipWaiting() { skipped++; }, clients: { claim() { claimed++; } },
};
const workbox = {
    setCacheNameDetails() {},
    precacheAndRoute(entries) { precached.push(...entries); },
    cleanupOutdatedCaches() {},
    registerRoute(route) { routes.push(route); },
    createHandlerBoundToURL(url) { return url; },
    NavigationRoute: class { constructor(handler, options) { this.handler = handler; this.options = options; } },
    clientsClaim() { claimed++; },
};
const context = vm.createContext({ self, URL,
    define(_dependencies, factory) { factory(workbox); },
    importScripts(name) { imported.push(name); assert.equal(name, "push-events.js"); vm.runInContext(pushCode, context); },
});
vm.runInContext(workerCode, context);
assert.deepEqual(imported, ["push-events.js"]);
assert.equal(typeof handlers.push, "function");
assert.equal(typeof handlers.notificationclick, "function");
assert.equal(skipped, 0, "Worker must still wait for manual update confirmation");
assert.equal(claimed, 0, "Worker must not automatically claim clients");
assert(precached.some((entry) => entry.url === "index.html"));
assert(!precached.some((entry) => /api\/|private|attachments/.test(entry.url)));
assert.equal(routes.length, 1, "Only the existing navigation fallback may be registered");
for (const url of ["/api/v1/notifications/", "/media/private.pdf", "/private_documents/plan.pdf", "/admin/login/"]) {
    assert(!routes[0].options.allowlist.some((pattern) => pattern.test(url)), url);
}
assert(routes[0].options.allowlist.some((pattern) => pattern.test("/admin/notifications")));
handlers.message({ data: { type: "UNRELATED" } });
assert.equal(skipped, 0);
handlers.message({ data: { type: "SKIP_WAITING" } });
assert.equal(skipped, 1, "Manual update message must remain supported");
console.log("Built worker verified: one imported push handler, manual updates, public precache and restricted navigation fallback.");
