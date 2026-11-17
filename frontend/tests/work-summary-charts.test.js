import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { loadSource } from "./source-loader.js";

const { exports: charts } = await loadSource("components/dashboard/WorkSummary.jsx");
const render = (props) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(charts.default, props)));
const { exports: chartData } = await loadSource("components/dashboard/workSummaryData.js");
const data = { tasks: { total: 20, total_created: 20, approved: 12, pending_approval: 6, rejected: 2, completed: 7 }, work: { verified: 10, pending_verification: 5, rejected: 0 }, reports: { submitted: 8, draft: 3 } };

test("approval chart partitions approval states without double-counting completed tasks", () => {
  const html = render(data);
  assert.ok(html.includes('stroke-dasharray="60 40"'));
  assert.ok(html.includes('stroke-dasharray="30 70"'));
  assert.ok(html.includes('stroke-dasharray="10 90"'));
  assert.ok(html.includes('aria-label="Completed tasks, 7"'));
  assert.ok(html.includes('href="/supervisor/tasks?work_status=COMPLETED"'));
  assert.ok(html.includes('aria-label="Rejected tasks, 2"'));
  assert.ok(html.includes("separate from approval"));
});

test("vertical verification bars share a zero-based scale and do not imply quantity progress", () => {
  const html = render(data);
  assert.ok(html.includes('style="height:50%"'));
  assert.ok(html.includes('style="height:100%"'));
  assert.ok(html.includes('style="height:0%"'));
  assert.ok(html.includes('aria-label="Awaiting verification work, 5"'));
  assert.ok(html.includes("counts, not measured progress"));
  assert.ok(html.includes('aria-label="Submitted daily reports, 8"'));
});

test("missing and invalid data stay unavailable; true zero produces an empty chart", () => {
  for (const invalid of [null, undefined, "", -1, "bad", Infinity, 2.5]) assert.equal(chartData.metricCount(invalid), null);
  assert.equal(chartData.metricCount("12"), 12);
  const missing = render({});
  assert.ok(missing.includes("Distribution unavailable"));
  assert.ok(!missing.includes("NaN"));
  assert.ok(!missing.includes("stroke-dasharray"));
  const zero = render({ tasks: { approved: 0, pending_approval: 0, rejected: 0 }, work: { verified: 0, pending_verification: 0, rejected: 0 } });
  assert.ok(zero.includes("No tasks yet"));
  assert.ok(zero.includes("No work entries to display yet"));
  assert.ok(!zero.includes("stroke-dasharray"));
});

test("Admin charts preserve project metrics and use Admin destinations only", () => {
  const html = render({ ...data, isAdmin: true, projects: { total: 9, active: 5, maintenance: 2 } });
  assert.ok(!html.includes("/supervisor/"));
  for (const url of ["/admin/approvals?tab=tasks", "/admin/reports", "/admin/approvals?tab=work", "/admin/projects?status=ACTIVE", "/admin/projects?status=MAINTENANCE"]) assert.ok(html.includes(url));
  assert.ok(html.includes("Total tasks"));
  assert.ok(html.includes("Across all projects"));
});
