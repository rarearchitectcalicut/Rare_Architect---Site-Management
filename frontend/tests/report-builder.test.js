import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./source-loader.js";
import { workActivities, toggleReportSentence } from "../src/components/daily-reports/siteReportOptions.js";

test("activity suggestions preserve handwritten detail and do not invent verified progress", () => {
  const text = "  Keep this handwritten detail.  ";
  const sentence = workActivities.find(([label]) => label === "Blockwork")[1];
  const added = toggleReportSentence(text, sentence);
  assert.equal(added, `${text}\nBlockwork carried out.`);
  assert.equal(toggleReportSentence(added, sentence), text);
  assert.ok(!added.includes("completed"));
  assert.ok(!added.includes("verified"));
});

test("quick diary uses compact native dropdowns, keeps blank drafts valid and exposes saved activity tags", async () => {
  const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx");
  const html = renderToStaticMarkup(React.createElement(exports.ReportDiaryForm, { quick: true, guided: true, report: { id: "draft", report_date: "2026-11-17", work_summary: "Blockwork carried out.", weather_condition: "", issues: "" }, onSave() {} }));
  for (const label of ["Did work happen today?", "Add a work activity", "Weather", "Any site issues or safety concerns?"]) assert.ok(html.includes(`aria-label="${label}"`));
  assert.ok(html.includes('aria-label="Remove Blockwork"'));
  assert.ok(!html.includes('class="rare-report-choice"'));
  assert.ok(html.includes('<option value="" selected="">Not recorded</option>'));
  assert.ok(!html.includes('textarea required=""'));
  assert.ok(html.includes("Save Draft"));
});

test("quick draft keeps the existing site-condition limit and associates summary feedback", async () => {
  const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx");
  const html = renderToStaticMarkup(React.createElement(exports.ReportDiaryForm, { quick: true, guided: true, report: { id: "draft", report_date: "2026-11-17", site_condition: "x".repeat(255) }, workSummaryError: "Work Summary is required.", onSave() {} }));
  assert.match(html, /maxlength="255"/i);
  assert.ok(html.includes("Maximum 255 characters reached."));
  assert.ok(html.includes('aria-describedby="work-summary-error-draft"'));
  assert.ok(html.includes('id="work-summary-error-draft" role="alert"'));
});

test("Add task work uses the task dropdown without search and only shows real paging controls", async () => {
  const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx");
  const props = { guided: true, onSave() {}, onCancel() {}, onTaskPage() {} };
  const html = renderToStaticMarkup(React.createElement(exports.ReportWorkForm, { ...props, tasks: { results: [], next: null, previous: null } }));
  assert.ok(html.includes('aria-label="Task"'));
  assert.ok(!html.includes("Task name or description"));
  assert.ok(!html.includes("Search tasks"));
  assert.ok(!html.includes("Task choices pages"));
  assert.ok(html.indexOf("Cancel entry") < html.lastIndexOf(">Add</button>"));
  assert.ok(html.includes('class="rare-report-work-actions"'));
  const paged = renderToStaticMarkup(React.createElement(exports.ReportWorkForm, { ...props, tasks: { results: [], next: "next-page", previous: null } }));
  assert.ok(paged.includes("Next tasks")); assert.ok(!paged.includes("Previous tasks"));
});
