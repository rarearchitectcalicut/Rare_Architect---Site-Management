import { useCallback, useEffect, useRef, useState } from "react";
import { approvalApi } from "../api/approvalApi";
import { taskApi } from "../api/taskApi";
import { timelineApi } from "../api/timelineApi";
import { delayApi } from "../api/delayApi";
import { dailyReportApi } from "../api/dailyReportApi";
import { getAllPages } from "../components/approvals/approvalUtils";

export function validationMessage(error, fallback = "Unable to complete this operation.") {
    const data = error?.response?.data;
    function messages(value) {
        if (typeof value === "string") return value;
        if (Array.isArray(value)) return value.map(messages).join(" ");
        if (value && typeof value === "object") return Object.entries(value).map(([key, text]) => `${key === "detail" ? "" : `${key}: `}${messages(text)}`).join(" ");
        return "";
    }
    return messages(data) || fallback;
}

export async function loadReview(item) {
    if (item.requestType === "tasks") {
        const task = await taskApi.get(item.id);
        if (task.approval_status === "REJECTED" && !item.historyId) {
            const history = await getAllPages((params) => taskApi.history(item.id, params));
            const decision = history.find((entry) => entry.action === "REJECTED");
            return { ...task, reviewed_by_name: decision?.actor_name, reviewed_at: decision?.created_at, admin_comment: decision?.details?.reason };
        }
        return task;
    }
    if (["delay", "extension"].includes(item.requestType)) return delayApi.get(item.id);
    if (item.requestType === "work") {
        const record = await dailyReportApi.work(item.id);
        const [report, attachments, progress] = await Promise.all([
            dailyReportApi.get(record.daily_report),
            getAllPages((params) => dailyReportApi.attachments(record.daily_report, params)),
            dailyReportApi.progress(record.task),
        ]);
        return { ...record, report, attachments: attachments.filter((file) => !file.task_work || String(file.task_work) === String(record.id)), progress };
    }
    const record = await approvalApi.getChangeRequest(item.id);
    if (item.requestType !== "timeline" && record.change_type !== "ORDER_CHANGE") return record;
    const timeline = await timelineApi.getTimeline(record.project_id);
    const tasks = timeline.tasks || timeline.results || timeline;
    if (!Array.isArray(tasks)) throw new Error("Invalid project timeline response.");
    const names = new Map(tasks.map((task) => [String(task.id), task.title]));
    const ids = [...new Set([...(record.old_values?.timeline || []), ...(record.new_values?.timeline || [])].map((row) => String(row.task_id)))];
    // Resolve tasks removed from the current timeline so historical requests remain readable.
    await Promise.all(ids.filter((id) => !names.has(id)).map(async (id) => {
        const task = await taskApi.get(id); names.set(id, task.title);
    }));
    return { ...record, taskNames: Object.fromEntries(names) };
}

export async function submitReview(item, action, comment) {
    const approve = action === "approve";
    switch (item.requestType) {
        case "tasks": return approve ? approvalApi.approveTask(item.id, comment) : approvalApi.rejectTask(item.id, comment);
        case "changes": return approve ? approvalApi.approveChange(item.id, comment) : approvalApi.rejectChange(item.id, comment);
        case "timeline": return approve ? timelineApi.approve(item.id, comment) : timelineApi.reject(item.id, comment);
        case "delay": return delayApi.decide(item.id, action, comment);
        case "extension": return delayApi.decide(item.id, action, comment, true);
        case "work": return dailyReportApi.decide(item.id, approve ? "verify" : "reject", comment);
        default: throw new Error("Unsupported request type.");
    }
}

export function useApprovalReview(item, onSuccess) {
    const [result, setResult] = useState({ key: null, record: null, error: "" });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState("");
    const [revision, setRevision] = useState(0);
    const inFlight = useRef(false);
    const currentKey = `${item.queueKey}:${revision}`;
    const loading = result.key !== currentKey;
    const record = loading ? null : result.record;
    useEffect(() => {
        let cancelled = false;
        loadReview(item).then((data) => { if (!cancelled) setResult({ key: currentKey, record: data, error: "" }); })
            .catch((failure) => { if (!cancelled) setResult({ key: currentKey, record: null, error: validationMessage(failure, "Unable to load request details. Refresh to retry.") }); });
        return () => { cancelled = true; };
    }, [item, currentKey]);

    async function decide(action, comment) {
        if (inFlight.current || loading || !record || item.historyId) return false;
        if (action === "reject" && !comment.trim()) { setError("A rejection reason is required."); return false; }
        inFlight.current = true; setBusy(action === "approve" ? "Approving request…" : "Rejecting request…"); setError("");
        try {
            const workflowItem = record.change_type === "ORDER_CHANGE" ? { ...item, requestType: "timeline" } : item;
            await submitReview(workflowItem, action, comment.trim());
            window.dispatchEvent(new Event("rare:notifications-updated"));
            onSuccess();
            return true;
        } catch (failure) {
            setError(validationMessage(failure));
            return false;
        } finally { inFlight.current = false; setBusy(""); }
    }
    const retry = useCallback(() => { setError(""); setRevision((value) => value + 1); }, []);
    return { record, loading, error: error || (!loading && result.error) || "", busy, decide, retry };
}
