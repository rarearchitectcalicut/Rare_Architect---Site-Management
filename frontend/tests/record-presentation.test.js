import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { loadSource } from "./source-loader.js";
import { recordDisplayText, recordEntries, withoutRecordIds } from "../src/utils/recordPresentation.js";

const id = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const visible = (html) => html.replace(/<[^>]*>/g, "");
const render = (Component, props) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component, props)));

test("technical snapshot fields are omitted while quantities, statuses and names stay readable", () => {
  const value = { id, task_id: id, projectId: other, client_id: other, worker_name: "Site crew", planned_quantity: "125.5", approved: true, nested: { uuid: other, end_date: "2026-11-20" } };
  const text = recordDisplayText(value);
  for (const expected of ["Site crew", "125.5", "Yes", "2026-11-20"]) assert.ok(text.includes(expected));
  assert.ok(!text.includes(id)); assert.ok(!text.includes(other));
  assert.equal(recordEntries(value).length, 4);
  assert.equal(recordDisplayText(id), "Linked record");
  assert.equal(withoutRecordIds(`Task ${id} could not be found`), "Task record could not be found");
});

test("activity cards omit UUIDs from visible generated context and retain valid related links", async () => {
  const { exports } = await loadSource("components/activity/ActivityEntry.jsx");
  const entry = { id: other, entity_type: "PROJECT", entity_id: id, action: "PROJECT_UPDATED", description: `Updated project ${id}`, actor_name: "Admin", subject_name: "Cedar House", metadata: { project_id: id, assigned_supervisor: other, end_date: "2026-11-20", status: "ACTIVE" } };
  for (const Component of [exports.default, exports.DesktopActivityEntry]) {
    const html = render(Component, { entry });
    assert.ok(!visible(html).includes(id)); assert.ok(!visible(html).includes(other));
    assert.ok(html.includes(`/admin/projects/${id}`));
    assert.ok(visible(html).includes("Cedar House"));
    assert.ok(visible(html).includes("2026-11-20"));
  }
  const { exports: activity } = await loadSource("pages/admin/Activity.jsx", { append: "\nexport { ActivityFilters };" });
  const filters = render(activity.ActivityFilters, { filters: { search: "", action: "", entity_type: "", actor: id, entity_id: id, date_from: "", date_to: "" }, records: [{ ...entry, actor_id: id }], onApply() {}, onReset() {} });
  assert.ok(!visible(filters).includes(id));
  assert.ok(filters.includes(`value="${id}"`));
  assert.ok(!filters.includes('placeholder="UUID"'));
});

test("task snapshot metadata and mobile timeline snapshots use human-readable values", async () => {
  const { exports: task } = await loadSource("components/admin/tasks/AdminTaskSections.jsx", { append: "\nexport { ReadableValue };" });
  const html = render(task.ReadableValue, { value: { task_id: id, status: "APPROVED", display_order: 2 } });
  assert.ok(!visible(html).includes(id)); assert.ok(visible(html).includes("APPROVED"));
  const { exports: timeline } = await loadSource("components/timeline/TimelineRequestHistory.jsx", { append: "\nexport { TimelineSnapshot };" });
  const snapshot = render(timeline.TimelineSnapshot, { value: [{ task_id: id, display_order: 1 }], tasks: [{ id, title: "Foundation survey" }] });
  assert.ok(visible(snapshot).includes("Foundation survey")); assert.ok(!visible(snapshot).includes(id));
});

test("draft correction choices show date and summary while retaining exact report values", async () => {
  const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx");
  const html = render(exports.ReportWorkForm, { correction: true, drafts: { results: [{ id, report_date: "2026-11-17", work_summary: "Roof inspection" }] }, onSave() {}, onCancel() {} });
  assert.ok(html.includes(`value="${id}"`));
  assert.ok(visible(html).includes("Roof inspection"));
  assert.ok(!visible(html).includes(id.slice(0, 8)));
});

test("notification presentation suppresses generated UUID references without changing its callback record", async () => {
  const { exports } = await loadSource("components/notifications/NotificationCenter.jsx", { append: "\nexport { NotificationRow };" });
  const notification = { id, notification_type: "SYSTEM", title: `Project ${id}`, message: `Updated ${other}`, is_read: false };
  const html = render(exports.NotificationRow, { notification, onOpen() {} });
  assert.ok(!visible(html).includes(id)); assert.ok(!visible(html).includes(other));
  let opened;
  exports.NotificationRow({ notification, onOpen: (record) => { opened = record; } }).props.onClick();
  assert.equal(opened, notification);
  const { exports: helpers } = await loadSource("components/approvals/approvalUtils.js");
  assert.equal(helpers.getCreatorName({ created_by: id }), "Supervisor");
});
