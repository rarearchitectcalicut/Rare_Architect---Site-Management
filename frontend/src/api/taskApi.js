
import { api } from "./client";

export const isTaskId = (value) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value || "");

export function isTaskOverdue(task, today = new Date()) {
    const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
    return Boolean(task.end_date && task.end_date < date && task.approval_status === "APPROVED" && !["COMPLETED", "CANCELLED"].includes(task.work_status));
}

// Follow DRF page numbers without sending authenticated requests to response URLs.
export async function loadTaskPages(fetchPage, signal) {
    const items = [];
    const ids = new Set();
    let expected;
    for (let page = 1; page <= 500; page += 1) {
        signal?.throwIfAborted();
        const response = await fetchPage({ page, page_size: 100 });
        signal?.throwIfAborted();
        const rows = Array.isArray(response) ? response : response?.results;
        if (!Array.isArray(rows)) throw new Error("Unexpected list response.");
        if (response?.count != null) {
            if (expected != null && expected !== response.count) throw new Error("Records changed while loading. Please refresh.");
            expected = response.count;
        }
        for (const row of rows) {
            if (!row.id || ids.has(row.id)) throw new Error("Records changed while loading. Please refresh.");
            ids.add(row.id);
            items.push(row);
        }
        if (!response?.next) {
            if (expected != null && items.length !== expected) throw new Error("The dataset is incomplete. Please refresh.");
            return items;
        }
        if (!rows.length) throw new Error("An empty page interrupted loading.");
    }
    throw new Error("Too many pages to load safely. Please contact support.");
}

export const taskApi = {
    register: async (params = {}, signal) => (await api.get("tasks/", { params, signal })).data,
    list: async (projectId, params = {}, signal) =>
        (await api.get(`projects/${projectId}/tasks/`, { params, signal })).data,

    listComplete: async (projectId, signal) => {
        const rows = await loadTaskPages((params) => taskApi.list(projectId, params, signal), signal);
        const details = new Array(rows.length);
        let index = 0;
        await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
            while (index < rows.length) {
                signal?.throwIfAborted();
                const position = index++;
                const task = await taskApi.get(rows[position].id, signal);
                if (task.id !== rows[position].id || task.project !== projectId) throw new Error("Task project mismatch. Please refresh.");
                details[position] = task;
            }
        }));
        return details;
    },

    create: async (projectId, payload) =>
        (await api.post(`projects/${projectId}/tasks/`, payload)).data,

    get: async (taskId, signal) =>
        (await api.get(`tasks/${taskId}/`, { signal })).data,

    update: async (taskId, payload) =>
        (await api.patch(`tasks/${taskId}/`, payload)).data,

    resubmit: async (taskId, payload) =>
        (await api.post(`tasks/${taskId}/resubmit/`, payload)).data,

    requestChange: async (taskId, payload) =>
        (await api.post(`tasks/${taskId}/change-requests/`, payload)).data,

    history: async (taskId, params = {}, signal) =>
        (await api.get(`tasks/${taskId}/history/`, { params, signal })).data,

    documents: async (taskId, params = {}, signal) => {
        const { data } = await api.get(
            `tasks/${taskId}/documents/`,
            { params, signal }
        );
        return data;
    },
    
    downloadDocument: async (documentId) => {
        const document = await taskApi.getDocument(documentId);
        if (!document.current_version?.id) throw new Error("No current document version is available.");
        return taskApi.downloadDocumentVersion(document.current_version.id);
    },

    downloadDocumentVersion: async (versionId) => {
        const response = await api.get(
            `task-document-versions/${versionId}/download/`,
            { responseType: "blob" }
        );
        return response.data;
    },

    bulkCreate: async (projectId, tasks) => {
        const { data } = await api.post(
            `projects/${projectId}/tasks/bulk-create/`,
            { tasks }
        );
        return data;
    },

    uploadDocument: async (taskId, formData) => {
        const { data } = await api.post(
            `tasks/${taskId}/documents/`,
            formData
        );
        return data;
    },

    newDocumentVersion: async (documentId, formData) => {
        const { data } = await api.post(
            `task-documents/${documentId}/new-version/`,
            formData
        );
        return data;
    },

    documentVersions: async (documentId, params = {}, signal) => {
        const { data } = await api.get(
            `task-documents/${documentId}/versions/`, { params, signal }
        );
        return data;
    },

    getDocument: async (documentId) => {
        const { data } = await api.get(
            `task-documents/${documentId}/`
        );
        return data;
    },

    start: async (taskId) => {
        const { data } = await api.post(`tasks/${taskId}/start/`);
        return data;
    },

    complete: async (taskId) => {
        const { data } = await api.post(`tasks/${taskId}/complete/`);
        return data;
    },

    cancel: async (taskId, reason) => (await api.post(`tasks/${taskId}/cancel/`, { reason })).data,
    reopen: async (taskId, reason) => (await api.post(`tasks/${taskId}/reopen/`, { reason })).data,
};

export function taskRegisterPage(response, page = 1, pageSize = 12) {
    if (Array.isArray(response)) {
        const projects = new Map();
        const supervisors = new Map();
        const summary = { total: response.length, pending_approval: 0, not_started: 0, in_progress: 0, completed: 0, overdue: 0 };
        for (const task of response) {
            if (!task.id || !task.project || !task.project_name) throw new Error("Task register data is incomplete.");
            projects.set(task.project, { id: task.project, name: task.project_name });
            for (const supervisor of task.supervisors || []) supervisors.set(supervisor.id, supervisor);
            if (task.approval_status === "PENDING") summary.pending_approval += 1;
            if (task.work_status === "NOT_STARTED") summary.not_started += 1;
            if (task.work_status === "IN_PROGRESS") summary.in_progress += 1;
            if (task.work_status === "COMPLETED") summary.completed += 1;
            if (typeof task.is_overdue === "boolean" ? task.is_overdue : isTaskOverdue(task)) summary.overdue += 1;
        }
        return {
            results: response.slice((page - 1) * pageSize, page * pageSize), count: response.length,
            next: page * pageSize < response.length, previous: page > 1,
            summary, summary_scope: "results", filter_options: { projects: [...projects.values()], supervisors: [...supervisors.values()] },
        };
    }
    const counts = ["total", "pending_approval", "not_started", "in_progress", "completed", "overdue"];
    if (!Array.isArray(response?.results) || !Number.isInteger(response.count) || response.count < 0 ||
        !counts.every((key) => Number.isInteger(response.summary?.[key]) && response.summary[key] >= 0) ||
        !Array.isArray(response.filter_options?.projects) || !Array.isArray(response.filter_options?.supervisors)) {
        throw new Error("The complete task register and its totals could not be loaded. Please retry.");
    }
    return { ...response, summary_scope: "all_projects", next: Boolean(response.next), previous: Boolean(response.previous) };
}
