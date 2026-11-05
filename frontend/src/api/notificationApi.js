
import { api } from "./client";

export const notificationApi = {
    list: async (params = {}, signal) => {
        const { data } = await api.get("notifications/", {
            params,
            signal,
        });
        return data;
    },

    unreadCount: async (signal) => {
        const { data } = await api.get(
            "notifications/unread-count/", { signal }
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
