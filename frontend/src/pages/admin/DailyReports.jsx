import { useEffect, useRef, useState } from "react";
import { ProjectSearch } from "../../components/daily-reports/ReportProjectPicker";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, CloudSun, FileText, FolderOpen, Plus, RefreshCw, UserRound } from "lucide-react";
import DailyReportSummary, { ReportAttachmentForm, ReportDiaryForm, ReportRowForm, ReportWorkEntry, ReportWorkForm, ReportStatusBadge } from "../../components/daily-reports/DailyReportSummary";
import ReportProjectPicker from "../../components/daily-reports/ReportProjectPicker";
import ReportEvidence from "../../components/daily-reports/ReportEvidence";
import LoadingScreen from "../../components/LoadingScreen";
import { dailyReportApi } from "../../api/dailyReportApi";
import { projectApi } from "../../api/projectApi";
import { isTaskId, taskApi } from "../../api/taskApi";
import { useAuth } from "../../hooks/useAuth";
import { useConfirmation } from "../../hooks/useConfirmation";
import { validationMessage } from "../../hooks/useApprovalReview";
import { formatDate, formatText } from "../../components/approvals/approvalUtils";
import SearchFilterToolbar from "../../components/common/SearchFilterToolbar";

const control = "mt-2 w-full min-w-0 rounded-xl border border-[#E7DED2] bg-[#FFFDFA] px-3 py-3 text-sm outline-none focus:border-[#A58A67] focus:ring-2 focus:ring-[#E8DDD0]";
const actionBase = "rare-button";
const action = `${actionBase} rare-button-secondary`;
const primaryAction = `${actionBase} rare-button-primary`;
const submitAction = `${actionBase} rare-button-success`;
const deleteAction = `${actionBase} rare-button-danger`;
const reportTabs = [["diary", "Site diary"], ["work-entries", "Task work"], ["manpower", "Manpower"], ["materials", "Materials"], ["attachments", "Attachments"], ["review", "Review & Submit"]];
const guidedSteps = [["diary", "Diary"], ["activity", "Site activity"], ["photos-submit", "Photos & Submit"]];

function ReportMetrics({ summary, role }) {
    const items = role === "ADMIN"
        ? [["Submitted reports", "submitted", CheckCircle2, "bg-[#E9F6EF] text-[#176647]"], ["Pending work verifications", "pending_work", Clock3, "bg-[#FFF3D6] text-[#795016]"]]
        : [["Total reports", "total", FileText, "bg-[#F1EADF] text-[#745532]"], ["Draft reports", "drafts", FileText, "bg-[#FFF3D6] text-[#795016]"], ["Submitted reports", "submitted", CheckCircle2, "bg-[#E9F6EF] text-[#176647]"], ["Pending work verifications", "pending_work", Clock3, "bg-[#EAF1FD] text-[#28549A]"]];
    return <section data-report-role={role} aria-label="Project report totals" className={`rare-compact-stats grid grid-cols-2 gap-3 ${role === "ADMIN" ? "" : "xl:grid-cols-4"}`}>{items.map(([label, field, Icon, tone]) => <div key={field} className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={20} aria-hidden="true" /></span><div><p className="text-sm font-medium leading-5 text-[#716658]">{label}</p><p className="mt-1 text-xl font-semibold tracking-tight text-[#211E1A] tabular-nums">{summary[field]}</p></div></div>)}</section>;
}

function ReportRegisterCard({ report, onSelect, onCorrect }) {
    return <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E7DED2] bg-[#FFFDFA]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7DED2] bg-[#F8F4EE] px-4 py-3 sm:px-5"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1EADF] text-[#514538]"><CalendarDays size={18} aria-hidden="true" /></span><div><p className="text-xs font-medium text-[#716658]">Daily site report</p><h3 className="mt-1 text-base font-semibold text-[#211E1A]">{formatDate(report.report_date)}</h3></div></div><ReportStatusBadge status={report.status} /></div>
        <div className="flex flex-1 flex-col p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#716658]"><span className="inline-flex items-center gap-2"><UserRound size={16} aria-hidden="true" />{report.reported_by_name || "Supervisor"}</span><span className="inline-flex items-center gap-2"><CloudSun size={16} aria-hidden="true" />{formatText(report.weather_condition)}</span></div>
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#423A30]">{report.work_summary || "No work summary saved yet."}</p>
            <div className="mb-5 mt-5 rounded-xl border border-[#E7DED2] bg-[#F8F4EE] p-4"><p className="mb-3 text-sm font-medium text-[#514538]">{report.work_entry_count} task work entries</p><dl className="grid grid-cols-3 gap-2">{[["Pending", "pending", "text-[#795016]"], ["Verified", "verified", "text-[#176647]"], ["Rejected", "rejected", "text-[#A33228]"]].map(([label, field, tone]) => <div key={field}><dt className="text-xs font-medium text-[#716658]">{label}</dt><dd className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{report.work_counts?.[field] ?? 0}</dd></div>)}</dl></div>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#EDE5DA] pt-4"><div className="text-xs leading-5 text-[#716658]"><p>Created {formatDate(report.created_at)}</p><p>{report.submitted_at ? `Submitted ${new Date(report.submitted_at).toLocaleString("en-IN")}` : "Draft awaiting submission"}</p></div><button type="button" onClick={() => onSelect(report.id)} className={primaryAction} aria-label={`View report for ${formatDate(report.report_date)} by ${report.reported_by_name || "Supervisor"}`}>View Report<ArrowUpRight size={18} aria-hidden="true" /></button></div>
            {!!report.correction_summary?.rejected_count && <div className="mt-4 space-y-3 rounded-xl border border-[#ECC4BA] bg-[#FFF1EC] p-4 text-sm leading-6 text-[#803D32]"><p className="font-bold">{report.correction_summary.eligible_count ? "Work Corrections Required" : "Work Correction History"} · {report.correction_summary.rejected_count} rejected entries</p>{report.correction_summary.entries.map((entry) => <p key={entry.id} className="whitespace-pre-wrap break-words"><strong>{entry.task_title}:</strong> {entry.verification_note}{entry.correction_report && <Link className="ml-2 inline-block font-bold underline" to={`/supervisor/projects/${report.project}/daily-reports?report=${entry.correction_report.id}`}>Existing correction: {formatText(entry.correction_report.status)}</Link>}</p>)}{report.correction_summary.rejected_count > report.correction_summary.entries.length && <p>Open the report to view all rejection notes.</p>}{report.correction_summary.eligible_count > 0 && onCorrect && <button type="button" className={primaryAction} onClick={() => onCorrect(report.id)}><Plus size={18} aria-hidden="true" />Create Correction Report</button>}</div>}
            <p className="report-reference mt-3 break-all text-xs leading-5 text-[#716658]">Ref: {report.id}</p>
        </div>
    </article>;
}

function reportPage(data, page = 1) {
    if (Array.isArray(data)) return { results: data.slice((page - 1) * 25, page * 25), count: data.length, next: page * 25 < data.length, previous: page > 1 };
    if (!Array.isArray(data?.results) || !Number.isInteger(data.count)) throw new Error("Unexpected report response. Please refresh.");
    return { ...data, next: Boolean(data.next), previous: Boolean(data.previous) };
}

function correctionPrefill(source) {
    const diaryFields = ["report_date", "weather_condition", "site_condition", "work_summary", "site_notes", "issues", "next_day_plan"];
    const fields = { manpower: ["trade", "contractor_name", "worker_count", "hours_worked", "remarks"], materials: ["material_name", "entry_type", "quantity", "unit", "remarks"] };
    return {
        diary: Object.fromEntries(diaryFields.map((key) => [key, source.report[key] || ""])),
        work: Object.fromEntries(source.work.filter((entry) => entry.can_correct).map((entry) => [entry.id, { work_description: entry.work_description || "", location_detail: entry.location_detail || "", quantity_completed_today: entry.quantity_completed_today || "", completion_claimed: entry.completion_claimed || false }])),
        manpower: source.manpower.map((row) => ({ id: row.id, include: false, values: Object.fromEntries(fields.manpower.map((key) => [key, row[key] ?? ""])) })),
        materials: source.materials.map((row) => ({ id: row.id, include: false, values: Object.fromEntries(fields.materials.map((key) => [key, row[key] ?? ""])) })),
        evidence: { files: [], caption: "" },
    };
}

function correctionClientId() {
    const random = typeof crypto === "undefined" ? null : crypto;
    if (random?.randomUUID) return random.randomUUID();
    if (!random?.getRandomValues) throw new Error("This browser cannot create a safe retry identifier. Use a current browser to save corrections.");
    const bytes = random.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function ReportFilters({ filters, reporters, onApply, onClear, role }) {
    const [draft, setDraft] = useState(filters);
    const appliedKey = JSON.stringify(filters);
    const [previousAppliedKey, setPreviousAppliedKey] = useState(appliedKey);
    if (appliedKey !== previousAppliedKey) { setPreviousAppliedKey(appliedKey); setDraft(JSON.parse(appliedKey)); }
    const [searchReset, setSearchReset] = useState(0);
    const [error, setError] = useState("");
    function change(field, value) {
        const next = { ...draft, [field]: value };
        setDraft(next); setError("");
        if (next.date_from && next.date_to && next.date_from > next.date_to) { setError("End date must be on or after start date."); return; }
        onApply(next);
    }
    const activeCount = [filters.search, role !== "ADMIN" && filters.status, filters.reported_by, filters.date_from, filters.date_to, filters.sort !== "newest"].filter(Boolean).length;
    const clear = () => {
        const empty = Object.fromEntries(Object.keys(filters).map((key) => [key, key === "sort" ? "newest" : ""]));
        setDraft(empty);
        setSearchReset((value) => value + 1);
        onClear();
    };
    return <SearchFilterToolbar
        label="Daily report search and filters"
        actions={<label className="report-desktop-sort hidden lg:block"><span className="sr-only">Sort reports</span><select aria-label="Sort reports" value={filters.sort} onChange={(event) => change("sort", event.target.value)} className="h-11 rounded-lg border border-[#E7DED2] bg-[#FFFDFA] px-3 text-xs"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>}
        search={<ProjectSearch compact key={searchReset} query={filters.search} onSearch={(value) => change("search", value)} label="Report content" labelClassName="sr-only" placeholder="Search the site diary" />}
        activeCount={activeCount}
        onClear={clear}
    >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {role !== "ADMIN" && <label className="text-sm font-semibold text-[#665C50]">Status<select value={draft.status} onChange={(e) => change("status", e.target.value)} className={control}><option value="">All reports</option><option value="DRAFT">Draft</option><option value="SUBMITTED">Submitted</option></select></label>}
        <label className="text-sm font-semibold text-[#665C50]">Reporter<select value={draft.reported_by} onChange={(e) => change("reported_by", e.target.value)} className={control}><option value="">All reporters</option>{reporters.map((reporter) => <option key={reporter.reported_by} value={reporter.reported_by}>{reporter.reported_by__username}</option>)}</select></label>
        <label className="text-sm font-semibold text-[#665C50]">From report date<input type="date" value={draft.date_from} onChange={(e) => change("date_from", e.target.value)} className={control} /></label>
        <label className="text-sm font-semibold text-[#665C50]">To report date<input type="date" min={draft.date_from || undefined} value={draft.date_to} onChange={(e) => change("date_to", e.target.value)} className={control} /></label>
        <label className="text-sm font-semibold text-[#665C50]">Sort<select value={draft.sort} onChange={(e) => change("sort", e.target.value)} className={control}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </SearchFilterToolbar>;
}

export function ProjectDailyReports({ role = "SUPERVISOR", projectId: providedId }) {
    const params = useParams();
    const { user } = useAuth();
    const projectId = providedId || params.projectId;
    return <ProjectReportWorkspace key={`${role}:${projectId}`} projectId={projectId} role={role} user={user} />;
}

function ProjectReportWorkspace({ projectId, role, user }) {
    const [params, setParams] = useSearchParams();
    const [project, setProject] = useState(null);
    const [projectError, setProjectError] = useState("");
    const [result, setResult] = useState(null);
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [mutationError, setMutationError] = useState("");
    const inFlight = useRef(false);
    const mounted = useRef(false);
    const latestParams = useRef(params);
    latestParams.current = params;
    const reportId = params.get("report");
    const correctionId = role === "SUPERVISOR" ? params.get("correct") : null;
    const selectedId = correctionId || reportId;
    const canCreate = role === "SUPERVISOR" && !projectError && ["ACTIVE", "MAINTENANCE"].includes(project?.status);
    useEffect(() => {
        if (params.get("create") !== "true") return;
        if (!project || projectError) return;
        const next = new URLSearchParams(params);
        next.delete("create");
        latestParams.current = next;
        setParams(next, { replace: true });
        // An explicit report/correction selection takes priority over a stale create flag.
        if (selectedId || role !== "SUPERVISOR") {
            setMutationError("");
            return;
        }
        if (!canCreate) {
            setMutationError(`Daily reports can only be created for ACTIVE or MAINTENANCE projects. This project is ${formatText(project.status)}.`);
            return;
        }
        if (inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        setMutationError("");
        const reportDate = new Date().toLocaleDateString("en-CA");
        async function openTodayDraft() {
            try {
                const response = await dailyReportApi.list(projectId, { status: "DRAFT", reported_by: user.id, date_from: reportDate, date_to: reportDate, page_size: 25 });
                if (!mounted.current) return;
                const drafts = Array.isArray(response) ? response : response.results || [];
                const today = drafts.find((draft) => draft.report_date === reportDate);
                const report = today || await dailyReportApi.create(projectId, { report_date: reportDate, work_summary: "", weather_condition: "", site_condition: "", site_notes: "", issues: "", next_day_plan: "" });
                if (mounted.current) selectReport(report.id);
            } catch (failure) {
                if (mounted.current) setMutationError(validationMessage(failure, "Unable to open today's report draft. Please retry."));
            } finally {
                inFlight.current = false;
                if (mounted.current) setBusy(false);
            }
        }
        void openTodayDraft();
    }, [params, setParams, project, projectError, canCreate, selectedId, role, projectId, user.id]);
    const page = Math.max(1, Number(params.get("page")) || 1);
    const filters = Object.fromEntries(["search", "status", "date_from", "date_to", "reported_by", "sort"].map((key) => [key, params.get(key) || (key === "sort" ? "newest" : "")]));
    if (role === "ADMIN") filters.status = "SUBMITTED";
    const filterKey = JSON.stringify(filters);
    const key = `${projectId}:${filterKey}:${page}:${revision}`;
    const data = result?.key === key ? result.data : null;
    const error = projectError || (result?.key === key ? result.error : "");
    const loading = !projectError && (!project || !selectedId && result?.key !== key);

    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        let active = true;
        async function load() {
            try {
                if (!isTaskId(projectId)) throw new Error("Invalid project ID.");
                const value = await projectApi.getProject(projectId);
                if (active) { setProject(value); setProjectError(""); }
            } catch (err) { if (active) setProjectError(validationMessage(err, err.message || "Unable to load this project.")); }
        }
        load();
        return () => { active = false; };
    }, [projectId, revision]);
    useEffect(() => {
        if (selectedId || !isTaskId(projectId)) return;
        const controller = new AbortController();
        const query = Object.fromEntries(Object.entries(JSON.parse(filterKey)).filter(([, value]) => value));
        dailyReportApi.list(projectId, { ...query, page, page_size: 25 }, controller.signal).then((response) => {
            const value = reportPage(response, page);
            if (!(role === "ADMIN" ? ["submitted", "pending_work"] : ["total", "drafts", "submitted", "pending_work"]).every((name) => Number.isInteger(value.summary?.[name]))) throw new Error("Complete report totals are unavailable. Please refresh.");
            if (!controller.signal.aborted) setResult({ key, data: value });
        }).catch((err) => { if (!controller.signal.aborted) setResult({ key, error: validationMessage(err, err.message || "Unable to load reports.") }); });
        return () => controller.abort();
    }, [key, filterKey, projectId, selectedId, page, role]);

    function selectReport(id, sourceId) { const next = new URLSearchParams(latestParams.current); next.delete("create"); next.delete("correct"); next.delete("source"); if (sourceId) next.set("source", sourceId); if (id) next.set("report", id); else { next.delete("report"); next.delete("page"); setRevision((v) => v + 1); } latestParams.current = next; setMutationError(""); setParams(next); }
    function startCorrection(id) { const next = new URLSearchParams(latestParams.current); next.delete("create"); next.delete("report"); next.delete("source"); next.set("correct", id); latestParams.current = next; setMutationError(""); setCreating(false); setParams(next); }
    async function create(payload) {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(true); setMutationError("");
        try { const report = await dailyReportApi.create(projectId, payload); if (mounted.current) { setCreating(false); selectReport(report.id); } }
        catch (err) { if (mounted.current) setMutationError(validationMessage(err)); }
        finally { inFlight.current = false; if (mounted.current) setBusy(false); }
    }
    const prefix = role === "ADMIN" ? "/admin" : "/supervisor";
    return <div className={`daily-report-workspace mx-auto min-w-0 max-w-[1500px] space-y-6 pb-8 text-[#211E1A] ${!selectedId ? "project-reports-desktop-theme" : ""}`}>
        {!result && loading && <LoadingScreen message="Loading daily reports..." />}
        {!(role === "SUPERVISOR" && selectedId) && <><nav aria-label="Breadcrumb" className={`flex flex-wrap gap-2 text-xs text-[#716658] ${role === "ADMIN" && selectedId ? "lg:hidden" : ""}`}><Link to={`${prefix}/projects`}>Projects</Link><span>/</span><Link to={`${prefix}/projects/${projectId}`}>{project?.name || "Project Overview"}</Link><span>/</span><span aria-current="page">Daily Reports</span></nav>
        <header className={`rare-page-header relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4 text-[#211E1A] shadow-none sm:p-5 ${role === "ADMIN" && selectedId ? "lg:hidden" : ""}`}><div className="min-w-0 border-l-2 border-[#E7DED2] pl-3"><p className="text-xs font-semibold uppercase tracking-wide text-[#716658]">{project?.name || "Project workspace"}</p><h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Daily Reports</h1></div><div className="flex flex-wrap gap-2"><button type="button" disabled={loading || busy} className={action} onClick={() => setRevision((v) => v + 1)}><RefreshCw size={16} aria-hidden="true" />Refresh</button>{canCreate && !selectedId && <button type="button" disabled={busy} className={primaryAction} onClick={() => { if (role === "SUPERVISOR") { const next = new URLSearchParams(params); next.set("create", "true"); setParams(next); } else { setCreating(true); setMutationError(""); } }}><Plus size={18} aria-hidden="true" />{role === "SUPERVISOR" ? "Submit today's report" : "Create Daily Report"}</button>}</div></header></>}
        {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700"><p>{error}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={action} onClick={() => setRevision((v) => v + 1)}>Retry</button><button type="button" className={action} onClick={() => setParams({})}>Clear filters</button></div></div>}
        {project?.status === "CANCELLED" && <p role="status" className="rounded-xl border border-[#E7DED2] bg-[#FFFDFA] p-4 text-sm text-[#716658]">This project has been cancelled. Existing records remain available for reference.</p>}
        {mutationError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{mutationError}</p>}
        {selectedId && !projectError ? <ReportDetail key={`${selectedId}:${Boolean(correctionId)}`} reportId={selectedId} projectId={projectId} role={role} user={user} externalRevision={revision} onSelect={selectReport} correctionMode={Boolean(correctionId)} onCorrectReport={startCorrection} sourceHint={params.get("source")} /> : <>
            {creating && canCreate && <ReportDiaryForm onSave={create} onCancel={() => setCreating(false)} busy={busy} />}
            <ReportFilters role={role} filters={filters} reporters={result?.data?.reporters || []} onApply={(next) => { const query = new URLSearchParams(Object.entries(next).filter(([, value]) => value)); setParams(query, { replace: true }); }} onClear={() => setParams({})} />
            {loading && result && <p role="status" className="text-sm text-[#817669]">Updating reports...</p>}
            {data && <>
                <div className="project-report-metrics"><ReportMetrics summary={data.summary} role={role} /></div>
                <p className="project-report-totals-note text-sm leading-6 text-[#716658]">Project-wide totals. Pending verification counts individual work entries in submitted reports.</p>
                <div className="project-report-register-heading flex flex-wrap items-end justify-between gap-3 pt-2"><div><h2 className="text-xl font-semibold tracking-tight text-[#211E1A]">Report register</h2><p role="status" className="mt-2 text-sm text-[#716658]">{data.count} matching reports</p></div><p className="text-sm text-[#716658]">{filters.sort === "oldest" ? "Oldest first" : "Newest first"}</p></div>
                <div className="project-report-cards grid items-stretch gap-5 2xl:grid-cols-2">{data.results.map((report) => <ReportRegisterCard key={report.id} report={report} onSelect={selectReport} onCorrect={role === "SUPERVISOR" ? startCorrection : undefined} />)}</div>
                {!data.count && <div className="rounded-2xl border border-dashed border-[#CCB99F] bg-[#FFFDFA] px-6 py-12 text-center"><FolderOpen size={32} aria-hidden="true" className="mx-auto text-[#99754B]" /><h3 className="mt-4 text-base font-semibold text-[#211E1A]">No reports match this selection.</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#716658]">Try another date range or clear your filters to see available reports.</p></div>}
                <nav aria-label="Report pages" className="rare-pagination rounded-2xl border border-[#E5DACB] bg-[#FFFDFA] p-4 text-sm text-[#665C50]"><button type="button" disabled={!data.previous} className={action} onClick={() => { const next = new URLSearchParams(params); next.set("page", String(page - 1)); setParams(next); }}><ChevronLeft size={15} />Previous</button><span aria-live="polite" aria-atomic="true">Page {page} of {Math.max(1, Math.ceil(data.count / 25))}</span><button type="button" disabled={!data.next} className={action} onClick={() => { const next = new URLSearchParams(params); next.set("page", String(page + 1)); setParams(next); }}>Next<ChevronRight size={15} /></button></nav>
            </>}
        </>}
    </div>;
}

function draftClientId() {
    return globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (letter) => {
        const value = Math.floor(Math.random() * 16);
        return (letter === "x" ? value : (value & 3) | 8).toString(16);
    });
}

async function saveReportDrafts(reportId, entries, api = dailyReportApi, assertActive = () => {}) {
    assertActive();
    const pending = entries.filter((entry) => entry.dirty);
    for (const entry of pending) {
        if (entry.section !== "attachments" && (!entry.snapshot.current || !entry.snapshot.current.validate())) throw new Error(`Check the ${entry.section} form before submitting.`);
    }
    for (const entry of pending) {
        assertActive();
        const values = entry.values;
        const payload = entry.snapshot.current?.payload;
        if (entry.section === "diary") await api.update(reportId, payload);
        else if (entry.section === "attachments") {
            for (const file of [...values.files]) {
                assertActive();
                const data = new FormData(); data.append("file", file); data.append("caption", values.caption);
                entry.fileIds ??= new Map();
                if (!entry.fileIds.has(file)) entry.fileIds.set(file, draftClientId());
                data.append("client_id", entry.fileIds.get(file));
                if (values.task_work) data.append("task_work", values.task_work);
                await api.upload(reportId, data);
                entry.values = { ...entry.values, files: entry.values.files.filter((item) => item !== file) };
            }
        } else {
            entry.clientId ??= draftClientId();
            const saved = await api.saveRow(reportId, entry.section, entry.rowId ? payload : { ...payload, client_id: entry.clientId }, entry.rowId);
            entry.rowId = saved.id;
        }
        if (entry.values === values || entry.section === "attachments" && !entry.values.files.length) entry.dirty = false;
    }
}

function revealActiveReportTab(container) {
    if (!container || !container.ownerDocument.defaultView.matchMedia("(max-width: 1023px)").matches) return;
    const active = container.querySelector('[aria-pressed="true"]');
    if (!active) return;
    const bounds = container.getBoundingClientRect();
    const selected = active.getBoundingClientRect();
    if (selected.left < bounds.left) container.scrollLeft += selected.left - bounds.left;
    else if (selected.right > bounds.right) container.scrollLeft += selected.right - bounds.right;
}

function ReportDetail({ reportId, projectId, role, user, externalRevision, onSelect, correctionMode = false, onCorrectReport, sourceHint }) {
    const [state, setState] = useState({ report: null, error: "" });
    const [revision, setRevision] = useState(0);
    const [tab, setTab] = useState("diary");
    const reportTabsRef = useRef(null);
    const draftTabsRef = useRef(null);
    const [overview, setOverview] = useState(true);
    const [activityOpen, setActivityOpen] = useState({});
    const [pages, setPages] = useState({});
    const [resources, setResources] = useState({});
    const [editing, setEditing] = useState(null);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [workSummaryError, setWorkSummaryError] = useState("");
    const [notice, setNotice] = useState("");
    const [taskSearch, setTaskSearch] = useState("");
    const [taskPage, setTaskPage] = useState(1);
    const [draftPage, setDraftPage] = useState(1);
    const [choices, setChoices] = useState(null);
    const [choiceRevision, setChoiceRevision] = useState(0);
    const inFlight = useRef(false);
    const mounted = useRef(false);
    const reportLifecycle = useRef(null);
    const drafts = useRef({});
    const draftSequence = useRef(0);
    const [, setDraftRevision] = useState(0);
    const [guidedEditors, setGuidedEditors] = useState({});
    const [prefill, setPrefill] = useState(null);
    const [savedDraft, setSavedDraft] = useState(null);
    const [saveStarted, setSaveStarted] = useState(false);
    const savePlan = useRef(null);
    const prefillForms = useRef(null);
    const { confirm, confirmationModal } = useConfirmation();
    const version = `${revision}:${externalRevision}`;
    const loading = state.key !== version;
    const report = state.report;
    const submittedReport = report?.status === "SUBMITTED";
    const reportOverview = submittedReport && overview;
    useEffect(() => {
        revealActiveReportTab(submittedReport ? reportTabsRef.current : draftTabsRef.current);
    }, [tab, overview, loading, submittedReport]);
    const owner = role === "SUPERVISOR" && report?.reported_by === user.id;
    const canEdit = report?.project_status !== "CANCELLED" && owner && report?.status === "DRAFT" && !loading && !state.error;
    const guidedDraft = role === "SUPERVISOR" && canEdit && !correctionMode;
    const allowEditor = report?.project_status !== "CANCELLED" && owner && (report?.status === "DRAFT" || editing?.correction && report?.status === "SUBMITTED");
    const editorBusy = Boolean(busy) || loading || Boolean(state.error);
    const pageKey = JSON.stringify(pages);
    const resourceKey = `${tab}:${pageKey}:${version}`;
    const choiceKey = `${editing?.section}:${editing?.row?.id}:${editing?.correction}:${taskSearch}:${taskPage}:${draftPage}:${choiceRevision}:${version}`;
    const choiceData = choices?.key === choiceKey ? choices.data : null;

    useEffect(() => {
        const lifecycle = { active: true, reportId, projectId };
        reportLifecycle.current = lifecycle;
        mounted.current = true;
        return () => { lifecycle.active = false; mounted.current = false; };
    }, [reportId, projectId]);
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                if (!isTaskId(reportId)) throw new Error("Invalid report ID.");
                const source = correctionMode ? await dailyReportApi.correctionSource(projectId, reportId, controller.signal) : null;
                const value = source ? source.report : await dailyReportApi.get(reportId, controller.signal);
                if (value.project !== projectId) throw new Error("This report does not belong to this project.");
                if (source && !value.correction_summary?.rejected_count) throw new Error("This report has no rejected work to correct.");
                if (!controller.signal.aborted) { setState({ key: version, report: value, source, error: "" }); if (source) setPrefill((current) => current || correctionPrefill(source)); }
            } catch (failure) { if (!controller.signal.aborted) setState({ key: version, report: null, error: validationMessage(failure, failure.message || "Unable to load report.") }); }
        }
        load(); return () => controller.abort();
    }, [reportId, projectId, version, correctionMode]);
    useEffect(() => {
        if (!report || loading || state.error || correctionMode) return;
        const controller = new AbortController();
        const selectedPages = JSON.parse(pageKey);
        const sections = guidedDraft
            ? tab === "activity" ? ["work-entries", "manpower", "materials"] : tab === "photos-submit" ? ["work-entries", "manpower", "materials", "attachments"] : []
            : (reportOverview || tab === "review") ? ["work-entries", "manpower", "materials", "attachments"] : tab === "diary" ? [] : tab === "attachments" ? ["attachments", "work-entries"] : [tab];
        for (const section of sections) {
            dailyReportApi.section(reportId, section, { page: selectedPages[section] || 1, page_size: 25 }, controller.signal).then((response) => {
                const data = reportPage(response, selectedPages[section] || 1);
                if (data.results.some((item) => item.daily_report !== reportId)) throw new Error("Unexpected report relationship.");
                if (!controller.signal.aborted) setResources((v) => ({ ...v, [section]: { key: resourceKey, data } }));
            }).catch((failure) => { if (!controller.signal.aborted) setResources((v) => ({ ...v, [section]: { key: resourceKey, error: validationMessage(failure, "Unable to load this section.") } })); });
        }
        return () => controller.abort();
    }, [tab, reportId, pageKey, resourceKey, report, loading, state.error, correctionMode, guidedDraft, reportOverview]);
    useEffect(() => {
        if (editing?.section !== "work-entries" || editing.row && !editing.correction) return;
        const controller = new AbortController();
        const promise = editing.correction
            ? dailyReportApi.list(projectId, { status: "DRAFT", reported_by: user.id, page: draftPage, page_size: 25 }, controller.signal)
            : taskApi.register({ project: projectId, exclude_daily_report: reportId, approval_status: "APPROVED", search: taskSearch, page: taskPage, page_size: 25 }, controller.signal);
        promise.then((data) => { if (!controller.signal.aborted) setChoices({ key: choiceKey, data: reportPage(data, editing.correction ? draftPage : taskPage) }); })
            .catch((failure) => { if (!controller.signal.aborted) setChoices({ key: choiceKey, error: validationMessage(failure, "Unable to load form choices.") }); });
        return () => controller.abort();
    }, [choiceKey, editing, projectId, reportId, user.id, draftPage, taskPage, taskSearch]);

    function resource(section) { return resources[section]?.key === resourceKey ? resources[section] : null; }
    const guidedIndex = guidedSteps.findIndex(([id]) => id === tab);
    function goStep(index) {
        if (inFlight.current) return;
        const bounded = Math.max(0, Math.min(guidedSteps.length - 1, index));
        setTab(guidedSteps[bounded][0]);
    }
    function changePage(section, delta) { setPages((v) => ({ ...v, [section]: Math.max(1, (v[section] || 1) + delta) })); }
    async function leaveEditor(next) {
        if (inFlight.current) return;
        if (editing && !await confirm({ title: "Discard unsaved edits?", message: "The current form has not been saved.", confirmLabel: "Discard edits" })) return;
        setEditing(null); setError(""); next();
    }
    async function mutate(kind, payload, section, rowId, onUploaded, draftKey) {
        if (inFlight.current) return;
        const lifecycle = reportLifecycle.current;
        const active = () => mounted.current && lifecycle?.active && reportLifecycle.current === lifecycle;
        const assertActive = () => { if (!active()) throw new Error("The report editor was closed. Remaining changes were not submitted."); };
        inFlight.current = true; setBusy(kind); setError(""); setNotice("");
        try {
            if (kind === "delete" && !await confirm({ title: "Delete this draft report?", message: "This permanently deletes the draft diary, task work, manpower, materials and its attachments. This cannot be undone.", confirmLabel: "Delete Draft" })) return;
            if (["submit", "remove"].includes(kind) && !await confirm({ title: kind === "submit" ? "Submit this report?" : "Remove this draft record?", message: kind === "submit" ? "The saved diary and all work, manpower, material records and evidence become read-only. Individual work entries remain subject to Admin verification." : "This removes the selected record from the draft.", confirmLabel: kind === "submit" ? "Submit report" : "Remove record" })) return;
            assertActive();
            if (kind === "delete") { await dailyReportApi.deleteDraft(reportId); if (active()) onSelect(null); return; }
            let response;
            if (guidedDraft && ["diary", "row", "upload", "submit"].includes(kind)) {
                const key = kind === "diary" ? "diary" : kind === "upload" ? "attachments" : draftKey || editing?.draftKey;
                if (kind === "submit") {
                    const diary = drafts.current.diary?.values || report;
                    if (!diary.work_summary?.trim()) { setWorkSummaryError("Work Summary is required."); setTab("diary"); return; }
                    setWorkSummaryError("");
                    await saveReportDrafts(reportId, Object.values(drafts.current), dailyReportApi, assertActive);
                    assertActive();
                    response = (await dailyReportApi.submit(reportId)).report;
                    if (!active()) return;
                    drafts.current = {};
                    setState({ key: version, report: response, error: "" });
                    setNotice("Report submitted. Work awaits individual Admin verification.");
                } else {
                    const entry = drafts.current[key];
                    if (!entry) throw new Error("Open the form again before saving.");
                    entry.dirty = true;
                    entry.snapshot.current = { ...entry.snapshot.current, payload };
                    await saveReportDrafts(reportId, [entry], dailyReportApi, assertActive);
                    if (!active()) return;
                    if (kind === "row") setGuidedEditors((current) => { const next = { ...current }; delete next[section]; return next; });
                    setNotice("Saved successfully.");
                    setRevision((value) => value + 1);
                }
                if (active()) setDraftRevision((value) => value + 1);
                return;
            }
            if (kind === "diary") response = await dailyReportApi.update(reportId, payload);
            if (kind === "row") response = await dailyReportApi.saveRow(reportId, section, payload, rowId);
            if (kind === "remove") {
                await dailyReportApi.removeRow(section, rowId);
                if (!active()) return;
                const removedKeys = new Set(Object.entries(drafts.current).filter(([, entry]) => entry.section === section && entry.rowId === rowId).map(([key]) => key));
                for (const key of removedKeys) delete drafts.current[key];
                setGuidedEditors((current) => {
                    const editor = current[section];
                    if (!editor || editor.row?.id !== rowId && !removedKeys.has(editor.draftKey)) return current;
                    const next = { ...current }; delete next[section]; return next;
                });
                setEditing((current) => current?.section === section && (current.row?.id === rowId || removedKeys.has(current.draftKey)) ? null : current);
            }
            if (kind === "correct") response = await dailyReportApi.correct(rowId, payload);
            if (kind === "submit") response = (await dailyReportApi.submit(reportId)).report;
            if (kind === "upload") for (const file of payload.files) { const data = new FormData(); data.append("file", file); data.append("caption", payload.caption); if (payload.task_work) data.append("task_work", payload.task_work); await dailyReportApi.upload(reportId, data); if (active()) onUploaded(file); }
            if (!active()) return;
            setEditing(null); setNotice(kind === "submit" ? "Report submitted. Work awaits individual Admin verification." : "Saved successfully.");
            if (kind === "diary") setState({ key: version, report: response, error: "" });
            else {
                if (kind === "submit") setState({ key: version, report: response, error: "" });
                setRevision((v) => v + 1);
            }
            if (kind === "correct") onSelect(response.daily_report);
        } catch (failure) { if (active()) { setError(validationMessage(failure)); if (["row", "correct"].includes(kind)) setChoiceRevision((value) => value + 1); if (kind === "upload") setRevision((v) => v + 1); } }
        finally { inFlight.current = false; if (active()) setBusy(""); }
    }
    async function savePrefill(submit = false) {
        if (inFlight.current || loading || !prefill) return;
        if (!savePlan.current) {
            const forms = prefillForms.current?.querySelectorAll("form[data-correction-confirmed='true']") || [];
            if ([...forms].some((form) => !form.reportValidity())) return;
            if (!Object.keys(prefill.work).length) { setError("No rejected entries are eligible for a new correction. Open an existing correction instead."); return; }
            if (submit && !prefill.diary.work_summary.trim()) { setError("Save a work summary before submitting the correction report."); return; }
            try {
                const rows = (section) => prefill[section].filter((row) => row.include).map((row) => ({ client_id: correctionClientId(), values: section === "manpower" ? { ...row.values, worker_count: Number(row.values.worker_count), hours_worked: row.values.hours_worked === "" ? null : row.values.hours_worked } : { ...row.values, quantity: row.values.quantity === "" ? null : row.values.quantity } }));
                savePlan.current = { client_id: correctionClientId(), diary: { ...prefill.diary }, manpower: rows("manpower"), materials: rows("materials"), work: Object.entries(prefill.work).map(([id, values]) => ({ id, title: state.source.work.find((row) => row.id === id)?.task_title || "Task work", values: { work_description: values.work_description, location_detail: values.location_detail, ...(state.source.work.find((row) => row.id === id)?.measurement_method === "QUANTITY" ? { quantity_completed_today: values.quantity_completed_today } : { completion_claimed: values.completion_claimed }) } })), files: prefill.evidence.files.map((file) => ({ client_id: correctionClientId(), file, caption: prefill.evidence.caption })), completed: [], draftId: null };
            } catch (failure) { setError(failure.message); return; }
        }
        inFlight.current = true; setSaveStarted(true); setBusy("prefill"); setError(""); setNotice("");
        try {
            const id = await dailyReportApi.saveCorrectionReport(projectId, reportId, savePlan.current, (draftId, step) => { if (mounted.current) { setSavedDraft(draftId); setNotice(`Saved: ${step}. Completed records will not be inserted again.`); } });
            if (submit && await confirm({ title: "Submit correction report?", message: "Only the corrected rejected work will enter verification. Original measurements, decisions and evidence remain unchanged.", confirmLabel: "Submit correction report" })) {
                try { await dailyReportApi.submit(id); }
                catch (failure) { const current = await dailyReportApi.get(id); if (current.status !== "SUBMITTED") throw failure; }
            }
            if (mounted.current) onSelect(id, reportId);
        } catch (failure) { if (mounted.current) setError(`${failure.correctionStep || "Submit correction report"}: ${validationMessage(failure, failure.message || "Unable to save this step.")} ${savePlan.current.draftId ? "Your draft is saved. Retry unfinished steps or open the saved draft." : "Retry uses the same draft identifier."}`); }
        finally { inFlight.current = false; if (mounted.current) setBusy(""); }
    }
    function updatePrefill(field, next) { setPrefill((current) => ({ ...current, [field]: typeof next === "function" ? next(current[field]) : next })); }
    if (correctionMode && report?.project_status === "CANCELLED") return <section className="space-y-4 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-5"><p role="status">This project has been cancelled. Existing records remain available for reference.</p><button type="button" className={action} onClick={() => onSelect(reportId)}>View original submitted report</button></section>;
    if (correctionMode) {
        const locked = Boolean(busy) || saveStarted;
        const source = state.source;
        const selectSource = async () => { if (inFlight.current) return; if (prefill && !await confirm({ title: "Leave correction editor?", message: savedDraft ? "Saved records remain in your draft. Unfinished selections and files in this editor will be discarded." : "Unsaved corrections and selected files will be discarded. No draft has been created.", confirmLabel: "View original report" })) return; onSelect(reportId); };
        return <section className="space-y-6" ref={prefillForms}>
            {confirmationModal}{loading && <LoadingScreen message="Loading correction reference records..." />}
            <header className="rare-page-header space-y-3 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5"><p className="text-xs font-semibold uppercase tracking-wide text-[#716658]">Independent daily report</p><h2 className="text-xl font-semibold">Correction Report</h2><p className="text-sm leading-6 text-[#716658]">Information from your previous report has been prefilled. Review the details and correct rejected work before submitting.</p><p className="text-sm leading-6 text-[#795016]">Original evidence and previously verified or pending work are references only. They will not be copied into the new report.</p><button type="button" disabled={Boolean(busy)} className={action} onClick={selectSource}>View original submitted report</button></header>
            {(state.error || error) && <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-700"><p>{state.error || error}</p>{state.error && <button type="button" className={action} onClick={() => setRevision((value) => value + 1)}>Retry loading reference records</button>}</div>}
            {notice && <p role="status" className="rounded-xl bg-[#E9F6EF] p-4 text-sm leading-6 text-[#176647]">{notice}</p>}
            {savedDraft && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E8CE94] bg-[#FFF8E7] p-4"><p className="min-w-0 break-all text-sm text-[#795016]">Saved draft: {savedDraft}</p><button type="button" disabled={Boolean(busy)} className={action} onClick={() => onSelect(savedDraft, reportId)}>Open saved draft</button><p className="w-full text-sm leading-6 text-[#795016]">Use Retry unfinished steps to finish this save. Open the draft to edit, upload evidence, or delete it through the normal workflow.</p></div>}
            {prefill && source && !loading && <>
                <ReportDiaryForm report={report} prefill values={prefill.diary} onChange={(next) => updatePrefill("diary", next)} onSave={() => {}} busy={locked} />
                <section className="space-y-4"><h3 className="text-base font-semibold">Rejected Task Work — Editable</h3>{source.work.filter((row) => row.can_correct).map((entry) => <ReportWorkForm key={entry.id} initial={entry} correction prefill values={prefill.work[entry.id]} onChange={(next) => updatePrefill("work", (work) => ({ ...work, [entry.id]: typeof next === "function" ? next(work[entry.id]) : next }))} onSave={() => {}} busy={locked} />)}{!source.work.some((row) => row.can_correct) && <p className="rounded-xl bg-[#F1EADF] p-4 text-sm text-[#716658]">No new corrections are eligible. Existing corrections are shown below.</p>}</section>
                <section className="space-y-4"><h3 className="text-base font-semibold">Other Submitted Work — Read-only reference</h3>{source.work.filter((row) => !row.can_correct).map((entry) => <ReportWorkEntry key={entry.id} entry={entry} role="SUPERVISOR" canEdit={false} canCorrect={false} />)}{!source.work.some((row) => !row.can_correct) && <p className="text-sm text-[#716658]">No other task work in the source report.</p>}</section>
                {["manpower", "materials"].map((section) => <section key={section} className="space-y-4"><h3 className="text-base font-semibold">{formatText(section)} — Prefilled</h3><p className="text-sm leading-6 text-[#716658]">Review these copied reference values. Select each record you want to include; saving creates an independent observation, not a new physical work or inventory transaction.</p>{prefill[section].map((row) => <div key={row.id} data-include={row.include} className="space-y-3 rounded-2xl border border-[#E7DED2] p-4"><label className="flex min-h-12 items-center gap-3 text-sm font-medium text-[#514538]"><input type="checkbox" className="h-5 w-5 accent-[#211E1A]" checked={row.include} disabled={locked} onChange={(event) => updatePrefill(section, (rows) => rows.map((item) => item.id === row.id ? { ...item, include: event.target.checked } : item))} />Include this reviewed {section === "manpower" ? "manpower" : "material"} record</label><ReportRowForm section={section} initial={row.values} prefill confirmed={row.include} values={row.values} onChange={(next) => updatePrefill(section, (rows) => rows.map((item) => item.id === row.id ? { ...item, values: typeof next === "function" ? next(item.values) : next } : item))} onSave={() => {}} busy={locked} /></div>)}{!prefill[section].length && <p className="text-sm text-[#716658]">No source records to prefill.</p>}</section>)}
                <section className="space-y-4"><h3 className="text-base font-semibold">Original Evidence — Read-only</h3><p className="text-sm leading-6 text-[#716658]">These files belong to the original submitted report. Preview them here; they are not attached to the new report.</p><ReportEvidence files={source.attachments.slice(((pages.originalEvidence || 1) - 1) * 12, (pages.originalEvidence || 1) * 12)} /><nav aria-label="Original evidence pages" className="rare-pagination"><button type="button" className={action} disabled={(pages.originalEvidence || 1) === 1} onClick={() => changePage("originalEvidence", -1)}>Previous evidence</button><span aria-live="polite" aria-atomic="true" className="text-sm text-[#716658]">Page {pages.originalEvidence || 1} of {Math.max(1, Math.ceil(source.attachments.length / 12))}</span><button type="button" className={action} disabled={(pages.originalEvidence || 1) * 12 >= source.attachments.length} onClick={() => changePage("originalEvidence", 1)}>Next evidence</button></nav></section>
                <section className="space-y-4"><h3 className="text-base font-semibold">New Attachments — Optional</h3><ReportAttachmentForm prefill onStage={(value) => updatePrefill("evidence", value)} onSave={() => {}} busy={locked} /></section>
                <div className="flex flex-wrap gap-3 rounded-2xl border border-[#D8C7B2] bg-[#FFFDFA] p-5"><button type="button" disabled={Boolean(busy) || (!Object.keys(prefill.work).length && !saveStarted)} className={primaryAction} onClick={() => savePrefill(false)}>{busy ? "Saving correction report..." : saveStarted ? "Retry unfinished steps" : "Save Draft"}</button><button type="button" disabled={Boolean(busy) || (!Object.keys(prefill.work).length && !saveStarted)} className={submitAction} onClick={() => savePrefill(true)}>Save & Submit</button></div>
            </>}
        </section>;
    }
    function sectionView(section, review = false) {
        const entry = resource(section);
        if (!entry) return <p role="status" className="text-sm text-[#716658]">Loading {section}...</p>;
        if (entry.error) return <div role="alert" className="text-sm text-red-700">{entry.error}<button type="button" className={`${action} ml-3`} onClick={() => setRevision((v) => v + 1)}>Retry</button></div>;
        const rows = review ? entry.data.results.slice(0, 5) : entry.data.results;
        return <div className={`report-section-records space-y-4 report-records-${section}`}>
            <p className="text-sm leading-6 text-[#665C50]">{entry.data.count} {section} records{review ? "; previewing up to five from the current page. Use the section tab to review every record." : ""}</p>
            {section === "attachments" ? <ReportEvidence files={rows} busy={Boolean(busy)} onRemove={canEdit && !review ? (file) => mutate("remove", null, section, file.id) : undefined} /> : rows.map((row) => section === "work-entries" ? <ReportWorkEntry key={row.id} entry={row} role={role} canEdit={canEdit && !review} canCorrect={report?.project_status !== "CANCELLED" && role === "SUPERVISOR" && report?.reported_by === user.id && report.status === "SUBMITTED" && !review} busy={Boolean(busy)} onEdit={() => guidedDraft ? openGuidedEditor({ section, row }) : leaveEditor(() => setEditing({ section, row }))} onRemove={() => mutate("remove", null, section, row.id)} onCorrect={() => leaveEditor(() => { setDraftPage(1); setEditing({ section, row, correction: true }); })} /> : <article key={row.id} className="rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4"><dl className="grid gap-3 text-sm sm:grid-cols-2">{(section === "manpower" ? ["trade", "contractor_name", "worker_count", "hours_worked", "remarks"] : ["material_name", "entry_type", "quantity", "unit", "remarks"]).map((field) => <div key={field}><dt className="text-xs text-[#716658]">{formatText(field)}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{row[field] ?? "Not specified"}</dd></div>)}</dl>{canEdit && !review && <div className="mt-4 flex gap-2"><button type="button" disabled={Boolean(busy)} className={action} onClick={() => guidedDraft ? openGuidedEditor({ section, row }) : leaveEditor(() => setEditing({ section, row }))}>Edit</button><button type="button" disabled={Boolean(busy)} className={action} onClick={() => mutate("remove", null, section, row.id)}>Remove</button></div>}</article>)}
            {section !== "attachments" && !entry.data.count && <p className="py-2 text-sm text-[#716658]">No {section === "work-entries" ? "task work" : section} recorded yet.</p>}
            {!review && entry.data.count > 25 && <nav aria-label={`${section} pages`} className="rare-pagination text-xs"><button type="button" disabled={!entry.data.previous || Boolean(busy)} className={action} onClick={() => changePage(section, -1)}>Previous</button><span aria-live="polite" aria-atomic="true">Page {pages[section] || 1} of {Math.max(1, Math.ceil(entry.data.count / 25))}</span><button type="button" disabled={!entry.data.next || Boolean(busy)} className={action} onClick={() => changePage(section, 1)}>Next</button></nav>}
        </div>;
    }
    function draftProps(key, defaults, section, rowId) {
        const entry = drafts.current[key] ??= { values: defaults, section, rowId, dirty: false, snapshot: { current: null } };
        return { values: entry.values, draftRef: entry.snapshot, onChange: (next) => {
            entry.values = typeof next === "function" ? next(entry.values) : next;
            if (key === "diary" && entry.values.work_summary?.trim()) setWorkSummaryError("");
            entry.dirty = true; setDraftRevision((value) => value + 1);
        } };
    }
    function openGuidedEditor(next) {
        if (inFlight.current) return;
        const current = guidedEditors[next.section];
        if (current && current.row?.id === next.row?.id) {
            setEditing(current);
            return;
        }
        if (current && drafts.current[current.draftKey]?.dirty) {
            setError("Save the unfinished record in this section before opening a different editor.");
            return;
        }
        const draftKey = next.row ? next.section + ":" + next.row.id : next.section + ":new:" + (++draftSequence.current);
        const editor = { ...next, draftKey };
        setEditing(editor); setGuidedEditors((current) => ({ ...current, [next.section]: editor }));
    }
    function guidedEditor(section) {
        const editor = guidedEditors[section];
        if (!guidedDraft || !editor) return null;
        const row = editor.row;
        const defaults = section === "work-entries" ? { task: row?.task || "", work_description: row?.work_description || "", location_detail: row?.location_detail || "", quantity_completed_today: row?.quantity_completed_today || "", completion_claimed: row?.completion_claimed || false, new_daily_report: "" }
            : section === "manpower" ? { trade: "MASON", contractor_name: "", worker_count: "1", hours_worked: "", remarks: "", ...row } : { material_name: "", entry_type: "RECEIVED", quantity: "", unit: "", remarks: "", ...row };
        const fields = section === "manpower" ? ["trade", "contractor_name", "worker_count", "hours_worked", "remarks"] : section === "materials" ? ["material_name", "entry_type", "quantity", "unit", "remarks"] : Object.keys(defaults);
        const props = draftProps(editor.draftKey, Object.fromEntries(fields.map((field) => [field, defaults[field]])), section, row?.id);
        const save = (payload) => { setEditing(editor); return mutate("row", payload, section, row?.id, undefined, editor.draftKey); };
        if (section === "work-entries") return <ReportWorkForm key={editor.draftKey} guided initial={row} tasks={choiceData} {...props} onTaskSearch={(value) => { setTaskSearch(value); setTaskPage(1); }} onTaskPage={(delta) => setTaskPage((v) => Math.max(1, v + delta))} busy={editorBusy} onSave={save} onCancel={() => {}} />;
        return <ReportRowForm key={editor.draftKey} guided section={section} initial={row} {...props} busy={editorBusy} onSave={save} onCancel={() => {}} />;
    }
    return <section className={`daily-report-detail min-w-0 space-y-5 pb-24 ${submittedReport ? "desktop-report-detail" : ""}`}>
        {confirmationModal}
        {loading && <LoadingScreen message="Loading report details..." />}
        {!guidedDraft && <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={action} disabled={Boolean(busy)} onClick={() => leaveEditor(() => onSelect(null))}><ArrowLeft size={15} />Back to Report Register</button>
        {canEdit && <button type="button" className={`${deleteAction} sm:ml-3`} disabled={Boolean(busy)} onClick={() => mutate("delete")}>{busy === "delete" ? "Deleting draft…" : "Delete Draft"}</button>}
        </div>}
        {guidedDraft && <header className="report-guided-header flex min-w-0 flex-wrap items-center justify-between gap-3"><div className="min-w-0"><Link to={`/supervisor/projects/${projectId}/daily-reports`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"><ArrowLeft size={16}/>Back to Daily Reports</Link><div className="flex flex-wrap items-center gap-2"><h1 className="mt-2 break-words text-xl font-bold">Daily Report · {formatDate(report.report_date)}</h1><ReportStatusBadge status="DRAFT" /></div><p className="text-sm text-[#665C50]">{report.project_name || "Project site diary"}</p><p aria-live="polite" className="text-xs text-[#716658]">{busy ? "Saving..." : notice ? "Saved" : "Draft"}</p></div><details className="relative"><summary aria-label="Report menu" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-[#E7DED2] text-xl focus-visible:outline-2">⋯</summary><button type="button" className={`${deleteAction} absolute right-0 top-12 z-10 w-max max-w-none whitespace-nowrap`} onClick={() => mutate("delete")}>Delete draft</button></details></header>}
        {(state.error || error) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.error || error}</p>}
        {notice && <p role="status" className="rounded-xl bg-[#E7F2E8] p-4 text-sm text-[#296F40]">{notice}</p>}
        {sourceHint && isTaskId(sourceHint) && <Link className={action} to={`/supervisor/projects/${projectId}/daily-reports?report=${sourceHint}`}>View source report used for prefill</Link>}
        {report && <>
            {!!report.correction_summary?.rejected_count && <section className="space-y-3 rounded-2xl border border-[#ECC4BA] bg-[#FFF1EC] p-5 text-[#803D32]"><h3 className="text-lg font-bold">{report.correction_summary.eligible_count ? "Work Corrections Required" : "Work Correction History"}</h3><p className="text-sm">{report.correction_summary.rejected_count} rejected entries. Corrected work is saved in a new independent report.</p>{report.correction_summary.entries.map((entry) => <p key={entry.id} className="whitespace-pre-wrap break-words text-sm leading-6"><strong>{entry.task_title}:</strong> {entry.verification_note}{entry.correction_report && <Link className="ml-2 inline-block font-bold underline" to={`/supervisor/projects/${report.project}/daily-reports?report=${entry.correction_report.id}`}>Existing correction: {formatText(entry.correction_report.status)}</Link>}</p>)}{report.correction_summary.eligible_count > 0 && onCorrectReport && <button type="button" className={primaryAction} disabled={Boolean(busy)} onClick={() => leaveEditor(() => onCorrectReport(report.id))}><Plus size={18} aria-hidden="true" />Create Correction Report</button>}</section>}
            {submittedReport && <header className="rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><span className="rounded-xl bg-[#F1E6D5] p-3"><CalendarDays size={20} /></span><div><p className="text-xs text-[#716658]">Daily site report - {report.project_name || "Project site diary"}</p><h1 className="mt-1 text-2xl font-semibold">{formatDate(report.report_date)}</h1></div></div><div className="flex items-center gap-2"><span className="rounded-full bg-[#F1EADF] px-3 py-1 text-xs">Read-only</span><ReportStatusBadge status={report.status} /></div></div>
                <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4 border-t border-[#EEE6DC] pt-4">{[["Prepared by", report.reported_by_name || "Supervisor"], ["Weather", formatText(report.weather_condition)], ["Submitted at", report.submitted_at ? new Date(report.submitted_at).toLocaleString("en-IN") : "Not submitted"], ["Task work entries", report.work_entry_count ?? 0]].map(([label, value]) => <div key={label}><dt className="text-xs font-medium uppercase tracking-wide text-[#716658]">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}</dl><p className="mt-3 text-xs text-[#716658]">Submitted reports are read-only. Task work is verified individually.</p>
            </header>}
            <header className={(submittedReport || guidedDraft ? "hidden " : "") + "rare-page-header flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5"}><div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#716658]"><CalendarDays size={16} aria-hidden="true" />Daily report</div><h2 className="text-xl font-semibold tracking-tight text-[#211E1A] sm:text-2xl">{formatDate(report.report_date)}</h2><p className="mt-2 text-sm leading-6 text-[#716658]">Prepared by {report.reported_by_name || "Supervisor"}</p></div><div className="space-y-2"><ReportStatusBadge status={report.status} /><p className="text-sm text-[#716658]">{report.work_entry_count ?? 0} task work entries{report.status === "SUBMITTED" ? " · Read-only report" : " · Private draft"}</p></div></header>
            {submittedReport && <nav ref={reportTabsRef} aria-label="Report sections" className="report-detail-tab-row report-section-tabs flex flex-wrap gap-2 border-b border-[#E7DED2]">{[["overview", "Overview"], ["diary", "Site diary"], ["work-entries", "Task work"], ["manpower", "Manpower"], ["materials", "Materials"], ["attachments", "Attachments"]].map(([id, label]) => <button key={id} type="button" disabled={Boolean(busy)} aria-pressed={id === "overview" ? overview : !overview && tab === id} onClick={() => leaveEditor(() => { setOverview(id === "overview"); if (id !== "overview") setTab(id); })} className={"border-b-2 px-3 py-3 text-xs font-semibold " + ((id === "overview" ? overview : !overview && tab === id) ? "border-[#211E1A]" : "border-transparent text-[#716658]")}>{label}{!["overview", "diary"].includes(id) && resource(id)?.data && <span className="ml-2">{resource(id).data.count}</span>}</button>)}</nav>}
            {reportOverview && <div className="report-overview-grid grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:gap-5">
                <section className="min-w-0 lg:col-span-2 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-bold">Site diary</h2><button type="button" onClick={() => { setOverview(false); setTab("diary"); }} className="text-xs text-[#3565A5]">Open full diary</button></div><dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[["Work summary", "work_summary"], ["Site condition", "site_condition"], ["Site notes", "site_notes"], ["Issues & safety observations", "issues"], ["Next day plan", "next_day_plan"]].map(([label, field], index) => <div key={field} className={"rounded-xl bg-[#F5F0E7] p-4 " + (index === 0 ? "sm:col-span-2" : "")}><dt className="text-xs font-medium uppercase tracking-wide text-[#716658]">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm">{report[field] || "Not recorded"}</dd></div>)}</dl></section>
                <section className="min-w-0 lg:col-span-3 lg:row-start-2 lg:w-1/2 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4"><div className="mb-4 flex items-center justify-between gap-2"><h2 className="text-sm font-bold">Attachments{resource("attachments")?.data ? ": " + resource("attachments").data.count : ""}</h2><button type="button" onClick={() => { setOverview(false); setTab("attachments"); }} className="text-xs text-[#3565A5]">Open</button></div>{sectionView("attachments", true)}</section>
                <div className="min-w-0 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-start-3 lg:row-start-1 lg:grid-cols-1">{[["work-entries", "Task work"], ["manpower", "Manpower"], ["materials", "Materials"]].map(([section, title]) => <button key={section} type="button" onClick={() => { setOverview(false); setTab(section); }} className="flex items-center justify-between gap-3 rounded-xl border border-[#E7DED2] bg-[#FFFDFA] p-4 text-left"><span><span className="block text-sm font-bold">{title}: {resource(section)?.data?.count ?? "Loading"}</span><span className="mt-1 block text-xs text-[#716658]">{resource(section)?.error ? "Could not load records" : !resource(section)?.data ? "Loading records..." : resource(section).data.count ? "View recorded entries" : "No " + title.toLowerCase() + " recorded yet"}</span></span><span className="text-xs text-[#3565A5]">Open</span></button>)}</div>
            </div>}
            {guidedDraft ? <nav aria-label="Daily report steps" className="rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-3"><p className="mb-2 text-sm font-semibold sm:hidden">Step {guidedIndex + 1} of 3 · {guidedSteps[guidedIndex][1]}</p><ol className="grid grid-cols-3 gap-2">{guidedSteps.map(([id, title], index) => <li key={id}><button type="button" onClick={() => goStep(index)} aria-current={tab === id ? "step" : undefined} className={`rare-button w-full min-h-11 px-2 py-2 text-xs ${tab === id ? "rare-button-primary" : "rare-button-secondary"}`}><span>{title}</span></button></li>)}</ol></nav> : <nav ref={draftTabsRef} hidden={submittedReport} aria-label="Daily report sections" className="report-detail-tab-row flex gap-2 overflow-x-auto rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-3">{reportTabs.map(([id, title]) => <button key={id} type="button" disabled={Boolean(busy)} aria-pressed={tab === id} className={`rare-button shrink-0 ${tab === id ? "rare-button-primary" : "rare-button-secondary"}`} onClick={() => { if (id !== tab) leaveEditor(() => setTab(id)); }}>{id === "review" && (role === "ADMIN" || report.status === "SUBMITTED") ? "Report overview" : title}</button>)}</nav>}
            {choices?.key === choiceKey && choices.error && <p role="alert" className="text-sm text-red-700">{choices.error}<button type="button" className={`${action} ml-3`} onClick={() => setChoiceRevision((v) => v + 1)}>Retry choices</button></p>}
            {allowEditor && !guidedDraft && editing?.section === "diary" && <ReportDiaryForm report={report} busy={editorBusy} onSave={(payload) => mutate("diary", payload)} onCancel={() => leaveEditor(() => {})} />}
            {allowEditor && !guidedDraft && editing?.section === "work-entries" && <ReportWorkForm key={`${editing.row?.id || "new"}:${editing.correction || false}`} initial={editing.row} correction={editing.correction} tasks={choiceData} drafts={choiceData} onTaskSearch={(value) => { setTaskSearch(value); setTaskPage(1); }} onTaskPage={(delta) => setTaskPage((v) => Math.max(1, v + delta))} onDraftPage={(delta) => setDraftPage((v) => Math.max(1, v + delta))} busy={editorBusy} onSave={(payload) => mutate(editing.correction ? "correct" : "row", payload, "work-entries", editing.row?.id)} onCancel={() => leaveEditor(() => {})} />}
            {allowEditor && !guidedDraft && ["manpower", "materials"].includes(editing?.section) && <ReportRowForm key={`${editing.section}:${editing.row?.id || "new"}`} section={editing.section} initial={editing.row} busy={editorBusy} onSave={(payload) => mutate("row", payload, editing.section, editing.row?.id)} onCancel={() => leaveEditor(() => {})} />}
            {allowEditor && !guidedDraft && editing?.section === "attachments" && <ReportAttachmentForm entries={resource("work-entries")?.data} onPage={(delta) => changePage("work-entries", delta)} busy={editorBusy} onSave={(payload, onUploaded) => mutate("upload", payload, "attachments", null, onUploaded)} onCancel={() => leaveEditor(() => {})} />}
            {!reportOverview && tab === "diary" && <>{guidedDraft ? <ReportDiaryForm report={report} guided workSummaryError={workSummaryError} {...draftProps("diary", Object.fromEntries(["report_date", "weather_condition", "site_condition", "work_summary", "site_notes", "issues", "next_day_plan"].map((field) => [field, report[field] || ""])), "diary")} busy={editorBusy} onSave={(payload) => mutate("diary", payload)} onCancel={() => {}} /> : <>{canEdit && !editing && <button type="button" className={primaryAction} onClick={() => setEditing({ section: "diary" })}>Edit Draft Diary</button>}<div className="report-diary-tab"><DailyReportSummary report={report} /></div></>}</>}
            {guidedDraft && tab === "activity" && <><p className="text-sm text-[#716658]">Task work {resource("work-entries")?.data?.count ?? 0} · Manpower {resource("manpower")?.data?.count ?? 0} · Materials {resource("materials")?.data?.count ?? 0}</p><section className="space-y-3">{[["work-entries", "Task work"], ["manpower", "Manpower"], ["materials", "Materials"]].map(([section, title]) => { const count = resource(section)?.data?.count ?? 0; const open = activityOpen[section] ?? count > 0; const id = "guided-" + section; return <section key={section} className="overflow-hidden rounded-2xl border border-[#E7DED2] bg-[#FFFDFA]"><div className="flex items-center gap-2 p-2"><button type="button" aria-expanded={open} aria-controls={id} onClick={() => setActivityOpen((current) => ({ ...current, [section]: !open }))} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left font-semibold focus-visible:outline-2"><span className="truncate">{title}</span><span className="rounded-full bg-[#F1EADF] px-2.5 py-1 text-xs">{count}</span></button>{canEdit && <button type="button" className={action} disabled={Boolean(busy)} onClick={() => { setActivityOpen((current) => ({ ...current, [section]: true })); openGuidedEditor({ section }); }}><Plus size={16}/>Add</button>}</div><div id={id} hidden={!open} className="space-y-3 border-t border-[#EDE5DA] p-3">{sectionView(section)}{guidedEditor(section)}</div>{!count && !open && <p className="px-4 pb-3 text-sm text-[#716658]">No {section === "work-entries" ? "task work" : section} recorded yet</p>}</section>; })}</section></>}
            {guidedDraft && tab === "photos-submit" && <div className="space-y-5"><section className="space-y-3 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4"><h2 className="text-base font-semibold text-[#211E1A]">Photos</h2>{sectionView("attachments")}{editing?.section === "attachments" ? <ReportAttachmentForm {...draftProps("attachments", { files: [], caption: "", task_work: "" }, "attachments")} entries={resource("work-entries")?.data} onPage={(delta) => changePage("work-entries", delta)} busy={editorBusy} onSave={(payload, onUploaded) => mutate("upload", payload, "attachments", null, onUploaded)} onCancel={() => setEditing(null)} /> : canEdit && <button type="button" className={action} onClick={() => setEditing({ section: "attachments" })}>Take photo / Choose files</button>}</section><section className="space-y-3 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4"><h2 className="text-base font-semibold text-[#211E1A]">Review checklist</h2>{[["Diary", Boolean(report.work_summary?.trim()), 0], ["Site activity", true, 1], ["Photos & Submit", true, 2]].map(([label, done, index]) => <div key={label} className="flex min-h-11 items-center gap-3 border-b border-[#E7DED2] py-2"><span aria-hidden="true">{done ? "✓" : "○"}</span><span className="min-w-0 flex-1 text-sm">{label}{label === "Site activity" ? " · Task work " + (resource("work-entries")?.data?.count ?? 0) + " · Manpower " + (resource("manpower")?.data?.count ?? 0) + " · Materials " + (resource("materials")?.data?.count ?? 0) : ""}</span>{!done && <button type="button" onClick={() => goStep(index)} className="min-h-11 px-3 text-sm text-[#514538] underline">Fix</button>}</div>)}<p className="text-sm leading-6 text-[#716658]">No-work reports are valid when the diary explains why no work took place. Submission does not complete tasks or verify measurements.</p></section></div>}
            {!reportOverview && !guidedDraft && !["diary", "review"].includes(tab) && <div className="report-section-panel space-y-5 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E7DED2] pb-4"><div><h3 className="text-base font-semibold text-[#211E1A]">{reportTabs.find(([id]) => id === tab)?.[1]}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-[#716658]">{{ "work-entries": "Reported work and measurements, with an individual verification status for each task.", manpower: "Site workforce, trades and working hours recorded for the day.", materials: "Material observations recorded on site for this report.", attachments: "Private site photographs and documents. Select Preview to view supporting evidence." }[tab]}</p></div>{canEdit && !editing && <button type="button" className={primaryAction} onClick={() => { setEditing({ section: tab }); setError(""); }}><Plus size={16} aria-hidden="true" />Add {tab === "attachments" ? "attachments" : "record"}</button>}</div>{sectionView(tab)}</div>}
            {!reportOverview && tab === "review" && !guidedDraft && <div className="space-y-5"><DailyReportSummary report={report} />{["work-entries", "manpower", "materials", "attachments"].map((section) => <section key={section} className="space-y-4 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5"><h3 className="text-base font-semibold text-[#211E1A]">{formatText(section)}</h3>{sectionView(section, true)}</section>)}{canEdit && <div className="rounded-2xl border border-[#E7DED2] bg-[#F1EADF] p-4"><p className="mb-4 text-sm text-[#716658]">A saved work summary is required. No-work reports are valid when the diary explains why no work took place. Submission does not complete tasks or verify measurements.</p><button type="button" disabled={Boolean(busy) || !report.work_summary?.trim() || ["work-entries", "manpower", "materials", "attachments"].some((section) => !resource(section)?.data)} className={submitAction} onClick={() => mutate("submit")}>Confirm and Submit Report</button></div>}</div>}
        </>}
        {guidedDraft && <footer className="report-draft-actions flex items-center justify-between gap-3 border border-[#E7DED2] bg-[#FFFDFA] p-3 shadow-lg"><button type="button" disabled={guidedIndex === 0 || Boolean(busy)} onClick={() => goStep(guidedIndex - 1)} className={action}>Back</button>{guidedIndex === guidedSteps.length - 1 ? <button type="button" className={submitAction} disabled={Boolean(busy)} onClick={() => mutate("submit")}>Submit report</button> : <button type="button" className={primaryAction} disabled={Boolean(busy)} onClick={() => goStep(guidedIndex + 1)}>Next</button>}</footer>}
    </section>;
}

function ReportLocator({ reportId }) {
    const [result, setResult] = useState(null);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        dailyReportApi.get(reportId, controller.signal).then((report) => { if (!controller.signal.aborted) setResult({ report }); }).catch((error) => { if (!controller.signal.aborted) setResult({ error: validationMessage(error) }); });
        return () => controller.abort();
    }, [reportId, revision]);
    if (!result) return <LoadingScreen message="Loading daily report..." />;
    if (result.error) return <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-5 text-sm text-red-700"><p>{result.error}</p><button type="button" className={action} onClick={() => { setResult(null); setRevision((v) => v + 1); }}>Retry</button><Link className={`${action} ml-2`} to="/admin/reports">Back to reports</Link></div>;
    return <Navigate to={`/admin/projects/${result.report.project}/daily-reports?report=${result.report.id}`} replace />;
}

export default function AdminDailyReports() {
    const [params] = useSearchParams();
    if (params.get("project")) return <ProjectDailyReports role="ADMIN" projectId={params.get("project")} />;
    if (params.get("report")) return <ReportLocator key={params.get("report")} reportId={params.get("report")} />;
    if (params.get("entry")) return <Navigate to={`/admin/approvals?tab=work&type=work&entry=${params.get("entry")}`} replace />;
    return <ReportProjectPicker />;
}
