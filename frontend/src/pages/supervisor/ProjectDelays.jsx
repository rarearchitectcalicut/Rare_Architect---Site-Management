import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { useDelayReports } from "../../hooks/useDelayReports";
import { normalizeRequest } from "../../components/approvals/queueData";
import ApprovalFilters from "../../components/approvals/ApprovalFilters";
import RequestList from "../../components/approvals/RequestList";
import RequestReview from "../../components/approvals/RequestReview";
import LoadingScreen from "../../components/LoadingScreen";
import DelaySummary from "../../components/delays/DelaySummary";
import DelayReportForm from "../../modal/supervisor/DelayReportForm";

export default function ProjectDelays({ role = "SUPERVISOR" }) {
    const route = useParams();
    const [params, setParams] = useSearchParams();
    const projectId = route.projectId || params.get("project") || undefined;
    const [formOpen, setFormOpen] = useState(false);
    const [notice, setNotice] = useState("");
    const admin = role === "ADMIN";
    const prefix = admin ? "/admin" : "/supervisor";
    const data = useDelayReports(projectId, { tasksEnabled: formOpen && !admin });
    const items = useMemo(() => data.reports.map((report) => normalizeRequest("delay", report)), [data.reports]);
    const id = params.get("request");
    const type = params.get("type") === "extension" ? "extension" : "delay";
    const selected = useMemo(() => id ? items.find((item) => item.id === id && item.requestType === type) || { id, requestType: type, queueKey: `${type}:${id}`, raw: {} } : null, [id, type, items]);
    function select(item) {
        const next = new URLSearchParams(params);
        if (item) next.set("request", item.id); else { next.delete("request"); next.delete("type"); }
        setParams(next, { replace: !item });
    }
    const list = { rows: items, pageRows: items, count: data.count, page: data.page, pageCount: data.pageCount, setPage: data.setPage };
    return <div className="space-y-6 pb-8">
        <header className="rounded-[28px] bg-[#211E1A] p-6 text-[#FFFDFA] sm:p-8">
            <Link className="text-xs text-[#F1EADF]" to={projectId ? `${prefix}/projects/${projectId}` : `${prefix}/projects`}>{projectId ? "Back to project" : "Projects"}</Link>
            <h1 className="mt-4 text-3xl font-semibold">Delay Reports</h1>
            <p className="mt-3 text-sm text-[#E7DED2]">{data.project?.name || (projectId ? "Project delays" : "All authorized projects")} / Track site issues and deadline-extension decisions.</p>
            <div className="mt-5 flex flex-wrap gap-3">
                {!admin && projectId && <button type="button" disabled={data.loading || Boolean(data.error) || !data.project || !["ACTIVE", "MAINTENANCE"].includes(data.project.status)} onClick={() => { data.refresh(); setFormOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-[#FFFDFA] px-4 py-3 text-sm font-semibold text-[#211E1A] disabled:opacity-40"><Plus size={17} />Report delay</button>}
                {!admin && !projectId && <Link to="/supervisor/projects" className="rounded-xl bg-[#FFFDFA] px-4 py-3 text-sm font-semibold text-[#211E1A]">Choose a project to report a delay</Link>}
                <button type="button" disabled={data.loading} onClick={data.refresh} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm"><RefreshCw size={16} />Refresh</button>
                {admin && <Link to="/admin/approvals?tab=delays" className="rounded-xl border border-white/20 px-4 py-3 text-sm">Open Approval Center</Link>}
            </div>
        </header>
        <DelaySummary summary={data.summary} loading={data.loading} />
        {notice && <p role="status" className="rounded-xl bg-[#E7F2E8] p-4 text-sm text-[#296F40]">{notice}</p>}
        {data.error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{data.error}</p>}
        <section className="overflow-hidden rounded-[26px] border border-[#E7DED2] bg-[#FFFDFA]">
            <ApprovalFilters mode="delays" filters={data.filters} onChange={data.updateFilter} onClear={data.clear} projects={data.projects} />
            <RequestList list={list} loading={data.loading} onOpen={select} />
        </section>
        {data.initialLoading && <LoadingScreen message="Loading delay reports..." />}
        {selected && <RequestReview key={selected.queueKey} item={selected} onClose={() => select(null)} readOnly role={role} />}
        {formOpen && !admin && <DelayReportForm key={projectId} tasks={data.tasks} taskOptions={data.taskOptions} onClose={() => setFormOpen(false)} onSaved={(report) => { setFormOpen(false); setNotice(`Delay report submitted: ${report.status === "PENDING" ? "Pending Admin review" : report.status}.`); data.refresh(); }} />}
    </div>;
}
