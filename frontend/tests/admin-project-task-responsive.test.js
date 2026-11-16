import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { loadSource } from "./source-loader.js";

const projectId = "77396cb1-2f3e-4d99-91e4-cd80a8150054";
const tasks = Array.from({ length: 13 }, (_, index) => ({
    id: `task-${index}`, title: `Task ${index}`, display_order: index + 1,
    approval_status: index === 0 ? "PENDING" : "APPROVED", work_status: "NOT_STARTED",
    priority: "MEDIUM", start_date: "2026-11-20", end_date: "2026-11-21",
    worker_name: "Test team", progress: { progress_percentage: 20 },
}));
async function harness(timelineOnly = false) {
    const slots = []; let cursor = 0;
    const { exports } = await loadSource("pages/admin/ProjectTasks.jsx", {
        overrides: {
            react: { ...React, useEffect() {}, useState(initial) {
                const index = cursor++;
                if (!(index in slots)) slots[index] = index === 0 ? { project: { name: "Test Project" }, tasks } : index === 1 ? false : initial;
                return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
            } },
            "components/tasks/TaskExecutionActions.jsx": { TaskProgress: () => null },
        },
        append: "\nexport { ProjectTaskRegister };",
    });
    function tree() { cursor = 0; return exports.ProjectTaskRegister({ projectId, timelineOnly }); }
    function find(node, predicate) {
        if (!node || typeof node !== "object") return undefined;
        if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return undefined; }
        if (predicate(node)) return node;
        return find(node.props?.children, predicate);
    }
    return {
        html: () => renderToStaticMarkup(React.createElement(MemoryRouter, null, tree())),
        find: predicate => find(tree(), predicate),
    };
}

test("project Tasks uses one heading, desktop cards and accessible Timeline navigation", async () => {
    const page = await harness();
    const html = page.html();
    assert.match(html, />Project Tasks<\/h1>/);
    assert.ok(html.includes(`href="/admin/projects/${projectId}/timeline"`));
    assert.ok(html.includes("View project timeline"));
    assert.ok(!html.includes('id="project-timeline"'));
    assert.ok(!html.includes("Total Tasks"));
    assert.ok(!html.includes("Across this project"));
    assert.ok(html.includes("admin-project-task-cards grid grid-cols-1"));
    assert.equal((html.match(/aria-label="Open task: Task /g) || []).length, 12);
    assert.ok(!html.includes("View Details"));
    assert.ok(html.includes('href="/admin/projects/'+projectId+'/tasks/task-0"'));
    const shortcuts = page.find(node => node.props?.["aria-label"] === "Filter tasks by approval status");
    assert.ok(shortcuts.props.className.includes("flex flex-wrap"));
    assert.ok(!shortcuts.props.className.includes("hidden"));
});

test("approval shortcuts and pagination retain their existing state transitions", async () => {
    const page = await harness();
    const next = page.find(node => node.type === "button" && node.props.children?.[0] === "Next");
    assert.equal(next.props.disabled, false);
    next.props.onClick();
    assert.ok(page.html().includes('aria-label="Open task: Task 12"'));
    const pending = page.find(node => node.type === "button" && node.props.children?.[0] === "Pending approval");
    pending.props.onClick();
    const html = page.html();
    assert.equal((html.match(/aria-label="Open task: Task /g) || []).length, 1);
    assert.ok(html.includes('aria-label="Open task: Task 0"'));
    assert.equal(page.find(node => node.type === "button" && node.props.children?.[0] === "Next").props.disabled, true);
});

test("dedicated Timeline retains its timeline, mobile summaries and sequence controls", async () => {
    const page = await harness(true);
    const html = page.html();
    assert.match(html, />Project Timeline<\/h1>/);
    assert.ok(html.includes('id="project-timeline"'));
    assert.ok(html.includes("Total Tasks"));
    assert.ok(html.includes('aria-label="Numbered list"'));
    assert.ok(html.includes('aria-label="Schedule chart"'));
    assert.ok(!html.includes("View project timeline"));
    assert.ok(!html.includes("admin-project-task-cards"));
});
