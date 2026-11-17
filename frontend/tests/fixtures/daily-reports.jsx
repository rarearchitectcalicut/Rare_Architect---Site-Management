// Local visual fixture. All report operations stay in sessionStorage; no backend
// requests or production records are used. Open through Vite, never production.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ProjectDailyReports } from "../../src/pages/admin/DailyReports";
import { AuthContext } from "../../src/context/AuthContext";
import { dailyReportApi } from "../../src/api/dailyReportApi";
import { projectApi } from "../../src/api/projectApi";
import { taskApi } from "../../src/api/taskApi";
import "../../src/index.css";

const project = "22222222-2222-4222-8222-222222222222";
const id = "11111111-1111-4111-8111-111111111111";
const initial = { id, project, project_name: "Lake House · Local QA", project_status: "ACTIVE", reported_by: "qa-supervisor", reported_by_name: "Site Supervisor", report_date: "2026-11-16", work_summary: "", weather_condition: "", site_condition: "", site_notes: "", issues: "", next_day_plan: "", status: "DRAFT", work_entry_count: 0 };
const key = "daily-reports-local-qa";
const data = JSON.parse(sessionStorage.getItem(key) || "null") || { report: initial, "work-entries": [], manpower: [], materials: [], attachments: [] };
const persist = () => sessionStorage.setItem(key, JSON.stringify(data));
const page = (rows) => ({ results: rows, count: rows.length, next: null, previous: null });
const copy = (value) => structuredClone(value);
projectApi.getProject = async () => ({ id: project, name: initial.project_name, status: "ACTIVE" });
dailyReportApi.get = async () => copy(data.report);
dailyReportApi.list = async () => ({ ...page([data.report]), summary: { total: 1, drafts: data.report.status === "DRAFT" ? 1 : 0, submitted: data.report.status === "SUBMITTED" ? 1 : 0, pending_work: 0 }, reporters: [], reporting_context: { today: "2026-11-16", time_zone: "Asia/Kolkata" } });
dailyReportApi.update = async (_, values) => { if (sessionStorage.getItem("qa-fail-save")) throw new Error("Local QA: simulated save failure. Your input remains in the editor."); Object.assign(data.report, values); persist(); return copy(data.report); };
dailyReportApi.section = async (_, section) => copy(page(data[section]));
dailyReportApi.saveRow = async (_, section, values, rowId) => {
    const row = { ...values, id: rowId || crypto.randomUUID(), daily_report: id, task_title: values.task ? "Ground-floor blockwork" : undefined, measurement_method: values.task ? "QUANTITY" : undefined, measurement_unit: "SQM", verification_status: "PENDING" };
    data[section] = [...data[section].filter((item) => item.id !== row.id), row]; data.report.work_entry_count = data["work-entries"].length; persist(); return copy(row);
};
dailyReportApi.removeRow = async (section, rowId) => { data[section] = data[section].filter((row) => row.id !== rowId); persist(); };
dailyReportApi.submit = async () => { data.report.status = "SUBMITTED"; data.report.submitted_at = new Date().toISOString(); persist(); return { report: copy(data.report) }; };
dailyReportApi.upload = async () => { throw new Error("Local QA fixture: file requests are intentionally simulated. Use the API tests for upload persistence."); };
taskApi.register = async () => page([{ id: "33333333-3333-4333-8333-333333333333", title: "Ground-floor blockwork", measurement_method: "QUANTITY", measurement_unit: "SQM", work_status: "IN_PROGRESS", progress: { planned_quantity: "100", verified_quantity: "20", pending_quantity: "10", available_quantity: "70", quantity_conflict: false } }]);

function Frame() {
    const [width, setWidth] = useState(390);
    const [fail, setFail] = useState(false);
    return <><header className="flex flex-wrap gap-2 bg-white p-3 text-sm">{[320, 375, 390, 430, 768, 1440].map((size) => <button className="rounded border px-3 py-2" key={size} onClick={() => setWidth(size)}>{size}px</button>)}<button className="rounded border px-3 py-2" onClick={() => { sessionStorage.removeItem(key); location.reload(); }}>Reset QA draft</button><button className="rounded border px-3 py-2" aria-pressed={fail} onClick={() => { setFail(!fail); if (!fail) sessionStorage.setItem("qa-fail-save", "1"); else sessionStorage.removeItem("qa-fail-save"); }}>Save failure: {fail ? "On" : "Off"}</button></header><p className="p-3 text-sm">Local fixture · {width} CSS pixels · no backend writes</p><iframe title="Daily report preview" style={{ width, height: "80vh", maxWidth: "none", border: "1px solid #ccc", background: "#f1eadf" }} src={`?inner=true&report=${id}`} /></>;
}

if (new URLSearchParams(location.search).has("inner")) {
    createRoot(document.getElementById("root")).render(<BrowserRouter><AuthContext.Provider value={{ user: { id: "qa-supervisor", role: "SUPERVISOR" } }}><main className="min-h-dvh bg-[#F5F0E8] p-3 sm:p-5"><ProjectDailyReports projectId={project} /></main></AuthContext.Provider></BrowserRouter>);
} else createRoot(document.getElementById("root")).render(<Frame />);
