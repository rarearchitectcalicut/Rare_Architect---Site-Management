import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { loadSource } from "./source-loader.js";

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function find(node, predicate) {
    if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
    if (!node || typeof node !== "object") return undefined;
    return predicate(node) ? node : find(node.props?.children, predicate);
}
function text(node) {
    if (Array.isArray(node)) return node.map(text).join("");
    if (typeof node === "string" || typeof node === "number") return String(node);
    return node && typeof node === "object" ? text(node.props?.children) : "";
}
function hooksHarness() {
    const slots = [], effects = [];
    let cursor = 0, mounted = true, lateWrites = 0;
    const changed = (a, b) => !a || b.some((v, i) => v !== a[i]);
    return {
        hooks: {
            useState(initial) {
                const i = cursor++;
                if (!slots[i]) {
                    const slot = { value: typeof initial === "function" ? initial() : initial };
                    slot.set = (value) => { if (!mounted) lateWrites++; slot.value = typeof value === "function" ? value(slot.value) : value; };
                    slots[i] = slot;
                }
                return [slots[i].value, slots[i].set];
            },
            useRef(initial) { return slots[cursor++] ??= { current: initial }; },
            useId() { return `test-id-${cursor++}`; },
            useCallback(value, deps) {
                const i = cursor++;
                if (changed(slots[i]?.deps, deps)) slots[i] = { value, deps };
                return slots[i].value;
            },
            useEffect(create, deps) {
                const i = cursor++;
                if (changed(slots[i]?.deps, deps)) effects.push(() => {
                    slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: create() };
                });
            },
        },
        render(create) { cursor = 0; const tree = create(); while (effects.length) effects.shift()(); return tree; },
        unmount() { slots.forEach((slot) => slot?.cleanup?.()); mounted = false; },
        get lateWrites() { return lateWrites; },
    };
}

async function settingsHarness(get) {
    const requests = [], state = hooksHarness();
    const graph = await loadSource("pages/admin/Settings.jsx", { overrides: {
        react: { ...React, ...state.hooks },
        "api/client.js": { api: { get: async (url, options) => {
            requests.push({ url, params: options?.params });
            return { data: await get(options?.params?.page) };
        } } },
        "components/settings/AccountProfile.jsx": { default: () => null },
        "components/settings/ChangePasswordForm.jsx": { default: () => null },
        "components/settings/PushPreferences.jsx": { default: () => null },
    } });
    let tree;
    const ui = { requests, state, render() { tree = state.render(() => graph.exports.default()); }, text: () => text(tree) };
    ui.render(); await flush(); ui.render(); return ui;
}

test("category management forwards page numbers and finishes a multipage directory", async () => {
    const ui = await settingsHarness(async (page) => ({ results: [{ id: String(page), name: `Category ${page}`, is_active: true }], next: page === 1 ? "https://untrusted.test/?page=2" : null }));
    assert.deepEqual(ui.requests.map((r) => r.params.page), [1, 2]);
    assert(ui.requests.every((r) => r.url === "project-categories/"));
    assert(ui.text().includes("Category 1"));
    assert(ui.text().includes("Category 2"));
    ui.state.unmount();
});

test("category management handles an array and surfaces a later-page failure", async () => {
    const array = await settingsHarness(async () => [{ id: "one", name: "Single", is_active: true }]);
    assert.equal(array.requests.length, 1); assert(array.text().includes("Single")); array.state.unmount();
    const failed = await settingsHarness(async (page) => {
        if (page === 2) throw new Error("Offline");
        return { results: [], next: "?page=2" };
    });
    assert.deepEqual(failed.requests.map((r) => r.params.page), [1, 2]);
    assert(failed.text().includes("Unable to load project categories")); failed.state.unmount();
});

async function overviewGraph(overrides = {}, append = "") {
    return loadSource("pages/admin/ProjectOverview.jsx", { overrides: {
        "modal/admin/EditProject.jsx": { default: () => null },
        "components/LoadingScreen.jsx": { default: () => null },
        "hooks/useApprovalReview.js": { validationMessage: (error, fallback) => error.message || fallback },
        ...overrides,
    }, append });
}

async function pickerHarness(list, onAssign = () => {}) {
    const state = hooksHarness(), requests = [];
    let open = true, tree, busy = "", projectId = "A", closes = 0;
    const setBusyMessage = (value) => { busy = typeof value === "function" ? value(busy) : value; };
    const graph = await overviewGraph({ react: { ...React, ...state.hooks }, "api/supervisorApi.js": { supervisorApi: { list: (params) => { requests.push(params); return list(params); } } } }, "\nexport { AddSupervisorDialog };");
    const ui = {
        requests, state,
        render() { tree = state.render(() => graph.exports.AddSupervisorDialog({ open, projectId, assignedIds: new Set(["assigned"]), onClose() { closes++; }, onAssign, setBusyMessage })); },
        close() { open = false; this.render(); },
        reopen() { open = true; this.render(); },
        navigate(id) { projectId = id; this.render(); },
        setBusyMessage,
        get closes() { return closes; },
        text: () => text(tree),
        find: (predicate) => find(tree, predicate),
        get busy() { return busy; },
    };
    ui.render(); return ui;
}

test("assignment picker loads all pages and retains search and eligibility filtering", async () => {
    const ui = await pickerHarness(async ({ page }) => ({ results: page === 1
        ? [{ id: "assigned", username: "Assigned" }, { id: "inactive", username: "Inactive", is_active: false }]
        : [{ id: "later", username: "Later Supervisor", is_active: true }], next: page === 1 ? "https://untrusted.test/?page=2" : null }));
    await flush(); ui.render();
    assert.deepEqual(ui.requests.map((r) => r.page), [1, 2]);
    assert(ui.text().includes("Later Supervisor"));
    assert(!ui.text().includes("Inactive")); assert(!ui.text().includes("Assigned"));
    const search = ui.find((node) => node.type === "input");
    search.props.onChange({ target: { value: "later" } }); ui.render();
    assert(ui.text().includes("Later Supervisor")); assert.equal(ui.busy, ""); ui.state.unmount();
});

test("assignment picker accepts arrays and reports failures without showing a partial directory", async () => {
    const single = await pickerHarness(async () => [{ id: "only", username: "Only Supervisor" }]);
    await flush(); single.render(); assert.equal(single.requests.length, 1); assert(single.text().includes("Only Supervisor")); single.state.unmount();
    const failed = await pickerHarness(async ({ page }) => {
        if (page === 2) throw new Error("Offline");
        return { results: [{ id: "first", username: "Partial Supervisor" }], next: "?page=2" };
    });
    await flush(); failed.render(); assert(failed.text().includes("Unable to load supervisors"));
    assert(!failed.text().includes("Partial Supervisor")); assert.equal(failed.busy, ""); failed.state.unmount();
});

test("closing or unmounting the picker stops pagination and discards late results", async () => {
    for (const close of [true, false]) {
        const first = deferred();
        const ui = await pickerHarness(() => first.promise);
        if (close) ui.close(); else ui.state.unmount();
        assert.equal(ui.busy, "");
        first.resolve({ results: [{ id: "late" }], next: "?page=2" }); await flush();
        assert.equal(ui.requests.length, 1); assert.equal(ui.state.lateWrites, 0);
        if (close) ui.state.unmount();
    }
});

test("reopening owns its loader while old success or failure settles", async () => {
    for (const reject of [false, true]) {
        const old = deferred(), fresh = deferred(); let calls = 0;
        const ui = await pickerHarness(() => ++calls === 1 ? old.promise : fresh.promise);
        ui.close(); assert.equal(ui.busy, ""); ui.reopen();
        assert.equal(ui.busy, "Loading supervisors...");
        if (reject) old.reject(new Error("Old failure")); else old.resolve({ results: [{ id: "old", username: "Old supervisor" }], next: "?page=2" });
        await flush(); ui.render();
        assert.equal(ui.busy, "Loading supervisors..."); assert(!ui.text().includes("Old supervisor"));
        fresh.resolve([{ id: "fresh", username: "Fresh supervisor" }]); await flush(); ui.render();
        assert.equal(ui.busy, ""); assert(ui.text().includes("Fresh supervisor")); assert.equal(calls, 2);
        ui.state.unmount();
    }
});

test("picker cleanup preserves another operation's loading message", async () => {
    const pending = deferred(); const ui = await pickerHarness(() => pending.promise);
    ui.setBusyMessage("Loading project overview..."); ui.close();
    assert.equal(ui.busy, "Loading project overview...");
    pending.resolve([]); await flush(); assert.equal(ui.busy, "Loading project overview..."); ui.state.unmount();
});

for (const outcome of ["success", "failure"]) {
    for (const action of ["close", "reopen", "navigate", "unmount", "remain"]) {
        test(`assignment ${outcome} after ${action} respects dialog lifecycle`, async () => {
            const pending = deferred(); let assignments = 0;
            const ui = await pickerHarness(async () => [{ id: "person", username: "Available supervisor" }], () => { assignments++; return pending.promise; });
            await flush(); ui.render();
            ui.find((node) => node.type === "button" && text(node).includes("Available supervisor")).props.onClick(); ui.render();
            const assign = ui.find((node) => node.type === "button" && text(node).startsWith("Assign ("));
            const result = assign.props.onClick(); assign.props.onClick(); assert.equal(assignments, 1);
            if (action === "close" || action === "reopen") ui.close();
            if (action === "reopen") ui.reopen();
            if (action === "navigate") ui.navigate("B");
            if (action === "unmount") ui.state.unmount();
            if (outcome === "failure") pending.reject({ response: { data: { detail: "Assignment failed" } } }); else pending.resolve();
            await result; await flush();
            if (action !== "unmount") ui.render();
            assert.equal(ui.closes, outcome === "success" && action === "remain" ? 1 : 0);
            assert.equal(ui.text().includes("Assignment failed"), outcome === "failure" && action === "remain");
            assert.equal(ui.state.lateWrites, 0);
            if (action !== "unmount") ui.state.unmount();
        });
    }
}

async function projectHarness() {
    const state = hooksHarness(), requests = [], assignments = [];
    let projectId = "A", tree;
    const graph = await overviewGraph({
        react: { ...React, ...state.hooks },
        "react-router-dom": { Link() {}, useParams: () => ({ projectId }) },
        "api/projectApi.js": { projectApi: { getProjectOverview: (id) => { const request = { id, ...deferred() }; requests.push(request); return request.promise; } } },
        "api/supervisorApi.js": { supervisorApi: { assignToProject: () => { const request = deferred(); assignments.push(request); return request.promise; } } },
    });
    const ui = {
        state, requests, assignments,
        render() { tree = state.render(() => graph.exports.default()); },
        navigate(id) { projectId = id; this.render(); },
        find: (predicate) => find(tree, predicate),
        text: () => text(tree),
    };
    ui.render(); return ui;
}
const project = (id) => ({ id, name: `Project ${id}`, status: "ACTIVE", supervisors: [] });

test("project overview ignores older route successes and failures without clearing the current loader", async () => {
    for (const [failure, oldFinishesLast] of [[false, false], [true, false], [false, true], [true, true]]) {
        const ui = await projectHarness();
        ui.navigate("B");
        if (oldFinishesLast) { ui.requests[1].resolve(project("B")); await flush(); ui.render(); }
        if (failure) ui.requests[0].reject(new Error("Old failure")); else ui.requests[0].resolve(project("A"));
        await flush(); ui.render();
        assert(!ui.text().includes("Project A")); assert(!ui.text().includes("Old failure"));
        if (!oldFinishesLast) {
            assert(ui.find((node) => node.props?.message === "Loading project overview..."));
            ui.requests[1].resolve(project("B")); await flush(); ui.render();
        }
        assert(ui.text().includes("Project B")); assert(!ui.text().includes("Project A")); ui.state.unmount();
    }
});

test("latest same-project refresh wins and old project content is hidden on navigation", async () => {
    const ui = await projectHarness();
    ui.requests[0].resolve(project("A")); await flush(); ui.render();
    const edit = ui.find((node) => typeof node.props?.onUpdated === "function");
    const first = edit.props.onUpdated(), second = edit.props.onUpdated();
    ui.requests[2].resolve({ ...project("A"), name: "Newest project" }); await second;
    ui.requests[1].resolve({ ...project("A"), name: "Old project" }); await first; ui.render();
    assert(ui.text().includes("Newest project")); assert(!ui.text().includes("Old project"));
    ui.navigate("B"); assert(!ui.text().includes("Newest project")); ui.state.unmount();
    ui.requests[3].resolve(project("B")); await flush(); assert.equal(ui.state.lateWrites, 0);
});

test("old assignment completions and edit callbacks cannot refresh a new route", async () => {
    const ui = await projectHarness();
    ui.requests[0].resolve(project("A")); await flush(); ui.render();
    const oldRefresh = ui.find((node) => typeof node.props?.onUpdated === "function").props.onUpdated;
    const assign = ui.find((node) => typeof node.props?.onAssign === "function").props.onAssign;
    const pending = assign(["supervisor"]);
    ui.navigate("B"); ui.assignments[0].resolve(); await pending; await oldRefresh();
    assert.deepEqual(ui.requests.map((r) => r.id), ["A", "B"]);
    ui.requests[1].resolve(project("B")); await flush(); ui.render();
    assert(ui.text().includes("Project B")); ui.state.unmount();
});

test("project load results after unmount cause no state updates", async () => {
    const ui = await projectHarness(); ui.state.unmount();
    ui.requests[0].resolve(project("A")); await flush(); assert.equal(ui.state.lateWrites, 0);
});
