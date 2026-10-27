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
    ui.change("task", "task"); ui.change("reason", " Rain delayed access "); ui.change("extension_requested", true); ui.change("requested_end_date", "2026-10-30");
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
    const ui = await delayFormHarness(); ui.change("task", "task"); ui.change("reason", "Rain");
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

test("Admin project delay register is read-only and links to the existing approval engine", async () => {
    const { exports } = await loadSource("pages/supervisor/ProjectDelays.jsx", { overrides: {
        "hooks/useDelayReports.js": { useDelayReports: () => ({ reports: [{ id: "report", status: "PENDING", project_id: "project", task_title: "Wall work" }], projects: [{ id: "project", name: "Site Alpha" }], project: { id: "project", name: "Site Alpha", status: "ACTIVE" }, summary: { total: 1, pending: 1, approved: 0, rejected: 0, pending_extensions: 0 }, count: 1, page: 1, pageCount: 1, filters: { search: "", status: "", sort: "newest", project: "", extension: "", delayType: "" }, loading: false, error: "", refresh() {}, setPage() {}, updateFilter() {}, clear() {} }) },
        "hooks/useApprovalReview.js": { useApprovalReview: () => ({ record: { id: "report", project_id: "project", task: "task", status: "PENDING" }, loading: false, error: "", busy: "", decide() {}, retry() {} }), validationMessage: () => "Failed" },
    } });
    const html = render(exports.default, { role: "ADMIN" }, "/admin/delays?project=project&request=report");
    assert.ok(html.includes("Site Alpha")); assert.ok(html.includes("/admin/approvals?tab=delays"));
    assert.ok(!/>Approve<\/button>/.test(html)); assert.ok(!/>Reject<\/button>/.test(html));
    assert.ok(!html.includes("Report delay</button>"));
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
    find((node) => node.type === "input" && node.props.type === "search").props.onChange({ target: { value: "plan" } }); draw();
    assert.equal(calls[0].signal.aborted, true);
    calls[0].resolve({ results: [{ id: "stale" }], count: 1000, upload_rules: documentRules }); await flushDelay(); draw();
    assert.ok(find((node) => node.props?.role === "status"));
    calls[1].resolve({ results: [{ id: "document", title: "Site plan", document_type: "DRAWING", current_version: { id: "version", original_filename: "plan.pdf", file_size: 100, version_number: 2 } }], count: 17, upload_rules: documentRules, next: "ignored" }); await flushDelay(); draw();
    assert.equal(calls.length, 2);
    assert.ok(find((node) => node.type === "button" && node.props.children === "Upload document"));
    assert.ok(find((node) => node.type === "button" && node.props.children === "New version"));
    role = "SUPERVISOR"; draw();
    assert.equal(find((node) => node.type === "button" && node.props.children === "Upload document"), undefined);
    assert.equal(find((node) => node.type === "button" && node.props.children === "New version"), undefined);
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
