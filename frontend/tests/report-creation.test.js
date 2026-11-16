import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import * as Router from "react-router-dom";
import { loadSource } from "./source-loader.js";

async function workspace({ status = "ACTIVE", query = "create=true" } = {}) {
    const slots = [], pending = [], creates = [];
    let cursor = 0, effects = [], params = new URLSearchParams(query), tree;
    const projectId = "00000000-0000-4000-8000-000000000001";
    const hooks = {
        useState(initial) {
            const i = cursor++;
            if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
            return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
        },
        useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
        useEffect(create, deps) {
            const i = cursor++, old = slots[i];
            if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) {
                effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: create() }; });
            }
        },
    };
    const { exports } = await loadSource("pages/admin/DailyReports.jsx", {
        overrides: {
            react: { ...React, ...hooks },
            "react-router-dom": { ...Router, useSearchParams: () => [params, (next) => { params = new URLSearchParams(next); }] },
            "api/projectApi.js": { projectApi: { getProject: async () => ({ id: projectId, status }) } },
            "api/dailyReportApi.js": { dailyReportApi: {
                list: (_id, filters) => filters.date_from
                    ? new Promise((resolve, reject) => pending.push({ filters, resolve, reject }))
                    : Promise.resolve({ results: [], count: 0, summary: { total: 0, drafts: 0, submitted: 0, pending_work: 0 } }),
                create: async (_id, payload) => { creates.push(payload); return { id: "new-draft" }; },
            } },
        },
        append: "\nexport { ProjectReportWorkspace };",
    });
    return {
        pending, creates,
        get params() { return params; },
        get tree() { return tree; },
        render() {
            cursor = 0; effects = [];
            tree = exports.ProjectReportWorkspace({ projectId, role: "SUPERVISOR", user: { id: "supervisor" } });
            effects.forEach((effect) => effect());
        },
        setQuery(value) { params = new URLSearchParams(value); },
        async flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); },
    };
}

test("opening today's existing draft consumes create once and preserves the latest filters", async () => {
    const page = await workspace();
    page.render(); await page.flush(); page.render(); page.render();
    assert.equal(page.pending.length, 1);
    assert(!page.params.has("create"));
    page.setQuery("search=latest"); page.render();
    page.pending[0].resolve({ results: [{ id: "existing-draft", report_date: page.pending[0].filters.date_from }] });
    await page.flush(); page.render(); page.render();
    assert.equal(page.params.get("report"), "existing-draft");
    assert.equal(page.params.get("search"), "latest");
    assert(!page.params.has("create"));
    assert.equal(page.creates.length, 0);
    assert(!JSON.stringify(page.tree).includes("unavailable"));
});

test("new draft creation locks lookup and create against repeated requests", async () => {
    const page = await workspace();
    page.render(); await page.flush(); page.render();
    page.setQuery("create=true"); page.render(); page.render();
    assert.equal(page.pending.length, 1);
    page.pending[0].resolve({ results: [] }); await page.flush(); page.render();
    assert.equal(page.creates.length, 1);
    assert.equal(page.params.get("report"), "new-draft");
    assert(!page.params.has("create"));
});

test("explicit report and correction selections override stale create flags without warnings", async () => {
    for (const selection of ["report=selected", "correct=selected"]) {
        const page = await workspace({ query: `create=true&${selection}` });
        page.render(); await page.flush(); page.render(); page.render();
        assert(!page.params.has("create"));
        assert.equal(page.params.toString(), selection);
        assert.equal(page.pending.length, 0);
        assert.equal(page.creates.length, 0);
        assert(!JSON.stringify(page.tree).includes("unavailable"));
    }
});

test("blocked status explains the actual restriction without creating a draft", async () => {
    const page = await workspace({ status: "ON_HOLD" });
    page.render(); await page.flush(); page.render(); page.render();
    assert.equal(page.pending.length, 0);
    assert.equal(page.creates.length, 0);
    assert.match(JSON.stringify(page.tree), /only be created for ACTIVE or MAINTENANCE/);
    assert(!page.params.has("create"));
});

test("failed lookup preserves the error and allows a clean retry", async () => {
    const page = await workspace({ status: "MAINTENANCE" });
    page.render(); await page.flush(); page.render();
    page.pending[0].reject(new Error("Connection failed")); await page.flush(); page.render();
    assert.match(JSON.stringify(page.tree), /Unable to open today's report draft/);
    assert.equal(page.creates.length, 0);
    page.setQuery("create=true"); page.render(); page.render();
    assert.equal(page.pending.length, 2);
    page.pending[1].resolve({ results: [] }); await page.flush(); page.render();
    assert.equal(page.params.get("report"), "new-draft");
    assert.equal(page.creates.length, 1);
});
