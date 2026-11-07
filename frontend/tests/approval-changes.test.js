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
    const approve = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find((match) => match[2].endsWith("Approve Request"));
    assert.ok(approve && /\sdisabled=/.test(approve[1]));
    assert.ok(html.includes("must be approved"));
});

test("decision history is read-only and exposes reviewer, reason and decision", async () => {
    const html = await reviewFixture({ id: "task", requestType: "tasks", historyId: "decision", status: "REJECTED", reviewedBy: "Reviewing Admin", comment: "Correct quantities", reviewedAt: "2026-10-23T08:00:00Z" }, { title: "Current task", approval_status: "PENDING" }, { readOnly: true });
    for (const value of ["Reviewing Admin", "Correct quantities", "Rejected", "historical"]) assert.ok(html.toLowerCase().includes(value.toLowerCase()));
    assert.ok(!/>Approve Request<\/button>/.test(html));
    assert.ok(!/>Reject Request<\/button>/.test(html));
});

test("supervisor delay review has no admin actions or admin navigation", async () => {
    const html = await reviewFixture({ id: "delay", requestType: "delay", status: "PENDING" }, { status: "PENDING", project_id: "project", task: "task", reason: "Rain" }, { readOnly: true, role: "SUPERVISOR" });
    assert.ok(html.includes("/supervisor/projects/project"));
    assert.ok(!html.includes("/admin/"));
    assert.ok(!/>Approve Request<\/button>/.test(html));
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
    const quantity = render(exports.ReportWorkForm, { ...props, initial: { id: "entry", task: "task", task_title: "Plastering", measurement_method: "QUANTITY", planned_quantity: "100", measurement_unit: "SQM", quantity_completed_today: "25", work_description: "Wall work", progress: { measurement_method: "QUANTITY", planned_quantity: "100", verified_quantity: "65", pending_quantity: "10", available_quantity: "25", progress_percentage: "65.00", measurement_unit: "SQM" } } });
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

async function evidenceHarness(filename, mime, fileApi) {
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
    function renderFile() { cursor = 0; effects = []; tree = exports.EvidenceFile({ file: { id: "evidence", original_filename: filename, caption: "Site evidence" }, fileApi }); effects.forEach((effect) => effect()); }
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


test("verified progress distinguishes measured zero, completion and unavailable data accessibly", async () => {
    const { exports } = await loadSource("components/tasks/TaskExecutionActions.jsx");
    const progress = { measurement_method: "QUANTITY", progress_percentage: "65.50", verified_quantity: "65.500", planned_quantity: "100.000", measurement_unit: "SQM" };
    const html = render(exports.TaskProgress, { progress });
    for (const text of ["65.5%", "65.500 / 100.000 SQM", 'role="progressbar"', 'aria-valuenow="65.5"', "width:65.5%"]) assert.ok(html.includes(text));
    assert.ok(render(exports.TaskProgress, { progress: { ...progress, progress_percentage: "0.00", verified_quantity: "0.000" } }).includes('aria-valuenow="0"'));
    for (const percent of ["0.00", "100.00"]) {
        const completion = render(exports.TaskProgress, { progress: { measurement_method: "COMPLETION_ONLY", progress_percentage: percent } });
        assert.ok(completion.includes(percent === "0.00" ? "Completion not yet verified" : "Completion verified"));
        assert.ok(!completion.includes("SQM"));
    }
    for (const value of [null, undefined, "", "oops", Infinity, NaN]) {
        const unavailable = render(exports.TaskProgress, { progress: { ...progress, progress_percentage: value } });
        assert.ok(unavailable.includes("Progress unavailable"));
        assert.ok(!unavailable.includes('role="progressbar"'));
        assert.ok(!/NaN|Infinity/.test(unavailable));
    }
    for (const quantity of [null, "", "oops", Infinity]) {
        assert.ok(render(exports.TaskProgress, { progress: { ...progress, verified_quantity: quantity } }).includes("Progress unavailable"));
    }
});

test("shared Admin and Supervisor task cards render server verified progress", async () => {
    const task = { id: "task", project: "project", title: "Measured wall", approval_status: "APPROVED", work_status: "COMPLETED", priority: "MEDIUM", progress: { measurement_method: "QUANTITY", progress_percentage: "25.00", verified_quantity: "25.000", planned_quantity: "100.000", measurement_unit: "SQM" } };
    const admin = await loadSource("components/admin/tasks/AdminTaskCard.jsx");
    const supervisor = await loadSource("pages/supervisor/ProjectTasks.jsx", { append: "\nexport { TaskCard };" });
    for (const html of [render(admin.exports.default, { task, to: "/admin/projects/project/tasks/task" }), render(supervisor.exports.TaskCard, { task, expanded: false })]) {
        assert.ok(html.includes('aria-valuenow="25"'));
        assert.ok(html.includes("25.000 / 100.000 SQM"));
        assert.ok(!html.includes("100%"));
    }
});

test("Daily Work historical details use the decision baseline and preserve original rejection", async () => {
    const { exports } = await loadSource("components/approvals/review/DailyWorkReview.jsx");
    const html = render(exports.default, { record: { daily_report: "report-ref", project_id: "project", measurement_method: "QUANTITY", measurement_unit: "METER", planned_quantity: "200", quantity_completed_today: "20", reviewed_baseline: { measurement_method: "QUANTITY", measurement_unit: "SQM", planned_quantity: "100" }, original_work: { id: "original", daily_report: "original-report", quantity_completed_today: "25", verification_note: "Remeasure walls", baseline: { measurement_method: "QUANTITY", measurement_unit: "SQM" } }, attachments: [] } });
    for (const text of ["report-ref", "20 SQM", "100 SQM", "25 SQM", "Remeasure walls", "original-report"]) assert.ok(html.includes(text));
    assert.ok(!html.includes("20 METER"));
});

test("decision history fetches a single server page, resets filters and ignores stale results", async () => {
    const slots = []; const effects = []; let cursor = 0; const requests = [];
    const hooks = {
        useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; },
        useEffect(create, deps) { const index = cursor++; const previous = slots[index]; if (!previous || deps.some((value, i) => value !== previous.deps[i])) effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: create() }; }); },
    };
    const { exports } = await loadSource("hooks/useRequestList.js", { overrides: {
        react: { ...React, ...hooks },
        "api/approvalApi.js": { approvalApi: { taskDecisions: (params) => new Promise((resolve, reject) => requests.push({ params, resolve, reject })) } },
    } });
    let list; let revision = 0;
    function draw() { cursor = 0; list = exports.useRequestList([], [], { server: true, revision }); while (effects.length) effects.shift()(); }
    async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); draw(); }
    const row = (id) => ({ decision_id: id, decision_type: "work", task_ref: "task", task_title: "Wall", project_ref: "project", project_title: "Site", decision_status: "VERIFIED", decision_date: "2026-10-27T10:00:00Z", reviewer_name: "Admin" });
    draw();
    assert.equal(requests[0].params.scope, "all");
    assert.equal(requests[0].params.page_size, 8);
    list.updateFilter("type", "work"); draw();
    requests[0].resolve({ results: [row("stale")], count: 1000, next: "ignored" }); await flush();
    assert.equal(list.loading, true);
    assert.equal(list.rows.length, 0);
    requests[1].resolve({ results: [row("first")], count: 17, next: "ignored" }); await flush();
    assert.equal(list.count, 17); assert.equal(list.pageCount, 3);
    assert.equal(requests.length, 2);
    list.setPage(2); draw();
    assert.equal(requests[2].params.page, 2);
    assert.equal(requests[2].params.type, "work");
    requests[2].resolve({ results: [row("second")], count: 17 }); await flush();
    assert.equal(list.pageRows[0].id, "second");
    list.updateFilter("reviewer_search", "Admin"); draw();
    assert.equal(requests[3].params.page, 1);
    assert.equal(requests[3].params.reviewer_search, "Admin");
    requests[3].reject(new Error("Offline")); await flush();
    assert.ok(list.error.includes("Unable to load decision history"));
    assert.equal(list.rows.length, 0);
    revision++; draw();
    assert.equal(requests.length, 5);
    list.clear(); draw();
    assert.equal(requests[5].params.type, undefined);
    assert.equal(requests[5].params.reviewer_search, undefined);
});


test("Daily Work review reuses progress in the work response without a separate progress request", async () => {
    const calls = [];
    const progress = { measurement_method: "QUANTITY", progress_percentage: "25.00" };
    const { exports } = await loadSource("hooks/useApprovalReview.js", { overrides: {
        "api/dailyReportApi.js": { dailyReportApi: {
            work: async () => ({ id: "entry", daily_report: "report", task: "task", progress }),
            get: async (id) => { calls.push(id); return { id }; },
            attachments: async () => ({ results: [], next: null }),
            progress: () => { throw new Error("Progress must come from the work response"); },
        } },
    } });
    const record = await exports.loadReview({ id: "entry", requestType: "work" });
    assert.equal(record.progress, progress);
    assert.deepEqual(calls, ["report"]);
});


function delayHooks() {
    const slots = []; const effects = []; let cursor = 0;
    return {
        hooks: {
            useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
            useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
            useCallback(callback) { cursor++; return callback; },
            useEffect(create, deps) { const i = cursor++; const previous = slots[i]; if (!previous || deps.some((value, j) => value !== previous.deps[j])) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
        },
        render(operation) { cursor = 0; const result = operation(); while (effects.length) effects.shift()(); return result; },
        cleanup() { slots.forEach((slot) => slot?.cleanup?.()); },
    };
}
const flushDelay = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const abortForDelay = '\nconst AbortController = class { signal = { aborted: false }; abort() { this.signal.aborted = true; } };';

test("delay register uses bounded server pages and summaries, ignores stale requests and loads tasks lazily", async () => {
    const state = delayHooks(); const requests = []; const taskRequests = []; let tasksEnabled = false;
    const graph = await loadSource("hooks/useDelayReports.js", { overrides: {
        react: { ...React, ...state.hooks },
        "api/delayApi.js": { delayApi: { list: (params, signal) => new Promise((resolve, reject) => requests.push({ params, signal, resolve, reject })) } },
        "api/projectApi.js": { projectApi: { getProject: async (id) => ({ id, name: "Site Alpha", status: "ACTIVE" }) } },
        "api/taskApi.js": { taskApi: { register: (params, signal) => new Promise((resolve) => taskRequests.push({ params, signal, resolve })) } },
    }, append: abortForDelay });
    let data;
    const draw = () => { data = state.render(() => graph.exports.useDelayReports("project", { tasksEnabled })); };
    draw(); await flushDelay(); draw();
    assert.equal(requests.length, 1); assert.equal(taskRequests.length, 0);
    assert.equal(requests[0].params.project, "project"); assert.equal(requests[0].params.page_size, 8);
    data.updateFilter("search", "rain"); draw();
    assert.equal(requests[0].signal.aborted, true);
    requests[0].resolve({ results: [{ id: "stale" }], count: 999, summary: { total: 999 } }); await flushDelay(); draw();
    assert.equal(data.reports.length, 0); assert.equal(data.loading, true);
    requests[1].resolve({ results: [{ id: "first" }], count: 17, summary: { total: 100, pending: 50 }, next: "ignored" }); await flushDelay(); draw();
    assert.equal(requests.length, 2); assert.equal(data.summary.total, 100); assert.equal(data.count, 17); assert.equal(data.pageCount, 3);
    data.setPage(2); draw(); assert.equal(requests[2].params.page, 2);
    data.updateFilter("extension", "NONE"); draw(); assert.equal(requests[3].params.page, 1); assert.equal(requests[3].params.extension_requested, false);
    requests[3].reject(new Error("Offline")); await flushDelay(); draw();
    assert.equal(data.reports.length, 0); assert.equal(data.summary, null); assert.ok(data.error.includes("Unable to load delay reports"));
    tasksEnabled = true; draw();
    assert.equal(taskRequests[0].params.project, "project"); assert.equal(taskRequests[0].params.delay_eligible, true); assert.equal(taskRequests[0].params.page_size, 20);
    taskRequests[0].resolve({ results: [{ id: "eligible" }], count: 25 }); await flushDelay(); draw();
    data.taskOptions.onPage(2); draw(); assert.equal(taskRequests[1].params.page, 2);
    data.taskOptions.onSearch("walls"); draw(); assert.equal(taskRequests[2].params.page, 1); assert.equal(taskRequests[2].params.search, "walls");
    state.cleanup();
});

async function delayFormHarness() {
    const state = delayHooks(); const requests = []; const confirmations = []; const saved = []; let tree;
    const tasks = [{ id: "task", title: "Wall work", approval_status: "APPROVED", work_status: "IN_PROGRESS", start_date: "2026-10-01", end_date: "2026-10-30" }];
    const { exports } = await loadSource("modal/supervisor/DelayReportForm.jsx", { overrides: {
        react: { ...React, ...state.hooks },
        "hooks/useConfirmation.jsx": { useConfirmation: () => ({ confirmationModal: null, confirm: () => new Promise((resolve) => confirmations.push(resolve)) }) },
        "api/delayApi.js": { delayApi: { create: (id, payload) => new Promise((resolve, reject) => requests.push({ id, payload, resolve, reject })) } },
    } });
    function find(predicate, node) { if (Array.isArray(node)) return node.map((child) => find(predicate, child)).find(Boolean); if (!node || typeof node !== "object") return; return predicate(node) ? node : find(predicate, node.props?.children); }
    const draw = () => { tree = state.render(() => exports.default({ tasks, onClose() {}, onSaved: (report) => saved.push(report) })); };
    draw();
    return { tasks, requests, confirmations, saved, draw, find: (predicate) => find(predicate, tree),
        change(name, value) { find((node) => node.props?.id === `delay-${name}`, tree).props.onChange({ target: { value, checked: value } }); draw(); },
        submit() { return find((node) => node.type === "form", tree).props.onSubmit({ preventDefault() {} }); },
    };
}

test("delay form validates dates, clears disabled extension dates and prevents duplicate confirmations or submissions", async () => {
    const ui = await delayFormHarness();
    ui.change("task", "task"); ui.change("expected_completion_date", "2026-11-10"); ui.change("reason", " Rain delayed access "); ui.change("extension_requested", true); ui.change("requested_end_date", "2026-10-30");
    await ui.submit(); ui.draw();
    assert.equal(ui.confirmations.length, 0);
    assert.equal(ui.find((node) => node.props?.id === "delay-requested_end_date").props["aria-invalid"], true);
    ui.change("requested_end_date", "2026-11-10"); ui.change("extension_requested", false); ui.change("extension_requested", true);
    assert.equal(ui.find((node) => node.props?.id === "delay-requested_end_date").props.value, "");
    ui.change("requested_end_date", "2026-11-10");
    const first = ui.submit(); await ui.submit(); ui.draw();
    assert.equal(ui.confirmations.length, 1); assert.equal(ui.find((node) => node.type === "fieldset").props.disabled, true);
    ui.confirmations[0](true); await flushDelay(); ui.draw(); await ui.submit();
    assert.equal(ui.requests.length, 1);
    assert.equal(ui.requests[0].payload.reason, "Rain delayed access"); assert.equal(ui.requests[0].payload.requested_end_date, "2026-11-10");
    assert.equal(ui.requests[0].payload.end_date, undefined);
    ui.requests[0].resolve({ id: "report", status: "PENDING", extension_status: "PENDING" }); await first;
    assert.equal(ui.saved[0].status, "PENDING");
});

test("delay form preserves backend field errors and can retry after failure or cancelled confirmation", async () => {
    const ui = await delayFormHarness(); ui.change("task", "task"); ui.change("expected_completion_date", "2026-11-10"); ui.change("reason", "Rain");
    const cancelled = ui.submit(); ui.confirmations[0](false); await cancelled;
    assert.equal(ui.requests.length, 0);
    const first = ui.submit(); ui.confirmations[1](true); await flushDelay();
    ui.requests[0].reject({ response: { data: { reason: ["Please explain the site issue."] } } }); await first; ui.draw();
    assert.equal(ui.find((node) => node.props?.id === "delay-reason").props["aria-invalid"], true);
    assert.ok(ui.find((node) => node.type?.name === "FieldError" && node.props.name === "reason").props.errors.reason.includes("Please explain the site issue."));
    const retry = ui.submit(); ui.confirmations[2](true); await flushDelay();
    assert.equal(ui.requests[1].payload.requested_end_date, null);
    ui.requests[1].resolve({ id: "report", status: "PENDING" }); await retry;
    assert.equal(ui.saved.length, 1);
});

test("delay summary never derives global totals from a report page", async () => {
    const { exports } = await loadSource("components/delays/DelaySummary.jsx");
    const html = render(exports.default, { summary: { total: 50, pending: 20, approved: 25, rejected: 5, pending_extensions: 4 }, loading: false });
    for (const text of ["Delay reports", "Pending reports", "Approved reports", "Rejected reports", "Pending extensions", ">50<", ">25<"]) assert.ok(html.includes(text));
    const unavailable = render(exports.default, { summary: null, loading: false });
    assert.ok(unavailable.includes("Unavailable")); assert.ok(!unavailable.includes(">0<"));
});

test("delay details distinguish original, current and approved deadlines with separate decisions", async () => {
    const { exports } = await loadSource("components/approvals/review/DelayReportReview.jsx");
    const record = { id: "report", project_id: "project", task: "task", delay_type: "WEATHER", reason: "Heavy rain", description: "Flooded access", expected_completion_date: "2026-11-08", current_end_date: "2026-11-15", requested_end_date: "2026-11-10", extension_requested: true, status: "APPROVED", extension_status: "APPROVED", reviewed_by_name: "Report Admin", reviewed_at: "2026-10-27T08:00:00Z", extension_reviewed_by_name: "Extension Admin", extension_reviewed_at: "2026-10-27T09:00:00Z", extension_admin_comment: "Allow extra time", deadline_history: { submission_deadline_recorded: true, deadline_at_submission: "2026-10-30", previous_approved_deadline: "2026-10-30", new_approved_deadline: "2026-11-10" } };
    const html = render(exports.default, { record });
    for (const text of ["Report Admin", "Extension Admin", "Allow extra time", "Previous approved deadline", "New approved deadline", "30 Oct 2026", "10 Nov 2026", "15 Nov 2026", "/admin/projects/project/tasks/task"]) assert.ok(html.includes(text));
    assert.ok(!html.includes("Extension rejection is available independently"));
});

test("Admin delay register reviews pending reports in place and Supervisors stay read-only", async () => {
    const { exports } = await loadSource("pages/supervisor/ProjectDelays.jsx", { overrides: {
        "hooks/useDelayReports.js": { useDelayReports: () => ({ reports: [{ id: "report", status: "PENDING", project_id: "project", task_title: "Wall work" }], projects: [{ id: "project", name: "Site Alpha" }], project: { id: "project", name: "Site Alpha", status: "ACTIVE" }, summary: { total: 1, pending: 1, approved: 0, rejected: 0, pending_extensions: 0 }, count: 1, page: 1, pageCount: 1, filters: { search: "", status: "", sort: "newest", project: "", extension: "", delayType: "" }, loading: false, error: "", refresh() {}, setPage() {}, updateFilter() {}, clear() {} }) },
        "hooks/useApprovalReview.js": { useApprovalReview: () => ({ record: { id: "report", project_id: "project", task: "task", status: "PENDING" }, loading: false, error: "", busy: "", decide() {}, retry() {} }), validationMessage: () => "Failed" },
    } });
    const html = render(exports.default, { role: "ADMIN" }, "/admin/delays?project=project&request=report");
    assert.ok(html.includes("Site Alpha")); assert.ok(html.includes("/admin/approvals?tab=delays"));
    assert.ok(/>Approve Request<\/button>/.test(html)); assert.ok(/>Reject Request<\/button>/.test(html));
    assert.ok(!html.includes("Review delay in Approval Center"));
    assert.ok(!html.includes("Report delay</button>"));
    const supervisor = render(exports.default, { role: "SUPERVISOR" }, "/supervisor/delays?project=project&request=report");
    assert.ok(!/>Approve Request<\/button>/.test(supervisor)); assert.ok(!/>Reject Request<\/button>/.test(supervisor));
});


test("Approval Center loads delay totals once and pages pending delay and extension requests", async () => {
    const state = delayHooks(); const calls = []; let list; let resolve;
    const { exports } = await loadSource("hooks/useRequestList.js", { overrides: {
        react: { ...React, ...state.hooks },
        "api/delayApi.js": { delayApi: { list: (params) => { calls.push(params); return new Promise((next) => { resolve = next; }); } } },
    } });
    const draw = () => { list = state.render(() => exports.useRequestList([], [], { server: true, serverKind: "delays" })); };
    draw(); assert.equal(calls[0].pending_only, true); assert.equal(calls[0].page_size, 8);
    resolve({ count: 20, results: [{ id: "delay", status: "PENDING", extension_status: "PENDING" }, { id: "extension", status: "REJECTED", extension_status: "PENDING" }], next: "ignored" }); await flushDelay(); draw();
    assert.equal(list.count, 20); assert.equal(calls.length, 1);
    assert.equal(list.pageRows[0].requestType, "delay"); assert.equal(list.pageRows[1].requestType, "extension");
    list.setPage(2); draw(); assert.equal(calls[1].page, 2);
    list.updateFilter("delayType", "WEATHER"); draw(); assert.equal(calls[2].page, 1); assert.equal(calls[2].delay_type, "WEATHER");
    state.cleanup();
});


function documentWalk(predicate, node) {
    if (Array.isArray(node)) return node.map((child) => documentWalk(predicate, child)).find(Boolean);
    if (!node || typeof node !== "object") return;
    return predicate(node) ? node : documentWalk(predicate, node.props?.children);
}
const documentRules = { max_file_size: 1000, allowed_extensions: [".pdf", ".png"], document_types: [{ value: "DRAWING", label: "Drawing" }, { value: "CONTRACT", label: "Contract" }] };

test("project document API uses authenticated project and version endpoints with blob preview requests", async () => {
    const calls = [];
    const api = { get: async (...args) => { calls.push(["get", ...args]); return { data: {} }; }, post: async (...args) => { calls.push(["post", ...args]); return { data: {} }; } };
    const { exports } = await loadSource("api/projectApi.js", { overrides: { "api/client.js": { api } } });
    await exports.projectApi.documents("project", { search: "plan", page: 2 }, "signal");
    await exports.projectApi.createDocument("project", "multipart");
    await exports.projectApi.newDocumentVersion("document", "multipart");
    await exports.projectApi.documentVersions("document", { page: 2 });
    await exports.projectDocumentFiles.previewAttachment("old-version", "signal");
    await exports.projectDocumentFiles.downloadAttachment("old-version", "signal");
    assert.equal(calls[0][1], "projects/project/documents/"); assert.equal(calls[0][2].signal, "signal");
    assert.equal(calls[1][1], "projects/project/documents/"); assert.equal(calls[1][2], "multipart");
    assert.equal(calls[2][1], "project-documents/document/new-version/");
    assert.equal(calls[3][1], "project-documents/document/versions/");
    assert.equal(calls[4][1], "project-document-versions/old-version/download/");
    assert.equal(calls[4][2].params.inline, "true"); assert.equal(calls[4][2].responseType, "blob");
    assert.equal(calls[5][2].params, undefined); assert.equal(calls[5][2].signal, "signal");
});

test("project files reuse the protected viewer without requesting Daily Report attachments", async () => {
    const calls = [];
    const fileApi = { previewAttachment: async (id, signal) => { calls.push({ id, signal }); return { type: "image/png" }; } };
    const ui = await evidenceHarness("drawing.png", "text/html", fileApi);
    assert.equal(ui.fetches, 0); assert.equal(calls.length, 1); assert.equal(calls[0].id, "evidence");
    await ui.find((node) => node.type === "button" && node.props.children === "Preview").props.onClick(); ui.render();
    assert.equal(ui.find((node) => node.type === ui.exports.EvidencePreview).props.preview.type, "image/png");
    ui.cleanup(); assert.equal(calls[0].signal.aborted, true);
    assert.deepEqual(Array.from(ui.exports.previewEvents), ["create", "revoke:blob:private-evidence"]);
});

async function projectUploadHarness(version = false) {
    const state = delayHooks(); const calls = []; let saved = 0; let tree;
    const { exports } = await loadSource("pages/supervisor/ProjectWorkspace.jsx", { overrides: {
        react: { ...React, ...state.hooks },
        "api/projectApi.js": { projectApi: {
            createDocument: (id, payload) => new Promise((resolve, reject) => calls.push({ id, payload, resolve, reject, type: "new" })),
            newDocumentVersion: (id, payload) => new Promise((resolve, reject) => calls.push({ id, payload, resolve, reject, type: "version" })),
        }, projectDocumentFiles: {} },
    }, append: '\nconst FormData = class { values = new Map(); append(name, value) { this.values.set(name, value); } get(name) { return this.values.get(name); } }; export { ProjectDocumentUpload };' });
    const draw = () => { tree = state.render(() => exports.ProjectDocumentUpload({ projectId: "route-project", documentRecord: version ? { id: "document", title: "Plan" } : null, rules: documentRules, onClose() {}, onSaved() { saved++; } })); };
    draw();
    const find = (predicate) => documentWalk(predicate, tree);
    return { draw, calls, find, get saved() { return saved; }, submit: () => find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }) };
}

test("project uploads validate backend rules, prevent duplicates and preserve backend field errors", async () => {
    const ui = await projectUploadHarness();
    await ui.submit(); ui.draw(); assert.equal(ui.calls.length, 0);
    ui.find((node) => node.type === "input" && node.props.maxLength === 200).props.onChange({ target: { value: " Plan title " } }); ui.draw();
    const input = ui.find((node) => node.type === "input" && node.props.type === "file");
    assert.equal(input.props.accept, ".pdf,.png");
    input.props.onChange({ target: { files: [{ name: "too-large.pdf", size: 1001 }] } }); ui.draw();
    await ui.submit(); ui.draw(); assert.equal(ui.calls.length, 0);
    ui.find((node) => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [{ name: "plan.pdf", size: 100 }] } }); ui.draw();
    const pending = ui.submit(); await ui.submit(); ui.draw();
    assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0].id, "route-project"); assert.equal(ui.calls[0].payload.get("title"), "Plan title");
    assert.equal(ui.calls[0].payload.get("uploaded_by"), undefined);
    ui.calls[0].reject({ response: { data: { file: ["Malformed PDF"] } } }); await pending; ui.draw();
    assert.equal(ui.find((node) => node.type === "input" && node.props.type === "file").props["aria-invalid"], true);
    const retry = ui.submit(); ui.calls[1].resolve({}); await retry; ui.draw();
    assert.equal(ui.saved, 1);
});

test("new project document versions send only the file and retain logical document identity", async () => {
    const ui = await projectUploadHarness(true);
    assert.equal(ui.find((node) => node.type === "input" && node.props.maxLength === 200), undefined);
    ui.find((node) => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [{ name: "revision.pdf", size: 100 }] } }); ui.draw();
    const pending = ui.submit();
    assert.equal(ui.calls[0].id, "document"); assert.equal(ui.calls[0].type, "version");
    assert.equal(ui.calls[0].payload.values.size, 1); assert.equal(ui.calls[0].payload.get("version_number"), undefined);
    ui.calls[0].resolve({}); await pending; assert.equal(ui.saved, 1);
});

test("project library uses server filters and pages, discards stale data and hides Admin controls from Supervisors", async () => {
    const state = delayHooks(); const calls = []; let role = "ADMIN"; let tree;
    const Router = await import("react-router-dom");
    const { exports } = await loadSource("pages/supervisor/ProjectWorkspace.jsx", { overrides: {
        react: { ...React, ...state.hooks },
        "react-router-dom": { ...Router, useParams: () => ({ projectId: "project" }) },
        "api/projectApi.js": { projectApi: {
            getProject: async () => ({ id: "project", name: "Site Alpha" }),
            documents: (id, params, signal) => new Promise((resolve, reject) => calls.push({ id, params, signal, resolve, reject })),
        }, projectDocumentFiles: {} },
    }, append: abortForDelay + "\nexport { ProjectDocumentLibrary };" });
    const draw = () => { tree = state.render(() => exports.ProjectDocumentLibrary({ role, projectId: "project" })); };
    const find = (predicate) => documentWalk(predicate, tree);
    draw(); await flushDelay(); draw();
    assert.equal(calls[0].id, "project"); assert.equal(calls[0].params.page_size, 8);
    find((node) => node.props?.label === "Search documents").props.onSearch("plan"); draw();
    assert.equal(calls[0].signal.aborted, true);
    calls[0].resolve({ results: [{ id: "stale" }], count: 1000, upload_rules: documentRules }); await flushDelay(); draw();
    assert.ok(find((node) => node.props?.role === "status"));
    calls[1].resolve({ results: [{ id: "document", title: "Site plan", document_type: "DRAWING", current_version: { id: "version", original_filename: "plan.pdf", file_size: 100, version_number: 2 } }], count: 17, upload_rules: documentRules, next: "ignored" }); await flushDelay(); draw();
    assert.equal(calls.length, 2);
    assert.ok(find((node) => node.type === "button" && Array.isArray(node.props.children) && node.props.children.includes("Upload Document")));
    assert.ok(find((node) => node.type === "button" && Array.isArray(node.props.children) && node.props.children.includes("New version")));
    role = "SUPERVISOR"; draw();
    assert.equal(find((node) => node.type === "button" && Array.isArray(node.props.children) && node.props.children.includes("Upload Document")), undefined);
    assert.equal(find((node) => node.type === "button" && Array.isArray(node.props.children) && node.props.children.includes("New version")), undefined);
    assert.ok(find((node) => node.type === "button" && node.props.children === "Version history"));
    find((node) => node.type === "button" && node.props.children === "Next").props.onClick(); draw();
    assert.equal(calls[2].params.page, 2); assert.equal(calls[2].params.search, "plan");
    calls[2].reject(new Error("Offline")); await flushDelay(); draw();
    assert.ok(find((node) => node.props?.role === "alert"));
    assert.equal(find((node) => node.type === "article"), undefined);
    state.cleanup();
});

test("project document routes use distinct authorized workspaces and replace sidebar placeholders", async () => {
    const { readFile } = await import("node:fs/promises");
    const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    for (const route of ["/admin/projects/:projectId/documents", "/supervisor/projects/:projectId/documents"]) assert.equal(app.split(`path="${route}"`).length - 1, 1);
    assert.match(app, /path="\/admin\/documents"\s+element=\{<ProjectDirectory role="ADMIN" section="documents"/);
    assert.match(app, /path="\/supervisor\/documents"\s+element=\{<ProjectDirectory role="SUPERVISOR" section="documents"/);
});


test("project version history pages retained files with current labels and handles retry", async () => {
    const state = delayHooks(); const calls = []; let tree;
    const { exports } = await loadSource("pages/supervisor/ProjectWorkspace.jsx", { overrides: {
        react: { ...React, ...state.hooks },
        "api/projectApi.js": { projectApi: { documentVersions: (id, params, signal) => new Promise((resolve, reject) => calls.push({ id, params, signal, resolve, reject })) }, projectDocumentFiles: { protected: true } },
    }, append: abortForDelay + "\nexport { ProjectDocumentHistory };" });
    const draw = () => { tree = state.render(() => exports.ProjectDocumentHistory({ documentRecord: { id: "document", title: "Site plan" }, revision: 0, onClose() {} })); };
    const find = (predicate) => documentWalk(predicate, tree);
    draw(); assert.equal(calls[0].id, "document"); assert.equal(calls[0].params.page_size, 8);
    calls[0].resolve({ results: [{ id: "old-version", version_number: 1, is_current: false, original_filename: "old.pdf", file_size: 100 }], count: 17 }); await flushDelay(); draw();
    assert.ok(find((node) => node.type === "h3" && node.props.children.includes("Previous")));
    const evidence = find((node) => node.type?.name === "ReportEvidence");
    assert.equal(evidence.props.files[0].id, "old-version"); assert.equal(evidence.props.fileApi.protected, true);
    find((node) => node.type === "button" && node.props.children === "Next versions").props.onClick(); draw();
    assert.equal(calls[1].params.page, 2); assert.equal(calls[0].signal.aborted, true);
    calls[1].reject(new Error("Offline")); await flushDelay(); draw();
    assert.ok(find((node) => node.type === "button" && node.props.children === "Retry"));
    state.cleanup();
});

test("task documents use one authorized page, reset search pagination and ignore late results", async () => {
    const state = delayHooks(), calls = [];
    let tree;
    const { exports } = await loadSource("components/tasks/TaskDocuments.jsx", { overrides: {
        react: { ...React, ...state.hooks },
        "api/taskApi.js": { taskApi: { documents: (id, params, signal) => new Promise((resolve, reject) => calls.push({ id, params, signal, resolve, reject })) } },
    } });
    const draw = () => { tree = state.render(() => exports.default({ taskId: "task", readOnly: false })); };
    const find = (predicate) => documentWalk(predicate, tree);
    draw(); assert.equal(calls.length, 1); assert.equal(calls[0].params.page_size, 8);
    calls[0].resolve({ results: [{ id: "first", title: "Plan" }], count: 17 }); await flushDelay(); draw();
    find((node) => node.type === "button" && node.props.children === "Next").props.onClick(); draw();
    assert.equal(calls[1].params.page, 2);
    find((node) => node.props?.label === "Search task documents").props.onSearch("footing"); draw();
    assert.equal(calls[1].signal.aborted, true); assert.equal(calls[2].params.page, 1); assert.equal(calls[2].params.search, "footing");
    calls[2].resolve({ results: [{ id: "match", title: "Footing" }], count: 1 }); await flushDelay(); draw();
    calls[1].resolve({ results: [{ id: "stale", title: "Wrong" }], count: 17 }); await flushDelay(); draw();
    assert.equal(find((node) => node.props?.record)?.props.record.id, "match");
    assert.equal(calls.length, 3); state.cleanup();
});

test("Admin task document version history keeps its resource scope after paginated loading", async () => {
    const state = delayHooks(), calls = [];
    const { exports: taskExports } = await loadSource("api/taskApi.js", { overrides: { "api/client.js": { api: {} } } });
    const { exports } = await loadSource("pages/admin/TaskDetails.jsx", { overrides: {
        react: { ...React, ...state.hooks },
        "api/taskApi.js": { ...taskExports, taskApi: { documentVersions: async (id, params) => { calls.push({ id, params }); return { results: [{ id: "version" }], count: 1, next: null }; } } },
    }, append: "\nexport { TaskWorkspace };" });
    const task = { id: "task", project: "project" }; let tree;
    const draw = () => { tree = state.render(() => exports.TaskWorkspace({ task })); };
    draw(); tree.props.onTabChange("documents"); draw();
    await tree.props.onVersions("document"); draw();
    assert.equal(calls.length, 1);
    assert.equal(tree.props.resources["versions:document"].data[0].id, "version");
    state.cleanup();
});

test("date-only schedule values keep their calendar day in western and eastern timezones", async () => {
    const { exports } = await loadSource("components/approvals/approvalUtils.js");
    const previous = process.env.TZ;
    try {
        for (const zone of ["America/Los_Angeles", "Pacific/Kiritimati", "Asia/Kolkata"]) {
            process.env.TZ = zone;
            assert.match(exports.formatDate("2026-11-02"), /^02 Nov 2026$/);
        }
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test("delay feedback reflects the independent extension decision and never repeats review navigation", async () => {
    const { exports } = await loadSource("components/approvals/review/DelayReportReview.jsx");
    for (const extension_status of ["PENDING", "APPROVED", "REJECTED"]) {
        const html = render(exports.default, { record: { id: "delay", task: "task", project_id: "project", status: "APPROVED", extension_requested: true, extension_status, expected_completion_date: "2026-11-02", current_end_date: "2026-10-30", requested_end_date: "2026-11-10" } });
        assert.ok(!html.includes("Review delay in Approval Center"));
        assert.ok(html.includes("View affected task"));
        if (extension_status === "APPROVED") { assert.ok(html.includes("was approved separately")); assert.ok(!html.includes("pending extension requires")); }
        if (extension_status === "REJECTED") assert.ok(html.includes("extension was rejected"));
        if (extension_status === "PENDING") assert.ok(html.includes("pending extension requires a separate decision"));
    }
});

test("cancelled projects disable operational approval while keeping the request readable", async () => {
    const { exports } = await loadSource("components/approvals/RequestReview.jsx", { overrides: {
        "hooks/useApprovalReview.js": { useApprovalReview: () => ({ record: { id: "delay", task: "task", project_id: "project", project_status: "CANCELLED", status: "APPROVED", extension_status: "PENDING", extension_requested: true }, loading: false, error: "", busy: "", decide() {}, retry() {} }), validationMessage: (error) => error.message },
    } });
    const html = render(exports.default, { item: { id: "delay", requestType: "extension" } });
    assert.match(html, /Operational changes cannot be approved/);
    assert.match(html, /disabled=""[^>]*>[\s\S]*?>Approve Request<\/button>/);
    assert.ok(html.includes("Requested new deadline"));
});

test("Admin delay review success closes the selected report and refreshes the register", async () => {
    const state = delayHooks(); let refreshes = 0, query = new URLSearchParams({ request: "report" });
    const Router = await import("react-router-dom");
    const { exports } = await loadSource("pages/supervisor/ProjectDelays.jsx", { overrides: {
        react: { ...React, ...state.hooks, useMemo: (compute) => compute() },
        "react-router-dom": { ...Router, useParams: () => ({ projectId: "project" }), useSearchParams: () => [query, (value) => { query = new URLSearchParams(value); }] },
        "hooks/useDelayReports.js": { useDelayReports: () => ({ reports: [{ id: "report", status: "PENDING" }], projects: [], project: { id: "project", status: "ACTIVE" }, filters: {}, loading: false, refresh() { refreshes++; } }) },
    } });
    let tree;
    const draw = () => { tree = state.render(() => exports.default({ role: "ADMIN" })); };
    draw();
    const review = documentWalk((node) => node.props?.item?.id === "report" && node.props.onSuccess, tree);
    assert.equal(review.props.readOnly, false);
    review.props.onSuccess({ requestType: "delay" }, "approve"); draw();
    assert.equal(query.has("request"), false); assert.equal(refreshes, 1);
    assert.ok(documentWalk((node) => node.props?.role === "status" && String(node.props.children).includes("deadline was not changed"), tree));
    state.cleanup();
});

test("project editing offers active categories and preserves an unchanged inactive relationship", async () => {
    const state = delayHooks(), categoryCalls = [], updates = [];
    const project = { id: "project", name: "Kept project", category: "retired", category_name: "Retired category", category_is_active: false, status: "ACTIVE" };
    const onClose = () => {};
    const confirmation = { confirm: async () => true, cancelConfirmation() {}, confirmationModal: null };
    const { exports } = await loadSource("modal/admin/EditProject.jsx", { overrides: {
        react: { ...React, ...state.hooks },
        "api/projectApi.js": { projectApi: {
            getCategories: async (params) => { categoryCalls.push(params); return { results: [{ id: "active", name: "Active category", is_active: true }, { id: "other-retired", name: "Other retired", is_active: false }], next: null }; },
            updateProject: async (id, payload) => { updates.push({ id, payload }); return project; },
        } },
        "hooks/useConfirmation.js": { useConfirmation: () => confirmation },
    }, append: '\ndocument.addEventListener = () => {}; document.removeEventListener = () => {}; const FormData = class { values = new Map(); append(key, value) { this.values.set(key, value); } get(key) { return this.values.get(key) ?? null; } };' });
    let tree;
    const draw = (value = project) => { tree = state.render(() => exports.default({ open: true, project: value, onClose })); };
    draw(); await flushDelay(); draw();
    assert.equal(categoryCalls[0].is_active, true);
    const find = (predicate) => documentWalk(predicate, tree);
    assert.equal(find((node) => node.type === "option" && node.props.value === "other-retired"), undefined);
    assert.equal(find((node) => node.type === "option" && node.props.value === "retired").props.disabled, true);
    await find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); draw();
    assert.equal(updates[0].payload.get("category"), null);
    find((node) => node.type === "select" && node.props.id === "edit-project-category").props.onChange({ target: { value: "active" } }); draw();
    await find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.equal(updates[1].payload.get("category"), "active");
    draw({ ...project, status: "CANCELLED" });
    assert.equal(tree, null); assert.equal(updates.length, 2);
    state.cleanup();
});

test("notification presentation uses audited events and keeps ambiguous legacy records neutral", async () => {
    const { exports } = await loadSource("components/notifications/NotificationCenter.jsx", { append: "\nexport { configFor, NotificationRow, resolveDestination };" });
    const rejected = exports.configFor({ notification_type: "TASK_APPROVAL", title: "Task approved", event: "TASK_REJECTED" });
    assert.match(rejected.tone, /B42318/); assert.match(rejected.label, /Rejected/);
    assert.match(exports.configFor({ notification_type: "TASK_APPROVAL", event: "TASK_APPROVED" }).tone, /166534/);
    assert.match(exports.configFor({ notification_type: "PROJECT_ASSIGNMENT", event: "SUPERVISOR_ASSIGNED" }).tone, /3565A5/);
    assert.match(exports.configFor({ notification_type: "SYSTEM", event: "PROJECT_CANCELLED" }).tone, /B42318/);
    assert.match(exports.configFor({ notification_type: "SYSTEM", event: "PROJECT_DATES_CHANGED" }).tone, /3565A5/);
    assert.match(exports.configFor({ notification_type: "TASK_APPROVAL", title: "Task approved" }).tone, /74614D/);
    const html = render(exports.NotificationRow, { notification: { id: "rejected", notification_type: "TASK_APPROVAL", title: "Rejected task", event: "TASK_REJECTED", is_read: false, message: "Read the Admin comment" } });
    assert.match(html, /Rejected task/); assert.match(html, /B42318/); assert.match(html, /Task approval \/ Rejected/);
});

test("project notifications and task batches use supported contextual destinations", async () => {
    const { exports } = await loadSource("components/notifications/NotificationCenter.jsx", { append: "\nexport { resolveDestination };" });
    const project = { notification_type: "SYSTEM", reference_type: "PROJECT", reference_id: "project" };
    assert.equal(await exports.resolveDestination(project, "SUPERVISOR"), "/supervisor/projects/project");
    assert.equal(await exports.resolveDestination(project, "ADMIN"), "/admin/projects/project");
    assert.equal(await exports.resolveDestination({ notification_type: "TASK_APPROVAL", reference_type: "TASK_BATCH", project_id: "project" }, "ADMIN"), "/admin/projects/project/tasks");
});

test("desktop and mobile navigation share the actual unread badge and hide zero counts", async () => {
    const user = { id: "user", username: "Supervisor", role: "SUPERVISOR" };
    for (const file of ["components/layout/DesktopSidebar.jsx", "components/layout/MobileBottomNav.jsx"]) {
        const { exports } = await loadSource(file);
        const positive = render(exports.default, { user, role: user.role, unreadCount: 12, open: true });
        assert.match(positive, /12 unread notifications/);
        const zero = render(exports.default, { user, role: user.role, unreadCount: 0, open: true });
        assert.ok(!zero.includes("0 unread notifications"));
    }
});

test("Supervisor task details show original review comments, reviewers and timestamps", async () => {
    const state = delayHooks(); const calls = [];
    const { exports: helpers } = await loadSource("api/taskApi.js", { overrides: { "api/client.js": { api: {} } } });
    const { exports } = await loadSource("pages/supervisor/ProjectTasks.jsx", { overrides: {
        react: { ...React, ...state.hooks },
        "api/delayApi.js": { delayApi: { list: async () => ({ count: 0, results: [] }) } },
        "api/taskApi.js": { ...helpers, taskApi: { history: async (id, params, signal) => {
            calls.push({ id, params, signal });
            return { count: 3, results: [
                { id: "extension", action: "EXTENSION_APPROVED", actor_name: "Actual Admin", created_at: "2026-11-05T11:00:00Z", details: { admin_comment: "Delivery time approved" } },
                { id: "approved", action: "APPROVED", actor_name: "Actual Admin", created_at: "2026-11-05T10:00:00Z", details: { comment: "Quantity checked and approved" } },
                { id: "rejected", action: "REJECTED", actor_name: "Earlier Admin", created_at: "2026-11-04T10:00:00Z", details: { reason: "Correct the quantities" } },
            ] };
        } } },
    }, append: "\nexport { ExpandedTask };" });
    let tree;
    const task = { id: "task", approval_status: "APPROVED", work_status: "NOT_STARTED" };
    const draw = () => { tree = state.render(() => exports.ExpandedTask({ task, loading: false })); };
    draw(); await flushDelay(); draw();
    assert.equal(calls.length, 1); assert.equal(calls[0].params.decisions_only, true); assert.equal(calls[0].params.page_size, 10);
    const contents = JSON.stringify(tree);
    for (const text of ["Quantity checked and approved", "Correct the quantities", "Actual Admin", "Earlier Admin", "Delivery time approved", "Admin decisions and comments"]) assert.ok(contents.includes(text));
    state.cleanup(); assert.equal(calls[0].signal.aborted, true);
});

test("layout consumes authoritative read counts without duplicate requests and rejects stale replies", async () => {
    const state = delayHooks(), requests = [];
    const user = { id: "user", role: "SUPERVISOR" };
    let pathname = "/supervisor/projects";
    const Router = await import("react-router-dom");
    const { exports } = await loadSource("layouts/AppLayout.jsx", { overrides: {
        react: { ...React, ...state.hooks },
        "hooks/useAuth.js": { useAuth: () => ({ user, logout: async () => {} }) },
        "react-router-dom": { ...Router, useLocation: () => ({ pathname }), useNavigate: () => () => {} },
        "api/notificationApi.js": { notificationApi: { unreadCount: (signal) => new Promise((resolve) => requests.push({ signal, resolve })) } },
    }, append: `
        export const listeners = new Map();
        const window = { scrollY: 0, setInterval: () => 1, clearInterval() {}, addEventListener(name, callback) { listeners.set(name, callback); }, removeEventListener(name) { listeners.delete(name); } };
        document.addEventListener = () => {}; document.removeEventListener = () => {};
    ` });
    let tree;
    const draw = () => { tree = state.render(() => exports.default()); };
    draw(); assert.equal(requests.length, 1);
    exports.listeners.get("rare:notifications-updated")({ detail: { unread_count: 5 } }); draw();
    assert.equal(requests.length, 1); assert.equal(requests[0].signal.aborted, true);
    requests[0].resolve({ unread_count: 99 }); await flushDelay(); draw();
    const sidebar = documentWalk((node) => node.props?.user && node.props.onLogout && node.props.unreadCount === 5, tree);
    assert.ok(sidebar);
    pathname = "/supervisor/notifications"; draw(); assert.equal(requests.length, 2);
    requests[1].resolve({ unread_count: 3 }); await flushDelay(); draw();
    const current = documentWalk((node) => node.props?.user && node.props.onLogout && node.props.unreadCount === 3, tree);
    assert.ok(current);
    await current.props.onLogout(); draw();
    assert.ok(!documentWalk((node) => node.props?.unreadCount === 3, tree));
    state.cleanup();
});

async function notificationHarness({ failRead = false, deferAll = false } = {}) {
    const state = delayHooks(), navigations = []; let tree, readCalls = 0, allCalls = 0, resolveAll;
    const records = Array.from({ length: 12 }, (_, index) => ({ id: `notification-${index}`, notification_type: "SYSTEM", event: "PROJECT_DATES_CHANGED", reference_type: "PROJECT", reference_id: "project", title: `Project update ${index}`, message: "Schedule changed", is_read: false, created_at: "2026-11-05T10:00:00Z" }));
    const Router = await import("react-router-dom");
    const markAll = () => { records.forEach((row) => { row.is_read = true; }); return { unread_count: 0, total_count: 12, updated_count: 12 }; };
    const { exports } = await loadSource("components/notifications/NotificationCenter.jsx", { overrides: {
        react: { ...React, ...state.hooks, useMemo: (compute) => compute() },
        "react-router-dom": { ...Router, useNavigate: () => (to) => navigations.push(to) },
        "api/notificationApi.js": { notificationApi: {
            list: async () => ({ count: 12, total_count: 12, unread_count: records.filter((row) => !row.is_read).length, results: records.map((row) => ({ ...row })), next: null }),
            markRead: async (id) => { readCalls++; if (failRead) throw { response: { data: { detail: "No access to this notification" } } }; const row = records.find((item) => item.id === id); row.is_read = true; row.read_at = "2026-11-05T11:00:00Z"; return { ...row, unread_count: 11, total_count: 12 }; },
            markAllRead: async () => { allCalls++; return deferAll ? new Promise((resolve) => { resolveAll = () => resolve(markAll()); }) : markAll(); },
        } },
    }, append: `
        export const dispatched = [];
        const window = { dispatchEvent(event) { dispatched.push(event); }, addEventListener() {}, removeEventListener() {} };
        const CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
        let noticeTimer;
        const setTimeout = (callback) => { noticeTimer = callback; return 1; };
        const clearTimeout = () => { noticeTimer = null; };
        export function expireNotice() { noticeTimer?.(); }
    ` });
    function draw() { tree = state.render(() => exports.default({ role: "SUPERVISOR" })); }
    const find = (predicate) => documentWalk(predicate, tree);
    draw(); await flushDelay(); draw();
    return { draw, find, navigations, exports, cleanup: state.cleanup,
        readCalls: () => readCalls, allCalls: () => allCalls, resolveAll: () => resolveAll(),
        row: () => find((node) => node.props?.notification?.id === "notification-0"),
    };
}

test("notification read uses server timestamps and counts before navigating to the project", async () => {
    const ui = await notificationHarness();
    assert.ok(ui.find((node) => node.type === "p" && String(node.props.children).includes("12 unread updates")));
    await ui.row().props.onOpen(ui.row().props.notification); ui.draw();
    assert.equal(ui.readCalls(), 1);
    assert.deepEqual(ui.navigations, ["/supervisor/projects/project"]);
    assert.equal(ui.row().props.notification.read_at, "2026-11-05T11:00:00Z");
    assert.equal(ui.exports.dispatched.at(-1).detail.unread_count, 11);
    ui.cleanup();
});

test("failed notification read preserves unread state and does not navigate", async () => {
    const ui = await notificationHarness({ failRead: true });
    await ui.row().props.onOpen(ui.row().props.notification); ui.draw();
    assert.equal(ui.navigations.length, 0);
    assert.ok(ui.find((node) => node.props?.role === "alert" && String(node.props.children).includes("No access")));
    ui.find((node) => node.type === "button" && node.props["aria-label"] === "Refresh notifications").props.onClick();
    ui.draw(); await flushDelay(); ui.draw();
    assert.equal(ui.row().props.notification.is_read, false);
    ui.cleanup();
});

test("mark all waits for server success, prevents duplicate writes and clears its transient notice", async () => {
    const ui = await notificationHarness({ deferAll: true });
    const button = ui.find((node) => node.type === "button" && node.props.children === "Mark all as read");
    const pending = button.props.onClick();
    await button.props.onClick(); ui.draw();
    assert.equal(ui.allCalls(), 1);
    assert.equal(ui.exports.dispatched.at(-1).detail.unread_count, 12);
    ui.resolveAll(); await pending; ui.draw(); await flushDelay(); ui.draw();
    assert.equal(ui.exports.dispatched.at(-1).detail.unread_count, 0);
    assert.ok(ui.find((node) => node.props?.role === "status" && node.props.children === "Notifications marked as read."));
    ui.exports.expireNotice(); ui.draw();
    assert.ok(!ui.find((node) => node.props?.role === "status" && node.props.children === "Notifications marked as read."));
    ui.cleanup();
});

test("unmounted notification operations cannot update a later session's unread badge", async () => {
    const ui = await notificationHarness({ deferAll: true });
    const pending = ui.find((node) => node.type === "button" && node.props.children === "Mark all as read").props.onClick();
    const events = ui.exports.dispatched.length;
    ui.cleanup(); ui.resolveAll(); await pending;
    assert.equal(ui.exports.dispatched.length, events);
});


test("delay completion date is required and strictly after the task deadline", async () => {
    const ui = await delayFormHarness();
    ui.change("task", "task"); ui.change("reason", "Rain");
    assert.equal(ui.find((node) => node.props?.id === "delay-expected_completion_date").props.min, "2026-10-31");
    assert.equal(ui.find((node) => node.props?.id === "delay-expected_completion_date").props.required, true);
    for (const value of ["", "2026-10-29", "2026-10-30"]) {
        ui.change("expected_completion_date", value);
        await ui.submit(); ui.draw();
        assert.equal(ui.find((node) => node.props?.id === "delay-expected_completion_date").props["aria-invalid"], true);
    }
    assert.equal(ui.confirmations.length, 0);
    ui.change("expected_completion_date", "2026-10-31");
    const submission = ui.submit();
    assert.equal(ui.confirmations.length, 1);
    ui.confirmations[0](false); await submission;
});

test("Supervisor task details load only that task's paginated delay reports and discard stale results", async () => {
    const state = delayHooks(), requests = [];
    const { exports: helpers } = await loadSource("api/taskApi.js", { overrides: { "api/client.js": { api: {} } } });
    const { exports } = await loadSource("pages/supervisor/ProjectTasks.jsx", { overrides: {
        react: { ...React, ...state.hooks },
        "api/taskApi.js": { ...helpers, taskApi: { history: async () => ({ count: 0, results: [] }) } },
        "api/delayApi.js": { delayApi: { list: (params, signal) => new Promise((resolve) => requests.push({ params, signal, resolve })) } },
    }, append: "\nexport { ExpandedTask };" });
    let task = { id: "first", end_date: "2026-10-30" }, tree;
    const draw = () => { tree = state.render(() => exports.ExpandedTask({ task, loading: false })); };
    draw();
    assert.deepEqual(JSON.parse(JSON.stringify(requests[0].params)), { task: "first", page: 1, page_size: 5 });
    task = { id: "second", end_date: "2026-11-01" }; draw();
    assert.equal(requests[0].signal.aborted, true);
    requests[0].resolve({ count: 1, results: [{ id: "old", reason: "Old private report" }] });
    requests[1].resolve({ count: 1, results: [{ id: "current", task: "second", reason: "Rain delay", status: "APPROVED", extension_status: "PENDING" }] });
    await flushDelay(); draw();
    assert.ok(!JSON.stringify(tree).includes("Old private report"));
    assert.ok(JSON.stringify(tree).includes("Rain delay"));
    assert.ok(JSON.stringify(tree).includes("Delay reports for this task"));
    state.cleanup(); assert.equal(requests[1].signal.aborted, true);
});


function quickFind(node, predicate) {
    if (Array.isArray(node)) return node.map((child) => quickFind(child, predicate)).find(Boolean);
    if (!node || typeof node !== "object") return;
    return predicate(node) ? node : quickFind(node.props?.children, predicate);
}

test("Supervisor Quick Actions match the Admin card pattern and provide direct project/task links", async () => {
    const state = delayHooks();
    const { exports } = await loadSource("pages/Dashboard.jsx", { overrides: { react: { ...React, ...state.hooks }, "components/dashboard/AdminQuickActions.jsx": { default: () => null } }, append: "\nexport { SupervisorQuickActions };" });
    let tree;
    const draw = () => { tree = state.render(() => exports.SupervisorQuickActions()); };
    draw();
    const contents = JSON.stringify(tree);
    for (const text of ["My Projects", "My Tasks", "Daily Report", "Create Task", "grid-cols-2", "sm:grid-cols-4", "/supervisor/projects", "/supervisor/tasks"]) assert.ok(contents.includes(text));
    quickFind(tree, (node) => node.type === "button" && JSON.stringify(node.props.children).includes("Daily Report")).props.onClick(); draw();
    assert.ok(quickFind(tree, (node) => node.type?.name === "SupervisorProjectSelector" && node.props.action === "report"));
    state.cleanup();
});

test("one Supervisor project selector handles eligible projects, errors, search and both create destinations without mutations", async () => {
    const Router = await import("react-router-dom");
    for (const action of ["report", "task"]) {
        const state = delayHooks(), requests = [], routes = [];
        const { exports } = await loadSource("pages/Dashboard.jsx", { overrides: {
            react: { ...React, ...state.hooks },
            "components/dashboard/AdminQuickActions.jsx": { default: () => null },
            "react-router-dom": { ...Router, useNavigate: () => (path) => routes.push(path) },
            "api/projectApi.js": { projectApi: { getProjects: (params, signal) => new Promise((resolve, reject) => requests.push({ params, signal, resolve, reject })) } },
        }, append: "\nexport { SupervisorProjectSelector };" });
        let tree, closed = 0;
        const draw = () => { tree = state.render(() => exports.SupervisorProjectSelector({ action, onClose: () => closed++ })); };
        const submit = () => quickFind(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
        draw(); draw();
        assert.equal(requests.length, 1);
        submit(); assert.equal(routes.length, 0);
        requests[0].resolve({ results: [
            { id: "active", name: "Active site", status: "ACTIVE" }, { id: "maintenance", name: "Maintenance site", status: "MAINTENANCE" },
            { id: "cancelled", name: "Hidden cancelled", status: "CANCELLED" }, { id: "completed", name: "Hidden completed", status: "COMPLETED" }, { id: "hold", name: "Hidden on hold", status: "ON_HOLD" },
        ], next: true, previous: false });
        await flushDelay(); draw();
        assert.ok(JSON.stringify(tree).includes("Maintenance site"));
        for (const text of ["Hidden cancelled", "Hidden completed", "Hidden on hold"]) assert.ok(!JSON.stringify(tree).includes(text));
        quickFind(tree, (node) => node.type === "input" && node.props.value === "maintenance").props.onChange(); draw();
        quickFind(tree, (node) => node.type?.name === "ProjectSearch").props.onSearch("Maintenance"); draw();
        assert.equal(requests.length, 2); assert.equal(requests[1].params.search, "Maintenance");
        assert.ok(JSON.stringify(tree).includes("Selected:"));
        requests[1].reject({ response: { data: { detail: "Access changed" } } }); await flushDelay(); draw();
        assert.ok(JSON.stringify(tree).includes("Access changed"));
        quickFind(tree, (node) => node.type === "button" && node.props.children === "Retry").props.onClick(); draw();
        requests[2].resolve({ results: [], next: false, previous: false }); await flushDelay(); draw();
        submit(); submit();
        assert.deepEqual(routes, [`/supervisor/projects/maintenance/${action === "report" ? "daily-reports" : "tasks"}?create=true`]);
        assert.equal(closed, 1);
        state.cleanup(); assert.equal(requests[2].signal.aborted, true);
    }
});

test("dashboard create links open existing Supervisor task/report forms only for eligible projects and never save on navigation", async () => {
    const Router = await import("react-router-dom");
    const projectId = "00000000-0000-4000-8000-000000000001";
    const { exports: helpers } = await loadSource("api/taskApi.js", { overrides: { "api/client.js": { api: {} } } });
    for (const status of ["ACTIVE", "MAINTENANCE", "ON_HOLD", "CANCELLED", "COMPLETED"]) {
        for (const kind of ["task", "report"]) {
            const state = delayHooks(); let query = new URLSearchParams("create=true");
            const setQuery = (next) => { query = next; };
            const { exports } = await loadSource(kind === "task" ? "pages/supervisor/ProjectTasks.jsx" : "pages/admin/DailyReports.jsx", { overrides: {
                react: { ...React, ...state.hooks, useMemo: (calculate) => calculate() },
                "react-router-dom": { ...Router, useParams: () => ({ projectId }), useSearchParams: () => [query, setQuery] },
                "api/projectApi.js": { projectApi: { getProject: async () => ({ id: projectId, status }), getProjectOverview: async () => ({ id: projectId, status }) } },
                "api/taskApi.js": { ...helpers, taskApi: { list: async () => [] } },
                "api/dailyReportApi.js": { dailyReportApi: { list: async () => ({ count: 0, results: [], summary: { total: 0, drafts: 0, submitted: 0, pending_work: 0 } }) } },
            }, append: kind === "report" ? "\nexport { ProjectReportWorkspace };" : "" });
            let tree;
            const draw = () => { tree = state.render(() => kind === "task" ? exports.default() : exports.ProjectReportWorkspace({ projectId, role: "SUPERVISOR", user: { id: "supervisor" } })); };
            draw(); await flushDelay(); draw(); draw();
            const eligible = ["ACTIVE", "MAINTENANCE"].includes(status);
            if (kind === "task") {
                const form = quickFind(tree, (node) => node.type?.name === "TaskForm");
                assert.equal(form.props.open, eligible);
            } else {
                assert.equal(Boolean(quickFind(tree, (node) => node.type?.name === "ReportDiaryForm")), eligible);
            }
            assert.equal(query.has("create"), false);
            state.cleanup();
        }
    }
});


test("task work form shows verified, pending and available quantities and blocks overflow without losing values", async () => {
    const state = delayHooks(), saved = [];
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx", { overrides: { react: { ...React, ...state.hooks } } });
    const progress = { measurement_method: "QUANTITY", measurement_unit: "SQM", planned_quantity: "100.000", verified_quantity: "65.000", pending_quantity: "20.000", available_quantity: "15.000", progress_percentage: "65.00" };
    let initial = { id: "entry", task: "task", task_title: "Walls", measurement_method: "QUANTITY", measurement_unit: "SQM", quantity_completed_today: "25", work_description: "Site work", progress };
    let tree;
    const draw = () => { tree = state.render(() => exports.ReportWorkForm({ initial, onSave: (payload) => saved.push(payload), onCancel() {} })); };
    draw();
    const content = JSON.stringify(tree);
    for (const text of ["100.000 SQM", "65.000 SQM", "20.000 SQM", "15.000 SQM", "Only 15.000 SQM", "Pending quantities are awaiting Admin verification"]) assert.ok(content.includes(text));
    const bar = quickFind(tree, (node) => node.type?.name === "TaskProgress");
    const html = render(bar.type, bar.props);
    assert.ok(html.includes('aria-valuenow="65"'));
    assert.equal(quickFind(tree, (node) => node.type === "button" && node.props.type === "submit").props.disabled, true);
    quickFind(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.equal(saved.length, 0);
    quickFind(tree, (node) => node.type === "input" && node.props.type === "number").props.onChange({ target: { value: "15.000" } }); draw();
    assert.equal(quickFind(tree, (node) => node.type === "button" && node.props.type === "submit").props.disabled, false);
    quickFind(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.equal(saved[0].quantity_completed_today, "15.000");
    // A refreshed baseline must invalidate stale quantities without rewriting the input.
    initial = { ...initial, progress: { ...progress, pending_quantity: "25.000", available_quantity: "10.000" } }; draw();
    assert.equal(quickFind(tree, (node) => node.type === "input" && node.props.type === "number").props.value, "15.000");
    assert.ok(JSON.stringify(tree).includes("Only 10.000 SQM"));
    for (const value of ["0", "-1", "1.0001", "NaN"]) {
        quickFind(tree, (node) => node.type === "input" && node.props.type === "number").props.onChange({ target: { value } }); draw();
        assert.equal(quickFind(tree, (node) => node.type === "button" && node.props.type === "submit").props.disabled, true);
    }
    state.cleanup();
});


test("selecting another task replaces work capacity and keeps completion-only inputs quantity-free", async () => {
    const state = delayHooks();
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx", { overrides: { react: { ...React, ...state.hooks } } });
    const tasks = { results: [
        { id: "quantity", title: "Measured walls", measurement_method: "QUANTITY", measurement_unit: "SQM", progress: { measurement_method: "QUANTITY", measurement_unit: "SQM", planned_quantity: "100.000", verified_quantity: "25.000", pending_quantity: "15.000", available_quantity: "60.000", progress_percentage: "25.00" } },
        { id: "completion", title: "Inspection", measurement_method: "COMPLETION_ONLY", completion_criteria: "Signed check", progress: { measurement_method: "COMPLETION_ONLY", progress_percentage: "0.00", is_fully_verified: false } },
    ] };
    let tree;
    const draw = () => { tree = state.render(() => exports.ReportWorkForm({ tasks, onSave() {}, onCancel() {} })); };
    draw();
    assert.ok(!quickFind(tree, (node) => node.props?.["aria-label"] === "Selected task progress"));
    quickFind(tree, (node) => node.type === "select").props.onChange({ target: { value: "quantity" } }); draw();
    assert.ok(JSON.stringify(tree).includes("60.000 SQM"));
    quickFind(tree, (node) => node.type === "select").props.onChange({ target: { value: "completion" } }); draw();
    assert.ok(!quickFind(tree, (node) => node.type === "input" && node.props.type === "number"));
    assert.ok(JSON.stringify(tree).includes("Signed check"));
    assert.ok(!JSON.stringify(tree).includes("60.000 SQM"));
    const bar = quickFind(tree, (node) => node.type?.name === "TaskProgress");
    assert.ok(render(bar.type, bar.props).includes('aria-valuenow="0"'));
    state.cleanup();
});
