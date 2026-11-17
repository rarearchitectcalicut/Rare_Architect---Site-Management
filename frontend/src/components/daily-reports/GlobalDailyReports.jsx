import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Building2, CalendarDays, FileText, Plus, RefreshCw, Search, UserRound } from "lucide-react";
import SupervisorProjectSelector from "./SupervisorProjectSelector";
import { dailyReportApi } from "../../api/dailyReportApi";
import { validationMessage } from "../../hooks/useApprovalReview";
import { formatDate } from "../../components/approvals/approvalUtils";
import SearchFilterToolbar from "../../components/common/SearchFilterToolbar";
import { PageHeader } from "../../components/common/WorkspaceUI";

const control = "mt-1 w-full rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm";
const baseFilterFields = ["search", "project_filter", "date_from", "date_to", "sort"];
const pageSize = 25;

export default function GlobalDailyReports({ role = "ADMIN" } = {}) {
    const admin = role === "ADMIN";
    const prefix = admin ? "/admin" : "/supervisor";
    const filterFields = [...baseFilterFields, admin ? "reported_by" : "status"];
    const [creating, setCreating] = useState(false);
    const [params, setParams] = useSearchParams();
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState(null);
    const filters = Object.fromEntries(filterFields.map((field) => [field, params.get(field) || ""]));
    const parsedPage = Number(params.get("page"));
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const filterKey = JSON.stringify(filters);
    const key = `${role}:${filterKey}:${page}:${revision}`;
    const current = result?.key === key;
    const data = current ? result.data : null;
    const error = current ? result.error : "";
    const loading = !current;
    const projects = result?.data?.projects || [];
    const reporters = result?.data?.reporters || [];

    useEffect(() => {
        const controller = new AbortController();
        const values = JSON.parse(filterKey);
        const query = Object.fromEntries(Object.entries(values).filter(([, value]) => value));
        if (query.project_filter) { query.project = query.project_filter; delete query.project_filter; }
        const register = admin ? dailyReportApi.register : dailyReportApi.myRegister;
        register({ ...query, page, page_size: pageSize }, controller.signal).then((response) => {
            if (!Array.isArray(response.results) || !Number.isInteger(response.count) || response.count < 0) throw new Error("Unexpected daily report response. Refresh to retry.");
            if (!controller.signal.aborted) setResult({ key, data: response });
        }).catch((failure) => {
            if (!controller.signal.aborted) setResult({ key, error: validationMessage(failure, "Unable to load daily reports. Please retry.") });
        });
        return () => controller.abort();
    }, [filterKey, key, page, admin]);

    function change(field, value) {
        setParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set(field, value); else next.delete(field); if (field !== "page") next.delete("page"); return next; });
    }
    function clear() { setParams((previous) => { const next = new URLSearchParams(previous); for (const field of [...filterFields, "page"]) next.delete(field); return next; }); }
    const activeCount = filterFields.filter((field) => !["search", "project_filter"].includes(field) && filters[field]).length;
    const count = data?.count ?? 0;
    const pageCount = Math.max(1, Math.ceil(count / pageSize));
    return <div className="space-y-4 pb-6">
        <PageHeader className="rare-report-register-header" eyebrow={admin ? "Admin workspace" : "Your site records"} title="Daily Reports" description={admin ? "Submitted site reports across all projects. Open a report to review its diary, work records and evidence." : "Your drafts and submitted reports across assigned projects. Choose a project to focus your site records."}
            actions={<>{!admin && <button type="button" className="rare-button rare-button-primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />New report</button>}<button type="button" className="rare-button rare-button-secondary" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" />Refresh</button></>} />
        {data?.summary && <div className="flex flex-wrap gap-3 text-sm text-muted" aria-label={admin ? "Portfolio report totals" : "Your report totals"}><span className="rounded-full border border-border bg-surface px-3 py-2"><strong className="text-ink">{data.summary.submitted}</strong> {admin ? "submitted reports across all projects" : "submitted across assigned projects"}</span>{!admin && <span className="rounded-full border border-border bg-surface px-3 py-2"><strong className="text-ink">{data.summary.drafts}</strong> drafts across assigned projects</span>}{admin ? <Link to="/admin/approvals?tab=work" className="rounded-full border border-border bg-surface px-3 py-2"><strong className="text-ink">{data.summary.pending_work}</strong> work entries awaiting verification<ArrowUpRight size={14} className="ml-1 inline" aria-hidden="true" /></Link> : <span className="rounded-full border border-border bg-surface px-3 py-2"><strong className="text-ink">{data.summary.pending_work}</strong> work entries awaiting verification</span>}</div>}
        <section className="rare-report-controls" aria-label="Daily report controls">
            <label className="rare-report-project-picker"><span className="rare-report-project-picker-icon"><Building2 size={19} aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-medium text-muted">Choose project</span><select aria-label="Choose project" value={filters.project_filter} onChange={(event) => change("project_filter", event.target.value)} className="min-h-11 w-full min-w-0 bg-transparent pr-4 text-sm font-semibold text-ink outline-offset-2"><option value="">All projects</option>{filters.project_filter && !projects.some((project) => project.project_id === filters.project_filter) && <option value={filters.project_filter}>Selected project</option>}{projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.project__name}</option>)}</select></span></label>
        <SearchFilterToolbar label="Daily report search and filters" activeCount={activeCount} onClear={clear}
            search={<label className="relative block"><span className="sr-only">Search daily reports</span><Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" /><input type="search" value={filters.search} onChange={(event) => change("search", event.target.value)} placeholder={admin ? "Search reports, projects or supervisors" : "Search your reports or projects"} className="min-h-11 w-full rounded-full border border-border-strong bg-surface py-3 pl-11 pr-4 text-sm" /></label>}>
            <div className="grid gap-4 sm:grid-cols-2">
                {admin ? <label className="text-sm text-muted">Reported by<select value={filters.reported_by} onChange={(event) => change("reported_by", event.target.value)} className={control}><option value="">All supervisors</option>{reporters.map((person) => <option key={person.reported_by} value={person.reported_by}>{person.reported_by__username}</option>)}</select></label> : <label className="text-sm text-muted">Report status<select aria-label="Report status" value={filters.status} onChange={(event) => change("status", event.target.value)} className={control}><option value="">All reports</option><option value="DRAFT">Draft</option><option value="SUBMITTED">Submitted</option></select></label>}
                <label className="text-sm text-muted">From date<input type="date" value={filters.date_from} max={filters.date_to || undefined} onChange={(event) => change("date_from", event.target.value)} className={control} /></label>
                <label className="text-sm text-muted">To date<input type="date" value={filters.date_to} min={filters.date_from || undefined} onChange={(event) => change("date_to", event.target.value)} className={control} /></label>
                <label className="text-sm text-muted">Sort reports<select aria-label="Sort reports" value={filters.sort || "newest"} onChange={(event) => change("sort", event.target.value)} className={control}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
            </div>
        </SearchFilterToolbar>
        </section>
        <section aria-label="Daily report register" className="overflow-hidden rounded-2xl border border-border bg-surface" aria-busy={loading}>
            <div className="border-b border-border px-4 py-3 text-sm text-muted" role="status">{loading ? "Loading daily reports…" : error ? "Reports unavailable" : `${count} matching ${count === 1 ? "report" : "reports"}`}</div>
            {loading && <p className="p-6 text-sm text-muted">Loading report records…</p>}
            {error && <div role="alert" className="space-y-3 p-5 text-sm text-danger"><p>{error}</p><button type="button" onClick={() => setRevision((value) => value + 1)} className="rare-button rare-button-secondary">Retry</button></div>}
            {data?.results.map((report) => <Link key={report.id} to={`${prefix}/projects/${report.project}/daily-reports?report=${encodeURIComponent(report.id)}`} className="group grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 border-b border-border p-4 text-ink last:border-b-0 hover:bg-surface-soft focus-visible:outline-offset-[-3px] sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(8rem,auto)_auto]">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-pastel-lavender text-info"><FileText size={18} aria-hidden="true" /></span>
                <div className="min-w-0"><p className="rare-report-project-caption">Project</p><h2 className="rare-report-project-name"><span>{report.project_name}</span></h2><p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted"><span className="inline-flex items-center gap-1"><CalendarDays size={13} aria-hidden="true" />{formatDate(report.report_date)}</span><span className="inline-flex items-center gap-1"><UserRound size={13} aria-hidden="true" />{report.reported_by_name || "Supervisor"}</span></p><p className="mt-2 line-clamp-2 text-sm leading-5 text-muted">{report.work_summary || "No work summary recorded."}</p><p className="mt-2 text-xs text-muted sm:hidden"><span className="mr-2 font-semibold">{report.status === "DRAFT" ? "Draft" : "Submitted"}</span>{report.work_entry_count} work entries · {report.work_counts?.pending ?? 0} pending verification</p></div>
                <div className="hidden text-right text-xs text-muted sm:block"><span className={`inline-flex rounded-full px-2.5 py-1 ${report.status === "DRAFT" ? "bg-pastel-butter text-warning" : "bg-pastel-mint text-success"}`}>{report.status === "DRAFT" ? "Draft" : "Submitted"}</span><p className="mt-2">{report.work_entry_count} work entries</p><p className="mt-1">{report.work_counts?.pending ?? 0} pending verification</p></div>
                <ArrowUpRight size={17} className="mt-2 text-muted" aria-hidden="true" />
            </Link>)}
            {data && !count && <div className="p-8 text-center"><FileText size={28} className="mx-auto text-muted" aria-hidden="true" /><h2 className="mt-3 text-base font-semibold">No reports found</h2><p className="mt-2 text-sm text-muted">{admin ? "Submitted reports will appear here. Try clearing the filters." : "Your drafts and submitted reports will appear here. Create a report or try clearing the filters."}</p>{filterFields.some((field) => filters[field]) && <button type="button" onClick={clear} className="rare-button rare-button-secondary mt-4">Clear filters</button>}</div>}
        </section>
        {creating && <SupervisorProjectSelector action="report" onClose={() => setCreating(false)} />}
        {data && count > pageSize && <nav aria-label="All daily report pages" className="rare-pagination"><button type="button" className="rare-button rare-button-secondary" disabled={!data.previous} onClick={() => change("page", String(page - 1))}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" className="rare-button rare-button-secondary" disabled={!data.next} onClick={() => change("page", String(page + 1))}>Next</button></nav>}
    </div>;
}
