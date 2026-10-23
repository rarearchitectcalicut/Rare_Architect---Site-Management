import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useDelayReports } from "../../hooks/useDelayReports";
import { useRequestList } from "../../hooks/useRequestList";
import { normalizeRequest } from "../../components/approvals/queueData";
import ApprovalOverview from "../../components/approvals/ApprovalOverview";
import ApprovalFilters from "../../components/approvals/ApprovalFilters";
import RequestList from "../../components/approvals/RequestList";
import RequestReview from "../../components/approvals/RequestReview";
import DelaySummary from "../../components/delays/DelaySummary";

export default function AdminDelays() {
    const { reports, projects, loading, error, refresh } = useDelayReports();
    const [params, setParams] = useSearchParams();
    const items = useMemo(() => reports.flatMap((report) => [normalizeRequest("delay", report), ...(report.extension_requested ? [normalizeRequest("extension", report)] : [])]), [reports]);
    const list = useRequestList(items, projects);
    const id = params.get("request");
    const type = params.get("type") === "extension" ? "extension" : "delay";
    const selected = useMemo(() => id ? items.find((item) => item.id === id && item.requestType === type) || { id, requestType: type, queueKey: `${type}:${id}`, raw: {} } : null, [id, type, items]);
    const close = () => setParams({}, { replace: true });
    return <div className="space-y-6 pb-8">
        <ApprovalOverview title="Delays & Extensions" description="Review site delays and deadline changes across every project. Report and extension decisions are tracked separately." count={items.filter((item) => item.status === "PENDING").length} loading={loading} onRefresh={refresh} />
        <DelaySummary reports={reports} loading={loading} />
        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        <section className="overflow-hidden rounded-[26px] border border-[#E5DDD1] bg-[#FFFDFA]">
            <h2 className="px-6 pt-6 text-lg font-bold">Delay and extension decisions</h2>
            <ApprovalFilters mode="delays" filters={list.filters} onChange={list.updateFilter} onClear={list.clear} projects={projects} />
            <RequestList list={list} loading={loading} onOpen={(item) => setParams({ request: item.id, type: item.requestType })} />
        </section>
        {selected && <RequestReview key={selected.queueKey} item={selected} onClose={close} onSuccess={() => { close(); refresh(); }} />}
    </div>;
}
