import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useDailyWorkQueue } from "../../hooks/useDailyWorkQueue";
import { useRequestList } from "../../hooks/useRequestList";
import ApprovalOverview from "../../components/approvals/ApprovalOverview";
import ApprovalFilters from "../../components/approvals/ApprovalFilters";
import RequestList from "../../components/approvals/RequestList";
import RequestReview from "../../components/approvals/RequestReview";
import DailyReportSummary from "../../components/daily-reports/DailyReportSummary";

export default function AdminDailyReports() {
    const [params, setParams] = useSearchParams();
    const reportId = params.get("report");
    const { items, projects, report, attachments, loading, error, refresh } = useDailyWorkQueue(reportId);
    const list = useRequestList(items, projects);
    const id = params.get("entry");
    const selected = useMemo(() => id ? items.find((item) => item.id === id) || { id, requestType: "work", queueKey: `work:${id}`, raw: {} } : null, [id, items]);
    function close() { const next = new URLSearchParams(params); next.delete("entry"); setParams(next, { replace: true }); }
    return <div className="space-y-6 pb-8">
        <ApprovalOverview title="Daily Reports & Verification" description="Review individual work entries, inspect report evidence, and verify measured work against approved task baselines." count={items.filter((item) => item.status === "PENDING").length} loading={loading} onRefresh={refresh} />
        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {report && !loading && !error && <DailyReportSummary report={report} attachments={attachments} />}
        <section className="overflow-hidden rounded-[26px] border border-[#E5DDD1] bg-[#FFFDFA]">
            <h2 className="px-6 pt-6 text-lg font-bold">Submitted daily work</h2>
            {reportId && <button type="button" onClick={() => setParams({})} className="mx-6 mt-3 text-xs font-semibold text-[#3565A5]">Show all reports</button>}
            <ApprovalFilters mode="work" filters={list.filters} onChange={list.updateFilter} onClear={list.clear} projects={projects} />
            <RequestList list={list} loading={loading} onOpen={(item) => { const next = new URLSearchParams(params); next.set("entry", item.id); setParams(next); }} />
        </section>
        {selected && <RequestReview key={selected.queueKey} item={selected} onClose={close} onSuccess={() => { close(); refresh(); }} />}
    </div>;
}
