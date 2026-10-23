
import { api } from "./client";

export const approvalApi = {
    taskDecisions: async (params = {}) => (await api.get("task-decisions/", { params })).data,
    getTaskApprovals: async (params = {}) => {
        const { data } = await api.get("task-approvals/", {
            params,
        });
        return data;
    },

    approveTask: async (taskId, comment = "") => {
        const { data } = await api.post(
            `tasks/${taskId}/approve/`,
            { comment }
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

    approveChange: async (requestId, comment = "") => {
        const { data } = await api.post(
            `task-change-requests/${requestId}/approve/`,
            { admin_comment: comment }
        );
        return data;
    },

    rejectChange: async (requestId, reason) => {
        const { data } = await api.post(
            `task-change-requests/${requestId}/reject/`,
            { admin_comment: reason }
        );
        return data;
    },
};
