import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { loadSource } from "./source-loader.js";
import { diaryValues, diaryChanged, prepareReportSubmission, submitWithRecovery } from "../src/components/daily-reports/reportDraft.js";

test("retry identifiers use secure random bytes when randomUUID is unavailable", async () => {
    const { exports } = await loadSource("components/daily-reports/reportDraft.js", { append: '\nglobalThis.crypto = { getRandomValues: (bytes) => bytes.fill(17) };' });
    assert.equal(exports.retryId(), "11111111-1111-4111-9111-111111111111");
});

test("partial diary values preserve every saved field and distinguish unsaved text", () => {
    const report = { report_date: "2026-11-16", weather_condition: "RAINY", issues: "Not inspected", site_notes: "Keep existing notes" };
    const values = diaryValues(report);
    assert.equal(values.work_summary, "");
    assert.equal(diaryChanged(values, report), false);
    assert.equal(diaryChanged({ ...values, work_summary: "No work today: Heavy rain." }, report), true);
    assert.equal(values.issues, "Not inspected");
});

test("submission preparation checks the saved diary and permits empty optional sections", async () => {
    const sections = [];
    const report = { id: "report", status: "DRAFT", work_summary: "No work today: Heavy rain." };
    const current = await prepareReportSubmission({
        get: async () => report,
        section: async (_, section) => { sections.push(section); return { count: 0, results: [] }; },
    }, "report");
    assert.equal(current, report);
    assert.deepEqual(sections.sort(), ["attachments", "manpower", "materials", "work-entries"]);
});

test("missing summary has a specific error and does not request resource sections", async () => {
    let reads = 0;
    await assert.rejects(() => prepareReportSubmission({ get: async () => ({ status: "DRAFT", work_summary: "  " }), section: async () => { reads++; } }, "report"), /Add a work summary.*Site Update/);
    assert.equal(reads, 0);
});

test("failed optional section reads block submission and name the section for retry", async () => {
    let fail = true;
    const api = {
        get: async () => ({ status: "DRAFT", work_summary: "Saved work" }),
        section: async (_, section) => { if (section === "materials" && fail) throw new Error("Offline"); return { count: 0, results: [] }; },
    };
    await assert.rejects(() => prepareReportSubmission(api, "report"), /Could not load materials/);
    fail = false;
    assert.equal((await prepareReportSubmission(api, "report")).status, "DRAFT");
});

test("an already submitted report skips draft summary and section requirements", async () => {
    const report = { status: "SUBMITTED" };
    assert.equal(await prepareReportSubmission({ get: async () => report, section: () => { throw new Error("Unexpected read"); } }, "report"), report);
});

test("submission reconciles a lost successful response without another submit", async () => {
    let submitted = false, submissions = 0;
    const api = {
        get: async () => ({ status: submitted ? "SUBMITTED" : "DRAFT" }),
        submit: async () => { submissions++; submitted = true; throw new Error("Timeout"); },
    };
    assert.equal((await submitWithRecovery(api, "report")).status, "SUBMITTED");
    assert.equal((await submitWithRecovery(api, "report")).status, "SUBMITTED");
    assert.equal(submissions, 1);
});

test("uncertain submission cannot retry a write until a status read succeeds", async () => {
    let gets = 0, submissions = 0;
    const api = { get: async () => { if (++gets > 1) throw new Error("Offline"); return { status: "DRAFT" }; }, submit: async () => { submissions++; throw new Error("Timeout"); } };
    await assert.rejects(() => submitWithRecovery(api, "report"), /could not be confirmed/);
    await assert.rejects(() => submitWithRecovery(api, "report"), /Offline/);
    assert.equal(submissions, 1);
});

test("a confirmed failed submission preserves the server validation error", async () => {
    const failure = new Error("Quantity exceeds available work");
    await assert.rejects(() => submitWithRecovery({ get: async () => ({ status: "DRAFT" }), submit: async () => { throw failure; } }, "report"), (error) => error === failure);
});

function find(node, predicate) {
    if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
    if (!node || typeof node !== "object") return;
    return predicate(node) ? node : find(node.props?.children, predicate);
}

async function quickUpdate(initial = {}) {
    const slots = []; let cursor = 0, tree, values = diaryValues(initial);
    const { exports } = await loadSource("components/daily-reports/QuickSiteUpdate.jsx", { overrides: { react: { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; } } } });
    function draw() { cursor = 0; tree = exports.default({ values, onChange(next) { values = typeof next === "function" ? next(values) : next; } }); }
    draw();
    return {
        get values() { return values; },
        select(label, value) { find(tree, (node) => node.props?.label === label).props.onChange(value); draw(); },
        type(field, value) { const input = find(tree, (node) => node.type === "textarea" && node.props.value === values[field]); input.props.onChange({ target: { value } }); draw(); },
        get tree() { return tree; },
    };
}

test("work/no-work choices require explicit selection and preserve both explanations", async () => {
    const ui = await quickUpdate({ report_date: "2026-11-16", work_summary: "Blockwork continued" });
    ui.select("Did work happen today?", "no");
    assert.equal(ui.values.work_summary, "");
    ui.select("Why was there no work?", "Heavy rain");
    assert.equal(ui.values.work_summary, "No work today: Heavy rain.");
    ui.select("Did work happen today?", "yes");
    assert.equal(ui.values.work_summary, "Blockwork continued");
    ui.select("Did work happen today?", "no");
    assert.equal(ui.values.work_summary, "No work today: Heavy rain.");
    ui.type("work_summary", "No work today: Heavy rain and access blocked.");
    ui.select("Did work happen today?", "no");
    assert.equal(ui.values.work_summary, "No work today: Heavy rain and access blocked.");
    assert.equal(ui.values.weather_condition, "");
});

test("weather and issues are explicit; unrecorded never means no issues", async () => {
    const ui = await quickUpdate({ issues: "Scaffolding needs inspection" });
    ui.select("Weather", "HEAVY_RAIN");
    assert.equal(ui.values.weather_condition, "HEAVY_RAIN");
    ui.select("Any site issues or safety concerns?", "unrecorded");
    assert.equal(ui.values.issues, "");
    ui.select("Any site issues or safety concerns?", "safety");
    assert.equal(ui.values.issues, "Safety concern: Scaffolding needs inspection");
    ui.select("Any site issues or safety concerns?", "none");
    assert.equal(ui.values.issues, "No issues observed");
    ui.select("Any site issues or safety concerns?", "issue");
    assert.equal(ui.values.issues, "Scaffolding needs inspection");
});

test("a lost work-row create response recovers only an identical task record", async () => {
    let saved = { id: "row", daily_report: "draft", task: "task", work_description: "Wall work", quantity_completed_today: "2.000" };
    const { exports } = await loadSource("api/dailyReportApi.js", { overrides: { "api/client.js": { api: {
        post: async () => { throw new Error("Timeout"); },
        get: async () => ({ data: { results: [saved], next: null } }),
    } } } });
    const payload = { task: "task", work_description: "Wall work", quantity_completed_today: "2" };
    assert.equal((await exports.dailyReportApi.saveRow("draft", "work-entries", payload)).id, "row");
    saved = { ...saved, work_description: "Different work" };
    await assert.rejects(() => exports.dailyReportApi.saveRow("draft", "work-entries", payload), /Timeout/);
});

test("new manpower has no invented worker count and no create happens on opening", async () => {
    let saved = 0;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx");
    const html = renderToStaticMarkup(React.createElement(exports.ReportRowForm, { section: "manpower", onSave() { saved++; } }));
    assert.match(html, /min="1"/);
    assert.match(html, /inputMode="numeric"/);
    assert.equal(saved, 0);
    assert(!html.includes('value="1"'));
});
