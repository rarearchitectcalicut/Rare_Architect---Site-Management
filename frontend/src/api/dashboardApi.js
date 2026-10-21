
import { api } from "./client";

// =====================================================
// RARE DASHBOARD API
// =====================================================

export const dashboardApi = {
    getAdminSummary: async () => {
        const { data } = await api.get(
            "dashboard/admin/"
        );

        return data;
    },

    getAdminReviewQueue: async () => {
        const { data } = await api.get(
            "dashboard/admin/review-queue/"
        );

        return data;
    },

    getSupervisorSummary: async () => {
        const { data } = await api.get(
            "dashboard/supervisor/"
        );

        return data;
    },

    getSupervisorActionItems: async () => {
        const { data } = await api.get(
            "dashboard/supervisor/action-items/"
        );

        return data;
    },
};
