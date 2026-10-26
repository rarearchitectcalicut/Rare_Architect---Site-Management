import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { loadSource } from "./source-loader.js";

const client = { "api/client.js": { api: {} } };
const entry = {
    id: "event", actor_name: "Former Admin", actor_role: "ADMIN", action: "TASK_APPROVED",
    entity_type: "TASK", entity_id: "22222222-2222-2222-2222-222222222222",
    summary: "Approved the slab task.", created_at: "2026-10-26T10:00:00Z",
    metadata: { project_id: "11111111-1111-1111-1111-111111111111", reason: "Scope verified", changes: { title: "Slab" } },
};

test("activity API sends server filters, page and cancellation through the authenticated client", async () => {
    const calls = [];
    const { exports } = await loadSource("api/activityApi.js", { overrides: {
        "api/client.js": { api: { get: async (...args) => { calls.push(args); return { data: [] }; } } },
    } });
    const signal = new AbortController().signal;
    await exports.activityApi.list({ search: "Slab", page: 3, date_from: "2026-10-20" }, signal);
    assert.equal(calls[0][0], "activity/");
    assert.equal(calls[0][1].params.page, 3);
    assert.equal(calls[0][1].params.search, "Slab");
    assert.equal(calls[0][1].signal, signal);
});

test("activity pagination preserves server totals and tolerates unpaginated responses", async () => {
    const { exports } = await loadSource("api/activityApi.js", { overrides: client });
    const page = exports.activityPage({ count: 61, results: [entry], next: "next", previous: "previous" });
    assert.equal(page.count, 61);
    assert.equal(page.next, true);
    assert.equal(page.previous, true);
    assert.equal(exports.activityPage([]).count, 0);
    assert.equal(exports.activityPage([entry]).paginated, false);
    assert.throws(() => exports.activityPage({ results: [], count: -1 }), /Unexpected/);
    assert.throws(() => exports.activityPage({ rows: [] }), /Unexpected/);
});

test("activity events show historical names, readable context and valid Admin task links", async () => {
    const { exports } = await loadSource("components/activity/ActivityEntry.jsx", { overrides: client });
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(exports.default, { entry })));
    for (const content of ["Former Admin", "Approved the slab task.", "Scope verified", "Recorded context", "Event details"]) assert(html.includes(content));
    assert.match(html, /href="\/admin\/projects\/11111111-1111-1111-1111-111111111111\/tasks\/22222222-2222-2222-2222-222222222222"/);
    assert(!html.includes('{&quot;'));
});

test("unavailable actors and unknown event types remain readable without invented links", async () => {
    const { exports } = await loadSource("components/activity/ActivityEntry.jsx", { overrides: client });
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(exports.default, { entry: {
        ...entry, actor_name: null, created_at: null, entity_type: "FUTURE_EVENT", metadata: null,
    } })));
    assert.match(html, /System \/ unavailable user/);
    assert.match(html, /Date unavailable/);
    assert(!html.includes("Open task"));
});

test("new activity filters cancel stale requests and never replace the current result", async () => {
    let slots = [], cursor = 0, effects = [], query = new URLSearchParams();
    const requests = [];
    const hooks = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
        useEffect(create, deps) { const i = cursor++; const previous = slots[i]; if (!previous || deps.some((value, j) => value !== previous.deps[j])) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
    };
    const { exports } = await loadSource("pages/admin/Activity.jsx", { overrides: {
        ...client, react: { ...React, ...hooks },
        "react-router-dom": { Link() {}, useSearchParams: () => [query, (next) => { query = new URLSearchParams(next); }] },
        "api/activityApi.js": {
            activityApi: { list: (params, signal) => new Promise((resolve) => requests.push({ params, signal, resolve })) },
            activityPage: (data) => data,
        },
    }, append: '\nconst AbortController = class { signal = { aborted: false }; abort() { this.signal.aborted = true; } };' });
    function render() { cursor = 0; effects = []; exports.default(); effects.forEach((effect) => effect()); }
    const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
    render();
    query = new URLSearchParams({ search: "new search", page: "2" });
    render();
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(requests[1].params.search, "new search");
    assert.equal(requests[1].params.page, 2);
    requests[1].resolve({ count: 1, rows: [{ id: "current" }] });
    await flush();
    requests[0].resolve({ count: 100, rows: [{ id: "stale" }] });
    await flush();
    assert.equal(slots[1].data.rows[0].id, "current");
    slots.forEach((slot) => slot?.cleanup?.());
});
