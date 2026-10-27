
import { api } from "./client";

// =====================================================
// PROJECT CATEGORY AND PROJECT API
// =====================================================

// Version IDs are resolved only by the authorized backend, including historical files.
export const projectDocumentFiles = {
    previewAttachment: async (versionId, signal) => (await api.get(`project-document-versions/${versionId}/download/`, { params: { inline: "true" }, responseType: "blob", signal })).data,
    downloadAttachment: async (versionId, signal) => (await api.get(`project-document-versions/${versionId}/download/`, { responseType: "blob", signal })).data,
};

export const projectApi = {
    documents: async (projectId, params = {}, signal) => (await api.get(`projects/${projectId}/documents/`, { params, signal })).data,
    document: async (id, signal) => (await api.get(`project-documents/${id}/`, { signal })).data,
    createDocument: async (projectId, formData) => (await api.post(`projects/${projectId}/documents/`, formData)).data,
    documentVersions: async (id, params = {}, signal) => (await api.get(`project-documents/${id}/versions/`, { params, signal })).data,
    newDocumentVersion: async (id, formData) => (await api.post(`project-documents/${id}/new-version/`, formData)).data,

    getCategories: async (params = {}, signal) => {
        const { data } = await api.get(
            "project-categories/",
            { params, signal }
        );
        return data;
    },

    getCategory: async (categoryId) => {
        const { data } = await api.get(
            `project-categories/${categoryId}/`
        );

        return data;
    },

    getProject: async (projectId) => {
        const { data } = await api.get(
            `projects/${projectId}/`
        );

        return data;
    },

    getProjects: async (params = {}, signal) => {
        const { data } = await api.get("projects/", {
            params,
            signal,
        });

        return data;
    },

    getProjectOverview: async (projectId) => {
        const { data } = await api.get(
            `projects/${projectId}/overview/`
        );

        return data;
    },
    createProject: async (formData) => {
        const { data } = await api.post(
            "projects/",
            formData
        );

        return data;
    },
    updateProject: async (projectId, formData) => {
        const { data } = await api.patch(
            `projects/${projectId}/`,
            formData
        );

        return data;
    },
};
