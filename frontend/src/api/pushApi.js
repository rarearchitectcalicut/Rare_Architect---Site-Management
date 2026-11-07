import { api } from "./client";

const path = "notifications/push/";
export const pushApi = {
    publicKey: async () => (await api.get(`${path}public-key/`, { timeout: 8000 })).data,
    register: async (subscription) => (await api.post(`${path}subscription/`, subscription, { timeout: 8000 })).data,
    status: async (endpoint) => (await api.post(`${path}subscription/status/`, { endpoint }, { timeout: 8000 })).data,
    remove: async (endpoint) => api.delete(`${path}subscription/`, { data: { endpoint }, timeout: 3000 }),
};
