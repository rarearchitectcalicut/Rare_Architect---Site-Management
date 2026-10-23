import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./source-loader.js";

function render(Component, props = {}, url = "/admin/approvals") {
    return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [url] }, createElement(Component, props)));
}
const data = (await loadSource("components/approvals/queueData.js")).exports;
const empty = { tasks: [], changes: [], timeline: [], delays: [], work: [], decisions: [] };

test("pending counts separate report and extension decisions and deduplicate ORDER_CHANGE", () => {
    const queues = data.buildQueues({ ...empty,
        changes: [{ id: "edit", change_type: "EDIT", status: "PENDING" }, { id: "order", change_type: "ORDER_CHANGE", status: "PENDING" }],
        timeline: [{ id: "order", change_type: "ORDER_CHANGE", status: "PENDING" }],
        delays: [{ id: "delay", status: "APPROVED", extension_requested: true, extension_status: "PENDING" }],
        work: [{ id: "pending", verification_status: "PENDING" }, { id: "verified", verification_status: "VERIFIED" }],
    });
    assert.equal(queues.changes.length, 1);
    assert.equal(queues.timeline.length, 1);
    assert.equal(queues.delays.length, 1);
    assert.equal(queues.delays[0].requestType, "extension");
    assert.equal(queues.work.length, 1);
    assert.equal(queues.history.length, 2);
});

test("historical task rejections remain distinct after resubmission", () => {
    const queues = data.buildQueues({ ...empty,
        tasks: [{ id: "task", title: "Revised", approval_status: "PENDING" }],
        decisions: [{ id: "decision", task: "task", action: "REJECTED", details: { reason: "Correct scope" }, actor_name: "Admin" }],
    });
    assert.equal(queues.tasks.length, 1);
    assert.equal(queues.history[0].comment, "Correct scope");
    assert.notEqual(queues.tasks[0].queueKey, queues.history[0].queueKey);
});

test("task change review renders new_values beside the original values", async () => {
    const { exports } = await loadSource("components/approvals/review/TaskChangeReview.jsx");
    const html = render(exports.default, { record: { reason: "Correct the scope", old_values: { title: "Old task", planned_quantity: "10" }, new_values: { title: "Revised task", planned_quantity: "20" } } });
    for (const value of ["Old task", "Revised task", "10", "20", "Correct the scope"]) assert.ok(html.includes(value));
});

test("timeline review shows human-readable names, both sequences, and moved positions", async () => {
    const { exports } = await loadSource("components/approvals/review/TimelineOrderReview.jsx");
    const html = render(exports.default, { record: { reason: "Access first", taskNames: { first: "Foundation", second: "Walls" }, old_values: { timeline: [{ task_id: "first" }, { task_id: "second" }] }, new_values: { timeline: [{ task_id: "second" }, { task_id: "first" }] } } });
    for (const value of ["Current approved sequence", "Proposed sequence", "Foundation", "Walls", "Position 2 → 1", "Position 1 → 2"]) assert.ok(html.includes(value));
});

async function reviewFixture(item, record, props = {}) {
    const { exports } = await loadSource("components/approvals/RequestReview.jsx", { overrides: {
        "hooks/useApprovalReview.js": { useApprovalReview: () => ({ record, loading: false, error: "", busy: "", decide() {}, retry() {} }), validationMessage: () => "Failed" },
    } });
    return render(exports.default, { item, ...props });
}

test("extension approval remains disabled until its delay report is approved", async () => {
    const html = await reviewFixture({ id: "delay", requestType: "extension", status: "PENDING" }, { status: "PENDING", extension_status: "PENDING", requested_end_date: "2026-11-10" });
    const approve = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find((match) => match[2].endsWith("Approve"));
    assert.ok(approve && /\sdisabled=/.test(approve[1]));
    assert.ok(html.includes("must be approved"));
});

test("decision history is read-only and exposes reviewer, reason and decision", async () => {
    const html = await reviewFixture({ id: "task", requestType: "tasks", historyId: "decision", status: "REJECTED", reviewedBy: "Reviewing Admin", comment: "Correct quantities", reviewedAt: "2026-10-23T08:00:00Z" }, { title: "Current task", approval_status: "PENDING" }, { readOnly: true });
    for (const value of ["Reviewing Admin", "Correct quantities", "Rejected", "historical"]) assert.ok(html.toLowerCase().includes(value.toLowerCase()));
    assert.ok(!/>Approve<\/button>/.test(html));
    assert.ok(!/>Reject<\/button>/.test(html));
});

test("supervisor delay review has no admin actions or admin navigation", async () => {
    const html = await reviewFixture({ id: "delay", requestType: "delay", status: "PENDING" }, { status: "PENDING", project_id: "project", task: "task", reason: "Rain" }, { readOnly: true, role: "SUPERVISOR" });
    assert.ok(html.includes("/supervisor/projects/project"));
    assert.ok(!html.includes("/admin/"));
    assert.ok(!/>Approve<\/button>/.test(html));
});

test("daily work review shows approved baseline, submitted work and verified quantity", async () => {
    const { exports } = await loadSource("components/approvals/review/DailyWorkReview.jsx");
    const html = render(exports.default, { record: { measurement_method: "QUANTITY", planned_quantity: "100", measurement_unit: "SQM", quantity_completed_today: "25", progress: { verified_quantity: "40" }, work_description: "Installed plaster", report: { work_summary: "Site report" }, attachments: [{ id: "file", original_filename: "site-evidence.pdf", caption: "Wall evidence" }] } });
    for (const value of ["100 SQM", "25 SQM", "40 SQM", "site-evidence.pdf", "Wall evidence", "Site report"]) assert.ok(html.includes(value));
});

test("rejection confirmation requires a reason", async () => {
    const { exports } = await loadSource("modal/admin/ApprovalDecisionModal.jsx");
    const html = render(exports.default, { action: "reject", label: "Task Change" });
    assert.match(html, /<textarea[^>]*required/);
    assert.match(html, /<button[^>]*type="submit"[^>]*disabled/);
});

test("decision API payloads use the correct workflow endpoints", async () => {
    const graph = await loadSource("hooks/useApprovalReview.js");
    const { api } = await graph.load("api/client.js");
    const requests = [];
    api.defaults.adapter = async (config) => { requests.push([config.url, JSON.parse(config.data)]); return { data: {}, status: 200, headers: {}, config }; };
    await graph.exports.submitReview({ id: "order", requestType: "timeline" }, "reject", "Keep order");
    await graph.exports.submitReview({ id: "delay", requestType: "extension" }, "approve", "Extend");
    await graph.exports.submitReview({ id: "work", requestType: "work" }, "approve", "Verified onsite");
    assert.deepEqual(requests, [
        ["timeline-change-requests/order/reject/", { admin_comment: "Keep order" }],
        ["delay-reports/delay/approve-extension/", { admin_comment: "Extend" }],
        ["daily-task-work/work/verify/", { verification_note: "Verified onsite" }],
    ]);
});

test("notification resolver recognizes the backend notification_type and timeline reference", async () => {
    const graph = await loadSource("components/notifications/NotificationCenter.jsx", { append: "\nexport { resolveDestination };" });
    const { api } = await graph.load("api/client.js");
    api.defaults.adapter = async (config) => ({ data: { change_type: "ORDER_CHANGE", project_id: "project", task: "task" }, status: 200, headers: {}, config });
    const notification = { notification_type: "TASK_CHANGE_REQUEST", reference_type: "TASK_CHANGE_REQUEST", reference_id: "order" };
    assert.equal(await graph.exports.resolveDestination(notification, "ADMIN"), "/admin/approvals?tab=timeline&request=order");
    assert.equal(await graph.exports.resolveDestination(notification, "SUPERVISOR"), "/supervisor/projects/project/timeline");
});

test("deep link opens the requested timeline review in the correct queue", async () => {
    const queues = data.buildQueues({ ...empty, timeline: [{ id: "order", change_type: "ORDER_CHANGE", status: "PENDING", task: "task" }] });
    const { exports } = await loadSource("pages/admin/Approvals.jsx", { overrides: {
        "hooks/useApprovalQueues.js": { useApprovalQueues: () => ({ queues, projects: [], errors: {}, loading: false, refresh() {} }) },
        "hooks/useApprovalReview.js": { useApprovalReview: () => ({ record: { status: "PENDING", old_values: { timeline: [] }, new_values: { timeline: [] }, taskNames: {} }, loading: false, error: "", busy: "", decide() {}, retry() {} }), validationMessage: () => "Failed" },
    } });
    const html = render(exports.default, {}, "/admin/approvals?tab=timeline&request=order");
    assert.ok(html.includes("<dialog"));
    assert.ok(html.includes("Timeline Order Change"));
    assert.ok(html.includes("Current approved sequence"));
    for (const label of Object.values(data.queueLabels)) assert.ok(html.replaceAll("&amp;", "&").includes(label));
});

test("daily report summary remains readable when no task work was submitted", async () => {
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx");
    const html = render(exports.default, { report: { project_name: "Site Alpha", reported_by_name: "Supervisor", report_date: "2026-10-23", status: "SUBMITTED", work_summary: "No work due to heavy rain", issues: "Site access unavailable" }, attachments: [] });
    for (const value of ["Site Alpha", "Supervisor", "No work due to heavy rain", "Site access unavailable"]) assert.ok(html.includes(value));
});

test("notification deep links resolve separate extensions and daily-report context", async () => {
    const graph = await loadSource("components/notifications/NotificationCenter.jsx", { append: "\nexport { resolveDestination };" });
    const { api } = await graph.load("api/client.js");
    api.defaults.adapter = async (config) => ({ data: { project_id: "project", project: "project" }, status: 200, headers: {}, config });
    assert.equal(await graph.exports.resolveDestination({ notification_type: "EXTENSION_REQUEST", reference_type: "DELAY_REPORT", reference_id: "delay" }, "ADMIN"), "/admin/delays?request=delay&type=extension");
    assert.equal(await graph.exports.resolveDestination({ notification_type: "DAILY_REPORT", reference_type: "DAILY_REPORT", reference_id: "report" }, "ADMIN"), "/admin/reports?report=report");
});
