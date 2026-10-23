
import { api } from "./client";

// ================================================
// TIMELINE API
// ================================================

export const timelineApi = {
    approve: async (id, comment = "") => (await api.post(`timeline-change-requests/${id}/approve/`, { admin_comment: comment })).data,
    reject: async (id, comment) => (await api.post(`timeline-change-requests/${id}/reject/`, { admin_comment: comment })).data,
    // ----------------------------------------------
    // GET PROJECT TIMELINE
    // ----------------------------------------------

    getTimeline: async (projectId, params = {}) => {
        const { data } = await api.get(
            `projects/${projectId}/timeline/`,
            { params }
        );

        return data;
    },

    // ----------------------------------------------
    // SUBMIT TASK REORDER PROPOSAL
    // ----------------------------------------------
    // payload must match the Django reorder serializer.
    //
    // We will verify its expected fields before
    // connecting the drag-and-drop submit action.
    // Do not assume that sending an array of IDs
    // automatically updates the approved order.

    proposeReorder: async (projectId, payload) => {
        const { data } = await api.post(
            `projects/${projectId}/timeline/reorder/`,
            payload
        );

        return data;
    },

    // ----------------------------------------------
    // GET TIMELINE CHANGE REQUESTS
    // ----------------------------------------------

    getChangeRequests: async (params = {}) => {
        const { data } = await api.get(
            "timeline-change-requests/",
            { params }
        );

        return data;
    },
};
