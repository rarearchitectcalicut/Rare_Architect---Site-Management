
import { api } from "./client";

// =====================================================
// PROJECT CATEGORY AND PROJECT API
// =====================================================

export const projectApi = {
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
