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

async function searchControl(initial = {}) {
    const slots = [], jobs = new Map(), calls = [], navigations = [];
    let cursor = 0, effects = [], serial = 0, tree;
    let props = { query: "", onSearch: (value) => calls.push(value), ...initial };
    const hooks = {
        useState(value) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = value;
            return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
        },
        useRef(value) { const index = cursor++; return slots[index] ||= { current: value }; },
        useId: () => "search-test",
        useEffect(create, deps) {
            const index = cursor++, previous = slots[index];
            if (!previous || deps.some((value, i) => value !== previous.deps[i])) effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: create() }; });
        },
    };
    const { exports } = await loadSource("components/daily-reports/ReportProjectPicker.jsx", {
        overrides: { react: { ...React, ...hooks }, "react-router-dom": { useNavigate: () => (to) => navigations.push(to) }, "api/projectApi.js": { projectApi: {} } },
        append: `
            export let schedule, cancel;
            export function timers(add, remove) { schedule = add; cancel = remove; }
            const setTimeout = (callback, delay) => schedule(callback, delay);
            const clearTimeout = (id) => cancel(id);
        `,
    });
    exports.timers((callback, delay) => { const id = ++serial; jobs.set(id, { callback, delay }); return id; }, (id) => jobs.delete(id));
    function draw(next = {}) {
        props = { ...props, ...next }; cursor = 0; effects = [];
        tree = exports.ProjectSearch(props); effects.forEach((effect) => effect());
        return tree;
    }
    function nodes(node) {
        if (Array.isArray(node)) return node.flatMap(nodes);
        if (!node || typeof node !== "object") return [];
        return [node, ...nodes(node.props?.children)];
    }
    draw();
    return {
        draw, calls, jobs, navigations,
        input: () => nodes(tree).find((node) => node.type === "input"),
        options: () => nodes(tree).filter((node) => node.props?.role === "option"),
        clear: () => nodes(tree).find((node) => node.type === "button" && node.props["aria-label"]?.startsWith("Clear")),
        type(value) { this.input().props.onChange({ target: { value } }); draw(); },
        key(key) { this.input().props.onKeyDown({ key, preventDefault() {} }); draw(); },
        tick() { const pending = [...jobs.values()]; jobs.clear(); pending.forEach((job) => job.callback()); draw(); },
        cleanup() { slots.forEach((slot) => slot?.cleanup?.()); },
    };
}

test("live search debounces rapid typing once, preserves input and suppresses stale suggestions", async () => {
    const ui = await searchControl({ suggestions: [{ id: "old", name: "Old site" }] });
    ui.type("N"); ui.type("Ne"); ui.type("New");
    assert.equal(ui.calls.length, 0); assert.equal(ui.jobs.size, 1);
    assert.equal([...ui.jobs.values()][0].delay, 300);
    assert.equal(ui.input().props.value, "New"); assert.equal(ui.options().length, 0);
    ui.tick(); assert.deepEqual(ui.calls, ["New"]);
    ui.key("Enter"); assert.equal(ui.calls.length, 1);
    ui.draw({ query: "New", suggestions: [{ id: "new", name: "New site" }] });
    assert.equal(ui.options().length, 1); ui.cleanup();
});

test("autocomplete limits real matches, supports both arrow directions, Enter and Escape", async () => {
    const suggestions = Array.from({ length: 9 }, (_, index) => ({ id: index, name: `Site ${index}`, context: "Project" }));
    const ui = await searchControl({ query: "Site", suggestions });
    ui.input().props.onFocus(); ui.draw(); assert.equal(ui.options().length, 6);
    ui.key("ArrowUp"); assert.equal(ui.input().props["aria-activedescendant"], "search-test-5");
    ui.key("ArrowDown"); assert.equal(ui.input().props["aria-activedescendant"], "search-test-0");
    ui.key("Enter"); assert.deepEqual(ui.calls, ["Site 0"]);
    assert.equal(ui.input().props["aria-expanded"], false);
    ui.draw({ query: "Site 0" }); ui.key("ArrowDown"); ui.key("Escape");
    assert.equal(ui.input().props["aria-expanded"], false); ui.cleanup();
});

test("clearing and unmount cancel pending debounce; client filtering is immediate", async () => {
    const ui = await searchControl({ query: "Site" });
    ui.type("Another site"); ui.clear().props.onClick(); ui.draw(); ui.tick();
    assert.deepEqual(ui.calls, [""]); assert.equal(ui.input().props.value, "");
    ui.type("Pending"); ui.cleanup(); assert.equal(ui.jobs.size, 0);
    const local = await searchControl({ delay: 0 });
    local.type("Task"); assert.deepEqual(local.calls, ["Task"]); assert.equal(local.jobs.size, 0); local.cleanup();
});

test("pointer selection uses an existing detail route without sending another search", async () => {
    const ui = await searchControl({ query: "Site", suggestions: [{ id: "1", name: "Site One", to: "/supervisor/projects/1" }] });
    ui.input().props.onFocus(); ui.draw(); let prevented = false;
    ui.options()[0].props.onPointerDown({ preventDefault() { prevented = true; } });
    ui.options()[0].props.onClick(); ui.draw(); assert.equal(prevented, true);
    assert.deepEqual(ui.navigations, ["/supervisor/projects/1"]); assert.equal(ui.calls.length, 0); assert.equal(ui.jobs.size, 0); ui.cleanup();
});

test("server-filtered project suggestions retain matches by client, location and other fields", async () => {
    for (const query of ["Calicut", "Acme", "interior commercial"]) {
        const ui = await searchControl({
            query, suggestionsFiltered: true,
            suggestions: [{ id: "1", name: "Lake House", context: "Calicut", to: "/admin/projects/1" }],
        });
        ui.input().props.onFocus(); ui.draw();
        assert.equal(ui.options().length, 1);
        ui.key("ArrowDown"); ui.key("Enter");
        assert.deepEqual(ui.navigations, ["/admin/projects/1"]);
        ui.cleanup();
    }
});

test("server-filtered suggestions still suppress stale and loading results", async () => {
    const ui = await searchControl({ query: "Acme", suggestionsFiltered: true, suggestions: [{ id: "1", name: "Lake House" }] });
    ui.input().props.onFocus(); ui.draw({ loading: true });
    assert.equal(ui.options().length, 0);
    ui.draw({ loading: false }); ui.type("Calicut");
    assert.equal(ui.options().length, 0);
    ui.tick(); ui.draw({ query: "Calicut" });
    assert.equal(ui.options().length, 1);
    ui.cleanup();
});
