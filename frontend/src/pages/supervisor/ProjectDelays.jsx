import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, ClipboardList, Clock3, CheckCircle2, XCircle, CalendarDays, FolderKanban, ChevronRight } from "lucide-react";
import { useDelayReports } from "../../hooks/useDelayReports";
import { normalizeRequest } from "../../components/approvals/queueData";
import { formatDate, formatText } from "../../components/approvals/approvalUtils";
import ApprovalFilters from "../../components/approvals/ApprovalFilters";
import RequestList from "../../components/approvals/RequestList";
import RequestReview from "../../components/approvals/RequestReview";
import LoadingScreen from "../../components/LoadingScreen";
import DelaySummary from "../../components/delays/DelaySummary";
import DelayReportForm from "../../modal/supervisor/DelayReportForm";

export default function ProjectDelays({ role = "SUPERVISOR" }) {
    const route = useParams();
    const [params, setParams] = useSearchParams();
    const queryProject = params.get("project");
    const validQueryProject = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(queryProject || "");
    const projectId = route.projectId || (validQueryProject ? queryProject : undefined);
    useEffect(() => {
        if (!params.has("project") || validQueryProject) return;
        setParams((current) => {
            const next = new URLSearchParams(current);
            if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(next.get("project") || "")) next.delete("project");
            return next;
        }, { replace: true });
    }, [params, setParams, validQueryProject]);
    const [formOpen, setFormOpen] = useState(false);
    const [notice, setNotice] = useState("");
    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(""), 8000);
        return () => clearTimeout(timer);
    }, [notice]);
    const admin = role === "ADMIN";
    const compactDesktop = true;
    const prefix = admin ? "/admin" : "/supervisor";
    const data = useDelayReports(projectId);
    const createRequested = params.get("create") === "true";
    const canReportDelay = data.project && ["ACTIVE", "MAINTENANCE"].includes(data.project.status);
    const autoOpenForm = !admin && createRequested && !data.projectLoading && canReportDelay;
    function closeForm() {
        setFormOpen(false);
        if (createRequested) {
            const next = new URLSearchParams(params);
            next.delete("create");
            setParams(next, { replace: true });
        }
    }
    const createError = createRequested && !data.projectLoading && !data.project && data.error;
    const createIneligible = createRequested && !data.projectLoading && data.project && !canReportDelay;
    useEffect(() => {
        if (!admin && createRequested && projectId && !data.projectLoading && !data.project) {
            const next = new URLSearchParams(params);
            next.delete("create");
            setParams(next, { replace: true });
        }
    }, [admin, createRequested, projectId, data.projectLoading, data.project, params, setParams]);
    const items = useMemo(() => data.reports.map((report) => normalizeRequest("delay", report)), [data.reports]);
    const id = params.get("request");
    const type = params.get("type") === "extension" ? "extension" : "delay";
    const selected = useMemo(() => id ? items.find((item) => item.id === id && item.requestType === type) || { id, requestType: type, queueKey: `${type}:${id}`, raw: {} } : null, [id, type, items]);
    function select(item) {
        const next = new URLSearchParams(params);
        if (item) next.set("request", item.id); else { next.delete("request"); next.delete("type"); if (!validQueryProject) next.delete("project"); }
        setParams(next, { replace: !item });
    }
    const list = { rows: items, pageRows: items, count: data.count, page: data.page, pageCount: data.pageCount, setPage: data.setPage };
    return <div className={`mx-auto min-w-0 max-w-[1500px] space-y-6 pb-8 text-[#211E1A] ${compactDesktop ? "supervisor-project-delays" : ""}`}>
        <header className="rare-page-header rounded-[28px] bg-[#FFFDFA] p-6 text-[#211E1A] sm:p-8">
            <Link className="text-xs text-[#716658]" to={projectId ? `${prefix}/projects/${projectId}` : `${prefix}/projects`}>{projectId ? "Back to project" : "Projects"}</Link>
            <h1 className="mt-4 text-2xl font-semibold">Delay Reports</h1>
            {/* <p className="mt-3 text-sm text-[#716658]">{data.project?.name || (projectId ? "Project delays" : "All authorized projects")} / Track site issues and deadline-extension decisions.</p> */}
            <div className="mt-5 flex flex-wrap gap-3">
                {!admin && projectId && <button type="button" disabled={data.loading || Boolean(data.error) || !canReportDelay} onClick={() => { data.refresh(); setFormOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-4 py-3 text-sm font-semibold text-[#FFFDFA] disabled:opacity-40"><Plus size={17} />Report delay</button>}
                {!admin && !projectId && <button type="button" onClick={() => setFormOpen(true)} className="rounded-xl bg-[#211E1A] px-4 py-3 text-sm font-semibold text-[#FFFDFA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]">Report a delay</button>}
                <button type="button" disabled={data.loading} onClick={data.refresh} aria-label="Refresh delay reports" className="inline-flex items-center gap-2 rounded-xl border border-[#E7DED2] px-4 py-3 text-sm"><RefreshCw size={16} />Refresh</button>
                {admin && <Link to="/admin/approvals?tab=delays" className="rounded-xl border border-[#E7DED2] px-4 py-3 text-sm">Open Approval Center</Link>}
            </div>
        </header>
        <div className={compactDesktop ? "lg:hidden" : ""}><DelaySummary summary={data.summary} loading={data.loading} /></div>
        {compactDesktop && <div className="hidden grid-cols-5 gap-3 lg:grid">{[["Delay reports", "total", ClipboardList, "bg-[#F1E6D5] text-[#8A6840]"], ["Pending reports", "pending", Clock3, "bg-[#FFF0CB] text-[#996000]"], ["Approved reports", "approved", CheckCircle2, "bg-[#DDF3EA] text-[#087D60]"], ["Rejected reports", "rejected", XCircle, "bg-[#FCE3E1] text-[#BB2525]"], ["Pending extensions", "pending_extensions", CalendarDays, "bg-[#E8F0FE] text-[#2563EB]"]].map(([label, key, Icon, tone]) => <div key={key} className="flex items-center gap-3 rounded-xl border border-[#E7DED2] bg-[#FFFDFA] p-4"><span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ' + tone}><Icon size={18} /></span><div><p className="text-2xl font-bold">{data.loading ? "Loading" : Number.isInteger(data.summary?.[key]) ? data.summary[key] : "Unavailable"}</p><p className="text-xs text-[#716658]">{label}</p></div></div>)}</div>}
        {notice && <p role="status" className="rounded-xl bg-[#E7F2E8] p-4 text-sm text-[#296F40]">{notice}</p>}
        {createError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{createError}</p>}
        {createIneligible && <p role="alert" className="rounded-xl bg-[#FFF2D8] p-4 text-sm text-[#795016]">Delay reports can only be created for Active or Maintenance projects.</p>}
        {data.error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{data.error}</p>}
        {compactDesktop && <div className="delay-status-pills hidden flex-wrap gap-2 lg:flex" role="group" aria-label="Filter delay reports by status">
            {[["", "All", "total"], ["PENDING", "Pending", "pending"], ["APPROVED", "Approved", "approved"], ["REJECTED", "Rejected", "rejected"]].map(([status, label, key]) => <button key={status} type="button" aria-pressed={data.filters.status === status} onClick={() => data.updateFilter("status", status)} className={"min-h-11 rounded-full border border-[#E7DED2] px-4 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] " + (data.filters.status === status ? "bg-[#292115] text-white" : "bg-[#FFFDFA] text-[#554535]")}>{label}{!data.loading && Number.isInteger(data.summary?.[key]) ? " " + data.summary[key] : ""}</button>)}
        </div>}
        <section className="project-delay-register rounded-[26px] border border-[#E7DED2] bg-[#FFFDFA]">
            <ApprovalFilters suggestions={items.map((item) => ({ id: item.id, name: item.title, context: item.projectName }))} loading={data.loading} count={data.count} mode="delays" filters={data.filters} onChange={data.updateFilter} onClear={data.clear} projects={data.projects} />
            <div className={compactDesktop ? "lg:hidden" : ""}><RequestList list={list} loading={data.loading} onOpen={select} compactCards={!admin} /></div>
            {compactDesktop && <div className="hidden lg:block">{data.loading ? <p role="status" className="py-6 text-sm">Loading delay reports...</p> : <div className="grid grid-cols-3 gap-4">{items.map((item) => <button key={item.queueKey} type="button" onClick={() => select(item)} aria-haspopup="dialog" className="flex min-w-0 flex-col rounded-xl border border-[#E7DED2] border-l-[3px] bg-[#FFFDFA] p-4 text-left focus-visible:outline-2 focus-visible:outline-[#3565A5]" style={{ borderLeftColor: item.status === "APPROVED" ? "#24A66A" : item.status === "REJECTED" ? "#E84C49" : "#E5A216" }}>
                <span className="flex w-full items-center justify-between gap-2"><span className="text-[11px] font-bold uppercase tracking-wider text-[#74695D]">Delay report</span><span className={'rounded-full px-2 py-1 text-xs font-semibold ' + (item.status === "APPROVED" ? 'bg-[#DDF3EA] text-[#087D60]' : item.status === "REJECTED" ? 'bg-[#FCE3E1] text-[#BB2525]' : 'bg-[#FFF0CB] text-[#996000]')}>{formatText(item.status)}</span></span>
                <span className="mt-3 line-clamp-2 text-base font-bold">{item.title}</span><span className="mt-1 flex items-center gap-2 text-xs text-[#716658]"><FolderKanban size={14} />{item.projectName}</span>
                <span className="mt-3 flex flex-wrap gap-1"><span className="rounded-full bg-[#FFF0CB] px-2 py-1 text-xs">{formatText(item.raw.delay_type || "Delay")}</span>{item.raw.extension_requested && <span className="rounded-full bg-[#F1EADF] px-2 py-1 text-xs">Extension requested</span>}</span>
                <span className="mb-3 mt-2 line-clamp-2 text-xs text-[#716658]">{item.preview || "Open to view delay report details."}</span>
                <span className="mt-auto flex w-full items-center justify-between gap-2 border-t border-[#EEE6DC] pt-3 text-xs"><span className="truncate">{item.creator} - {formatDate(item.createdAt)}</span><span className="flex shrink-0 items-center gap-1 text-[#3565A5]">View report<ChevronRight size={14} /></span></span>
            </button>)}</div>}{!data.loading && !items.length && <p className="py-6 text-sm">No delay reports to show.</p>}<div className="mt-4 flex items-center justify-between gap-3 text-xs text-[#716658]"><p>{data.count ? 'Showing ' + ((data.page - 1) * 8 + 1) + ' - ' + Math.min(data.page * 8, data.count) + ' of ' + data.count + ' requests' : '0 requests'}</p>{data.pageCount > 1 && <div className="flex items-center gap-3"><button type="button" disabled={data.page === 1} onClick={() => data.setPage(data.page - 1)}>Previous</button><span>Page {data.page} of {data.pageCount}</span><button type="button" disabled={data.page === data.pageCount} onClick={() => data.setPage(data.page + 1)}>Next</button></div>}</div></div>}
        </section>
        {data.initialLoading && <LoadingScreen message="Loading delay reports..." />}
        {selected && <RequestReview key={selected.queueKey} item={selected} onClose={() => select(null)} readOnly={!admin} role={role} onSuccess={(reviewed, action) => {
            select(null);
            const extension = reviewed.requestType === "extension";
            setNotice(`${extension ? "Deadline extension" : "Delay report"} ${action === "approve" ? "approved" : "rejected"}. ${extension && action === "approve" ? "The task deadline was updated." : "The task deadline was not changed by this decision."}`);
            data.refresh();
        }} />}
        {(formOpen || autoOpenForm) && !admin && <DelayReportForm key={`${projectId}:${params.get("task") || ""}`} projectId={projectId} taskId={params.get("task") || undefined} onClose={closeForm} onSaved={(report) => { closeForm(); setNotice(`Delay report submitted: ${report.status === "PENDING" ? "Pending Admin review" : report.status}.`); data.refresh(); }} />}
    </div>;
}
