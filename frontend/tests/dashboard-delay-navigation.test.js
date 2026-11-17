import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { loadSource } from "./source-loader.js";

const projectId = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function find(node, predicate) {
    if (Array.isArray(node)) return node.map((item) => find(item, predicate)).find(Boolean);
    if (!node || typeof node !== "object") return undefined;
    return predicate(node) ? node : find(node.props?.children, predicate);
}

test("realistic dashboard delay and extension responses keep the request without inventing project context", async () => {
    const { exports } = await loadSource("pages/Dashboard.jsx", { overrides: { "modal/admin/AddProject.jsx": { default: () => null } }, append: "\nexport { mergePendingDelayItems };" });
    for (const project of [undefined, null, "undefined", "null", "Site Alpha", projectId]) {
        for (const kind of ["delay", "extension", "both"]) {
            const row = { id: requestId, task_id: "task", task_title: "Concrete", delay_status: "REJECTED", extension_status: "PENDING", ...(project === undefined ? {} : { project_id: project }) };
            const actions = { pending_delay_reports: { items: kind === "extension" ? [] : [row] }, pending_extensions: { items: kind === "delay" ? [] : [row] } };
            const items = exports.mergePendingDelayItems(actions);
            assert.equal(items.length, 1);
            const url = new URL(items[0].to, "http://rare.test");
            assert.equal(url.searchParams.get("request"), requestId);
            assert.equal(url.searchParams.get("project"), project === projectId ? projectId : null);
            assert.equal(url.searchParams.get("type"), kind === "extension" ? "extension" : null);
        }
    }
});

async function register(query, { fail = false, pending = false } = {}) {
    const slots = [], effects = [], requests = [], projects = [];
    let cursor = 0, params = new URLSearchParams(query), tree;
    const setParams = (next) => { params = typeof next === "function" ? next(params) : next; };
    const hooks = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
        useRef(initial) { return slots[cursor++] ??= { current: initial }; },
        useCallback: (value) => value,
        useMemo: (create) => create(),
        useEffect(create, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => v !== old.deps[j])) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
    };
    const { exports } = await loadSource("pages/supervisor/ProjectDelays.jsx", { overrides: {
        react: { ...React, ...hooks },
        "react-router-dom": { Link() {}, useParams: () => ({}), useSearchParams: () => [params, setParams] },
        "api/delayApi.js": { delayApi: { list: async (filters) => {
            requests.push(filters);
            if (pending) return new Promise(() => {});
            if (fail) throw { response: { status: 500, data: { detail: "Server unavailable" } } };
            return { results: [], count: 0, summary: { total: 0, pending: 0, approved: 0, rejected: 0, pending_extensions: 0 } };
        } } },
        "api/projectApi.js": { projectApi: { getProject: async (id) => { projects.push(id); return { id, status: "ACTIVE" }; } } },
    } });
    const ui = {
        requests, projects,
        render() { cursor = 0; tree = exports.default({}); while (effects.length) effects.shift()(); },
        find: (predicate) => find(tree, predicate),
        get params() { return params; },
    };
    ui.render(); await flush(); ui.render(); await flush(); ui.render(); return ui;
}

test("invalid incoming project filters are removed before requests, while extension selection survives", async () => {
    for (const project of ["undefined", "null", "not-a-uuid", ""]) {
        const ui = await register(`project=${project}&request=${requestId}&type=extension`);
        assert.equal(ui.params.has("project"), false);
        assert(ui.requests.every((r) => !Object.hasOwn(r, "project")));
        assert.equal(ui.projects.length, 0);
        const review = ui.find((node) => node.type?.name === "RequestReview");
        assert.equal(review.props.item.id, requestId);
        assert.equal(review.props.item.requestType, "extension");
        review.props.onClose(); ui.render();
        assert.equal(ui.params.has("request"), false);
        assert.equal(ui.params.has("type"), false);
        assert.equal(ui.params.has("project"), false);
    }
});

test("valid project filters remain applied after closing a selected request", async () => {
    const ui = await register(`project=${projectId}&request=${requestId}`);
    assert(ui.requests.every((r) => r.project === projectId));
    ui.find((node) => node.type?.name === "RequestReview").props.onClose(); ui.render();
    assert.equal(ui.params.get("project"), projectId);
    assert.equal(ui.params.has("request"), false);
});

test("failed delay requests stop loading and show unavailable totals; genuine pending requests remain loading", async () => {
    const failed = await register(`request=${requestId}`, { fail: true });
    assert(failed.find((node) => node.props?.role === "alert" && node.props.children === "Server unavailable"));
    assert(failed.find((node) => node.type === "p" && node.props.children === "Unavailable"));
    assert.equal(failed.find((node) => node.type === "p" && node.props.children === "Loading"), undefined);
    const pending = await register("", { pending: true });
    assert(pending.find((node) => node.type === "p" && node.props.children === "Loading"));
});
