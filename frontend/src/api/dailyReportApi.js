import { api } from "./client";

export const dailyReportApi = {
    myRegister: async (params = {}, signal) => (await api.get("my-daily-reports/", { params, signal })).data,
    register: async (params = {}, signal) => (await api.get("daily-reports/", { params, signal })).data,
    saveCorrectionReport: async (projectId, sourceId, plan, onProgress = () => {}) => {
        let step = "Create report draft";
        try {
            if (!plan.draftId) {
                const report = await dailyReportApi.create(projectId, { ...plan.diary, client_id: plan.client_id, source_report: sourceId });
                plan.draftId = report.id;
                onProgress(plan.draftId, step);
            }
            const steps = [
                ...plan.manpower.map((row) => ({ key: `manpower:${row.client_id}`, label: `Manpower: ${row.values.trade}`, run: () => dailyReportApi.saveRow(plan.draftId, "manpower", { ...row.values, client_id: row.client_id }) })),
                ...plan.materials.map((row) => ({ key: `materials:${row.client_id}`, label: `Material: ${row.values.material_name}`, run: () => dailyReportApi.saveRow(plan.draftId, "materials", { ...row.values, client_id: row.client_id }) })),
                ...plan.work.map((row) => ({ key: `work:${row.id}`, label: `Corrected work: ${row.title}`, run: () => dailyReportApi.correct(row.id, { ...row.values, new_daily_report: plan.draftId }) })),
                ...plan.files.map((item) => ({ key: `file:${item.client_id}`, label: `New evidence: ${item.file.name}`, run: () => { const data = new FormData(); data.append("file", item.file); data.append("caption", item.caption); data.append("client_id", item.client_id); return dailyReportApi.upload(plan.draftId, data); } })),
            ];
            for (const item of steps) {
                if (plan.completed.includes(item.key)) continue;
                step = item.label;
                await item.run(); plan.completed.push(item.key); onProgress(plan.draftId, step);
            }
            return plan.draftId;
        } catch (failure) { failure.correctionStep = step; throw failure; }
    },
    correctionSource: async (projectId, reportId, signal) => {
        const report = await dailyReportApi.get(reportId, signal);
        if (report.project !== projectId || report.status !== "SUBMITTED" || !report.correction_summary) throw new Error("Only your own submitted report can prefill corrections in this project.");
        async function records(section) {
            const rows = [];
            for (let page = 1; page <= 20; page++) {
                const data = await dailyReportApi.section(reportId, section, { page, page_size: 100 }, signal);
                const items = Array.isArray(data) ? data : data?.results;
                if (!Array.isArray(items) || (data.count ?? items.length) > 2000) throw new Error("This report is too large to prefill safely. Use individual work corrections instead.");
                if (items.some((item) => item.daily_report !== reportId)) throw new Error("Unexpected source report relationship.");
                rows.push(...items);
                if (Array.isArray(data) || !data.next) return rows;
            }
            throw new Error("Unable to finish loading the source report. No draft has been created.");
        }
        const [work, manpower, materials, attachments] = await Promise.all(["work-entries", "manpower", "materials", "attachments"].map(records));
        return { report, work, manpower, materials, attachments };
    },
    list: async (projectId, params = {}, signal) => (await api.get(`projects/${projectId}/daily-reports/`, { params, signal })).data,
    create: async (projectId, payload) => (await api.post(`projects/${projectId}/daily-reports/`, payload)).data,
    update: async (id, payload) => (await api.patch(`daily-reports/${id}/`, payload)).data,
    deleteDraft: async (id) => (await api.delete(`daily-reports/${id}/`)).data,
    submit: async (id) => (await api.post(`daily-reports/${id}/submit/`)).data,
    section: async (id, section, params = {}, signal) => {
        if (!["work-entries", "manpower", "materials", "attachments"].includes(section)) throw new Error("Unsupported report section.");
        return (await api.get(`daily-reports/${id}/${section}/`, { params, signal })).data;
    },
    saveRow: async (id, section, payload, rowId) => {
        const resources = { "work-entries": "daily-task-work", manpower: "daily-manpower", materials: "daily-materials" };
        if (!resources[section]) throw new Error("Unsupported report section.");
        if (rowId) return (await api.patch(`${resources[section]}/${rowId}/`, payload)).data;
        try { return (await api.post(`daily-reports/${id}/${section}/`, payload)).data; }
        catch (failure) {
            // A lost response must not create a duplicate work entry. Recover only
            // an exact record in this report; retain server validation failures.
            if (section === "work-entries" && !failure.response) {
                const quantity = (value) => {
                    const text = String(value ?? "0");
                    if (!/^\d+(?:\.\d{1,3})?$/.test(text)) return null;
                    const [whole, fraction = ""] = text.split(".");
                    return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
                };
                try {
                    for (let page = 1; page <= 20; page++) {
                        const { data } = await api.get(`daily-reports/${id}/work-entries/`, { params: { page, page_size: 100 } });
                        const rows = Array.isArray(data) ? data : data.results;
                        if (!Array.isArray(rows)) break;
                        const saved = rows.find((row) => row.daily_report === id && row.task === payload.task && !row.correction_of && row.work_description === payload.work_description && (row.location_detail || "") === (payload.location_detail || "") && Boolean(row.completion_claimed) === Boolean(payload.completion_claimed) && quantity(row.quantity_completed_today) !== null && quantity(row.quantity_completed_today) === quantity(payload.quantity_completed_today));
                        if (saved) return saved;
                        if (!data.next) break;
                    }
                } catch { /* Re-throw the original write failure for a safe retry. */ }
            }
            throw failure;
        }
    },
    removeRow: async (section, rowId) => {
        const resources = { "work-entries": "daily-task-work", manpower: "daily-manpower", materials: "daily-materials", attachments: "daily-report-attachments" };
        if (!resources[section]) throw new Error("Unsupported report section.");
        return (await api.delete(`${resources[section]}/${rowId}/`)).data;
    },
    upload: async (id, data) => (await api.post(`daily-reports/${id}/attachments/`, data)).data,
    correct: async (id, payload) => (await api.post(`daily-task-work/${id}/correct/`, payload)).data,
    workQueue: async (params = {}) => (await api.get("daily-task-work/", { params })).data,
    work: async (id) => (await api.get(`daily-task-work/${id}/`)).data,
    get: async (id, signal) => (await api.get(`daily-reports/${id}/`, { signal })).data,
    attachments: async (reportId, params = {}) => (await api.get(`daily-reports/${reportId}/attachments/`, { params })).data,
    downloadAttachment: async (id) => (await api.get(`daily-report-attachments/${id}/download/`, { responseType: "blob" })).data,
    previewAttachment: async (id, signal) => (await api.get(`daily-report-attachments/${id}/download/`, { params: { preview: 1 }, responseType: "blob", signal })).data,
    progress: async (taskId) => (await api.get(`tasks/${taskId}/progress/`)).data,
    decide: async (id, action, note) => (await api.post(`daily-task-work/${id}/${action}/`, { verification_note: note })).data,
};
