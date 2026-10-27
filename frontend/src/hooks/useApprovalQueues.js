import { useCallback, useEffect, useMemo, useState } from "react";
import { approvalApi } from "../api/approvalApi";
import { timelineApi } from "../api/timelineApi";
import { delayApi } from "../api/delayApi";
import { dailyReportApi } from "../api/dailyReportApi";
import { projectApi } from "../api/projectApi";
import { getAllPages, getError } from "../components/approvals/approvalUtils";
import { buildQueues } from "../components/approvals/queueData";

const loaders = {
    tasks: (params) => approvalApi.getTaskApprovals({ ...params, status: "PENDING" }),
    changes: (params) => approvalApi.getChangeRequests({ ...params, status: "PENDING" }),
    timeline: (params) => timelineApi.getChangeRequests({ ...params, status: "PENDING" }),
    delays: async (params) => {
        const data = await delayApi.list(params);
        if (!Number.isInteger(data.count) || !data.summary) throw new Error("Unexpected delay queue response.");
        return data;
    }, work: (params) => dailyReportApi.workQueue({ ...params, status: "PENDING" }),
    projects: projectApi.getProjects,
};
const empty = Object.fromEntries(Object.keys(loaders).map((key) => [key, []]));

export function useApprovalQueues() {
    const [data, setData] = useState(empty);
    const [loading, setLoading] = useState(true);
    const [errors, setErrors] = useState({});
    const [revision, setRevision] = useState(0);
    const refresh = useCallback(() => setRevision((value) => value + 1), []);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            const names = Object.keys(loaders);
            const results = await Promise.allSettled(names.map((name) => name === "delays" ? loaders[name]({ pending_only: true, page_size: 1 }) : getAllPages(loaders[name])));
            if (cancelled) return;
            const nextErrors = {};
            const next = {};
            results.forEach((result, index) => {
                const name = names[index];
                if (name === "delays") {
                    next.delays = [];
                    next.delayCount = result.status === "fulfilled" ? result.value.count : null;
                    next.delaySummary = result.status === "fulfilled" ? result.value.summary : null;
                    if (result.status === "rejected") nextErrors.delays = getError(result.reason, "Unable to load delay queue totals. Refresh to retry.");
                    return;
                }
                next[name] = result.status === "fulfilled" ? result.value : [];
                if (result.status === "rejected") nextErrors[name] = getError(result.reason, `Unable to load ${name}. Refresh to retry.`);
            });
            setData(next); setErrors(nextErrors); setLoading(false);
        }
        load();
        return () => { cancelled = true; };
    }, [revision]);

    const queues = useMemo(() => ({ ...buildQueues({ ...data, decisions: [] }), history: [] }), [data]);
    return { counts: { delays: data.delayCount ?? null }, delaySummary: data.delaySummary, queues, projects: data.projects, loading, errors, refresh, revision };
}
