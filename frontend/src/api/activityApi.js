import { api } from "./client";

export const activityApi = {
    list: async (params = {}, signal) => (await api.get("activity/", { params, signal })).data,
};

export function activityPage(response) {
    if (Array.isArray(response)) return { rows: response, count: response.length, next: false, previous: false, paginated: false };
    if (!Array.isArray(response?.results) || !Number.isInteger(response.count) || response.count < 0) {
        throw new Error("Unexpected activity response. Please try again.");
    }
    return { rows: response.results, count: response.count, next: Boolean(response.next), previous: Boolean(response.previous), paginated: true };
}
