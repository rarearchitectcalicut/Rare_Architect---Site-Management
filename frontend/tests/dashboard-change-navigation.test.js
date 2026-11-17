import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { loadSource } from "./source-loader.js";

const taskId = "8f85dd87-b700-44cc-a367-e25988a5ceac";
const projectId = "d67b2589-c6a7-4039-a8a1-2b2118fcb8a2";
const { exports: helpers } = await loadSource("api/taskApi.js", { overrides: { "api/client.js": { api: {} } } });
function find(node, predicate) {
    if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return; }
    if (!node || typeof node !== "object") return;
    return predicate(node) ? node : find(node.props?.children, predicate);
}
async function harness(id = taskId) {
    const slots = [], effects = [], requests = [], navigations = [];
    let cursor = 0, tree;
    const react = { ...React,
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { value: initial, set(value) { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; } }; return [slots[i].value, slots[i].set]; },
        useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
        useEffect(create, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((value, j) => value !== old.deps[j])) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
    };
    const { exports } = await loadSource("pages/Dashboard.jsx", { overrides: {
        react,
        "modal/admin/AddProject.jsx": { default: () => null },
        "react-router-dom": { useNavigate: () => value => navigations.push(value), Link() {} },
        "api/taskApi.js": { ...helpers, taskApi: { get: (id, signal) => new Promise((resolve, reject) => requests.push({ id, signal, resolve, reject })) } },
    }, append: "\nexport { PendingChangeTaskLink, AttentionRow, buildSupervisorAttentionItems, mergePendingDelayItems };" });
    const draw = () => { cursor = 0; tree = exports.PendingChangeTaskLink({ taskId: id, children: "Task" }); while (effects.length) effects.shift()(); };
    draw();
    return { requests, navigations, exports, draw,
        button: () => find(tree, node => node.type === "button"),
        alert: () => find(tree, node => node.props?.role === "alert"),
        retry: () => find(tree, node => node.type === "button" && node.props.children === "Try Again"),
        cleanup() { for (const slot of slots) slot?.cleanup?.(); },
    };
}

test("backend-shaped change rows without project fields never construct a project URL", async () => {
    const ui = await harness();
    const rows = ui.exports.buildSupervisorAttentionItems({ pending_change_requests: { items: [{ id: "change", task_id: taskId, task_title: "create req and timeline docs", status: "PENDING", change_type: "EDIT" }] } }, new Date());
    assert.equal(rows[0].resolveTaskId, taskId);
    assert.equal(rows[0].pendingChange, true);
    assert.equal(rows[0].to, undefined);
    assert.equal(rows[0].description, "Change request pending");
    const named = ui.exports.buildSupervisorAttentionItems({ pending_change_requests: { items: [{ id: "change", task_id: taskId, project_id: "invalid", project_name: "Site" }] } }, new Date());
    assert.equal(named[0].description, "Site \u00b7 Change request pending");
    assert.equal(named[0].to, undefined);
    const row = ui.exports.AttentionRow({ item: rows[0] });
    assert.equal(row.type, ui.exports.PendingChangeTaskLink);
    ui.cleanup();
});

test("valid lookup navigates using response.project rather than an invented project_id", async () => {
    const ui = await harness();
    const pending = ui.button().props.onClick(); ui.draw();
    assert.deepEqual(ui.navigations, []);
    assert.equal(ui.button().props.disabled, true);
    assert.equal(ui.requests[0].id, taskId);
    assert.equal(ui.requests[0].signal.aborted, false);
    const duplicate = ui.button().props.onClick(); assert.equal(ui.requests.length, 1);
    ui.requests[0].resolve({ id: taskId, project: projectId, project_name: "Site" });
    await pending; await duplicate; ui.draw();
    assert.deepEqual(ui.navigations, [`/supervisor/projects/${projectId}/tasks/${taskId}`]);
    assert.equal(ui.button().props.disabled, false);
    ui.cleanup();
});

for (const project of [undefined, null, "undefined", "null", "invalid", "", {}, [projectId]]) {
    test(`missing or invalid project cannot navigate (${JSON.stringify(project)})`, async () => {
        const ui = await harness();
        const pending = ui.button().props.onClick();
        ui.requests[0].resolve({ id: taskId, project, project_id: projectId });
        await pending; ui.draw();
        assert.deepEqual(ui.navigations, []);
        assert.ok(ui.alert()); assert.ok(ui.retry());
        assert.equal(ui.button().props.disabled, false);
        ui.cleanup();
    });
}

for (const failure of [new Error("Network Error"), { response: { status: 404, data: { detail: "Not found." } } }, { response: { status: 500, data: {} } }]) {
    test(`failed task lookup stays recoverable (${failure.message || failure.response.status})`, async () => {
        const ui = await harness();
        const pending = ui.button().props.onClick(); ui.requests[0].reject(failure);
        await pending; ui.draw(); assert.ok(ui.alert()); assert.ok(ui.retry());
        assert.deepEqual(ui.navigations, []);
        const retry = ui.retry().props.onClick();
        ui.requests[1].resolve({ id: taskId, project: projectId });
        await retry; ui.draw(); assert.equal(ui.alert(), undefined);
        assert.equal(ui.navigations.length, 1); ui.cleanup();
    });
}

test("invalid task ID avoids the lookup and any navigation", async () => {
    for (const id of [undefined, null, "undefined", "invalid"]) {
        const ui = await harness(id === undefined ? null : id);
        await ui.button().props.onClick(); ui.draw();
        assert.equal(ui.requests.length, 0); assert.deepEqual(ui.navigations, []);
        assert.ok(ui.alert()); ui.cleanup();
    }
});

test("a mismatched task response cannot navigate", async () => {
    const ui = await harness(); const pending = ui.button().props.onClick();
    ui.requests[0].resolve({ id: projectId, project: projectId });
    await pending; ui.draw(); assert.deepEqual(ui.navigations, []); assert.ok(ui.alert()); ui.cleanup();
});

test("leaving the dashboard aborts lookup and ignores late completion", async () => {
    const ui = await harness(); const pending = ui.button().props.onClick();
    ui.cleanup(); assert.equal(ui.requests[0].signal.aborted, true);
    ui.requests[0].resolve({ id: taskId, project: projectId });
    await pending; assert.deepEqual(ui.navigations, []);
});
