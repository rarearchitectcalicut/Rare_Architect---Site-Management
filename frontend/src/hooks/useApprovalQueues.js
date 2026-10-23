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
    changes: approvalApi.getChangeRequests, timeline: timelineApi.getChangeRequests,
    delays: delayApi.list, work: dailyReportApi.workQueue, decisions: approvalApi.taskDecisions,
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
            const results = await Promise.allSettled(names.map((name) => getAllPages(loaders[name])));
            if (cancelled) return;
            const nextErrors = {};
            const next = {};
            results.forEach((result, index) => {
                const name = names[index];
                next[name] = result.status === "fulfilled" ? result.value : [];
                if (result.status === "rejected") nextErrors[name] = getError(result.reason, `Unable to load ${name}. Refresh to retry.`);
            });
            setData(next); setErrors(nextErrors); setLoading(false);
        }
        load();
        return () => { cancelled = true; };
    }, [revision]);

    const queues = useMemo(() => buildQueues(data), [data]);
    return { queues, projects: data.projects, loading, errors, refresh, revision };
}
