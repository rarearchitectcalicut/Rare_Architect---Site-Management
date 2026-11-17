import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./source-loader.js";

const task = { id: "task", project: "project", title: "Foundation", display_order: 2 };
const tabs = ["overview", "documents", "work", "changes", "history"];
const { exports: sections } = await loadSource("components/admin/tasks/AdminTaskSections.jsx");
function navigationButtons(tree) {
    const navigation = tree.props.children[0];
    return navigation.type(navigation.props).props.children.props.children;
}
const resources = {
    progress: { data: { progress_percentage: 30 } }, entries: { data: [] },
    changes: { data: [] }, orders: { data: [{ id: "order", status: "PENDING", old_values: { timeline: [{ task_id: "task", display_order: 2 }] }, new_values: { timeline: [{ task_id: "task", display_order: 1 }] } }] },
    delays: { data: [] }, history: { data: [] },
};
for (const [tab, content] of [["overview", "Task essentials"], ["documents", "Search"], ["work", "Verified progress"], ["changes", "Pending timeline order requests"], ["history", "No history events."]]) {
    test(`retained ${tab} section renders with five navigation buttons`, () => {
        const element = React.createElement(sections.default, { task, tab, resources, onTabChange() {}, onRetry() {} });
        const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, element));
        assert.ok(html.includes(content));
        assert.ok(!html.includes('data-task-tab="timeline"'));
        assert.ok(!html.includes('>Timeline</button>'));
        const tree = sections.default({ task, tab, resources, onTabChange() {} });
        const buttons = navigationButtons(tree);
        assert.deepEqual(Array.from(buttons, button => button.key), tabs);
        if (tab === "changes") {
            assert.ok(html.includes("Previous task order"));
            assert.ok(html.includes("Proposed task order"));
            assert.ok(html.includes('/admin/approvals?tab=timeline&amp;request=order&amp;type=timeline'));
        }
    });
}

test("each retained section button selects its existing section", () => {
    const selected = [];
    const tree = sections.default({ task, tab: "overview", resources, onTabChange: tab => selected.push(tab) });
    for (const button of navigationButtons(tree)) button.props.onClick();
    assert.deepEqual(selected, tabs);
});

test("workspace navigation preserves section loaders and scoped timeline-order requests without loading project Timeline", async () => {
    const slots = [], effects = [], calls = [];
    let cursor = 0;
    const hooks = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
        useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
        useEffect(create, deps) {
            const i = cursor++, previous = slots[i];
            if (!previous || deps.some((value, index) => value !== previous.deps[index])) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: create() }; });
        },
    };
    const page = results => ({ results, count: results.length, next: null });
    const record = { id: "order", project_id: "project", status: "PENDING", old_values: { timeline: [{ task_id: "task" }] } };
    const { exports: apiExports } = await loadSource("api/taskApi.js", { overrides: { "api/client.js": { api: {} } } });
    const { exports } = await loadSource("pages/admin/TaskDetails.jsx", { overrides: {
        react: { ...React, ...hooks },
        "api/taskApi.js": { ...apiExports, taskApi: { history: async () => { calls.push("history"); return page([]); } } },
        "api/timelineApi.js": { timelineApi: {
            getTimeline: async () => { calls.push("FORBIDDEN project Timeline"); throw Error("Unexpected call"); },
            getChangeRequests: async params => { calls.push("orders"); assert.equal(params.status, "PENDING"); return page([record, { ...record, id: "foreign", project_id: "other" }]); },
        } },
        "api/dailyReportApi.js": { dailyReportApi: {
            progress: async () => { calls.push("progress"); return { task_id: "task", project_id: "project" }; },
            workQueue: async () => { calls.push("entries"); return page([]); },
        } },
        "api/approvalApi.js": { approvalApi: { getChangeRequests: async () => { calls.push("changes"); return page([]); } } },
        "api/delayApi.js": { delayApi: { list: async () => { calls.push("delays"); return page([]); } } },
    }, append: "\nexport { TaskWorkspace };" });
    let tree;
    const draw = () => { cursor = 0; tree = exports.TaskWorkspace({ task }); while (effects.length) effects.shift()(); };
    try {
        draw(); assert.equal(tree.props.tab, "overview"); assert.equal(calls.length, 0);
        for (const tab of tabs.slice(1)) {
            tree.props.onTabChange(tab); draw();
            await new Promise(resolve => setTimeout(resolve, 0)); draw();
            assert.equal(tree.props.tab, tab);
            if (tab === "changes") assert.deepEqual(Array.from(tree.props.resources.orders.data, value => value.id), ["order"]);
        }
        assert.deepEqual(calls.sort(), ["changes", "delays", "entries", "history", "orders", "progress"]);
    } finally { for (const slot of slots) slot?.cleanup?.(); }
});

test("removed Timeline panel has no remaining rendering branch", () => {
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
        React.createElement(sections.default, { task, tab: "timeline", resources: { timeline: { data: { tasks: [task] } } }, onTabChange() {}, onRetry() {} })));
    assert.ok(!html.includes("Position in approved timeline"));
    assert.ok(!html.includes("Overlapping approved tasks"));
    assert.ok(!html.includes('class="admin-task-timeline'));
});
