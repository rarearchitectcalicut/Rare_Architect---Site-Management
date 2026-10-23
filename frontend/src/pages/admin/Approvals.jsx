import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApprovalQueues } from "../../hooks/useApprovalQueues";
import { useRequestList } from "../../hooks/useRequestList";
import ApprovalOverview from "../../components/approvals/ApprovalOverview";
import ApprovalQueueTabs from "../../components/approvals/ApprovalQueueTabs";
import ApprovalFilters from "../../components/approvals/ApprovalFilters";
import RequestList from "../../components/approvals/RequestList";
import RequestReview from "../../components/approvals/RequestReview";
import { queueLabels } from "../../components/approvals/queueData";

export default function AdminApprovals() {
    const { queues, projects, errors, loading, refresh } = useApprovalQueues();
    const [params, setParams] = useSearchParams();
    const [notice, setNotice] = useState("");
    const requestedTab = params.get("tab") || "tasks";
    const tab = requestedTab === "rejected" ? "history" : Object.hasOwn(queueLabels, requestedTab) ? requestedTab : "tasks";
    const historyStatus = params.get("status") || (requestedTab === "rejected" ? "REJECTED" : "");
    const items = tab === "history" && historyStatus ? queues.history.filter((item) => item.status === historyStatus) : queues[tab];
    const list = useRequestList(items, projects);
    const reference = params.get("task") || params.get("request") || params.get("entry");
    const selectedType = params.get("type") || ({ tasks: "tasks", changes: "changes", timeline: "timeline", delays: "delay", work: "work" })[tab];
    const allItems = useMemo(() => Object.values(queues).flat(), [queues]);
    const selected = useMemo(() => {
        if (!reference || loading) return null;
        const found = allItems.find((item) => item.id === reference && item.requestType === selectedType && (!params.get("decision") || item.historyId === params.get("decision")));
        // Notifications can reference requests no longer in a pending queue.
        return found || (selectedType ? { id: reference, requestType: selectedType, queueKey: `${selectedType}:${reference}`, title: "Request details", status: null, raw: {} } : null);
    }, [allItems, reference, selectedType, loading, params]);
    const pendingCount = Object.entries(queues).reduce((count, [key, rows]) => key === "history" ? count : count + rows.length, 0);

    function changeTab(next) { list.clear(); setNotice(""); setParams({ tab: next }); }
    function open(item) {
        const next = new URLSearchParams(params);
        ["task", "request", "entry", "decision"].forEach((key) => next.delete(key));
        next.set(item.requestType === "tasks" ? "task" : item.requestType === "work" ? "entry" : "request", item.id);
        next.set("type", item.requestType);
        if (item.historyId) next.set("decision", item.historyId);
        setParams(next);
    }
    function close() {
        const next = new URLSearchParams(params);
        ["task", "request", "entry", "type", "decision"].forEach((key) => next.delete(key));
        setParams(next, { replace: true });
    }
    function completed() { close(); setNotice("Decision recorded successfully."); refresh(); }
    function updateFilter(key, value) {
        if (tab === "history" && key === "status") {
            const next = new URLSearchParams(params);
            next.set("tab", "history");
            if (value) next.set("status", value); else next.delete("status");
            setParams(next, { replace: true });
            list.updateFilter("status", "");
        } else list.updateFilter(key, value);
    }
    function clearFilters() { list.clear(); if (tab === "history") setParams({ tab: "history" }); }

    return <div className="space-y-6 pb-8">
        <ApprovalOverview loading={loading} count={pendingCount} onRefresh={refresh} />
        <ApprovalQueueTabs queues={queues} tab={tab} onChange={changeTab} loading={loading} />
        {notice && <p role="status" className="rounded-2xl bg-[#E7F2E8] p-4 text-sm text-[#296F40]">{notice}</p>}
        {!!Object.keys(errors).length && <div role="alert" className="space-y-1 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{Object.entries(errors).map(([name, text]) => <p key={name}>{text}</p>)}</div>}
        <section className="overflow-hidden rounded-[26px] border border-[#E5DDD1] bg-[#FFFDFA]">
            <header className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
                <h2 className="text-lg font-bold">{queueLabels[tab]} <span className="ml-2 text-sm font-medium text-[#817669]">{loading ? "—" : list.rows.length}</span></h2>
                {tab === "history" && <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={!historyStatus} onClick={() => { list.clear(); setParams({ tab: "history" }); }} className="rounded-full border border-[#E4DCCD] px-3 py-2 text-xs">All decisions</button><button type="button" aria-pressed={historyStatus === "REJECTED"} onClick={() => { list.clear(); setParams({ tab: "history", status: "REJECTED" }); }} className="rounded-full bg-[#FCE9E6] px-3 py-2 text-xs font-semibold text-[#B5473E]">Rejected Requests</button></div>}
                {tab === "delays" && <Link className="text-xs font-semibold text-[#3565A5]" to="/admin/delays">Open delay workspace →</Link>}
                {tab === "work" && <Link className="text-xs font-semibold text-[#3565A5]" to="/admin/reports">Open daily reports →</Link>}
            </header>
            <ApprovalFilters filters={tab === "history" ? { ...list.filters, status: historyStatus } : list.filters} onChange={updateFilter} onClear={clearFilters} projects={projects} mode={tab} projectsUnavailable={Boolean(errors.projects)} />
            <RequestList list={list} loading={loading} onOpen={open} />
        </section>
        {selected && <RequestReview key={selected.queueKey} item={selected} onClose={close} onSuccess={completed} readOnly={tab === "history"} />}
    </div>;
}
