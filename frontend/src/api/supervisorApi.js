
import { api } from "./client";

export const supervisorApi = {
    list: async (params = {}) => {
        const { data } = await api.get(
            "users/supervisors/",
            { params }
        );
        return data;
    },

    assignToProject: async (projectId, supervisorIds) => {
        const { data } = await api.post(
            `projects/${projectId}/assign-supervisors/`,
            { supervisor_ids: supervisorIds }
        );
        return data;
    },

    removeFromProject: async (projectId, supervisorId) => {
        const { data } = await api.delete(
            `projects/${projectId}/supervisors/${supervisorId}/`
        );
        return data;
    },
    createSupervisor: async (payload) => {
        const { data } = await api.post(
            "users/supervisors/",
            payload
        );

        return data;
    },
    getSupervisor: async (id) => {
        const { data } = await api.get(
            `users/supervisors/${id}/`
        );
        return data;
    },

    updateSupervisor: async (id, payload) => {
        const { data } = await api.patch(
            `users/supervisors/${id}/`,
            payload
        );
        return data;
    },

    resetPassword: async (supervisorId, payload) => {
        const { data } = await api.post(
            `users/supervisors/${supervisorId}/reset-password/`,
            payload
        );

        return data;
    },
    
    getProjectSupervisors: async (projectId) => {
        const { data } = await api.get(
            `projects/${projectId}/supervisors/`
        );
        return data;
    },
};
