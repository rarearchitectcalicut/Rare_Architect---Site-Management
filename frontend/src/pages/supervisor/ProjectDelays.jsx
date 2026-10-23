import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { useDelayReports } from "../../hooks/useDelayReports";
import { useRequestList } from "../../hooks/useRequestList";
import { normalizeRequest } from "../../components/approvals/queueData";
import ApprovalFilters from "../../components/approvals/ApprovalFilters";
import RequestList from "../../components/approvals/RequestList";
import RequestReview from "../../components/approvals/RequestReview";
import DelaySummary from "../../components/delays/DelaySummary";
import DelayReportForm from "../../modal/supervisor/DelayReportForm";

export default function ProjectDelays() {
    const { projectId } = useParams();
    const { reports, projects, tasks, loading, error, refresh } = useDelayReports(projectId);
    const [params, setParams] = useSearchParams();
    const [formOpen, setFormOpen] = useState(false);
    const [notice, setNotice] = useState("");
    const items = useMemo(() => reports.map((report) => normalizeRequest("delay", report)), [reports]);
    const list = useRequestList(items, projects);
    const id = params.get("request");
    const selected = useMemo(() => id ? items.find((item) => item.id === id) || { id, requestType: "delay", queueKey: `delay:${id}`, raw: {} } : null, [id, items]);
    return <div className="space-y-6 pb-8">
        <header className="rounded-[28px] bg-[#252B2A] p-6 text-white sm:p-8">
            <Link className="text-xs text-[#CBB99A]" to={`/supervisor/projects/${projectId}`}>← Back to project</Link>
            <h1 className="mt-4 text-3xl font-semibold">Delay Reports</h1>
            <p className="mt-3 text-sm text-[#C3C9C5]">{projects[0]?.name || "Project delays"} · Report site issues and track deadline-extension decisions.</p>
            <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={loading || Boolean(error)} onClick={() => setFormOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#FFFDFA] px-4 py-3 text-sm font-semibold text-[#252B2A] disabled:opacity-40"><Plus size={17} />Report delay</button><button type="button" disabled={loading} onClick={refresh} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm"><RefreshCw size={16} />Refresh</button></div>
        </header>
        <DelaySummary reports={reports} loading={loading} />
        {notice && <p role="status" className="rounded-xl bg-[#E7F2E8] p-4 text-sm text-[#296F40]">{notice}</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        <section className="overflow-hidden rounded-[26px] border border-[#E5DDD1] bg-[#FFFDFA]">
            <ApprovalFilters mode="delays" filters={list.filters} onChange={list.updateFilter} onClear={list.clear} projects={projects} />
            <RequestList list={list} loading={loading} onOpen={(item) => setParams({ request: item.id })} />
        </section>
        {selected && <RequestReview key={selected.queueKey} item={selected} onClose={() => setParams({}, { replace: true })} readOnly role="SUPERVISOR" />}
        {formOpen && <DelayReportForm tasks={tasks} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); setNotice("Delay report submitted for Admin review."); refresh(); }} />}
    </div>;
}
