import { useCallback, useEffect, useState } from "react";
import { delayApi } from "../api/delayApi";
import { projectApi } from "../api/projectApi";
import { taskApi } from "../api/taskApi";
import { validationMessage } from "./useApprovalReview";

const initialFilters = { search: "", project: "", projectSearch: "", category: "", status: "", delayType: "", extension: "", date_from: "", date_to: "", sort: "newest" };

export function useDelayReports(projectId, { tasksEnabled = false } = {}) {
    const [filters, setFilters] = useState(initialFilters);
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [state, setState] = useState({ key: "", reports: [], count: 0, summary: null, error: "" });
    const [projectState, setProjectState] = useState({ id: null, project: null, error: "" });
    const [taskSearch, setTaskSearch] = useState("");
    const [taskPage, setTaskPage] = useState(1);
    const [taskState, setTaskState] = useState({ key: "", tasks: [], count: 0, error: "" });
    const refresh = useCallback(() => setRevision((value) => value + 1), []);
    const query = JSON.stringify(Object.fromEntries(Object.entries({
        project: projectId || filters.project, search: filters.search, project_search: filters.projectSearch,
        status: filters.status, delay_type: filters.delayType, sort: filters.sort,
        date_from: filters.date_from, date_to: filters.date_to,
        ...(["REQUESTED", "NONE"].includes(filters.extension) ? { extension_requested: filters.extension === "REQUESTED" } : { extension_status: filters.extension }),
    }).filter(([, value]) => value !== "" && value != null)));
    const key = `${query}:${page}:${revision}`;
    useEffect(() => {
        const controller = new AbortController();
        delayApi.list({ ...JSON.parse(query), page, page_size: 8 }, controller.signal).then((data) => {
            if (controller.signal.aborted) return;
            if (!Array.isArray(data.results) || !Number.isInteger(data.count) || !data.summary) throw new Error("Unexpected delay register response.");
            setState({ key, reports: data.results, count: data.count, summary: data.summary, error: "" });
        }).catch((error) => {
            if (!controller.signal.aborted) setState({ key, reports: [], count: 0, summary: null, error: validationMessage(error, "Unable to load delay reports. Refresh to retry.") });
        });
        return () => controller.abort();
    }, [query, page, revision, key]);
    useEffect(() => {
        if (!projectId) return;
        let cancelled = false;
        projectApi.getProject(projectId).then((project) => {
            if (!cancelled) setProjectState({ id: projectId, project, error: "" });
        }).catch((error) => {
            if (!cancelled) setProjectState({ id: projectId, project: null, error: validationMessage(error, "Unable to load this project.") });
        });
        return () => { cancelled = true; };
    }, [projectId, revision]);
    const taskKey = `${projectId}:${taskSearch}:${taskPage}:${revision}`;
    useEffect(() => {
        if (!tasksEnabled || !projectId) return;
        const controller = new AbortController();
        taskApi.register({ project: projectId, delay_eligible: true, search: taskSearch, page: taskPage, page_size: 20 }, controller.signal).then((data) => {
            if (controller.signal.aborted) return;
            if (!Array.isArray(data.results) || !Number.isInteger(data.count)) throw new Error("Unexpected task picker response.");
            setTaskState({ key: taskKey, tasks: data.results, count: data.count, error: "" });
        }).catch((error) => {
            if (!controller.signal.aborted) setTaskState({ key: taskKey, tasks: [], count: 0, error: validationMessage(error, "Unable to load eligible tasks.") });
        });
        return () => controller.abort();
    }, [projectId, tasksEnabled, taskSearch, taskPage, revision, taskKey]);
    const current = state.key === key;
    const project = projectState.id === projectId ? projectState.project : null;
    const tasksCurrent = taskState.key === taskKey;
    return {
        reports: current ? state.reports : [], count: current ? state.count : 0,
        summary: current ? state.summary : null, loading: !current, initialLoading: !state.key,
        projects: project ? [project] : [], project,
        error: current && state.error || projectState.id === projectId && projectState.error || "",
        refresh, filters, page, setPage, pageCount: current ? Math.max(1, Math.ceil(state.count / 8)) : 1,
        updateFilter: (field, value) => { setFilters((previous) => ({ ...previous, [field]: value })); setPage(1); },
        clear: () => { setFilters(initialFilters); setPage(1); },
        tasks: tasksCurrent ? taskState.tasks : [],
        taskOptions: { search: taskSearch, page: taskPage, count: tasksCurrent ? taskState.count : 0,
            loading: !tasksCurrent, error: tasksCurrent ? taskState.error : "",
            onSearch: (value) => { setTaskSearch(value); setTaskPage(1); }, onPage: setTaskPage, onRetry: refresh },
    };
}
