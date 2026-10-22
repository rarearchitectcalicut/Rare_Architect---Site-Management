
import { api } from "./client";

export const supervisorApi = {
    list: async () => {
        const { data } = await api.get("users/supervisors/");
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
};
