import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, CloudSun, FileText, FolderOpen, ListFilter, Plus, RefreshCw, UserRound } from "lucide-react";
import DailyReportSummary, { ReportAttachmentForm, ReportDiaryForm, ReportRowForm, ReportWorkEntry, ReportWorkForm, ReportStatusBadge } from "../../components/daily-reports/DailyReportSummary";
import ReportEvidence from "../../components/daily-reports/ReportEvidence";
import LoadingScreen from "../../components/LoadingScreen";
import { dailyReportApi } from "../../api/dailyReportApi";
import { projectApi } from "../../api/projectApi";
import { isTaskId, taskApi } from "../../api/taskApi";
import { useAuth } from "../../hooks/useAuth";
import { useConfirmation } from "../../hooks/useConfirmation";
import { validationMessage } from "../../hooks/useApprovalReview";
import { formatDate, formatText } from "../../components/approvals/approvalUtils";

function ReportProjectPicker() {
    const [search, setSearch] = useState("");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState(null);
    const key = `${query}:${page}:${revision}`;
    const current = result?.key === key ? result : null;
    useEffect(() => {
        let active = true;
        projectApi.getProjects({ search: query, page, page_size: 25 }).then((response) => { if (active) setResult({ key, data: reportPage(response, page) }); })
            .catch((error) => { if (active) setResult({ key, error: validationMessage(error, "Unable to load projects.") }); });
        return () => { active = false; };
    }, [key, query, page]);
    return <div className="space-y-6 pb-8 text-[#211E1A]">
        {!current && <LoadingScreen message="Loading project reports..." />}
        <header className="space-y-4 rounded-[28px] border border-[#302A21] bg-black p-6 text-[#FFFDFA] shadow-[0_12px_36px_-24px_rgba(0,0,0,0.6)] sm:p-8"><div className="border-l-4 border-[#F3C45C] pl-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#D2BEA2]">Site records / Administration</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Daily Reports</h1><p className="mt-3 max-w-xl text-base leading-7 text-[#D5C9B9]">Choose a project to review its site diary, work records and evidence.</p></div><Link className={primaryAction} to="/admin/approvals?tab=work">Open Daily Work Verification</Link></header>
        <form className="flex flex-wrap gap-3 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(1); }}><label className="min-w-0 flex-1 basis-52 text-xs text-[#817669]">Search projects<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className={control} /></label><button type="submit" className={`${action} self-end`}>Search</button><button type="button" className={`${action} self-end`} onClick={() => { setSearch(""); setQuery(""); setPage(1); }}>Clear</button><button type="button" className={`${action} self-end`} disabled={!current} onClick={() => setRevision((v) => v + 1)}>Refresh</button></form>
        {current?.error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700"><p>{current.error}</p><button type="button" className={`${action} mt-3`} onClick={() => setRevision((v) => v + 1)}>Retry</button></div>}
        {current?.data && <><p className="text-xs text-[#817669]">{current.data.count} matching projects</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{current.data.results.map((project) => <Link key={project.id} to={`/admin/projects/${project.id}/daily-reports`} className="group min-w-0 rounded-[24px] border border-[#E2D6C6] bg-[#FFFDFA] p-6 transition-[border-color,box-shadow] hover:border-[#BCA17D] hover:shadow-md motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D]"><span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F6EAD5] text-[#795A30]"><FolderOpen size={23} aria-hidden="true" /></span><h2 className="break-words text-xl font-bold text-[#352D24]">{project.name}</h2><p className="mt-3 text-sm leading-6 text-[#665C50]">View daily reports and site evidence</p><span className="mt-5 inline-flex items-center gap-2 text-base font-bold text-[#795016]">Open reports<ArrowUpRight size={18} aria-hidden="true" /></span></Link>)}</div>{!current.data.count && <p className="rounded-2xl bg-[#FFFDFA] p-8 text-center text-sm text-[#817669]">No projects match this search.</p>}<nav aria-label="Project pages" className="flex items-center justify-between gap-3 text-xs"><button type="button" className={action} disabled={!current.data.previous} onClick={() => setPage((v) => v - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(current.data.count / 25))}</span><button type="button" className={action} disabled={!current.data.next} onClick={() => setPage((v) => v + 1)}>Next</button></nav></>}
    </div>;
}

const control = "mt-2 w-full min-w-0 rounded-xl border border-[#E7DED2] bg-[#FFFDFA] px-3 py-3 text-sm outline-none focus:border-[#A58A67] focus:ring-2 focus:ring-[#E8DDD0]";
const actionBase = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-5 py-3 text-base font-bold leading-6 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] disabled:cursor-not-allowed disabled:opacity-50";
const action = `${actionBase} border-[#C5AE8F] bg-[#F1EADF] text-[#4F3D27] hover:bg-[#E8DAC6]`;
const primaryAction = `${actionBase} border-[#D6A437] bg-[#F3C45C] text-[#35250C] shadow-sm hover:bg-[#EAB344]`;
const submitAction = `${actionBase} border-[#047857] bg-[#047857] text-white shadow-sm hover:bg-[#065F46]`;
const deleteAction = `${actionBase} border-[#B91C1C] bg-[#DC2626] text-white shadow-sm hover:bg-[#B91C1C]`;
const reportTabs = [["diary", "Site diary"], ["work-entries", "Task work"], ["manpower", "Manpower"], ["materials", "Materials"], ["attachments", "Attachments"], ["review", "Review & Submit"]];

function ReportMetrics({ summary, role }) {
    const items = role === "ADMIN"
        ? [["Submitted reports", "submitted", CheckCircle2, "bg-[#E9F6EF] text-[#176647]"], ["Pending work verifications", "pending_work", Clock3, "bg-[#FFF3D6] text-[#795016]"]]
        : [["Total reports", "total", FileText, "bg-[#F1EADF] text-[#745532]"], ["Draft reports", "drafts", FileText, "bg-[#FFF3D6] text-[#795016]"], ["Submitted reports", "submitted", CheckCircle2, "bg-[#E9F6EF] text-[#176647]"], ["Pending work verifications", "pending_work", Clock3, "bg-[#EAF1FD] text-[#28549A]"]];
    return <section aria-label="Project report totals" className={`grid gap-3 sm:grid-cols-2 ${role === "ADMIN" ? "" : "xl:grid-cols-4"}`}>{items.map(([label, field, Icon, tone]) => <div key={field} className="flex items-center gap-4 rounded-[22px] border border-[#E5DACB] bg-[#FFFDFA] p-5 shadow-[0_4px_20px_-16px_rgba(61,42,20,0.3)]"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone}`}><Icon size={23} aria-hidden="true" /></span><div><p className="text-sm font-medium leading-5 text-[#665C50]">{label}</p><p className="mt-1 text-3xl font-semibold tracking-tight text-[#211E1A] tabular-nums">{summary[field]}</p></div></div>)}</section>;
}

function ReportRegisterCard({ report, onSelect, onCorrect }) {
    return <article className="group flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-[#E2D6C6] bg-[#FFFDFA] shadow-[0_5px_22px_-18px_rgba(61,42,20,0.3)] transition-[border-color,box-shadow,transform] duration-200 hover:border-[#BCA17D] hover:shadow-[0_12px_30px_-18px_rgba(61,42,20,0.3)] motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDE5DA] bg-[#FCF9F4] px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E6D4B9] bg-[#F6EAD5] text-[#795A30]"><CalendarDays size={21} aria-hidden="true" /></span><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#80603B]">Daily site report</p><h3 className="mt-1 text-lg font-bold tracking-tight text-[#2E271F]">{formatDate(report.report_date)}</h3></div></div><ReportStatusBadge status={report.status} /></div>
        <div className="flex flex-1 flex-col p-5 sm:p-6"><div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#665C50]"><span className="inline-flex items-center gap-2"><UserRound size={16} aria-hidden="true" />{report.reported_by_name || "Supervisor"}</span><span className="inline-flex items-center gap-2"><CloudSun size={16} aria-hidden="true" />{formatText(report.weather_condition)}</span></div>
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-base leading-7 text-[#423A30]">{report.work_summary || "No work summary saved yet."}</p>
            <div className="mb-5 mt-5 rounded-2xl border border-[#E9E1D6] bg-[#F8F4EE] p-4"><p className="mb-3 text-sm font-semibold text-[#4F473D]">{report.work_entry_count} task work entries</p><dl className="grid grid-cols-3 gap-2">{[["Pending", "pending", "text-[#795016]"], ["Verified", "verified", "text-[#176647]"], ["Rejected", "rejected", "text-[#A33228]"]].map(([label, field, tone]) => <div key={field}><dt className="text-xs font-medium text-[#716658]">{label}</dt><dd className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{report.work_counts?.[field] ?? 0}</dd></div>)}</dl></div>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#EDE5DA] pt-4"><div className="text-xs leading-5 text-[#716658]"><p>Created {formatDate(report.created_at)}</p><p>{report.submitted_at ? `Submitted ${new Date(report.submitted_at).toLocaleString("en-IN")}` : "Draft awaiting submission"}</p></div><button type="button" onClick={() => onSelect(report.id)} className={primaryAction} aria-label={`View report for ${formatDate(report.report_date)} by ${report.reported_by_name || "Supervisor"}`}>View Report<ArrowUpRight size={18} aria-hidden="true" /></button></div>
            {!!report.correction_summary?.rejected_count && <div className="mt-4 space-y-3 rounded-xl border border-[#ECC4BA] bg-[#FFF1EC] p-4 text-sm leading-6 text-[#803D32]"><p className="font-bold">{report.correction_summary.eligible_count ? "Work Corrections Required" : "Work Correction History"} · {report.correction_summary.rejected_count} rejected entries</p>{report.correction_summary.entries.map((entry) => <p key={entry.id} className="whitespace-pre-wrap break-words"><strong>{entry.task_title}:</strong> {entry.verification_note}{entry.correction_report && <Link className="ml-2 inline-block font-bold underline" to={`/supervisor/projects/${report.project}/daily-reports?report=${entry.correction_report.id}`}>Existing correction: {formatText(entry.correction_report.status)}</Link>}</p>)}{report.correction_summary.rejected_count > report.correction_summary.entries.length && <p>Open the report to view all rejection notes.</p>}{report.correction_summary.eligible_count > 0 && onCorrect && <button type="button" className={primaryAction} onClick={() => onCorrect(report.id)}>Create Correction Report</button>}</div>}
            <p className="mt-3 break-all font-mono text-[11px] leading-5 text-[#716658]">Ref: {report.id}</p>
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
    return <form onSubmit={(event) => { event.preventDefault(); onApply(draft); }} className="grid gap-4 rounded-[24px] border border-[#E2D6C6] bg-[#FFFDFA] p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
        <div className="flex items-start gap-3 border-b border-[#EDE5DA] pb-4 sm:col-span-2 xl:col-span-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1EADF] text-[#745532]"><ListFilter size={20} aria-hidden="true" /></span><div><h2 className="text-base font-bold text-[#352D24]">Find a report</h2><p className="mt-1 text-sm leading-6 text-[#716658]">Search the site diary or narrow reports by date and supervisor.</p></div></div>
        <label className="text-sm font-semibold text-[#665C50]">Search report content<input type="search" maxLength={200} value={draft.search} onChange={(e) => setDraft((v) => ({ ...v, search: e.target.value }))} className={control} /></label>
        {role !== "ADMIN" && <label className="text-sm font-semibold text-[#665C50]">Status<select value={draft.status} onChange={(e) => setDraft((v) => ({ ...v, status: e.target.value }))} className={control}><option value="">All reports</option><option value="DRAFT">Draft</option><option value="SUBMITTED">Submitted</option></select></label>}
        <label className="text-sm font-semibold text-[#665C50]">Reporter<select value={draft.reported_by} onChange={(e) => setDraft((v) => ({ ...v, reported_by: e.target.value }))} className={control}><option value="">All reporters</option>{reporters.map((reporter) => <option key={reporter.reported_by} value={reporter.reported_by}>{reporter.reported_by__username}</option>)}</select></label>
        <label className="text-sm font-semibold text-[#665C50]">From report date<input type="date" value={draft.date_from} onChange={(e) => setDraft((v) => ({ ...v, date_from: e.target.value }))} className={control} /></label>
        <label className="text-sm font-semibold text-[#665C50]">To report date<input type="date" min={draft.date_from || undefined} value={draft.date_to} onChange={(e) => setDraft((v) => ({ ...v, date_to: e.target.value }))} className={control} /></label>
        <label className="text-sm font-semibold text-[#665C50]">Sort<select value={draft.sort} onChange={(e) => setDraft((v) => ({ ...v, sort: e.target.value }))} className={control}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-3"><button type="submit" className={action}>Apply filters</button><button type="button" className={action} onClick={() => { setDraft(Object.fromEntries(Object.keys(filters).map((key) => [key, key === "sort" ? "newest" : ""]))); onClear(); }}>Clear filters</button></div>
    </form>;
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
    const reportId = params.get("report");
    const correctionId = role === "SUPERVISOR" ? params.get("correct") : null;
    const selectedId = correctionId || reportId;
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

    function selectReport(id, sourceId) { const next = new URLSearchParams(params); next.delete("correct"); next.delete("source"); if (sourceId) next.set("source", sourceId); if (id) next.set("report", id); else { next.delete("report"); next.delete("page"); setRevision((v) => v + 1); } setParams(next); }
    function startCorrection(id) { const next = new URLSearchParams(params); next.delete("report"); next.delete("source"); next.set("correct", id); setCreating(false); setParams(next); }
    async function create(payload) {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(true); setMutationError("");
        try { const report = await dailyReportApi.create(projectId, payload); if (mounted.current) { setCreating(false); selectReport(report.id); } }
        catch (err) { if (mounted.current) setMutationError(validationMessage(err)); }
        finally { inFlight.current = false; if (mounted.current) setBusy(false); }
    }
    const prefix = role === "ADMIN" ? "/admin" : "/supervisor";
    return <div className="mx-auto min-w-0 max-w-[1500px] space-y-6 pb-8 text-[#211E1A]">
        {loading && <LoadingScreen message="Loading daily reports..." />}
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-xs text-[#817669]"><Link to={`${prefix}/projects`}>Projects</Link><span>/</span><Link to={`${prefix}/projects/${projectId}`}>{project?.name || "Project Overview"}</Link><span>/</span><span aria-current="page">Daily Reports</span></nav>
        <header className="relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-[28px] border border-[#302A21] bg-black p-6 text-[#FFFDFA] shadow-[0_12px_36px_-24px_rgba(0,0,0,0.6)] sm:p-8"><div className="min-w-0 border-l-4 border-[#F3C45C] pl-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#D2BEA2]">{project?.name || "Project workspace"}</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Daily Reports</h1><p className="mt-3 max-w-xl text-base leading-7 text-[#D5C9B9]">A clear record of every day on site. Review the diary, measured work and supporting evidence in one place.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={loading || busy} className={`${actionBase} border-white/40 bg-white/10 text-white hover:bg-white/20`} onClick={() => setRevision((v) => v + 1)}><RefreshCw size={18} aria-hidden="true" />Refresh</button>{role === "SUPERVISOR" && !selectedId && <button type="button" disabled={busy} className={primaryAction} onClick={() => { setCreating(true); setMutationError(""); }}><Plus size={20} aria-hidden="true" />Create Daily Report</button>}</div></header>
        {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700"><p>{error}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={action} onClick={() => setRevision((v) => v + 1)}>Retry</button><button type="button" className={action} onClick={() => setParams({})}>Clear filters</button></div></div>}
        {mutationError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{mutationError}</p>}
        {selectedId && !projectError ? <ReportDetail key={`${selectedId}:${Boolean(correctionId)}`} reportId={selectedId} projectId={projectId} role={role} user={user} externalRevision={revision} onSelect={selectReport} correctionMode={Boolean(correctionId)} onCorrectReport={startCorrection} sourceHint={params.get("source")} /> : <>
            {creating && <ReportDiaryForm onSave={create} onCancel={() => setCreating(false)} busy={busy} />}
            {data && <>
                <ReportMetrics summary={data.summary} role={role} />
                <p className="text-sm leading-6 text-[#716658]">Project-wide totals. Pending verification counts individual work entries in submitted reports.</p>
                <ReportFilters key={filterKey} role={role} filters={filters} reporters={data.reporters || []} onApply={(next) => { const query = new URLSearchParams(Object.entries(next).filter(([, value]) => value)); setParams(query); }} onClear={() => setParams({})} />
                <div className="flex flex-wrap items-end justify-between gap-3 pt-2"><div><h2 className="text-2xl font-semibold tracking-tight text-[#2E271F]">Report register</h2><p role="status" className="mt-2 text-sm text-[#665C50]">{data.count} matching reports</p></div><p className="text-sm text-[#716658]">{filters.sort === "oldest" ? "Oldest first" : "Newest first"}</p></div>
                <div className="grid items-stretch gap-5 2xl:grid-cols-2">{data.results.map((report) => <ReportRegisterCard key={report.id} report={report} onSelect={selectReport} onCorrect={role === "SUPERVISOR" ? startCorrection : undefined} />)}</div>
                {!data.count && <div className="rounded-[24px] border border-dashed border-[#CCB99F] bg-[#FFFDFA] px-6 py-14 text-center"><FolderOpen size={36} aria-hidden="true" className="mx-auto text-[#99754B]" /><h3 className="mt-4 text-lg font-bold text-[#352D24]">No reports match this selection.</h3><p className="mx-auto mt-2 max-w-md text-base leading-7 text-[#716658]">Try another date range or clear your filters to see available reports.</p></div>}
                <nav aria-label="Report pages" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5DACB] bg-[#FFFDFA] p-4 text-sm text-[#665C50]"><button type="button" disabled={!data.previous} className={action} onClick={() => { const next = new URLSearchParams(params); next.set("page", String(page - 1)); setParams(next); }}><ChevronLeft size={15} />Previous</button><span>Page {page} of {Math.max(1, Math.ceil(data.count / 25))}</span><button type="button" disabled={!data.next} className={action} onClick={() => { const next = new URLSearchParams(params); next.set("page", String(page + 1)); setParams(next); }}>Next<ChevronRight size={15} /></button></nav>
            </>}
        </>}
    </div>;
}

function ReportDetail({ reportId, projectId, role, user, externalRevision, onSelect, correctionMode = false, onCorrectReport, sourceHint }) {
    const [state, setState] = useState({ report: null, error: "" });
    const [revision, setRevision] = useState(0);
    const [tab, setTab] = useState("diary");
    const [pages, setPages] = useState({});
    const [resources, setResources] = useState({});
    const [editing, setEditing] = useState(null);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [taskSearch, setTaskSearch] = useState("");
    const [taskPage, setTaskPage] = useState(1);
    const [draftPage, setDraftPage] = useState(1);
    const [choices, setChoices] = useState(null);
    const [choiceRevision, setChoiceRevision] = useState(0);
    const inFlight = useRef(false);
    const mounted = useRef(false);
    const [prefill, setPrefill] = useState(null);
    const [savedDraft, setSavedDraft] = useState(null);
    const [saveStarted, setSaveStarted] = useState(false);
    const savePlan = useRef(null);
    const prefillForms = useRef(null);
    const { confirm, confirmationModal } = useConfirmation();
    const version = `${revision}:${externalRevision}`;
    const loading = state.key !== version;
    const report = state.report;
    const owner = role === "SUPERVISOR" && report?.reported_by === user.id;
    const canEdit = owner && report?.status === "DRAFT" && !loading && !state.error;
    const allowEditor = owner && (report?.status === "DRAFT" || editing?.correction && report?.status === "SUBMITTED");
    const editorBusy = Boolean(busy) || loading || Boolean(state.error);
    const pageKey = JSON.stringify(pages);
    const resourceKey = `${tab}:${pageKey}:${version}`;
    const choiceKey = `${editing?.section}:${editing?.row?.id}:${editing?.correction}:${taskSearch}:${taskPage}:${draftPage}:${choiceRevision}`;
    const choiceData = choices?.key === choiceKey ? choices.data : null;

    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
        const sections = tab === "review" ? ["work-entries", "manpower", "materials", "attachments"] : tab === "diary" ? [] : tab === "attachments" ? ["attachments", "work-entries"] : [tab];
        for (const section of sections) {
            dailyReportApi.section(reportId, section, { page: selectedPages[section] || 1, page_size: 25 }, controller.signal).then((response) => {
                const data = reportPage(response, selectedPages[section] || 1);
                if (data.results.some((item) => item.daily_report !== reportId)) throw new Error("Unexpected report relationship.");
                if (!controller.signal.aborted) setResources((v) => ({ ...v, [section]: { key: resourceKey, data } }));
            }).catch((failure) => { if (!controller.signal.aborted) setResources((v) => ({ ...v, [section]: { key: resourceKey, error: validationMessage(failure, "Unable to load this section.") } })); });
        }
        return () => controller.abort();
    }, [tab, reportId, pageKey, resourceKey, report, loading, state.error, correctionMode]);
    useEffect(() => {
        if (editing?.section !== "work-entries" || editing.row && !editing.correction) return;
        const controller = new AbortController();
        const promise = editing.correction
            ? dailyReportApi.list(projectId, { status: "DRAFT", reported_by: user.id, page: draftPage, page_size: 25 }, controller.signal)
            : taskApi.register({ project: projectId, approval_status: "APPROVED", search: taskSearch, page: taskPage, page_size: 25 }, controller.signal);
        promise.then((data) => { if (!controller.signal.aborted) setChoices({ key: choiceKey, data: reportPage(data, editing.correction ? draftPage : taskPage) }); })
            .catch((failure) => { if (!controller.signal.aborted) setChoices({ key: choiceKey, error: validationMessage(failure, "Unable to load form choices.") }); });
        return () => controller.abort();
    }, [choiceKey, editing, projectId, user.id, draftPage, taskPage, taskSearch]);

    function resource(section) { return resources[section]?.key === resourceKey ? resources[section] : null; }
    function changePage(section, delta) { setPages((v) => ({ ...v, [section]: Math.max(1, (v[section] || 1) + delta) })); }
    async function leaveEditor(next) {
        if (inFlight.current) return;
        if (editing && !await confirm({ title: "Discard unsaved edits?", message: "The current form has not been saved.", confirmLabel: "Discard edits" })) return;
        setEditing(null); setError(""); next();
    }
    async function mutate(kind, payload, section, rowId, onUploaded) {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(kind); setError(""); setNotice("");
        try {
            if (kind === "delete" && !await confirm({ title: "Delete this draft report?", message: "This permanently deletes the draft diary, task work, manpower, materials and its attachments. This cannot be undone.", confirmLabel: "Delete Draft" })) return;
            if (["submit", "remove"].includes(kind) && !await confirm({ title: kind === "submit" ? "Submit this report?" : "Remove this draft record?", message: kind === "submit" ? "The saved diary and all work, manpower, material records and evidence become read-only. Individual work entries remain subject to Admin verification." : "This removes the selected record from the draft.", confirmLabel: kind === "submit" ? "Submit report" : "Remove record" })) return;
            if (kind === "delete") { await dailyReportApi.deleteDraft(reportId); if (mounted.current) onSelect(null); return; }
            let response;
            if (kind === "diary") response = await dailyReportApi.update(reportId, payload);
            if (kind === "row") response = await dailyReportApi.saveRow(reportId, section, payload, rowId);
            if (kind === "remove") await dailyReportApi.removeRow(section, rowId);
            if (kind === "correct") response = await dailyReportApi.correct(rowId, payload);
            if (kind === "submit") response = (await dailyReportApi.submit(reportId)).report;
            if (kind === "upload") for (const file of payload.files) { const data = new FormData(); data.append("file", file); data.append("caption", payload.caption); if (payload.task_work) data.append("task_work", payload.task_work); await dailyReportApi.upload(reportId, data); if (mounted.current) onUploaded(file); }
            if (!mounted.current) return;
            setEditing(null); setNotice(kind === "submit" ? "Report submitted. Work awaits individual Admin verification." : "Saved successfully.");
            if (kind === "submit") setState({ key: version, report: response, error: "" });
            setRevision((v) => v + 1);
            if (kind === "correct") onSelect(response.daily_report);
        } catch (failure) { if (mounted.current) { setError(validationMessage(failure)); if (kind === "upload") setRevision((v) => v + 1); } }
        finally { inFlight.current = false; if (mounted.current) setBusy(""); }
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
    if (correctionMode) {
        const locked = Boolean(busy) || saveStarted;
        const source = state.source;
        const selectSource = async () => { if (inFlight.current) return; if (prefill && !await confirm({ title: "Leave correction editor?", message: savedDraft ? "Saved records remain in your draft. Unfinished selections and files in this editor will be discarded." : "Unsaved corrections and selected files will be discarded. No draft has been created.", confirmLabel: "View original report" })) return; onSelect(reportId); };
        return <section className="space-y-6" ref={prefillForms}>
            {confirmationModal}{loading && <LoadingScreen message="Loading correction reference records..." />}
            <header className="space-y-3 rounded-[24px] border border-[#E2D6C6] bg-[#FFFDFA] p-5 sm:p-7"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#80603B]">Independent daily report</p><h2 className="text-2xl font-bold">Correction Report</h2><p className="text-base leading-7 text-[#665C50]">Information from your previous report has been prefilled. Review the details and correct rejected work before submitting.</p><p className="text-sm leading-6 text-[#795016]">Original evidence and previously verified or pending work are references only. They will not be copied into the new report.</p><button type="button" disabled={Boolean(busy)} className={action} onClick={selectSource}>View original submitted report</button></header>
            {(state.error || error) && <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-700"><p>{state.error || error}</p>{state.error && <button type="button" className={action} onClick={() => setRevision((value) => value + 1)}>Retry loading reference records</button>}</div>}
            {notice && <p role="status" className="rounded-xl bg-[#E9F6EF] p-4 text-sm leading-6 text-[#176647]">{notice}</p>}
            {savedDraft && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E8CE94] bg-[#FFF8E7] p-4"><p className="min-w-0 break-all text-sm text-[#795016]">Saved draft: {savedDraft}</p><button type="button" disabled={Boolean(busy)} className={action} onClick={() => onSelect(savedDraft, reportId)}>Open saved draft</button><p className="w-full text-sm leading-6 text-[#795016]">Use Retry unfinished steps to finish this save. Open the draft to edit, upload evidence, or delete it through the normal workflow.</p></div>}
            {prefill && source && !loading && <>
                <ReportDiaryForm report={report} prefill values={prefill.diary} onChange={(next) => updatePrefill("diary", next)} onSave={() => {}} busy={locked} />
                <section className="space-y-4"><h3 className="text-xl font-bold">Rejected Task Work — Editable</h3>{source.work.filter((row) => row.can_correct).map((entry) => <ReportWorkForm key={entry.id} initial={entry} correction prefill values={prefill.work[entry.id]} onChange={(next) => updatePrefill("work", (work) => ({ ...work, [entry.id]: typeof next === "function" ? next(work[entry.id]) : next }))} onSave={() => {}} busy={locked} />)}{!source.work.some((row) => row.can_correct) && <p className="rounded-xl bg-[#FFF8E7] p-4 text-sm text-[#795016]">No new corrections are eligible. Existing corrections are shown below.</p>}</section>
                <section className="space-y-4"><h3 className="text-xl font-bold">Other Submitted Work — Read-only reference</h3>{source.work.filter((row) => !row.can_correct).map((entry) => <ReportWorkEntry key={entry.id} entry={entry} role="SUPERVISOR" canEdit={false} canCorrect={false} />)}{!source.work.some((row) => !row.can_correct) && <p className="text-sm text-[#665C50]">No other task work in the source report.</p>}</section>
                {["manpower", "materials"].map((section) => <section key={section} className="space-y-4"><h3 className="text-xl font-bold">{formatText(section)} — Prefilled</h3><p className="text-sm leading-6 text-[#665C50]">Review these copied reference values. Select each record you want to include; saving creates an independent observation, not a new physical work or inventory transaction.</p>{prefill[section].map((row) => <div key={row.id} data-include={row.include} className="space-y-3 rounded-2xl border border-[#D8C7B2] p-4"><label className="flex min-h-12 items-center gap-3 text-base font-bold text-[#5F472A]"><input type="checkbox" className="h-5 w-5 accent-[#94651D]" checked={row.include} disabled={locked} onChange={(event) => updatePrefill(section, (rows) => rows.map((item) => item.id === row.id ? { ...item, include: event.target.checked } : item))} />Include this reviewed {section === "manpower" ? "manpower" : "material"} record</label><ReportRowForm section={section} initial={row.values} prefill confirmed={row.include} values={row.values} onChange={(next) => updatePrefill(section, (rows) => rows.map((item) => item.id === row.id ? { ...item, values: typeof next === "function" ? next(item.values) : next } : item))} onSave={() => {}} busy={locked} /></div>)}{!prefill[section].length && <p className="text-sm text-[#665C50]">No source records to prefill.</p>}</section>)}
                <section className="space-y-4"><h3 className="text-xl font-bold">Original Evidence — Read-only</h3><p className="text-sm leading-6 text-[#665C50]">These files belong to the original submitted report. Preview them here; they are not attached to the new report.</p><ReportEvidence files={source.attachments.slice(((pages.originalEvidence || 1) - 1) * 12, (pages.originalEvidence || 1) * 12)} /><nav aria-label="Original evidence pages" className="flex flex-wrap items-center justify-between gap-3"><button type="button" className={action} disabled={(pages.originalEvidence || 1) === 1} onClick={() => changePage("originalEvidence", -1)}>Previous evidence</button><span className="text-sm text-[#665C50]">Page {pages.originalEvidence || 1} of {Math.max(1, Math.ceil(source.attachments.length / 12))}</span><button type="button" className={action} disabled={(pages.originalEvidence || 1) * 12 >= source.attachments.length} onClick={() => changePage("originalEvidence", 1)}>Next evidence</button></nav></section>
                <section className="space-y-4"><h3 className="text-xl font-bold">New Attachments — Optional</h3><ReportAttachmentForm prefill onStage={(value) => updatePrefill("evidence", value)} onSave={() => {}} busy={locked} /></section>
                <div className="flex flex-wrap gap-3 rounded-2xl border border-[#D8C7B2] bg-[#FFFDFA] p-5"><button type="button" disabled={Boolean(busy) || (!Object.keys(prefill.work).length && !saveStarted)} className={primaryAction} onClick={() => savePrefill(false)}>{busy ? "Saving correction report..." : saveStarted ? "Retry unfinished steps" : "Save Draft"}</button><button type="button" disabled={Boolean(busy) || (!Object.keys(prefill.work).length && !saveStarted)} className={submitAction} onClick={() => savePrefill(true)}>Save & Submit</button></div>
            </>}
        </section>;
    }
    function sectionView(section, review = false) {
        const entry = resource(section);
        if (!entry) return <p role="status" className="text-sm text-[#817669]">Loading {section}...</p>;
        if (entry.error) return <div role="alert" className="text-sm text-red-700">{entry.error}<button type="button" className={`${action} ml-3`} onClick={() => setRevision((v) => v + 1)}>Retry</button></div>;
        const rows = review ? entry.data.results.slice(0, 5) : entry.data.results;
        return <div className="space-y-4">
            <p className="text-sm leading-6 text-[#665C50]">{entry.data.count} {section} records{review ? "; previewing up to five from the current page. Use the section tab to review every record." : ""}</p>
            {section === "attachments" ? <ReportEvidence files={rows} busy={Boolean(busy)} onRemove={canEdit && !review ? (file) => mutate("remove", null, section, file.id) : undefined} /> : rows.map((row) => section === "work-entries" ? <ReportWorkEntry key={row.id} entry={row} role={role} canEdit={canEdit && !review} canCorrect={role === "SUPERVISOR" && report?.reported_by === user.id && report.status === "SUBMITTED" && !review} busy={Boolean(busy)} onEdit={() => leaveEditor(() => setEditing({ section, row }))} onRemove={() => mutate("remove", null, section, row.id)} onCorrect={() => leaveEditor(() => { setDraftPage(1); setEditing({ section, row, correction: true }); })} /> : <article key={row.id} className="rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4"><dl className="grid gap-3 text-sm sm:grid-cols-2">{(section === "manpower" ? ["trade", "contractor_name", "worker_count", "hours_worked", "remarks"] : ["material_name", "entry_type", "quantity", "unit", "remarks"]).map((field) => <div key={field}><dt className="text-xs text-[#817669]">{formatText(field)}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{row[field] ?? "Not specified"}</dd></div>)}</dl>{canEdit && !review && <div className="mt-4 flex gap-2"><button type="button" disabled={Boolean(busy)} className={action} onClick={() => leaveEditor(() => setEditing({ section, row }))}>Edit</button><button type="button" disabled={Boolean(busy)} className={action} onClick={() => mutate("remove", null, section, row.id)}>Remove</button></div>}</article>)}
            {section !== "attachments" && !entry.data.count && <div className="rounded-2xl border border-dashed border-[#CCB99F] bg-[#FAF7F1] p-8 text-center"><FileText size={28} aria-hidden="true" className="mx-auto text-[#99754B]" /><p className="mt-3 text-base font-semibold text-[#4F473D]">No {section === "work-entries" ? "task work" : section} recorded yet.</p></div>}
            {!review && <nav aria-label={`${section} pages`} className="flex flex-wrap items-center justify-between gap-2 text-xs"><button type="button" disabled={!entry.data.previous || Boolean(busy)} className={action} onClick={() => changePage(section, -1)}>Previous</button><span>Page {pages[section] || 1} of {Math.max(1, Math.ceil(entry.data.count / 25))}</span><button type="button" disabled={!entry.data.next || Boolean(busy)} className={action} onClick={() => changePage(section, 1)}>Next</button></nav>}
        </div>;
    }
    return <section className="space-y-5">
        {confirmationModal}
        {loading && <LoadingScreen message="Loading report details..." />}
        <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={action} disabled={Boolean(busy)} onClick={() => leaveEditor(() => onSelect(null))}><ArrowLeft size={15} />Back to Report Register</button>
        {canEdit && <button type="button" className={`${deleteAction} sm:ml-3`} disabled={Boolean(busy)} onClick={() => mutate("delete")}>{busy === "delete" ? "Deleting draft…" : "Delete Draft"}</button>}
        </div>
        {(state.error || error) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.error || error}</p>}
        {notice && <p role="status" className="rounded-xl bg-[#E7F2E8] p-4 text-sm text-[#296F40]">{notice}</p>}
        {sourceHint && isTaskId(sourceHint) && <Link className={action} to={`/supervisor/projects/${projectId}/daily-reports?report=${sourceHint}`}>View source report used for prefill</Link>}
        {report && <>
            {!!report.correction_summary?.rejected_count && <section className="space-y-3 rounded-2xl border border-[#ECC4BA] bg-[#FFF1EC] p-5 text-[#803D32]"><h3 className="text-lg font-bold">{report.correction_summary.eligible_count ? "Work Corrections Required" : "Work Correction History"}</h3><p className="text-sm">{report.correction_summary.rejected_count} rejected entries. Corrected work is saved in a new independent report.</p>{report.correction_summary.entries.map((entry) => <p key={entry.id} className="whitespace-pre-wrap break-words text-sm leading-6"><strong>{entry.task_title}:</strong> {entry.verification_note}{entry.correction_report && <Link className="ml-2 inline-block font-bold underline" to={`/supervisor/projects/${report.project}/daily-reports?report=${entry.correction_report.id}`}>Existing correction: {formatText(entry.correction_report.status)}</Link>}</p>)}{report.correction_summary.eligible_count > 0 && onCorrectReport && <button type="button" className={primaryAction} disabled={Boolean(busy)} onClick={() => leaveEditor(() => onCorrectReport(report.id))}>Create Correction Report</button>}</section>}
            <header className="flex flex-wrap items-center justify-between gap-5 rounded-[24px] border border-[#E2D6C6] bg-[#FFFDFA] p-5 sm:p-6"><div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#80603B]"><CalendarDays size={17} aria-hidden="true" />Daily report</div><h2 className="text-2xl font-semibold tracking-tight text-[#2E271F] sm:text-3xl">{formatDate(report.report_date)}</h2><p className="mt-2 text-sm leading-6 text-[#665C50]">Prepared by {report.reported_by_name || "Supervisor"}</p></div><div className="space-y-3"><ReportStatusBadge status={report.status} /><p className="text-sm text-[#665C50]">{report.work_entry_count ?? 0} task work entries{report.status === "SUBMITTED" ? " · Read-only report" : " · Private draft"}</p></div></header>
            <nav aria-label="Daily report sections" className="flex gap-2 overflow-x-auto rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-3">{reportTabs.map(([id, title]) => <button key={id} type="button" disabled={Boolean(busy)} aria-pressed={tab === id} className={`min-h-12 shrink-0 rounded-xl border px-5 py-3 text-base font-bold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] disabled:opacity-50 ${tab === id ? "border-[#D6A437] bg-[#F3C45C] text-[#35250C] shadow-sm" : "border-[#D8C7B2] bg-[#F8F4EE] text-[#4F3D27] hover:bg-[#E8DAC6]"}`} onClick={() => { if (id !== tab) leaveEditor(() => setTab(id)); }}>{id === "review" && (role === "ADMIN" || report.status === "SUBMITTED") ? "Report overview" : title}</button>)}</nav>
            {choices?.key === choiceKey && choices.error && <p role="alert" className="text-sm text-red-700">{choices.error}<button type="button" className={`${action} ml-3`} onClick={() => setChoiceRevision((v) => v + 1)}>Retry choices</button></p>}
            {allowEditor && editing?.section === "diary" && <ReportDiaryForm report={report} busy={editorBusy} onSave={(payload) => mutate("diary", payload)} onCancel={() => leaveEditor(() => {})} />}
            {allowEditor && editing?.section === "work-entries" && <ReportWorkForm key={`${editing.row?.id || "new"}:${editing.correction || false}`} initial={editing.row} correction={editing.correction} tasks={choiceData} drafts={choiceData} onTaskSearch={(value) => { setTaskSearch(value); setTaskPage(1); }} onTaskPage={(delta) => setTaskPage((v) => Math.max(1, v + delta))} onDraftPage={(delta) => setDraftPage((v) => Math.max(1, v + delta))} busy={editorBusy} onSave={(payload) => mutate(editing.correction ? "correct" : "row", payload, "work-entries", editing.row?.id)} onCancel={() => leaveEditor(() => {})} />}
            {allowEditor && ["manpower", "materials"].includes(editing?.section) && <ReportRowForm key={`${editing.section}:${editing.row?.id || "new"}`} section={editing.section} initial={editing.row} busy={editorBusy} onSave={(payload) => mutate("row", payload, editing.section, editing.row?.id)} onCancel={() => leaveEditor(() => {})} />}
            {allowEditor && editing?.section === "attachments" && <ReportAttachmentForm entries={resource("work-entries")?.data} onPage={(delta) => changePage("work-entries", delta)} busy={editorBusy} onSave={(payload, onUploaded) => mutate("upload", payload, "attachments", null, onUploaded)} onCancel={() => leaveEditor(() => {})} />}
            {tab === "diary" && <>{canEdit && !editing && <button type="button" className={primaryAction} onClick={() => setEditing({ section: "diary" })}>Edit Draft Diary</button>}<DailyReportSummary report={report} /></>}
            {!["diary", "review"].includes(tab) && <div className="space-y-5 rounded-[24px] border border-[#E2D6C6] bg-[#FFFDFA] p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EDE5DA] pb-5"><div><h3 className="text-xl font-bold text-[#352D24]">{reportTabs.find(([id]) => id === tab)?.[1]}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-[#665C50]">{{ "work-entries": "Reported work and measurements, with an individual verification status for each task.", manpower: "Site workforce, trades and working hours recorded for the day.", materials: "Material observations recorded on site for this report.", attachments: "Private site photographs and documents. Select Preview to view supporting evidence." }[tab]}</p></div>{canEdit && !editing && <button type="button" className={primaryAction} onClick={() => { setEditing({ section: tab }); setError(""); }}>Add {tab === "attachments" ? "attachments" : "record"}</button>}</div>{sectionView(tab)}</div>}
            {tab === "review" && <div className="space-y-6"><DailyReportSummary report={report} />{["work-entries", "manpower", "materials", "attachments"].map((section) => <section key={section} className="space-y-4 rounded-[24px] border border-[#E2D6C6] bg-[#FFFDFA] p-5 sm:p-6"><h3 className="text-xl font-bold text-[#352D24]">{formatText(section)}</h3>{sectionView(section, true)}</section>)}{canEdit && <div className="rounded-2xl bg-[#F1EADF] p-5"><p className="mb-4 text-sm text-[#665C50]">A saved work summary is required. No-work reports are valid when the diary explains why no work took place. Submission does not complete tasks or verify measurements.</p><button type="button" disabled={Boolean(busy) || !report.work_summary?.trim() || ["work-entries", "manpower", "materials", "attachments"].some((section) => !resource(section)?.data)} className={submitAction} onClick={() => mutate("submit")}>Confirm and Submit Report</button></div>}</div>}
        </>}
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
