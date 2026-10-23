
import { api } from "./client";

export const notificationApi = {
    list: async (params = {}) => {
        const { data } = await api.get("notifications/", {
            params,
        });
        return data;
    },

    unreadCount: async () => {
        const { data } = await api.get(
            "notifications/unread-count/"
        );
        return data;
    },

    markRead: async (id) => {
        const { data } = await api.post(
            `notifications/${id}/read/`,
            {}
        );
        return data;
    },

    markAllRead: async () => {
        const { data } = await api.post(
            "notifications/read-all/",
            {}
        );
        return data;
    },
};
