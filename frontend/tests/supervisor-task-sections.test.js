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
    if (node.type?.name === "TaskSectionNavigation") return find(node.type(node.props), predicate);
    return predicate(node) ? node : find(node.props?.children, predicate);
}
const { exports: taskHelpers } = await loadSource("api/taskApi.js", { overrides: { "api/client.js": { api: {} } } });
const task = { id: "task-1", title: "Foundation", end_date: "2026-11-20", approval_status: "APPROVED", work_status: "IN_PROGRESS" };
async function contentHarness({ fail = false, canReportDelay = true, currentTask = task } = {}) {
    const state = hooks(), requests = [], reports = [];
    const { exports } = await loadSource("components/tasks/SupervisorTaskContent.jsx", {
        overrides: { react: state.react,
            "api/delayApi.js": { delayApi: { list: async (params, signal) => {
                requests.push({ params, signal }); if (fail) throw Error("Offline");
                return { results: [{ id: `report-${params.page}`, reason: "Rain", status: "PENDING" }], count: 6, next: params.page === 1 ? "next" : null, previous: params.page === 2 ? "previous" : null };
            } } },
            "api/taskApi.js": { ...taskHelpers, taskApi: { history: async () => ({ results: [], count: 0 }) } },
        },
    });
    let tree;
    function draw() { tree = state.render(() => exports.default({ task: currentTask, loading: false, canReportDelay, onReportDelay: value => reports.push(value), onEdit: value => reports.push(value) })); state.flush(); return tree; }
    const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); draw(); };
    draw(); await settle();
    return { state, requests, reports, draw, settle, find: predicate => find(tree, predicate), button: label => find(tree, node => node.type === "button" && (node.props.children === label || node.props.children?.[0] === label)) };
}

test("task sections lazy-load delays and retain pagination on returning", async () => {
    const ui = await contentHarness();
    try {
        assert.equal(ui.requests.length, 0);
        ui.button("Delays").props.onClick(); ui.draw(); await ui.settle();
        assert.equal(ui.requests.length, 1);
        ui.button("Next reports").props.onClick(); ui.draw(); await ui.settle();
        assert.equal(ui.requests[1].params.page, 2);
        ui.button("Overview").props.onClick(); ui.draw();
        assert.equal(ui.requests[1].signal.aborted, true);
        ui.button("Delays").props.onClick(); ui.draw(); await ui.settle();
        assert.equal(ui.requests[2].params.page, 2);
        assert.ok(ui.find(n => n.props?.record?.id === "report-2"));
    } finally { ui.state.cleanup(); }
});

test("delay action retains permission and sends the actual task to the existing form", async () => {
    for (const canReportDelay of [true, false]) {
        const ui = await contentHarness({ canReportDelay });
        try {
            ui.button("Delays").props.onClick(); ui.draw();
            const report = ui.button("Report delay");
            assert.equal(Boolean(report), canReportDelay);
            if (report) { report.props.onClick(); assert.equal(ui.reports[0], task); }
        } finally { ui.state.cleanup(); }
    }
});

test("task page delay section retains refresh, retry and request cleanup", async () => {
    for (const fail of [false, true]) {
        const ui = await contentHarness({ fail });
        ui.button("Delays").props.onClick(); ui.draw(); await ui.settle();
        const action = ui.button(fail ? "Retry" : "Refresh reports");
        assert.ok(action); action.props.onClick(); ui.draw(); await ui.settle();
        assert.equal(ui.requests.length, 2);
        ui.state.cleanup(); assert.equal(ui.requests[1].signal.aborted, true);
    }
});

test("documents retain the actual task scope and cancelled-project read-only rule", async () => {
    for (const status of ["ACTIVE", "CANCELLED"]) {
        const ui = await contentHarness({ currentTask: { ...task, project_status: status } });
        ui.button("Docs").props.onClick(); ui.draw();
        const documents = ui.find(n => n.type?.name === "TaskDocuments");
        assert.equal(documents.props.taskId, task.id);
        assert.equal(documents.props.readOnly, status === "CANCELLED");
        ui.state.cleanup();
    }
});

test("header edit action preserves pending edits, rejected resubmission and approved change requests", async () => {
    const { exports } = await loadSource("components/tasks/SupervisorTaskContent.jsx");
    for (const [approval_status, label] of [["PENDING", "Edit Task"], ["REJECTED", "Correct & Resubmit"], ["APPROVED", "Request Changes"]]) {
        const currentTask = { ...task, approval_status }, calls = [];
        const edit = exports.SupervisorTaskEditAction({ task: currentTask, onEdit: value => calls.push(value) });
        assert.ok(edit.props.children.includes(label)); edit.props.onClick(); assert.equal(calls[0], currentTask);
    }
    assert.equal(exports.SupervisorTaskEditAction({ task: { ...task, project_status: "CANCELLED" } }), null);
});

async function pageHarness() {
    const state = hooks(), requests = [];
    const projectId = '00000000-0000-4000-8000-000000000001';
    const taskId = '00000000-0000-4000-8000-000000000002';
    const { exports } = await loadSource('pages/supervisor/TaskDetails.jsx', { overrides: {
        react: state.react,
        'api/taskApi.js': { ...taskHelpers, taskApi: { get: (id, signal) => new Promise((resolve, reject) => requests.push({ id, signal, resolve, reject })) } },
        'api/projectApi.js': { projectApi: { getProjectOverview: async id => ({ id, name: 'Project', status: 'ACTIVE' }) } },
    }, append: '\nexport { TaskDetailsPage };' });
    let tree;
    const draw = (params = { projectId, taskId }) => { tree = state.render(() => exports.TaskDetailsPage(params)); state.flush(); };
    const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
    return { state, requests, projectId, taskId, draw, settle, find: predicate => find(tree, predicate) };
}

test('Supervisor detail page rejects invalid links without API calls', async () => {
    const ui = await pageHarness();
    ui.draw({ projectId: 'invalid', taskId: 'invalid' }); await ui.settle(); ui.draw({ projectId: 'invalid', taskId: 'invalid' });
    assert.equal(ui.requests.length, 0);
    assert.ok(ui.find(n => n.props?.role === 'alert'));
    ui.state.cleanup();
});

test('Supervisor detail page withholds task content for mismatched projects and denied reads', async () => {
    for (const denied of [false, true]) {
        const ui = await pageHarness(); ui.draw();
        if (denied) ui.requests[0].reject({ response: { status: 403, data: { detail: 'No access' } } });
        else ui.requests[0].resolve({ id: ui.taskId, project: 'different-project', title: 'Private task' });
        await ui.settle(); ui.draw();
        assert.ok(ui.find(n => n.props?.role === 'alert'));
        assert.equal(ui.find(n => n.type?.name === 'SupervisorTaskContent'), undefined);
        ui.state.cleanup();
    }
});

test('Supervisor task page aborts old task reads and ignores their late success', async () => {
    const ui = await pageHarness(); ui.draw();
    const newerId = '00000000-0000-4000-8000-000000000003';
    const params = { projectId: ui.projectId, taskId: newerId }; ui.draw(params);
    assert.equal(ui.requests[0].signal.aborted, true);
    ui.requests[1].resolve({ id: newerId, project: ui.projectId, title: 'Current task' });
    await ui.settle(); ui.draw(params);
    assert.equal(ui.find(n => n.type?.name === 'SupervisorTaskContent').props.task.id, newerId);
    ui.requests[0].resolve({ id: ui.taskId, project: ui.projectId, title: 'Stale task' });
    await ui.settle(); ui.draw(params);
    assert.equal(ui.find(n => n.type?.name === 'SupervisorTaskContent').props.task.id, newerId);
    ui.state.cleanup(); assert.equal(ui.requests[1].signal.aborted, true);
});
