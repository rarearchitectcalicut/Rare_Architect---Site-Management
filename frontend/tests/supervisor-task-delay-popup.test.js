import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { loadSource } from "./source-loader.js";

function hooks() {
    const slots = [], effects = [];
    let cursor = 0;
    return {
        react: { ...React,
            useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { value: initial, set(value) { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; } }; return [slots[i].value, slots[i].set]; },
            useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
            useEffect(create, deps) { const i = cursor++, previous = slots[i]; if (!previous || deps.some((v, j) => v !== previous.deps[j])) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
        },
        render(fn) { cursor = 0; return fn(); },
        flush() { while (effects.length) effects.shift()(); },
        cleanup() { for (const slot of slots) slot?.cleanup?.(); },
    };
}
function find(node, predicate) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return; }
    return predicate(node) ? node : find(node.props?.children, predicate);
}
const { exports: taskHelpers } = await loadSource("api/taskApi.js", { overrides: { "api/client.js": { api: {} } } });
const task = { id: "task-1", title: "Foundation", end_date: "2026-11-20", approval_status: "APPROVED", work_status: "IN_PROGRESS" };
async function expandedHarness({ fail = false, canReportDelay = true } = {}) {
    const state = hooks(), requests = [], reports = [];
    const { exports } = await loadSource("pages/supervisor/ProjectTasks.jsx", {
        overrides: { react: state.react,
            "api/delayApi.js": { delayApi: { list: async (params, signal) => {
                requests.push({ params, signal }); if (fail) throw Error("Offline");
                return { results: [{ id: `report-${params.page}`, reason: "Rain", status: "PENDING" }], count: 6, next: params.page === 1 ? "next" : null, previous: params.page === 2 ? "previous" : null };
            } } },
            "api/taskApi.js": { ...taskHelpers, taskApi: { history: async () => ({ results: [], count: 0 }) } },
        }, append: "\nexport { ExpandedTask, MobileTaskDelayDialog };",
    });
    let tree;
    function draw() { tree = state.render(() => exports.ExpandedTask({ task, loading: false, canReportDelay, onReportDelay: value => reports.push(value) })); state.flush(); return tree; }
    const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); draw(); };
    draw(); await settle();
    return { state, requests, reports, draw, settle, find: predicate => find(tree, predicate), dialog: () => find(tree, node => node.type === exports.MobileTaskDelayDialog), button: label => find(tree, node => node.type === "button" && (node.props.children === label || node.props.children?.[0] === label)) };
}

test("mobile reports start collapsed; reopening preserves page/results and does not fetch again", async () => {
    const ui = await expandedHarness();
    try {
        assert.equal(ui.dialog(), undefined);
        assert.equal(ui.button("Delay Reports").props["aria-expanded"], false);
        ui.button("Delay Reports").props.onClick(); ui.draw();
        assert.ok(ui.dialog()); assert.equal(ui.requests.length, 1);
        ui.dialog().props.onClose(false); ui.draw();
        assert.equal(ui.dialog(), undefined);
        ui.button("Delay Reports").props.onClick(); ui.draw();
        const next = find(ui.dialog(), n => n.type === "button" && n.props.children === "Next reports");
        next.props.onClick(); ui.draw(); await ui.settle();
        assert.equal(ui.requests[1].params.page, 2);
        ui.dialog().props.onClose(false); ui.draw(); ui.button("Delay Reports").props.onClick(); ui.draw();
        assert.equal(ui.requests.length, 2);
        assert.ok(JSON.stringify(ui.dialog()).includes("report-2"));
    } finally { ui.state.cleanup(); }
});

test("mobile report action retains permission and callback without closing the report list", async () => {
    for (const canReportDelay of [true, false]) {
        const ui = await expandedHarness({ canReportDelay });
        try {
            ui.button("Delay Reports").props.onClick(); ui.draw();
            const report = find(ui.dialog(), n => n.type === "button" && n.props.children === "Report delay");
            assert.equal(Boolean(report), canReportDelay);
            if (report) { report.props.onClick(); assert.equal(ui.reports[0], task); ui.draw(); assert.ok(ui.dialog()); }
        } finally { ui.state.cleanup(); }
    }
});

test("mobile popup keeps refresh, retry and request cleanup", async () => {
    for (const fail of [false, true]) {
        const ui = await expandedHarness({ fail });
        ui.button("Delay Reports").props.onClick(); ui.draw();
        const action = find(ui.dialog(), n => n.type === "button" && n.props.children === (fail ? "Retry" : "Refresh reports"));
        assert.ok(action); action.props.onClick(); ui.draw(); await ui.settle();
        assert.equal(ui.requests.length, 2);
        ui.state.cleanup(); assert.equal(ui.requests[1].signal.aborted, true);
    }
});

async function dialogHarness(desktop = false) {
    const state = hooks(), closed = [], calls = [];
    const { exports } = await loadSource("pages/supervisor/ProjectTasks.jsx", {
        overrides: { react: state.react },
        append: `\nconst viewport = { matches: false, listener: null, addEventListener(type, fn) { this.listener = fn; }, removeEventListener() { this.listener = null; } };
const window = { matchMedia: () => viewport };
export { MobileTaskDelayDialog, viewport }; export const body = document.body;`,
    });
    exports.viewport.matches = desktop;
    exports.body.style.overflow = "scroll";
    const triggerRef = { current: { isConnected: true, focus() { calls.push("focus"); } } };
    const tree = state.render(() => exports.MobileTaskDelayDialog({ onClose: value => closed.push(value), triggerRef, children: "Existing mobile content" }));
    tree.props.ref.current = { showModal() { calls.push("show"); }, close() { calls.push("close"); } };
    state.flush(); return { state, exports, tree, calls, closed };
}

test("native mobile dialog closes accessibly and restores scrolling/focus on cleanup", async () => {
    const ui = await dialogHarness();
    assert.deepEqual(ui.calls, ["show"]); assert.equal(ui.exports.body.style.overflow, "hidden");
    assert.equal(ui.tree.props["aria-modal"], "true");
    let prevented = false, stopped = false;
    ui.tree.props.onCancel({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    assert.ok(prevented && stopped); assert.deepEqual(ui.closed, [false]);
    ui.state.cleanup(); assert.equal(ui.exports.body.style.overflow, "scroll");
    assert.deepEqual(ui.calls, ["show", "close", "focus"]);
});

test("dialog backdrop ignores content clicks and desktop transitions release the popup", async () => {
    const ui = await dialogHarness();
    const target = {};
    ui.tree.props.onClick({ target: {}, currentTarget: target }); assert.equal(ui.closed.length, 0);
    ui.tree.props.onClick({ target, currentTarget: target }); assert.deepEqual(ui.closed, [false]);
    ui.exports.viewport.matches = true; ui.exports.viewport.listener({ matches: true });
    assert.deepEqual(ui.closed, [false, false]); ui.state.cleanup();
    assert.ok(!ui.calls.includes("focus"));
    const desktop = await dialogHarness(true); assert.deepEqual(desktop.calls, []); assert.deepEqual(desktop.closed, [false]); desktop.state.cleanup();
});
