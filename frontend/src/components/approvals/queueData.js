import { normalTask, normalChange, referenceId } from "./approvalUtils";

export const delayTypes = ["MATERIAL_DELAY", "WORKER_UNAVAILABLE", "WEATHER", "CLIENT_CHANGE", "SITE_CONDITION", "EQUIPMENT_FAILURE", "APPROVAL_DELAY", "OTHER"];

export const requestLabels = {
    tasks: "Task Approval", changes: "Task Change", timeline: "Timeline Order Change",
    delay: "Delay Report", extension: "Deadline Extension", work: "Daily Work Verification",
};

export const queueLabels = {
    tasks: "Task Approvals", changes: "Task Changes", timeline: "Timeline Changes",
    delays: "Delays & Extensions", work: "Daily Work Verification", history: "Decision History",
};

export function normalizeRequest(type, entry) {
    let item;
    if (type === "tasks") item = normalTask(entry);
    else if (["changes", "timeline"].includes(type)) item = normalChange(entry);
    else item = {
        id: String(entry.id), projectId: referenceId(entry.project_id), projectName: entry.project_name,
        title: entry.task_title, creator: entry.reported_by_name || "Supervisor", batchId: "",
        createdAt: entry.reported_at || entry.created_at, priority: null,
    };
    const extension = type === "extension";
    return {
        ...item, raw: entry, requestType: type, queueKey: `${type}:${entry.id}`,
        title: type === "timeline" ? "Timeline order change" : item.title,
        taskId: referenceId(entry.task) || (type === "tasks" ? item.id : ""),
        status: extension ? entry.extension_status : entry.verification_status || entry.approval_status || entry.status,
        reviewedBy: extension ? entry.extension_reviewed_by_name : entry.verified_by_name || entry.reviewed_by_name,
        reviewedAt: extension ? entry.extension_reviewed_at : entry.verified_at || entry.reviewed_at,
        comment: extension ? entry.extension_admin_comment : entry.verification_note || entry.admin_comment,
        preview: entry.work_description || entry.reason || entry.description,
    };
}

export function taskDecision(entry) {
    return {
        id: String(entry.task), historyId: entry.id, requestType: "tasks", queueKey: `task-decision:${entry.id}`,
        title: entry.task_title, projectId: String(entry.project_id), projectName: entry.project_name,
        creator: entry.actor_name || "Reviewer unavailable", createdAt: entry.created_at,
        reviewedBy: entry.actor_name, reviewedAt: entry.created_at, status: entry.action,
        comment: entry.details?.reason || entry.details?.comment || "", raw: entry, taskId: String(entry.task),
    };
}

export function buildQueues(sources) {
    const changes = sources.changes.filter((entry) => entry.change_type !== "ORDER_CHANGE").map((entry) => normalizeRequest("changes", entry));
    const timeline = sources.timeline.map((entry) => normalizeRequest("timeline", entry));
    const delays = sources.delays.flatMap((entry) => [normalizeRequest("delay", entry), ...(entry.extension_requested ? [normalizeRequest("extension", entry)] : [])]);
    const work = sources.work.map((entry) => normalizeRequest("work", entry));
    return {
        tasks: sources.tasks.map((entry) => normalizeRequest("tasks", entry)),
        changes: changes.filter((item) => item.status === "PENDING"),
        timeline: timeline.filter((item) => item.status === "PENDING"),
        delays: delays.filter((item) => item.status === "PENDING"),
        work: work.filter((item) => item.status === "PENDING"),
        history: [...sources.decisions.map(taskDecision), ...changes, ...timeline, ...delays, ...work]
            .filter((item) => ["APPROVED", "REJECTED", "VERIFIED"].includes(item.status)),
    };
}
