import { useEffect, useState } from "react";
import { delayApi } from "../api/delayApi";
import { normalizeRequest } from "../components/approvals/queueData";
import { approvalApi } from "../api/approvalApi";
import { getError, referenceId } from "../components/approvals/approvalUtils";

export function useRequestList(items, projects = [], { server = false, serverKind = "history", status = "", revision = 0 } = {}) {
    const initial = { search: "", project: "", projectSearch: "", category: "", priority: "", status: "", type: "", delayType: "", extension: "", date: "", task_search: "", reviewer_search: "", date_from: "", date_to: "", sort: "oldest" };
    const [filters, setFilters] = useState(initial);
    const [page, setPage] = useState(1);
    const [history, setHistory] = useState({ key: "", rows: [], count: 0, error: "" });
    const query = JSON.stringify(Object.fromEntries(Object.entries({
        search: filters.search, project: filters.project, category: filters.category, type: filters.type, status: serverKind === "delays" ? filters.status : status,
        sort: ["newest", "oldest"].includes(filters.sort) ? filters.sort : "newest",
        ...(serverKind === "delays" ? { project_search: filters.projectSearch, delay_type: filters.delayType,
            ...(["REQUESTED", "NONE"].includes(filters.extension) ? { extension_requested: filters.extension === "REQUESTED" } : { extension_status: filters.extension }) } : {}),
        task_search: filters.task_search, reviewer_search: filters.reviewer_search, date_from: filters.date_from, date_to: filters.date_to,
    }).filter(([, value]) => value !== "")));
    const key = `${serverKind}:${query}:${page}:${revision}`;
    useEffect(() => {
        if (!server) return;
        let cancelled = false;
        const request = serverKind === "delays"
            ? delayApi.list({ ...JSON.parse(query), pending_only: true, page, page_size: 8 })
            : approvalApi.taskDecisions({ ...JSON.parse(query), scope: "all", page, page_size: 8 });
        request.then((data) => {
            if (cancelled) return;
            if (!Array.isArray(data.results) || !Number.isInteger(data.count)) throw new Error("Unexpected paginated request response.");
            const rows = serverKind === "delays" ? data.results.map((entry) => normalizeRequest(entry.status === "PENDING" ? "delay" : "extension", entry)) : data.results.map((entry) => ({
                id: entry.decision_type === "tasks" ? entry.task_ref : entry.decision_id,
                historyId: entry.decision_type === "tasks" ? entry.decision_id : undefined,
                requestType: entry.decision_type, queueKey: `${entry.decision_type}:${entry.decision_id}`,
                taskId: entry.task_ref, title: entry.task_title, projectId: entry.project_ref, projectName: entry.project_title,
                creator: entry.reporter_name, reviewedBy: entry.reviewer_name, reviewedAt: entry.decision_date,
                createdAt: entry.decision_date, status: entry.decision_status, comment: entry.decision_note, raw: entry,
            }));
            setHistory({ key, rows, count: data.count, error: "" });
        }).catch((error) => {
            if (!cancelled) setHistory({ key, rows: [], count: 0, error: getError(error, serverKind === "delays" ? "Unable to load pending delay requests. Check filters and refresh to retry." : "Unable to load decision history. Check filters and refresh to retry.") });
        });
        return () => { cancelled = true; };
    }, [query, page, revision, server, serverKind, key]);
    const projectMap = new Map(projects.map((project) => [String(project.id), project]));
    const rows = items.map((item) => {
        const project = projectMap.get(item.projectId);
        return { ...item, projectName: item.projectName || project?.name || "Project unavailable", categoryId: referenceId(project?.category) };
    }).filter((item) => {
        const q = filters.search.trim().toLowerCase();
        return [item.title, item.projectName, item.creator, item.reviewedBy, item.comment, item.preview].filter(Boolean).join(" ").toLowerCase().includes(q)
            && (!filters.project || item.projectId === filters.project)
            && (!filters.category || item.categoryId === filters.category)
            && (!filters.priority || item.priority === filters.priority)
            && (!filters.status || item.status === filters.status)
            && (!filters.type || item.requestType === filters.type)
            && (!filters.delayType || item.raw.delay_type === filters.delayType)
            && (!filters.date || item.raw.report_date === filters.date)
            && (!filters.extension || (filters.extension === "REQUESTED" ? item.raw.extension_requested : filters.extension === "NONE" ? !item.raw.extension_requested : item.raw.extension_status === filters.extension));
    });
    const weights = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    rows.sort((a, b) => {
        if (filters.sort === "title") return a.title.localeCompare(b.title);
        if (filters.sort === "project") return a.projectName.localeCompare(b.projectName);
        if (filters.sort === "priority") return (weights[b.priority] || 0) - (weights[a.priority] || 0);
        const first = a.reviewedAt || a.createdAt || "";
        const second = b.reviewedAt || b.createdAt || "";
        return filters.sort === "newest" ? second.localeCompare(first) : first.localeCompare(second);
    });
    const pageCount = Math.max(1, Math.ceil(rows.length / 8));
    const safePage = Math.min(page, pageCount);
    const updateFilter = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
    const controls = { filters, updateFilter, clear: () => { setFilters(initial); setPage(1); }, setPage };
    if (server) {
        const current = history.key === key;
        return { ...controls, rows: current ? history.rows : [], pageRows: current ? history.rows : [],
            count: current ? history.count : 0, page, pageCount: current ? Math.max(1, Math.ceil(history.count / 8)) : 1,
            historyRows: current ? history.rows : undefined, loading: !current, error: current ? history.error : "" };
    }
    return { filters, updateFilter, clear: () => { setFilters(initial); setPage(1); }, rows, pageRows: rows.slice((safePage - 1) * 8, safePage * 8), page: safePage, setPage, pageCount };
}
