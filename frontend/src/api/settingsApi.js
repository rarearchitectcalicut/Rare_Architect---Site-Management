
import { api } from "./client";

export const settingsApi = {
    getProfile: async () => {
        const { data } = await api.get("auth/me/");
        return data;
    },

    // Requires Django to support PATCH /auth/me/.
    updateProfile: async (payload) => {
        const { data } = await api.patch("auth/me/", payload);
        return data;
    },

    changePassword: async (payload) => {
        const { data } = await api.post(
            "auth/change-password/",
            payload
        );
        return data;
    },

    getCategories: async () => {
        const { data } = await api.get("project-categories/");
        return data;
    },

    getCategory: async (id) => {
        const { data } = await api.get(
            `project-categories/${id}/`
        );
        return data;
    },

    createCategory: async (formData) => {
        const { data } = await api.post(
            "project-categories/",
            formData
        );
        return data;
    },

    updateCategory: async (id, formData) => {
        const { data } = await api.patch(
            `project-categories/${id}/`,
            formData
        );
        return data;
    },
};
