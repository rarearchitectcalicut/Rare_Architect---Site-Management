import { api } from "./client";

export const delayApi = {
    list: async (params = {}) => (await api.get("delay-reports/", { params })).data,
    get: async (id) => (await api.get(`delay-reports/${id}/`)).data,
    create: async (taskId, payload) => (await api.post(`tasks/${taskId}/delay-reports/`, payload)).data,
    decide: async (id, action, adminComment, extension = false) => (
        await api.post(`delay-reports/${id}/${action}${extension ? "-extension" : ""}/`, { admin_comment: adminComment })
    ).data,
};
