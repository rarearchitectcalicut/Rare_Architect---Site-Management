export const diaryFields = ["report_date", "weather_condition", "site_condition", "work_summary", "site_notes", "issues", "next_day_plan"];

export function diaryValues(report) {
    return Object.fromEntries(diaryFields.map((field) => [field, report?.[field] || ""]));
}

export function diaryChanged(values, report) {
    return values !== null && diaryFields.some((field) => values[field] !== (report?.[field] || ""));
}

// A retry keeps the same identifier until the server confirms success.
export function retryId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (!globalThis.crypto?.getRandomValues) throw new Error("This browser cannot create a safe retry identifier. Use a current browser to save reports.");
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function prepareReportSubmission(api, id) {
    // Saving a diary or upload can finish before React has rendered its new
    // report/cache keys. Validate persisted data, independently of that render.
    const current = await api.get(id);
    if (current.status === "SUBMITTED") return current;
    if (!current.work_summary?.trim()) throw new Error("Add a work summary or explain why no work took place in Site Update before submitting.");
    const sections = [["work-entries", "task work"], ["manpower", "manpower"], ["materials", "materials"], ["attachments", "photos and files"]];
    await Promise.all(sections.map(async ([section, label]) => {
        try {
            const data = await api.section(id, section, { page: 1, page_size: 25 });
            const rows = Array.isArray(data) ? data : data?.results;
            if (!Array.isArray(rows) || rows.some((row) => row.daily_report !== id)) throw new Error("Unexpected report records.");
        } catch {
            throw new Error(`Could not load ${label} before submission. Your saved draft is unchanged. Check your connection and retry Submit Report.`);
        }
    }));
    return current;
}

export async function submitWithRecovery(api, id) {
    // Reconcile first, including a previous request whose response was lost.
    const current = await api.get(id);
    if (current.status === "SUBMITTED") return current;
    try { return (await api.submit(id)).report; }
    catch (failure) {
        try {
            const latest = await api.get(id);
            if (latest.status === "SUBMITTED") return latest;
        } catch {
            throw new Error("Submission status could not be confirmed. Reconnect and retry to check this report before submitting again.");
        }
        throw failure;
    }
}
