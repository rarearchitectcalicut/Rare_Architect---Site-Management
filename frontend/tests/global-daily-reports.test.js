import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { loadSource } from "./source-loader.js";
import { getNavigation } from "../src/config/navigation.js";

async function harness(role = "ADMIN") {
    const slots = [], requests = [];
    let cursor = 0, effects = [], query = new URLSearchParams();
    const hooks = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
        useEffect(create, deps) { const i = cursor++, previous = slots[i]; if (!previous || deps.some((value, j) => value !== previous.deps[j])) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
    };
    const { exports } = await loadSource("pages/admin/GlobalDailyReports.jsx", { overrides: {
        react: { ...React, ...hooks },
        "react-router-dom": { ...(await import("react-router-dom")), useSearchParams: () => [query, (value) => { query = typeof value === "function" ? value(query) : new URLSearchParams(value); }] },
        "api/dailyReportApi.js": { dailyReportApi: {
            register: (params, signal) => new Promise((resolve, reject) => requests.push({ kind: "admin", params, signal, resolve, reject })),
            myRegister: (params, signal) => new Promise((resolve, reject) => requests.push({ kind: "supervisor", params, signal, resolve, reject })),
        } },
    } });
    return { requests, setQuery(value) { query = new URLSearchParams(value); },
        render() { cursor = 0; effects = []; const tree = exports.default({ role }); effects.forEach((effect) => effect()); return renderToStaticMarkup(React.createElement(MemoryRouter, null, tree)); },
        async flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); },
    };
}
const response = { count: 1, next: null, previous: null, summary: { submitted: 1, pending_work: 2 }, projects: [], reporters: [], results: [{ id: "report-one", project: "site-one", project_name: "Cedar Residence", report_date: "2026-11-17", reported_by_name: "Site Supervisor", work_summary: "Walls measured", work_entry_count: 2, work_counts: { pending: 2 } }] };

test("Admin daily reports load report records directly and link to the existing detail workflow", async () => {
    const ui = await harness();
    assert.match(ui.render(), /Loading report records/);
    assert.equal(ui.requests[0].params.page_size, 25);
    ui.requests[0].resolve(response); await ui.flush();
    const html = ui.render();
    assert.match(html, /aria-label="Choose project"/);
    assert.match(html, /All projects/);
    assert.match(html, /rare-report-project-name/);
    for (const text of ["Cedar Residence", "Walls measured", "Site Supervisor", "1 matching report"]) assert(html.includes(text));
    assert.match(html, /href="\/admin\/projects\/site-one\/daily-reports\?report=report-one"/);
    assert(!html.includes("Choose a project"));
});

test("global filters use server parameters, cancel stale responses and retain page/filter scope", async () => {
    const ui = await harness(); ui.render();
    ui.setQuery({ search: "Walls", project_filter: "site-one", reported_by: "supervisor", page: "2", sort: "oldest" }); ui.render();
    assert(ui.requests[0].signal.aborted);
    assert.equal(ui.requests[1].params.project, "site-one");
    assert.equal(ui.requests[1].params.search, "Walls");
    assert.equal(ui.requests[1].params.page, 2);
    assert.equal(ui.requests[1].params.sort, "oldest");
    ui.requests[1].resolve(response); await ui.flush(); ui.render();
    ui.requests[0].resolve({ ...response, results: [{ ...response.results[0], project_name: "Stale project" }] }); await ui.flush();
    assert(!ui.render().includes("Stale project"));
});

test("report loading errors preserve filters and expose retry", async () => {
    const ui = await harness(); ui.setQuery({ search: "Retained" }); ui.render();
    ui.requests[0].reject(new Error("Network failed")); await ui.flush();
    const html = ui.render();
    assert.match(html, /role="alert"/); assert.match(html, /Retry/); assert.match(html, /value="Retained"/);
});

test("Admin and Supervisor navigation omit global Documents while retaining report navigation", () => {
    assert(!getNavigation("ADMIN").some((item) => item.path === "/admin/documents"));
    assert(!getNavigation("SUPERVISOR").some((item) => item.path === "/supervisor/documents"));
    assert(getNavigation("ADMIN").some((item) => item.path === "/admin/reports"));
});

test("Supervisor report register uses personal API and real draft/detail links without Admin actions", async () => {
    const ui = await harness("SUPERVISOR"); ui.render();
    assert.equal(ui.requests[0].kind, "supervisor");
    ui.requests[0].resolve({ ...response, summary: { submitted: 0, drafts: 1, pending_work: 0 }, results: [{ ...response.results[0], status: "DRAFT" }] }); await ui.flush();
    const html = ui.render();
    assert.ok(html.includes('href="/supervisor/projects/site-one/daily-reports?report=report-one"'));
    for (const label of ["New report", "Draft", "Choose project", "Report status", "drafts across assigned projects"]) assert.ok(html.includes(label));
    assert.ok(!html.includes("/admin/"));
    assert.ok(!html.includes("All supervisors"));
});

test("Supervisor project/status/sort filters are sent to the personal endpoint and cancel prior requests", async () => {
    const ui = await harness("SUPERVISOR"); ui.render();
    ui.setQuery({ project_filter: "my-site", status: "DRAFT", sort: "oldest", page: "2" }); ui.render();
    assert.ok(ui.requests[0].signal.aborted);
    assert.equal(ui.requests[1].kind, "supervisor");
    assert.deepEqual(JSON.parse(JSON.stringify(ui.requests[1].params)), { project: "my-site", status: "DRAFT", sort: "oldest", page: 2, page_size: 25 });
});
