import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import * as React from "react";
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

test("daily-report API uses existing project, draft, section and correction endpoints", async () => {
    const calls = [];
    const api = Object.fromEntries(["get", "post", "patch", "delete"].map((method) => [method, async (...args) => { calls.push({ method, args }); return { data: {} }; }]));
    const { exports } = await loadSource("api/dailyReportApi.js", { overrides: { "api/client.js": { api } } });
    await exports.dailyReportApi.list("project", { status: "DRAFT", page: 2 });
    await exports.dailyReportApi.create("project", { report_date: "2026-10-26", work_summary: "" });
    await exports.dailyReportApi.update("report", { site_notes: "Notes" });
    await exports.dailyReportApi.saveRow("report", "work-entries", { task: "task" });
    await exports.dailyReportApi.saveRow("report", "manpower", { worker_count: 2 }, "row");
    await exports.dailyReportApi.removeRow("materials", "material");
    await exports.dailyReportApi.correct("entry", { new_daily_report: "draft", work_description: "Correction" });
    await exports.dailyReportApi.submit("report");
    assert.deepEqual(calls.map((call) => `${call.method}:${call.args[0]}`), ["get:projects/project/daily-reports/", "post:projects/project/daily-reports/", "patch:daily-reports/report/", "post:daily-reports/report/work-entries/", "patch:daily-manpower/row/", "delete:daily-materials/material/", "post:daily-task-work/entry/correct/", "post:daily-reports/report/submit/"]);
    assert.equal(calls[1].args[1].work_summary, "");
    assert.equal(calls[6].args[1].new_daily_report, "draft");
    await assert.rejects(() => exports.dailyReportApi.section("report", "progress"), /Unsupported/);
});

test("work forms show approved quantity units or completion criteria without percentage input", async () => {
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx");
    const props = { busy: false, onSave() {}, onCancel() {} };
    const quantity = render(exports.ReportWorkForm, { ...props, initial: { id: "entry", task: "task", task_title: "Plastering", measurement_method: "QUANTITY", planned_quantity: "100", measurement_unit: "SQM", quantity_completed_today: "25", work_description: "Wall work" } });
    assert(quantity.includes("Quantity completed today (SQM)"));
    assert(quantity.includes("100 SQM"));
    assert(!quantity.includes("percent"));
    const completion = render(exports.ReportWorkForm, { ...props, initial: { id: "entry", task: "task", task_title: "Inspection", measurement_method: "COMPLETION_ONLY", completion_criteria: "Signed inspection", work_description: "Inspection complete", completion_claimed: true } });
    assert(completion.includes("Signed inspection"));
    assert(completion.includes("Claim completion for verification"));
    assert(!completion.includes('type="number"'));
});

test("submitted work feedback is read-only and pending Admin entries link to the existing Approval Center", async () => {
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx");
    const rejected = { id: "entry", task_title: "Plastering", report_status: "SUBMITTED", verification_status: "REJECTED", verification_note: "Remeasure", verified_by_name: "Admin", work_description: "Wall work" };
    const supervisor = render(exports.ReportWorkEntry, { entry: rejected, role: "SUPERVISOR", canEdit: false, canCorrect: true });
    assert(supervisor.includes("Remeasure")); assert(supervisor.includes("not counted")); assert(supervisor.includes("Create correction")); assert(!supervisor.includes("Edit work"));
    const admin = render(exports.ReportWorkEntry, { entry: { ...rejected, verification_status: "PENDING" }, role: "ADMIN", canEdit: false });
    assert(admin.includes("/admin/approvals?tab=work&amp;type=work&amp;entry=entry"));
    assert(!admin.includes("Remove work"));
    const corrected = render(exports.ReportWorkEntry, { entry: { ...rejected, correction_id: "corrected" }, role: "SUPERVISOR", canCorrect: true });
    assert(!corrected.includes("Create correction"));
});

test("diary and site-record forms allow drafts and use actual weather, manpower and material fields", async () => {
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx");
    const diary = render(exports.ReportDiaryForm, { report: { report_date: "2026-10-26", work_summary: "" }, onSave() {}, onCancel() {} });
    for (const text of ["HEAVY_RAIN", "Site Notes", "Next Day Plan", "Issues and safety observations", "Save Draft"]) assert(diary.includes(text));
    const manpower = render(exports.ReportRowForm, { section: "manpower", onSave() {}, onCancel() {} });
    assert(manpower.includes("Worker Count")); assert(manpower.includes("Hours Worked")); assert(manpower.includes("PLUMBER"));
    const material = render(exports.ReportRowForm, { section: "materials", onSave() {}, onCancel() {} });
    for (const text of ["RECEIVED", "USED", "REQUIRED", "Quantity", "Unit"]) assert(material.includes(text));
});

async function reportDetailHarness({ role = "SUPERVISOR", submitted = false, deleteError = false, correctionMode = false } = {}) {
    const slots = []; let cursor = 0, effects = [], tree;
    const calls = [];
    let resolveSubmit;
    let resolveDelete;
    let resolvePrefill, rejectPrefill, prefillProgress, prefillPlan;
    const selections = [];
    const report = { id: "11111111-1111-1111-1111-111111111111", project: "22222222-2222-2222-2222-222222222222", reported_by: "supervisor", status: submitted || correctionMode ? "SUBMITTED" : "DRAFT", work_summary: "Saved site summary", report_date: "2026-10-26", correction_summary: correctionMode ? { rejected_count: 1, eligible_count: 1, entries: [] } : null };
    const hooks = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
        useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
        useEffect(create, deps) { const i = cursor++; const previous = slots[i]; if (!previous || deps.some((value, j) => value !== previous.deps[j])) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
    };
    const { exports } = await loadSource("pages/admin/DailyReports.jsx", { overrides: {
        react: { ...React, ...hooks },
        "hooks/useAuth.js": { useAuth: () => ({ user: { id: "supervisor" } }) },
        "hooks/useConfirmation.jsx": { useConfirmation: () => ({ confirm: async () => true, confirmationModal: null }) },
        "api/client.js": { api: {} },
        "api/dailyReportApi.js": { dailyReportApi: {
            get: async () => ({ ...report }),
            correctionSource: async () => ({ report: { ...report }, work: [{ id: "rejected", can_correct: true, task_title: "Wall work", work_description: "Original work", quantity_completed_today: "10", measurement_method: "QUANTITY", measurement_unit: "SQM", planned_quantity: "100", verification_note: "Remeasure", verification_status: "REJECTED" }, { id: "verified", can_correct: false, verification_status: "VERIFIED", quantity_completed_today: "20" }], manpower: [{ id: "crew", trade: "MASON", worker_count: 2 }], materials: [], attachments: [{ id: "old-evidence", original_filename: "site.pdf" }] }),
            saveCorrectionReport: (project, source, plan, progress) => { calls.push({ method: "prefill-save", project, source }); prefillPlan = plan; prefillProgress = progress; return new Promise((resolve, reject) => { resolvePrefill = resolve; rejectPrefill = reject; }); },
            section: async (id, section) => { calls.push({ method: "section", section }); return { count: 0, results: [], next: null, previous: null }; },
            submit: () => { calls.push({ method: "submit" }); return new Promise((resolve) => { resolveSubmit = resolve; }); },
            deleteDraft: () => { calls.push({ method: "delete" }); return deleteError ? Promise.reject(new Error("Deletion failed")) : new Promise((resolve) => { resolveDelete = resolve; }); },
        } },
    }, append: '\nconst crypto = { randomUUID: () => "33333333-3333-4333-8333-333333333333" }; const AbortController = class { signal = { aborted: false }; abort() { this.signal.aborted = true; } }; export { ReportDetail };' });
    function walk(predicate, node) { if (Array.isArray(node)) return node.map((child) => walk(predicate, child)).find(Boolean); if (!node || typeof node !== "object") return; return predicate(node) ? node : walk(predicate, node.props?.children); }
    function renderDetail() { cursor = 0; effects = []; tree = exports.ReportDetail({ reportId: report.id, projectId: report.project, user: { id: "supervisor" }, role, correctionMode, externalRevision: 0, onSelect(value) { selections.push(value); } }); effects.forEach((effect) => effect()); }
    const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
    renderDetail(); await flush(); renderDetail();
    return { calls, selections, render: renderDetail, flush, find: (predicate) => walk(predicate, tree), get prefillPlan() { return prefillPlan; }, saveDraftProgress() { prefillPlan.draftId = "saved-draft"; prefillProgress("saved-draft", "Create report draft"); }, failPrefill() { rejectPrefill(new Error("Offline")); }, completePrefill() { resolvePrefill("saved-draft"); }, completeDelete() { resolveDelete(); }, completeSubmit() { report.status = "SUBMITTED"; resolveSubmit({ report: { ...report } }); }, cleanup() { slots.forEach((slot) => slot?.cleanup?.()); } };
}

test("report submission lazily loads the review sections, prevents duplicate requests and locks editing", async () => {
    const ui = await reportDetailHarness();
    assert.equal(ui.calls.length, 0);
    const review = ui.find((node) => node.type === "button" && node.props.children === "Review & Submit");
    await review.props.onClick(); ui.render(); await ui.flush(); ui.render();
    assert.equal(ui.calls.filter((call) => call.method === "section").length, 4);
    const submit = ui.find((node) => node.type === "button" && node.props.children === "Confirm and Submit Report");
    assert.equal(submit.props.disabled, false);
    const first = submit.props.onClick(); submit.props.onClick(); await ui.flush();
    assert.equal(ui.calls.filter((call) => call.method === "submit").length, 1);
    ui.completeSubmit(); await first; ui.render(); await ui.flush(); ui.render();
    assert.equal(ui.find((node) => node.type === "button" && node.props.children === "Confirm and Submit Report"), undefined);
    ui.cleanup();
});

test("Admin and submitted Supervisor report details never offer ordinary draft editing", async () => {
    for (const options of [{ role: "ADMIN" }, { role: "SUPERVISOR", submitted: true }]) {
        const ui = await reportDetailHarness(options);
        assert.equal(ui.find((node) => node.type === "button" && node.props.children === "Edit Draft Diary"), undefined);
        assert.equal(ui.find((node) => node.type === "button" && node.props.children === "Delete Draft"), undefined);
        ui.cleanup();
    }
});

test("draft deletion waits for server success, prevents duplicates and preserves failures for retry", async () => {
    const ui = await reportDetailHarness();
    const button = ui.find((node) => node.type === "button" && node.props.children === "Delete Draft");
    const first = button.props.onClick(); button.props.onClick(); await ui.flush(); ui.render();
    assert.equal(ui.calls.filter((call) => call.method === "delete").length, 1);
    assert.equal(ui.selections.length, 0);
    assert.equal(ui.find((node) => node.type === "button" && node.props.children === "Deleting draft…").props.disabled, true);
    ui.completeDelete(); await first;
    assert.deepEqual(ui.selections, [null]); ui.cleanup();
    const failed = await reportDetailHarness({ deleteError: true });
    await failed.find((node) => node.type === "button" && node.props.children === "Delete Draft").props.onClick();
    failed.render();
    assert.equal(failed.selections.length, 0);
    assert(failed.find((node) => node.props?.role === "alert"));
    assert.equal(failed.find((node) => node.type === "button" && node.props.children === "Delete Draft").props.disabled, false);
    failed.cleanup();
});

test("Admin report filters omit drafts while preserving reporter and date filters", async () => {
    const { exports } = await loadSource("pages/admin/DailyReports.jsx", { append: '\nexport { ReportFilters };' });
    const html = render(exports.ReportFilters, { role: "ADMIN", filters: { search: "", status: "SUBMITTED", reported_by: "", date_from: "", date_to: "", sort: "newest" }, reporters: [], onApply() {}, onClear() {} });
    assert(!html.includes("Draft"));
    for (const text of ["Reporter", "From report date", "To report date"]) assert(html.includes(text));
});

test("draft delete and evidence preview reuse authenticated existing endpoints", async () => {
    const calls = [];
    const { exports } = await loadSource("api/dailyReportApi.js", { overrides: { "api/client.js": { api: {
        delete: async (...args) => { calls.push(["delete", ...args]); return { data: undefined }; },
        get: async (...args) => { calls.push(["get", ...args]); return { data: { type: "application/pdf" } }; },
    } } } });
    await exports.dailyReportApi.deleteDraft("draft");
    await exports.dailyReportApi.previewAttachment("file", "signal");
    assert.equal(calls[0][1], "daily-reports/draft/");
    assert.equal(calls[1][1], "daily-report-attachments/file/download/");
    assert.equal(calls[1][2].params.preview, 1);
    assert.equal(calls[1][2].responseType, "blob");
    assert.equal(calls[1][2].signal, "signal");
});

async function evidenceHarness(filename, mime) {
    const slots = []; let cursor = 0, effects = [], tree, fetches = 0;
    const hooks = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
        useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
        useEffect(create, deps) { const i = cursor++; const previous = slots[i]; if (!previous || deps.some((value, j) => value !== previous.deps[j])) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
    };
    const { exports } = await loadSource("components/daily-reports/ReportEvidence.jsx", { overrides: {
        react: { ...React, ...hooks },
        "api/dailyReportApi.js": { dailyReportApi: { previewAttachment: async () => { fetches++; return { type: mime }; } } },
    }, append: '\nconst previewEvents = []; const URL = { createObjectURL() { previewEvents.push("create"); return "blob:private-evidence"; }, revokeObjectURL(url) { previewEvents.push(`revoke:${url}`); } }; const AbortController = class { signal = { aborted: false }; abort() { this.signal.aborted = true; } }; export { EvidenceFile, EvidencePreview, previewEvents };' });
    function walk(predicate, node) { if (Array.isArray(node)) return node.map((child) => walk(predicate, child)).find(Boolean); if (!node || typeof node !== "object") return; return predicate(node) ? node : walk(predicate, node.props?.children); }
    function renderFile() { cursor = 0; effects = []; tree = exports.EvidenceFile({ file: { id: "evidence", original_filename: filename, caption: "Site evidence" } }); effects.forEach((effect) => effect()); }
    const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
    renderFile(); await flush(); renderFile();
    return { render: renderFile, flush, exports, get fetches() { return fetches; }, find: (predicate) => walk(predicate, tree), cleanup() { slots.forEach((slot) => slot?.cleanup?.()); } };
}

test("private image thumbnails enlarge, reuse cached blobs on reopen and revoke URLs on unmount", async () => {
    const ui = await evidenceHarness("site.png", "image/png");
    assert.equal(ui.fetches, 1);
    assert.equal(ui.find((node) => node.type === "img").props.src, "blob:private-evidence");
    await ui.find((node) => node.type === "button" && node.props.children === "Preview").props.onClick(); ui.render();
    const dialog = ui.find((node) => node.type === ui.exports.EvidencePreview);
    assert.equal(dialog.props.preview.type, "image/png");
    dialog.props.onClose(); ui.render();
    assert.equal(ui.find((node) => node.type === ui.exports.EvidencePreview), undefined);
    await ui.find((node) => node.type === "button" && node.props.children === "Preview").props.onClick(); ui.render();
    assert.equal(ui.fetches, 1);
    ui.cleanup();
    assert.deepEqual(Array.from(ui.exports.previewEvents), ["create", "revoke:blob:private-evidence"]);
});

test("PDF previews are on demand and unsafe or unsupported evidence keeps a download fallback", async () => {
    const pdf = await evidenceHarness("evidence.pdf", "application/pdf");
    assert.equal(pdf.fetches, 0);
    await pdf.find((node) => node.type === "button" && node.props.children === "Preview").props.onClick(); pdf.render();
    assert.equal(pdf.fetches, 1);
    assert.equal(pdf.find((node) => node.type === pdf.exports.EvidencePreview).props.preview.type, "application/pdf");
    assert.equal(pdf.find((node) => node.type === "a"), undefined);
    pdf.cleanup();
    const unsafe = await evidenceHarness("forged.pdf", "text/html");
    await unsafe.find((node) => node.type === "button" && node.props.children === "Preview").props.onClick(); unsafe.render();
    assert.equal(unsafe.find((node) => node.type === unsafe.exports.EvidencePreview), undefined);
    assert(unsafe.find((node) => node.props?.role === "alert"));
    assert.equal(unsafe.exports.previewEvents.length, 0); unsafe.cleanup();
    const legacy = await evidenceHarness("legacy.docx", "application/octet-stream");
    assert.equal(legacy.find((node) => node.type === "button" && node.props.children === "Preview"), undefined);
    assert(legacy.find((node) => node.type === "button" && node.props.children === "Download")); legacy.cleanup();
});

test("PDF lightbox is labelled, supports Escape cancellation and offers an explicit download fallback", async () => {
    const { exports } = await loadSource("components/daily-reports/ReportEvidence.jsx", { append: '\nexport { EvidencePreview };' });
    const html = render(exports.EvidencePreview, { file: { original_filename: "evidence.pdf" }, preview: { type: "application/pdf", url: "blob:private" }, onClose() {}, onDownload() {}, loading: false, button: "" });
    for (const text of ['aria-labelledby=', 'aria-modal="true"', 'title="PDF preview: evidence.pdf"', 'src="blob:private"', "Close preview", "Download", "depends on your browser"]) assert(html.includes(text));
    const eventGraph = await loadSource("components/daily-reports/ReportEvidence.jsx", { overrides: {
        react: { ...React, useRef: () => ({ current: null }), useId: () => "preview-title", useEffect() {} },
        "hooks/useModalScrollLock.js": { useModalScrollLock() {} },
    }, append: '\nexport { EvidencePreview };' });
    let closed = 0, prevented = 0, stopped = 0;
    const dialog = eventGraph.exports.EvidencePreview({ file: { original_filename: "evidence.pdf" }, preview: { type: "application/pdf", url: "blob:private" }, onClose() { closed++; } });
    dialog.props.onCancel({ preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
    assert.equal(closed, 1); assert.equal(prevented, 1); assert.equal(stopped, 1);
});

test("correction prefill opens without writes, keeps original date and requires copied-row confirmation", async () => {
    const ui = await reportDetailHarness({ correctionMode: true });
    assert.equal(ui.calls.length, 0);
    const diary = ui.find((node) => node.type?.name === "ReportDiaryForm");
    assert.equal(diary.props.values.report_date, "2026-10-26");
    assert.equal(diary.props.values.work_summary, "Saved site summary");
    assert(ui.find((node) => node.type?.name === "ReportWorkForm" && node.props.initial.id === "rejected"));
    const verified = ui.find((node) => node.type?.name === "ReportWorkEntry" && node.props.entry.id === "verified");
    assert.equal(verified.props.canEdit, false); assert.equal(verified.props.canCorrect, false);
    assert.equal(ui.find((node) => node.type?.name === "ReportRowForm").props.confirmed, false);
    const evidence = ui.find((node) => node.type?.name === "ReportEvidence");
    assert.equal(evidence.props.files[0].id, "old-evidence");
    assert.equal(evidence.props.onRemove, undefined);
    ui.cleanup();
});

test("correction save prevents duplicates and retains the same partial plan for retry", async () => {
    const ui = await reportDetailHarness({ correctionMode: true });
    const first = ui.find((node) => node.type === "button" && node.props.children === "Save Draft").props.onClick();
    ui.find((node) => node.type === "button" && node.props.children === "Save Draft").props.onClick();
    await ui.flush();
    assert.equal(ui.calls.filter((call) => call.method === "prefill-save").length, 1);
    assert.equal(ui.prefillPlan.work.length, 1);
    assert.equal(ui.prefillPlan.work[0].id, "rejected");
    assert.equal(ui.prefillPlan.manpower.length, 0);
    const retryId = ui.prefillPlan.client_id;
    ui.saveDraftProgress(); ui.failPrefill(); await first; ui.render();
    assert(ui.find((node) => node.type === "button" && node.props.children === "Open saved draft"));
    const retry = ui.find((node) => node.type === "button" && node.props.children === "Retry unfinished steps").props.onClick();
    await ui.flush();
    assert.equal(ui.prefillPlan.client_id, retryId);
    assert.equal(ui.prefillPlan.draftId, "saved-draft");
    ui.completePrefill(); await retry;
    assert.deepEqual(ui.selections, ["saved-draft"]);
    ui.cleanup();
});

test("correction API checkpoint retries only unfinished rows and uses the existing correction endpoint", async () => {
    const calls = []; let failMaterial = true;
    const { exports } = await loadSource("api/dailyReportApi.js", { overrides: { "api/client.js": { api: {
        post: async (path, payload) => {
            calls.push({ path, payload });
            if (path.endsWith("/materials/") && failMaterial) { failMaterial = false; throw new Error("Temporary failure"); }
            return { data: { id: "draft" } };
        },
    } } } });
    const plan = { client_id: "retry-id", diary: { report_date: "2026-10-26" }, manpower: [{ client_id: "crew", values: { trade: "MASON", worker_count: 2 } }], materials: [{ client_id: "material", values: { material_name: "Cement", entry_type: "USED" } }], work: [{ id: "rejected-a", title: "Wall", values: { quantity_completed_today: "10", work_description: "Corrected wall" } }, { id: "rejected-b", title: "Inspection", values: { completion_claimed: true, work_description: "Corrected inspection" } }], files: [], completed: [], draftId: null };
    await assert.rejects(() => exports.dailyReportApi.saveCorrectionReport("project", "source", plan), /Temporary failure/);
    assert.equal(plan.draftId, "draft");
    assert.equal(calls.filter((call) => call.path === "projects/project/daily-reports/").length, 1);
    await exports.dailyReportApi.saveCorrectionReport("project", "source", plan);
    assert.equal(calls.filter((call) => call.path.endsWith("/manpower/")).length, 1);
    assert.equal(calls.filter((call) => call.path === "projects/project/daily-reports/").length, 1);
    assert.equal(calls.filter((call) => call.path.endsWith("/materials/")).length, 2);
    const corrections = calls.filter((call) => call.path.includes("/correct/"));
    assert.equal(corrections.length, 2);
    assert.equal(corrections[0].payload.new_daily_report, "draft");
    assert.equal(corrections[1].payload.completion_claimed, true);
    assert.equal(calls[0].payload.source_report, "source");
});

test("correction source loader validates project and relationships and bounds paginated references", async () => {
    const calls = [];
    const { exports } = await loadSource("api/dailyReportApi.js", { overrides: { "api/client.js": { api: {
        get: async (path, options) => {
            calls.push({ path, options });
            if (path === "daily-reports/source/") return { data: { id: "source", project: "project", status: "SUBMITTED", correction_summary: { rejected_count: 1 } } };
            return { data: { count: 1, results: [{ id: path, daily_report: "source" }], next: null } };
        },
    } } } });
    const source = await exports.dailyReportApi.correctionSource("project", "source", "signal");
    assert.equal(source.work.length, 1); assert.equal(source.attachments.length, 1);
    assert.equal(calls.length, 5);
    assert.equal(calls[1].options.params.page_size, 100);
    assert.equal(calls[1].options.signal, "signal");
    await assert.rejects(() => exports.dailyReportApi.correctionSource("foreign-project", "source"), /own submitted report/);
});

test("Admin verification shows original rejection and the corrected measurement without adding review endpoints", async () => {
    const { exports } = await loadSource("components/approvals/review/DailyWorkReview.jsx");
    const html = render(exports.default, { record: { id: "corrected", daily_report: "new", project_id: "project", measurement_method: "QUANTITY", quantity_completed_today: "20", measurement_unit: "SQM", planned_quantity: "100", original_work: { id: "rejected", daily_report: "source", quantity_completed_today: "25", verification_note: "Remeasure wall" } } });
    for (const text of ["20 SQM", "25 SQM", "Remeasure wall", "Correction of rejected work", "report=source"]) assert(html.includes(text));
});

test("correction action is shown only for eligible source reports and existing corrections show their status", async () => {
    const { exports } = await loadSource("pages/admin/DailyReports.jsx", { append: '\nexport { ReportRegisterCard };' });
    const report = { id: "source", project: "project", report_date: "2026-10-26", status: "SUBMITTED", work_counts: {}, correction_summary: { rejected_count: 1, eligible_count: 1, entries: [{ id: "rejected", task_title: "Wall", verification_note: "Remeasure wall" }] } };
    const eligible = render(exports.ReportRegisterCard, { report, onSelect() {}, onCorrect() {} });
    assert(eligible.includes("Create Correction Report")); assert(eligible.includes("Remeasure wall"));
    const complete = render(exports.ReportRegisterCard, { report: { ...report, correction_summary: { ...report.correction_summary, eligible_count: 0, entries: [{ ...report.correction_summary.entries[0], correction_report: { id: "draft", status: "DRAFT" } }] } }, onSelect() {}, onCorrect() {} });
    assert(!complete.includes("Create Correction Report")); assert(complete.includes("Existing correction: Draft")); assert(complete.includes("Work Correction History"));
    const admin = render(exports.ReportRegisterCard, { report: { ...report, correction_summary: null }, onSelect() {} });
    assert(!admin.includes("Create Correction Report"));
});
