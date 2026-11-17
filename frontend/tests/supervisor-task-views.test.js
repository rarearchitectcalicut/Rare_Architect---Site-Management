import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { loadSource } from "./source-loader.js";

const { exports } = await loadSource("components/admin/tasks/AdminTaskCard.jsx", {
    overrides: { "components/tasks/TaskExecutionActions.jsx": { TaskProgress: () => null } },
});
const task = {
    id: "task-1", title: "A long foundation inspection task title", project_name: "Cedar House",
    priority: "HIGH", approval_status: "APPROVED", work_status: "IN_PROGRESS",
    supervisors: [{ name: "Laya" }], end_date: "2026-11-20", progress: { progress_percentage: 40 },
};
const to = "/supervisor/projects/project-1/tasks?task=task-1";
function render(props = {}) {
    return renderToStaticMarkup(React.createElement(MemoryRouter, null,
        React.createElement(exports.MobileTaskCard, { task, to, ...props })));
}
for (const narrowMobileOnly of [false, true]) {
    test(`mobile modes retain task data and one link (narrow=${narrowMobileOnly})`, () => {
        const prefix = narrowMobileOnly ? "max-[480px]:" : "max-md:";
        const row = render({ mobilePresentation: "row", narrowMobileOnly });
        const gallery = render({ mobilePresentation: "gallery", narrowMobileOnly });
        assert.ok(row.includes(`${prefix}flex-row`));
        assert.ok(row.includes(`${prefix}flex-1`));
        assert.ok(gallery.includes(`${prefix}p-4`));
        assert.ok(gallery.includes(`${prefix}whitespace-normal`));
        assert.ok(!gallery.includes(`${prefix}flex-row`));
        for (const html of [row, gallery]) {
            assert.equal((html.match(/<a\b/g) || []).length, 1);
            for (const value of [to, task.title, "Cedar House", "Laya", "Approval: Approved", "Work: In Progress", 'role="progressbar"', 'aria-valuenow="40"']) assert.ok(html.includes(value), value);
        }
    });
}
test("default card has no opt-in responsive presentation or wrapper", () => {
    const html = render();
    assert.ok(!html.includes("max-md:"));
    assert.ok(!html.includes("max-[480px]:"));
    assert.ok(!html.includes('class="contents'));
    assert.equal((html.match(/<a\b/g) || []).length, 1);
});
test("both modes retain click handler, expansion and missing-data behavior", () => {
    const onClick = () => {};
    for (const mobilePresentation of ["row", "gallery"]) {
        const link = exports.MobileTaskCard({ task, to, onClick, expanded: true, mobilePresentation });
        assert.equal(link.props.onClick, onClick);
        assert.equal(link.props.to, to);
        const html = render({ mobilePresentation, expanded: true, showProject: false });
        assert.ok(html.includes("rotate-90"));
        assert.ok(!html.includes("Cedar House"));
        const missing = render({ mobilePresentation, task: { title: "Task" } });
        assert.ok(!missing.includes("Not specified"));
        assert.ok(!missing.includes('role="progressbar"'));
    }
});
test("global Supervisor branches opt in below the existing breakpoint", async () => {
    const source = await readFile(new URL("../src/pages/admin/ProjectTasks.jsx", import.meta.url), "utf8");
    const branch = source.slice(source.indexOf(': layout === "list"'));
    assert.ok(branch.includes('mobilePresentation="row" narrowMobileOnly'));
    assert.ok(branch.includes('mobilePresentation="gallery" narrowMobileOnly'));
    assert.ok(branch.includes('hidden min-[481px]:block'));
    assert.ok(!source.slice(0, source.indexOf(': layout === "list"')).includes('mobilePresentation='));
});
test("project register maps selected mode without replacing expansion or delay actions", async () => {
    const source = await readFile(new URL("../src/pages/supervisor/ProjectTasks.jsx", import.meta.url), "utf8");
    assert.ok(source.includes('mobilePresentation={layout === "list" ? "row" : "gallery"}'));
    assert.ok(source.includes('grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3'));
    assert.ok(source.includes('toggleTask(task.id)'));
    assert.ok(source.includes('setDelayReportTask(task)'));
});
