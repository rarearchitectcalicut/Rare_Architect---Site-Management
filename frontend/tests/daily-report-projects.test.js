import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { loadSource } from "./source-loader.js";

async function picker() {
    const slots = [], requests = [];
    let cursor = 0, effects = [], query = new URLSearchParams();
    const hooks = {
        useState(initial) {
            const i = cursor++;
            if (!(i in slots)) slots[i] = initial;
            return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
        },
        useEffect(create, deps) {
            const i = cursor++, previous = slots[i];
            if (!previous || deps.some((value, j) => value !== previous.deps[j])) {
                effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: create() }; });
            }
        },
    };
    const { exports } = await loadSource("components/daily-reports/ReportProjectPicker.jsx", {
        overrides: {
            react: { ...React, ...hooks },
            "react-router-dom": {
                ...(await import("react-router-dom")),
                useSearchParams: () => [query, (value) => { query = new URLSearchParams(value); }],
            },
            "api/projectApi.js": { projectApi: { getProjects: (params, signal) => new Promise((resolve, reject) => requests.push({ params, signal, resolve, reject })) } },
            "hooks/useApprovalReview.js": { validationMessage: (error, fallback) => error.message || fallback },
        },
        append: '\nconst AbortController = class { signal = { aborted: false }; abort() { this.signal.aborted = true; } };',
    });
    return {
        requests,
        setQuery(value) { query = new URLSearchParams(value); },
        render(role = "SUPERVISOR") {
            cursor = 0; effects = [];
            const tree = exports.default({ role });
            effects.forEach((effect) => effect());
            return renderToStaticMarkup(React.createElement(MemoryRouter, null, tree));
        },
        async flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); },
    };
}

test("supervisor reports load assigned projects and link to the existing report workflow", async () => {
    const page = await picker();
    assert.match(page.render(), /Loading projects/);
    assert.equal(page.requests[0].params.page_size, 25);
    page.requests[0].resolve({ results: [{ id: "site-1", name: "First Site" }], count: 1, next: null, previous: null });
    await page.flush();
    const html = page.render();
    assert.match(html, /href="\/supervisor\/projects\/site-1\/daily-reports"/);
    assert.match(html, /continue a draft/);
    assert(!html.includes("/admin/"));
});

test("search and pagination cancel stale requests and preserve the newest result", async () => {
    const page = await picker();
    page.render();
    page.setQuery({ search: "New site", page: "2" });
    page.render();
    assert.equal(page.requests[0].signal.aborted, true);
    assert.equal(page.requests[1].params.search, "New site");
    assert.equal(page.requests[1].params.page, 2);
    page.requests[1].resolve({ results: [{ id: "new", name: "New site" }], count: 26, previous: "previous", next: null });
    await page.flush();
    page.requests[0].resolve([{ id: "old", name: "Old site" }]);
    await page.flush();
    const html = page.render();
    assert.match(html, /Page 2 of 2/);
    assert.match(html, /\/projects\/new\/daily-reports/);
    assert(!html.includes("Old site"));
});

test("empty assignments and request failures provide clear recovery states", async () => {
    const page = await picker();
    page.render();
    page.requests[0].resolve([]);
    await page.flush();
    assert.match(page.render(), /No projects assigned yet/);
    page.setQuery({ search: "site" });
    page.render();
    page.requests[1].reject(new Error("Connection failed"));
    await page.flush();
    const html = page.render();
    assert.match(html, /role="alert"/);
    assert.match(html, /Connection failed/);
    assert.match(html, /Retry/);
});

test("the shared admin picker keeps admin report and verification links", async () => {
    const page = await picker();
    page.render("ADMIN");
    page.requests[0].resolve([{ id: "site-1", name: "First Site" }]);
    await page.flush();
    const html = page.render("ADMIN");
    assert.match(html, /href="\/admin\/projects\/site-1\/daily-reports"/);
    assert.match(html, /href="\/admin\/approvals\?tab=work"/);
});
