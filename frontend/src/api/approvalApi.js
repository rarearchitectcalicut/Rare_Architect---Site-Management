
import { api } from "./client";

export const approvalApi = {
    getTaskApprovals: async (params = {}) => {
        const { data } = await api.get("task-approvals/", {
            params,
        });
        return data;
    },

    approveTask: async (taskId) => {
        const { data } = await api.post(
            `tasks/${taskId}/approve/`,
            {}
        );
        return data;
    },

    rejectTask: async (taskId, reason) => {
        const { data } = await api.post(
            `tasks/${taskId}/reject/`,
            { reason }
        );
        return data;
    },

    getChangeRequests: async (params = {}) => {
        const { data } = await api.get(
            "task-change-requests/",
            { params }
        );
        return data;
    },

    getChangeRequest: async (requestId) => {
        const { data } = await api.get(
            `task-change-requests/${requestId}/`
        );
        return data;
    },

    approveChange: async (requestId) => {
        const { data } = await api.post(
            `task-change-requests/${requestId}/approve/`,
            {}
        );
        return data;
    },

    rejectChange: async (requestId, reason) => {
        const { data } = await api.post(
            `task-change-requests/${requestId}/reject/`,
            { reason }
        );
        return data;
    },
};
