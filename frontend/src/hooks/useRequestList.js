import { useState } from "react";
import { referenceId } from "../components/approvals/approvalUtils";

export function useRequestList(items, projects = []) {
    const initial = { search: "", project: "", category: "", priority: "", status: "", type: "", delayType: "", extension: "", date: "", sort: "oldest" };
    const [filters, setFilters] = useState(initial);
    const [page, setPage] = useState(1);
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
    return { filters, updateFilter, clear: () => { setFilters(initial); setPage(1); }, rows, pageRows: rows.slice((safePage - 1) * 8, safePage * 8), page: safePage, setPage, pageCount };
}
