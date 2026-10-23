
import { api } from "./client";

export const taskApi = {
    list: async (projectId, params = {}) =>
        (await api.get(`projects/${projectId}/tasks/`, { params })).data,

    create: async (projectId, payload) =>
        (await api.post(`projects/${projectId}/tasks/`, payload)).data,

    get: async (taskId) =>
        (await api.get(`tasks/${taskId}/`)).data,

    update: async (taskId, payload) =>
        (await api.patch(`tasks/${taskId}/`, payload)).data,

    resubmit: async (taskId, payload) =>
        (await api.post(`tasks/${taskId}/resubmit/`, payload)).data,

    requestChange: async (taskId, payload) =>
        (await api.post(`tasks/${taskId}/change-requests/`, payload)).data,

    history: async (taskId) =>
        (await api.get(`tasks/${taskId}/history/`)).data,

    documents: async (taskId, params = {}) => {
        const { data } = await api.get(
            `tasks/${taskId}/documents/`,
            { params }
        );
        return data;
    },
    
    downloadDocument: async (documentId) => {
        const response = await api.get(
            `task-documents/${documentId}/download/`,
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

    documentVersions: async (documentId) => {
        const { data } = await api.get(
            `task-documents/${documentId}/versions/`
        );
        return data;
    },

    getDocument: async (documentId) => {
        const { data } = await api.get(
            `task-documents/${documentId}/`
        );
        return data;
    },

};
