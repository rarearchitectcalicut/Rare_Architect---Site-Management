
import { api } from "./client";

// =====================================================
// PROJECT CATEGORY AND PROJECT API
// =====================================================

export const projectApi = {
    getCategories: async () => {
        const { data } = await api.get("project-categories/");
        return data;
    },

    getCategory: async (categoryId) => {
        const { data } = await api.get(
            `project-categories/${categoryId}/`
        );

        return data;
    },

    getProjects: async (params = {}) => {
        const { data } = await api.get("projects/", {
            params,
        });

        return data;
    },

    getProject: async (projectId) => {
        const { data } = await api.get(
            `projects/${projectId}/`
        );

        return data;
    },

    getProjectOverview: async (projectId) => {
        const { data } = await api.get(
            `projects/${projectId}/overview/`
        );

        return data;
    },

    getProjects: async (params = {}) => {
        const { data } = await api.get("projects/", {
            params,
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
};
