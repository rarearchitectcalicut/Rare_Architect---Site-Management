import { api } from "./client";

export const dailyReportApi = {
    workQueue: async (params = {}) => (await api.get("daily-task-work/", { params })).data,
    work: async (id) => (await api.get(`daily-task-work/${id}/`)).data,
    get: async (id) => (await api.get(`daily-reports/${id}/`)).data,
    attachments: async (reportId, params = {}) => (await api.get(`daily-reports/${reportId}/attachments/`, { params })).data,
    downloadAttachment: async (id) => (await api.get(`daily-report-attachments/${id}/download/`, { responseType: "blob" })).data,
    progress: async (taskId) => (await api.get(`tasks/${taskId}/progress/`)).data,
    decide: async (id, action, note) => (await api.post(`daily-task-work/${id}/${action}/`, { verification_note: note })).data,
};
