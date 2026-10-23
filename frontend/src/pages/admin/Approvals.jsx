
import { useEffect, useMemo, useState } from "react";
import {
    AlertCircle,
    ArrowDownUp,
    Building2,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    Clock3,
    FileText,
    FolderKanban,
    Inbox,
    RefreshCw,
    Search,
    ShieldCheck,
    SlidersHorizontal,
    UserRound,
    X,
    XCircle,
} from "lucide-react";

import { approvalApi } from "../../api/approvalApi";
import { projectApi } from "../../api/projectApi";
import { taskApi } from "../../api/taskApi";
import LoadingScreen from "../../components/LoadingScreen";

const PAGE_SIZE = 8;

const inputClass =
    "h-11 w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-3 text-sm text-[#211E1A] outline-none focus:border-[#B7A58E] focus:ring-4 focus:ring-[#E8DDD0]/50";

const formatText = (value) => {
    if (value === null || value === undefined || value === "") {
        return "Not specified";
    }
    return String(value)
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

function formatDate(value) {
    if (!value) return "Not specified";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function getItems(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.results)) return response.results;
    throw new Error("Unexpected API list response.");
}

async function getAllPages(fetchPage) {
    let page = 1;
    let more = true;
    const items = [];

    while (more) {
        if (page > 500) {
            throw new Error("Pagination limit reached.");
        }

        const result = await fetchPage({ page });
        items.push(...getItems(result));

        more =
            !Array.isArray(result) &&
            Boolean(result?.next);

        page += 1;
    }

    return items;
}

function getError(error, fallback) {
    const data = error?.response?.data;

    if (typeof data?.detail === "string") return data.detail;

    if (Array.isArray(data?.non_field_errors)) {
        return data.non_field_errors.join(" ");
    }

    if (error?.response?.status === 403) {
        return "You do not have permission for this action.";
    }

    if (error?.response?.status === 404) {
        return "This record is no longer available.";
    }

    return fallback;
}

function referenceId(value) {
    if (value && typeof value === "object") {
        return String(value.id ?? value.uuid ?? "");
    }
    return value == null ? "" : String(value);
}

function getTaskRecord(entry) {
    if (entry?.task && typeof entry.task === "object") {
        return entry.task;
    }
    return entry;
}

function getTaskId(entry) {
    const task = getTaskRecord(entry);

    return referenceId(
        task?.id ??
        task?.task_id ??
        entry?.task_id ??
        entry?.task
    );
}

function getProjectId(entry) {
    const task = getTaskRecord(entry);

    return referenceId(
        task?.project_id ??
        task?.project ??
        entry?.project_id ??
        entry?.project
    );
}

function getCreatorName(entry) {
    const task = getTaskRecord(entry);
    const creator =
        task?.created_by ??
        entry?.created_by ??
        task?.supervisor ??
        entry?.supervisor;

    if (typeof creator === "string") {
        return creator;
    }

    if (creator && typeof creator === "object") {
        const name = [
            creator.first_name,
            creator.last_name,
        ].filter(Boolean).join(" ");

        return (
            name ||
            creator.name ||
            creator.username ||
            task?.created_by_name ||
            entry?.created_by_name ||
            "Supervisor"
        );
    }

    return (
        task?.created_by_name ||
        entry?.created_by_name ||
        task?.supervisor_name ||
        entry?.supervisor_name ||
        "Supervisor"
    );
}

function normalTask(entry) {
    const task = getTaskRecord(entry);

    return {
        id: getTaskId(entry),
        raw: entry,
        title: task.title || entry.title || "Untitled Task",
        projectId: getProjectId(entry),
        projectName:
            task.project_name || entry.project_name || "",
        creator: getCreatorName(entry),
        priority: task.priority || entry.priority || "MEDIUM",
        createdAt:
            entry.created_at ||
            task.created_at ||
            entry.submitted_at ||
            "",
        batchId: referenceId(
            task.batch_id ??
            task.batch ??
            entry.batch_id ??
            entry.batch
        ),
    };
}

function normalChange(entry) {
    const task =
        typeof entry.task === "object"
            ? entry.task
            : null;

    return {
        id: referenceId(entry.id),
        raw: entry,
        title:
            task?.title ||
            entry.task_title ||
            entry.title ||
            "Task Change Request",
        projectId: referenceId(
            entry.project_id ??
            entry.project ??
            task?.project_id ??
            task?.project
        ),
        projectName: entry.project_name || "",
        creator:
            entry.requested_by_name ||
            entry.created_by_name ||
            getCreatorName(entry),
        priority: task?.priority || "MEDIUM",
        createdAt:
            entry.created_at ||
            entry.requested_at ||
            "",
        batchId: "",
    };
}

function Meta({ label, value }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#938778]">
                {label}
            </p>
            <p className="mt-1.5 wrap-break-word text-sm font-semibold text-[#211E1A]">
                {value || "Not specified"}
            </p>
        </div>
    );
}

function getChanges(record) {
    if (!record) return [];

    // Support flat or nested proposed-change objects.
    const data =
        record.proposed_changes ||
        record.changes ||
        record.requested_changes ||
        record.proposed_values ||
        {};

    if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data)
    ) {
        return Object.entries(data).filter(
            ([key]) =>
                !["id", "project", "created_by"].includes(key)
        );
    }

    return [];
}

function ApprovalDetails({
    type,
    item,
    detail,
    detailLoading,
    detailError,
    onClose,
    onApprove,
    onReject,
    decisionBusy,
}) {
    const [decision, setDecision] = useState(null);
    const [reason, setReason] = useState("");
    const [documentsOpen, setDocumentsOpen] =
        useState(false);
    const [documents, setDocuments] = useState([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsError, setDocsError] = useState("");

    const currentId = item?.id;

    useEffect(() => {
        setDecision(null);
        setReason("");
        setDocumentsOpen(false);
        setDocuments([]);
        setDocsError("");
    }, [currentId, type]);

    useEffect(() => {
        if (!documentsOpen || !item || type !== "tasks") {
            return;
        }

        let cancelled = false;

        async function fetchDocuments() {
            setDocsLoading(true);
            setDocsError("");

            try {
                const docs = await getAllPages((params) =>
                    taskApi.documents(item.id, params)
                );

                if (!cancelled) setDocuments(docs);
            } catch {
                if (!cancelled) {
                    setDocsError("Unable to load task documents.");
                }
            } finally {
                if (!cancelled) setDocsLoading(false);
            }
        }

        fetchDocuments();
        return () => {
            cancelled = true;
        };
    }, [documentsOpen, item?.id, type]);

    async function downloadDocument(documentRecord) {
        setDocsError("");

        try {
            const blob = await taskApi.downloadDocument(
                documentRecord.id
            );

            const url = URL.createObjectURL(blob);
            const link = window.document.createElement("a");

            link.href = url;
            link.download =
                documentRecord.original_filename ||
                documentRecord.file_name ||
                documentRecord.title ||
                "task-document";

            window.document.body.appendChild(link);
            link.click();
            link.remove();

            window.setTimeout(
                () => URL.revokeObjectURL(url),
                1000
            );
        } catch {
            setDocsError("Unable to download the selected file.");
        }
    }

    if (!item) {
        return (
            <div className="flex min-h-102.5 flex-col items-center justify-center p-7 text-center">
                <span className="rounded-2xl bg-[#F1EADF] p-4 text-[#817669]">
                    <ClipboardCheck size={30} />
                </span>

                <h3 className="mt-4 text-base font-bold text-[#211E1A]">
                    Select an approval
                </h3>

                <p className="mt-2 max-w-xs text-sm leading-6 text-[#817669]">
                    Choose a request from the left to review its details
                    and take action.
                </p>
            </div>
        );
    }

    const record = detail || item.raw;
    const task =
        type === "tasks"
            ? getTaskRecord(record)
            : null;

    const changes = type === "changes"
        ? getChanges(record)
        : [];

    const status =
        type === "tasks"
            ? task?.approval_status || "PENDING"
            : record?.status || "PENDING";

    const canDecide = status === "PENDING";

    const approvalTitle =
        type === "tasks"
            ? "Review Task"
            : "Review Change Request";

    const confirmationLabel =
        type === "tasks"
            ? "Approve Task"
            : "Approve Changes";

    async function submitDecision() {
        if (decision === "reject" && !reason.trim()) return;

        const action = decision;
        setDecision(null);

        if (action === "approve") {
            await onApprove(item.id);
        } else {
            await onReject(item.id, reason.trim());
        }
    }

    return (
        <div className="min-w-0">
            {/* PANEL HEADER */}
            <div className="flex items-start justify-between gap-3 border-b border-[#EEE6DC] p-5 sm:p-6">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#938778]">
                        Admin / Approval Review
                    </p>

                    <h2 className="mt-2 text-lg font-bold text-[#211E1A]">
                        {approvalTitle}
                    </h2>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close selected approval"
                    className="rounded-xl bg-[#F1EADF] p-2.5 text-[#665E53] hover:bg-[#E8DCCB]"
                >
                    <X size={18} />
                </button>
            </div>

            {detailLoading ? (
                <div className="flex items-center gap-3 p-6 text-sm text-[#817669]">
                    <RefreshCw size={17} className="animate-spin" />
                    Loading approval details...
                </div>
            ) : detailError ? (
                <p role="alert" className="p-6 text-sm text-red-700">
                    {detailError}
                </p>
            ) : (
                <>
                    <div className="space-y-5 p-5 sm:p-6">
                        {/* TITLE */}
                        <div>
                            <h3 className="wrap-break-word text-xl font-bold text-[#211E1A]">
                                {task?.title ||
                                    record?.task_title ||
                                    item.title}
                            </h3>

                            <p className="mt-2 text-xs text-[#817669]">
                                <Building2 size={14} className="mr-1 inline" />
                                {item.projectName || "Project"}
                            </p>

                            <span className="mt-3 inline-flex rounded-full bg-[#FFF2D8] px-3 py-1.5 text-[10px] font-bold text-[#94651D]">
                                {formatText(status)}
                            </span>
                        </div>

                        <div className="grid gap-4 rounded-2xl bg-[#F8F4EE] p-4 sm:grid-cols-2">
                            <Meta
                                label="Submitted By"
                                value={item.creator}
                            />
                            <Meta
                                label="Submitted"
                                value={formatDate(item.createdAt)}
                            />
                        </div>

                        {type === "tasks" ? (
                            <>
                                <div className="grid gap-4 rounded-2xl border border-[#EEE6DC] p-4 sm:grid-cols-2">
                                    <Meta
                                        label="Priority"
                                        value={formatText(task.priority)}
                                    />
                                    <Meta
                                        label="Worker / Team"
                                        value={task.worker_name}
                                    />
                                    <Meta
                                        label="Start Date"
                                        value={formatDate(task.start_date)}
                                    />
                                    <Meta
                                        label="End Date"
                                        value={formatDate(task.end_date)}
                                    />
                                    <Meta
                                        label="Measurement Method"
                                        value={formatText(task.measurement_method)}
                                    />
                                    <Meta
                                        label="Planned Quantity"
                                        value={
                                            task.planned_quantity != null
                                                ? `${task.planned_quantity} ${task.measurement_unit || ""}`
                                                : "Not applicable"
                                        }
                                    />
                                    <Meta
                                        label="Batch"
                                        value={
                                            item.batchId
                                                ? `Bulk batch ${item.batchId.slice(0, 8)}`
                                                : "Individual task"
                                        }
                                    />
                                    <Meta
                                        label="Work Status"
                                        value={formatText(task.work_status)}
                                    />
                                </div>

                                <div>
                                    <h4 className="text-sm font-bold text-[#211E1A]">
                                        Description
                                    </h4>
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#817669]">
                                        {task.description ||
                                            "No description provided."}
                                    </p>
                                </div>

                                <div className="rounded-2xl border border-[#C9DFC9] bg-[#F2F8F2] p-4">
                                    <h4 className="flex items-center gap-2 text-sm font-bold text-[#296F40]">
                                        <ShieldCheck size={18} />
                                        Completion Criteria
                                    </h4>

                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#526A54]">
                                        {task.completion_criteria ||
                                            "No completion criteria provided."}
                                    </p>

                                    <p className="mt-3 text-xs leading-5 text-[#526A54]">
                                        Review the measurement baseline carefully:
                                        approving a task also approves its planned
                                        quantity and measurement method.
                                    </p>
                                </div>

                                {/* DOCUMENTS */}
                                <div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setDocumentsOpen((v) => !v)
                                        }
                                        aria-expanded={documentsOpen}
                                        className="flex w-full items-center justify-between rounded-xl border border-[#E4DCCD] bg-[#F8F4EE] px-4 py-3 text-sm font-bold text-[#211E1A]"
                                    >
                                        <span className="flex items-center gap-2">
                                            <FileText size={18} />
                                            Task Documents
                                        </span>

                                        <ChevronDown
                                            size={17}
                                            className={
                                                documentsOpen ? "rotate-180" : ""
                                            }
                                        />
                                    </button>

                                    {documentsOpen && (
                                        <div className="space-y-2 rounded-b-xl border border-t-0 border-[#E4DCCD] p-3">
                                            {docsLoading && (
                                                <p className="text-xs text-[#817669]">
                                                    Loading documents...
                                                </p>
                                            )}

                                            {docsError && (
                                                <p role="alert" className="text-xs text-red-700">
                                                    {docsError}
                                                </p>
                                            )}

                                            {!docsLoading &&
                                                !documents.length &&
                                                !docsError && (
                                                    <p className="text-xs text-[#817669]">
                                                        No documents attached.
                                                    </p>
                                                )}

                                            {documents.map((doc) => (
                                                <button
                                                    key={doc.id}
                                                    type="button"
                                                    onClick={() => downloadDocument(doc)}
                                                    className="flex w-full items-center justify-between gap-2 rounded-lg bg-[#F8F4EE] p-3 text-left hover:bg-[#F1EADF]"
                                                >
                                                    <span className="min-w-0 wrap-break-word text-xs font-semibold text-[#211E1A]">
                                                        {doc.title || doc.file_name || "Document"}
                                                    </span>
                                                    <span className="shrink-0 text-xs font-bold text-[#3565A5]">
                                                        Download
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="rounded-2xl bg-[#F8F4EE] p-4">
                                    <Meta
                                        label="Change Type"
                                        value={formatText(
                                            record.change_type ||
                                            record.request_type ||
                                            "Task Edit"
                                        )}
                                    />

                                    <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#938778]">
                                        Reason for Request
                                    </p>
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#665E53]">
                                        {record.reason ||
                                            record.change_reason ||
                                            "No reason provided."}
                                    </p>
                                </div>

                                <div>
                                    <h4 className="text-sm font-bold text-[#211E1A]">
                                        Requested Changes
                                    </h4>

                                    {changes.length ? (
                                        <div className="mt-3 space-y-2">
                                            {changes.map(([field, newValue]) => {
                                                const oldValues =
                                                    record.old_values ||
                                                    record.current_values ||
                                                    record.previous_values ||
                                                    {};

                                                const oldValue = oldValues[field];

                                                return (
                                                    <div
                                                        key={field}
                                                        className="rounded-xl border border-[#E7DED2] p-4"
                                                    >
                                                        <p className="text-xs font-bold text-[#665E53]">
                                                            {formatText(field)}
                                                        </p>

                                                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                                            <div className="rounded-lg bg-[#FCE9E6] p-3">
                                                                <p className="text-[10px] font-bold text-[#A65B51]">
                                                                    Current
                                                                </p>
                                                                <p className="mt-1 wrap-break-word text-xs text-[#211E1A]">
                                                                    {oldValue == null
                                                                        ? "See current task"
                                                                        : String(oldValue)}
                                                                </p>
                                                            </div>

                                                            <div className="rounded-lg bg-[#E7F2E8] p-3">
                                                                <p className="text-[10px] font-bold text-[#296F40]">
                                                                    Proposed
                                                                </p>
                                                                <p className="mt-1 wrap-break-word text-xs text-[#211E1A]">
                                                                    {newValue == null
                                                                        ? "Empty"
                                                                        : String(newValue)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="mt-3 text-xs leading-5 text-[#817669]">
                                            No structured before/after fields were
                                            returned. Do not approve until the backend
                                            exposes the proposed changes for review.
                                        </p>
                                    )}
                                </div>
                            </>
                        )}

                        {/* DECISION FORM */}
                        {canDecide && !decision && (
                            <div className="grid grid-cols-2 gap-3 border-t border-[#EEE6DC] pt-5">
                                <button
                                    type="button"
                                    disabled={
                                        Boolean(decisionBusy) ||
                                        Boolean(detailError) ||
                                        detailLoading ||
                                        (type === "changes" && !changes.length)
                                    }
                                    onClick={() => setDecision("approve")}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E7F2E8] px-4 py-3 text-sm font-bold text-[#296F40] transition-colors hover:bg-[#D4EAD9] disabled:opacity-50"
                                >
                                    <Check size={18} />
                                    Approve
                                </button>

                                <button
                                    type="button"
                                    disabled={
                                        Boolean(decisionBusy) ||
                                        Boolean(detailError) ||
                                        detailLoading
                                    }
                                    onClick={() => setDecision("reject")}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FCE9E6] px-4 py-3 text-sm font-bold text-[#B5473E] transition-colors hover:bg-[#F9D7D1] disabled:opacity-50"
                                >
                                    <XCircle size={18} />
                                    Reject
                                </button>
                            </div>
                        )}

                        {canDecide && decision && (
                            <div className="space-y-3 rounded-2xl border border-[#E7DED2] bg-[#F8F4EE] p-4">
                                <h4 className="text-sm font-bold text-[#211E1A]">
                                    {decision === "approve"
                                        ? `Confirm ${confirmationLabel}`
                                        : "Reject with Reason"}
                                </h4>

                                <p className="text-xs leading-5 text-[#817669]">
                                    {decision === "approve"
                                        ? "Confirm you have reviewed the task, schedule and measurement baseline."
                                        : "Explain what the Supervisor must correct. This reason will be recorded in task history."}
                                </p>

                                {decision === "reject" && (
                                    <textarea
                                        value={reason}
                                        onChange={(event) =>
                                            setReason(event.target.value)
                                        }
                                        rows={4}
                                        placeholder="e.g. Planned quantity needs correction before approval..."
                                        aria-label="Rejection reason"
                                        className="w-full resize-y rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] p-3 text-sm outline-none focus:border-[#B7A58E]"
                                    />
                                )}

                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setDecision(null)}
                                        disabled={Boolean(decisionBusy)}
                                        className="rounded-xl border border-[#E4DCCD] px-4 py-2.5 text-xs font-bold text-[#665E53]"
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        type="button"
                                        onClick={submitDecision}
                                        disabled={
                                            Boolean(decisionBusy) ||
                                            (decision === "reject" && !reason.trim())
                                        }
                                        className={`rounded-xl px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50 ${decision === "approve"
                                                ? "bg-[#296F40]"
                                                : "bg-[#B5473E]"
                                            }`}
                                    >
                                        {decision === "approve"
                                            ? "Confirm Approval"
                                            : "Confirm Rejection"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default function AdminApprovals() {
    const [tab, setTab] = useState("tasks");
    const [tasks, setTasks] = useState([]);
    const [changes, setChanges] = useState([]);
    const [projects, setProjects] = useState([]);

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [projectFilter, setProjectFilter] = useState("");
    const [priority, setPriority] = useState("");
    const [sort, setSort] = useState("oldest");
    const [page, setPage] = useState(1);

    const [selectedId, setSelectedId] = useState("");
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");

    const [loading, setLoading] = useState(true);
    const [decisionBusy, setDecisionBusy] = useState("");
    const [error, setError] = useState("");
    const [projectLookupError, setProjectLookupError] =
        useState(false);
    const [notice, setNotice] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    // ==============================================
    // LOAD APPROVAL QUEUES
    // ==============================================

    useEffect(() => {
        let cancelled = false;

        async function loadQueues() {
            setLoading(true);
            setError("");
            setProjectLookupError(false);

            const [taskResult, changeResult, projectResult] =
                await Promise.allSettled([
                    getAllPages((params) =>
                        approvalApi.getTaskApprovals(params)
                    ),
                    getAllPages((params) =>
                        approvalApi.getChangeRequests({
                            ...params,
                            status: "PENDING",
                        })
                    ),
                    getAllPages((params) =>
                        projectApi.getProjects(params)
                    ),
                ]);

            if (cancelled) return;

            if (taskResult.status === "fulfilled") {
                setTasks(
                    taskResult.value
                        .map(normalTask)
                        .filter((item) => Boolean(item.id))
                );
            } else {
                setTasks([]);
            }

            if (changeResult.status === "fulfilled") {
                setChanges(
                    changeResult.value
                        .filter(
                            (entry) =>
                                !entry.status ||
                                entry.status === "PENDING"
                        )
                        .map(normalChange)
                        .filter((item) => Boolean(item.id))
                );
            } else {
                setChanges([]);
            }

            if (projectResult.status === "fulfilled") {
                setProjects(projectResult.value);
            } else {
                setProjects([]);
                setProjectLookupError(true);
            }

            if (taskResult.status === "rejected") {
                setError(
                    "Unable to load pending task approvals."
                );
            } else if (
                changeResult.status === "rejected"
            ) {
                setError(
                    "Task approvals are available, but change requests could not be loaded."
                );
            }

            setLoading(false);
        }

        loadQueues();

        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    // ==============================================
    // PROJECT / CATEGORY LOOKUP
    // ==============================================

    const projectMap = useMemo(
        () =>
            new Map(
                projects.map((project) => [
                    String(project.id),
                    project,
                ])
            ),
        [projects]
    );

    const categories = useMemo(() => {
        const map = new Map();

        projects.forEach((project) => {
            const id = referenceId(project.category);
            if (!id) return;

            map.set(
                id,
                project.category_name ||
                project.category?.name ||
                "Category"
            );
        });

        return [...map.entries()].sort((a, b) =>
            a[1].localeCompare(b[1])
        );
    }, [projects]);

    const projectOptions = useMemo(
        () =>
            [...projects].sort((a, b) =>
                (a.name || "").localeCompare(b.name || "")
            ),
        [projects]
    );

    // ==============================================
    // ENRICH ROWS
    // ==============================================

    const activeRows = useMemo(() => {
        const entries = tab === "tasks" ? tasks : changes;

        return entries.map((item) => {
            const project = projectMap.get(item.projectId);

            return {
                ...item,
                projectName:
                    item.projectName ||
                    project?.name ||
                    "Project unavailable",
                categoryId:
                    referenceId(project?.category),
                categoryName:
                    project?.category_name || "",
            };
        });
    }, [tab, tasks, changes, projectMap]);

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();

        const result = activeRows.filter((item) => {
            const text = [
                item.title,
                item.projectName,
                item.categoryName,
                item.creator,
                item.priority,
                item.batchId,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return (
                text.includes(q) &&
                (!category || item.categoryId === category) &&
                (!projectFilter ||
                    item.projectId === projectFilter) &&
                (!priority || item.priority === priority)
            );
        });

        result.sort((a, b) => {
            if (sort === "newest") {
                return String(b.createdAt).localeCompare(
                    String(a.createdAt)
                );
            }

            if (sort === "title") {
                return a.title.localeCompare(b.title);
            }

            if (sort === "project") {
                return a.projectName.localeCompare(
                    b.projectName
                );
            }

            if (sort === "priority") {
                const weight = {
                    URGENT: 4,
                    HIGH: 3,
                    MEDIUM: 2,
                    LOW: 1,
                };

                return (
                    (weight[b.priority] || 0) -
                    (weight[a.priority] || 0)
                );
            }

            return String(a.createdAt).localeCompare(
                String(b.createdAt)
            );
        });

        return result;
    }, [
        activeRows,
        search,
        category,
        projectFilter,
        priority,
        sort,
    ]);

    const pageCount = Math.max(
        1,
        Math.ceil(filteredRows.length / PAGE_SIZE)
    );

    const safePage = Math.min(page, pageCount);

    const pageRows = filteredRows.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );

    const selectedItem =
        activeRows.find((item) => item.id === selectedId) ||
        null;

    // ==============================================
    // DETAIL LOADING
    // ==============================================

    useEffect(() => {
        if (!selectedId) {
            setDetail(null);
            setDetailError("");
            return;
        }

        let cancelled = false;

        async function loadDetail() {
            setDetailLoading(true);
            setDetailError("");
            setDetail(null);

            try {
                const result =
                    tab === "tasks"
                        ? await taskApi.get(selectedId)
                        : await approvalApi.getChangeRequest(
                            selectedId
                        );

                if (!cancelled) setDetail(result);
            } catch (err) {
                if (!cancelled) {
                    setDetailError(
                        getError(
                            err,
                            "Unable to retrieve the selected approval."
                        )
                    );
                }
            } finally {
                if (!cancelled) {
                    setDetailLoading(false);
                }
            }
        }

        loadDetail();

        return () => {
            cancelled = true;
        };
    }, [selectedId, tab, refreshKey]);

    // ==============================================
    // FILTER ACTIONS
    // ==============================================

    function setFilter(setter, value) {
        setter(value);
        setPage(1);
        setSelectedId("");
    }

    function switchTab(next) {
        setTab(next);
        setPage(1);
        setSelectedId("");
        setPriority("");
        setNotice("");
    }

    function clearFilters() {
        setSearch("");
        setCategory("");
        setProjectFilter("");
        setPriority("");
        setSort("oldest");
        setPage(1);
        setSelectedId("");
    }

    // ==============================================
    // DECISION ACTIONS
    // ==============================================

    async function decide(kind, id, reason = "") {
        if (decisionBusy) return;

        setDecisionBusy(
            kind === "approve"
                ? "Approving request..."
                : "Rejecting request..."
        );
        setError("");

        try {
            if (tab === "tasks") {
                if (kind === "approve") {
                    await approvalApi.approveTask(id);
                } else {
                    await approvalApi.rejectTask(id, reason);
                }
            } else if (kind === "approve") {
                await approvalApi.approveChange(id);
            } else {
                await approvalApi.rejectChange(id, reason);
            }

            setNotice(
                kind === "approve"
                    ? "Request approved successfully."
                    : "Request rejected. The reason has been submitted."
            );

            setSelectedId("");
            setDetail(null);

            // Load fresh pending queues from Django.
            setRefreshKey((previous) => previous + 1);
        } catch (err) {
            setError(
                getError(
                    err,
                    "Unable to process this approval. Please retry."
                )
            );
        } finally {
            setDecisionBusy("");
        }
    }

    const hasFilters =
        Boolean(search || category || projectFilter || priority) ||
        sort !== "oldest";

    return (
        <div className="space-y-6 pb-8">
            {(loading || decisionBusy) && (
                <LoadingScreen
                    message={
                        decisionBusy ||
                        "Loading Admin approvals..."
                    }
                />
            )}

            {/* PAGE HEADER */}
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#948778]">
                        Admin / Workflow Management
                    </p>

                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                        Approval Center
                    </h1>

                    <p className="mt-2 max-w-xl text-sm leading-6 text-[#817669]">
                        Review Supervisor task submissions, validate
                        project plans, and process change requests.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setRefreshKey((v) => v + 1)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-4 py-3 text-sm font-semibold text-[#211E1A] hover:bg-[#F1EADF] disabled:opacity-50"
                >
                    <RefreshCw size={17} />
                    Refresh Queue
                </button>
            </header>

            {/* QUEUE SUMMARY */}
            <div className="grid gap-3 sm:grid-cols-3">
                {[
                    {
                        label: "Pending Tasks",
                        value: tasks.length,
                        icon: ClipboardCheck,
                        tone: "bg-[#FFF2D8] text-[#94651D]",
                    },
                    {
                        label: "Change Requests",
                        value: changes.length,
                        icon: ArrowDownUp,
                        tone: "bg-[#E9F0FC] text-[#3565A5]",
                    },
                    {
                        label: "Total Waiting",
                        value: tasks.length + changes.length,
                        icon: Inbox,
                        tone: "bg-[#F0EAF8] text-[#7C5BA4]",
                    },
                ].map((summary) => {
                    const Icon = summary.icon;

                    return (
                        <div
                            key={summary.label}
                            className="group rounded-[20px] border border-[#E7DED2] bg-[#FFFDFA] p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-xs text-[#817669]">
                                    {summary.label}
                                </p>

                                <span
                                    className={`rounded-xl p-2.5 transition-transform group-hover:rotate-[-5deg] ${summary.tone}`}
                                >
                                    <Icon size={20} />
                                </span>
                            </div>

                            <p className="mt-3 text-3xl font-bold text-[#211E1A]">
                                {loading ? "—" : summary.value}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* TABS */}
            <div className="inline-flex w-full gap-2 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-2 sm:w-auto">
                {[
                    {
                        id: "tasks",
                        label: "Task Approvals",
                        count: tasks.length,
                    },
                    {
                        id: "changes",
                        label: "Change Requests",
                        count: changes.length,
                    },
                ].map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        onClick={() => switchTab(option.id)}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition-colors sm:flex-none sm:text-sm ${tab === option.id
                                ? "bg-[#211E1A] text-white"
                                : "text-[#817669] hover:bg-[#F1EADF]"
                            }`}
                    >
                        {option.label}
                        <span
                            className={`rounded-full px-2 py-0.5 text-[10px] ${tab === option.id
                                    ? "bg-white/20 text-white"
                                    : "bg-[#F1EADF] text-[#665E53]"
                                }`}
                        >
                            {option.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* SEARCH & FILTER */}
            <section className="rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2">
                    <SlidersHorizontal
                        size={18}
                        className="text-[#817669]"
                    />

                    <h2 className="text-sm font-bold text-[#211E1A]">
                        Find an Approval
                    </h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_170px_140px_160px]">
                    <div className="relative">
                        <Search
                            size={17}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#948778]"
                        />

                        <input
                            type="search"
                            value={search}
                            onChange={(e) =>
                                setFilter(setSearch, e.target.value)
                            }
                            placeholder="Task, project or Supervisor..."
                            aria-label="Search approvals"
                            className={`${inputClass} pl-10`}
                        />
                    </div>

                    <select
                        value={category}
                        onChange={(e) =>
                            setFilter(setCategory, e.target.value)
                        }
                        disabled={projectLookupError}
                        aria-label="Filter by category"
                        className={inputClass}
                    >
                        <option value="">All Categories</option>
                        {categories.map(([id, name]) => (
                            <option key={id} value={id}>
                                {name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={projectFilter}
                        onChange={(e) =>
                            setFilter(setProjectFilter, e.target.value)
                        }
                        disabled={projectLookupError}
                        aria-label="Filter by project"
                        className={inputClass}
                    >
                        <option value="">All Projects</option>

                        {projectOptions.map((project) => (
                            <option
                                key={project.id}
                                value={String(project.id)}
                            >
                                {project.name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={priority}
                        onChange={(e) =>
                            setFilter(setPriority, e.target.value)
                        }
                        aria-label="Filter by priority"
                        className={inputClass}
                    >
                        <option value="">All Priorities</option>
                        <option value="URGENT">Urgent</option>
                        <option value="HIGH">High</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="LOW">Low</option>
                    </select>

                    <select
                        value={sort}
                        onChange={(e) =>
                            setFilter(setSort, e.target.value)
                        }
                        aria-label="Sort approvals"
                        className={inputClass}
                    >
                        <option value="oldest">Oldest First</option>
                        <option value="newest">Newest First</option>
                        <option value="priority">Highest Priority</option>
                        <option value="project">Project A–Z</option>
                        <option value="title">Task A–Z</option>
                    </select>
                </div>

                {hasFilters && (
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#817669] hover:text-[#211E1A]"
                    >
                        <X size={14} />
                        Clear Filters
                    </button>
                )}

                {projectLookupError && (
                    <p className="mt-3 text-xs text-[#A97518]">
                        Project/category filters are temporarily unavailable.
                        Approval review is still accessible.
                    </p>
                )}
            </section>

            {notice && (
                <div
                    role="status"
                    className="flex items-start gap-3 rounded-xl bg-[#E7F2E8] p-4 text-sm text-[#296F40]"
                >
                    <CheckCircle2 size={19} className="shrink-0" />
                    <span className="flex-1">{notice}</span>
                    <button
                        type="button"
                        onClick={() => setNotice("")}
                        aria-label="Dismiss notice"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {error && (
                <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    {error}
                </div>
            )}

            {/* MAIN REVIEW WORKSPACE */}
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
                {/* LEFT: QUEUE */}
                <section className="min-w-0 overflow-hidden rounded-[23px] border border-[#E7DED2] bg-[#FFFDFA]">
                    <div className="border-b border-[#EEE6DC] p-5">
                        <h2 className="text-base font-bold text-[#211E1A]">
                            {tab === "tasks"
                                ? "Pending Task Queue"
                                : "Pending Change Requests"}
                        </h2>
                        <p className="mt-1 text-xs text-[#817669]">
                            {filteredRows.length}{" "}
                            {filteredRows.length === 1
                                ? "request"
                                : "requests"}{" "}
                            matching
                        </p>
                    </div>

                    {!loading && pageRows.length ? (
                        <div className="divide-y divide-[#EEE6DC]">
                            {pageRows.map((item) => {
                                const selected = selectedId === item.id;

                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setSelectedId(item.id)}
                                        className={`group flex w-full items-start gap-3 p-4 text-left transition-colors sm:p-5 ${selected
                                                ? "bg-[#F1EADF]"
                                                : "hover:bg-[#FBF7F1]"
                                            }`}
                                    >
                                        <span
                                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tab === "tasks"
                                                    ? "bg-[#FFF2D8] text-[#94651D]"
                                                    : "bg-[#E9F0FC] text-[#3565A5]"
                                                }`}
                                        >
                                            {tab === "tasks" ? (
                                                <ClipboardCheck size={20} />
                                            ) : (
                                                <ArrowDownUp size={20} />
                                            )}
                                        </span>

                                        <span className="min-w-0 flex-1">
                                            <span className="block wrap-break-word text-sm font-bold text-[#211E1A]">
                                                {item.title}
                                            </span>

                                            <span className="mt-2 flex items-center gap-1.5 text-xs text-[#817669]">
                                                <FolderKanban
                                                    size={14}
                                                    className="shrink-0"
                                                />
                                                <span className="wrap-break-word">
                                                    {item.projectName}
                                                </span>
                                            </span>

                                            <span className="mt-1 flex items-center gap-1.5 text-xs text-[#817669]">
                                                <UserRound
                                                    size={14}
                                                    className="shrink-0"
                                                />
                                                {item.creator}
                                            </span>

                                            <span className="mt-3 flex flex-wrap gap-2">
                                                <span
                                                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.priority === "URGENT"
                                                            ? "bg-[#FCE9E6] text-[#B5473E]"
                                                            : item.priority === "HIGH"
                                                                ? "bg-[#FFF2D8] text-[#94651D]"
                                                                : "bg-[#EEE8E0] text-[#74695D]"
                                                        }`}
                                                >
                                                    {formatText(item.priority)}
                                                </span>

                                                {item.batchId && (
                                                    <span className="rounded-full bg-[#E9F0FC] px-2.5 py-1 text-[10px] font-bold text-[#3565A5]">
                                                        Bulk Submission
                                                    </span>
                                                )}
                                            </span>

                                            <span className="mt-3 flex items-center gap-1.5 text-[11px] text-[#938778]">
                                                <Clock3 size={13} />
                                                {formatDate(item.createdAt)}
                                            </span>
                                        </span>

                                        <ChevronRight
                                            size={18}
                                            className="mt-2 shrink-0 text-[#948778] transition-transform group-hover:translate-x-0.5"
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    ) : !loading ? (
                        <div className="px-6 py-14 text-center">
                            <CheckCircle2
                                size={35}
                                className="mx-auto text-[#368250]"
                            />

                            <h3 className="mt-4 text-base font-bold text-[#211E1A]">
                                {hasFilters
                                    ? "No matching approvals"
                                    : "You're all caught up"}
                            </h3>

                            <p className="mt-2 text-sm text-[#817669]">
                                {hasFilters
                                    ? "Try different filters."
                                    : "No pending requests in this queue."}
                            </p>
                        </div>
                    ) : null}

                    {/* PAGINATION */}
                    {!loading && pageCount > 1 && (
                        <div className="flex items-center justify-between gap-2 border-t border-[#EEE6DC] p-3">
                            <button
                                type="button"
                                disabled={safePage === 1}
                                onClick={() =>
                                    setPage((v) => Math.max(1, v - 1))
                                }
                                className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-35"
                            >
                                <ChevronLeft size={16} />
                                Previous
                            </button>

                            <p className="text-xs text-[#817669]">
                                {safePage} / {pageCount}
                            </p>

                            <button
                                type="button"
                                disabled={safePage >= pageCount}
                                onClick={() =>
                                    setPage((v) =>
                                        Math.min(pageCount, v + 1)
                                    )
                                }
                                className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-35"
                            >
                                Next
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </section>

                {/* RIGHT: REVIEW PANEL */}
                <section className="min-w-0 overflow-hidden rounded-[23px] border border-[#E7DED2] bg-[#FFFDFA] xl:sticky xl:top-5">
                    <ApprovalDetails
                        key={`${tab}-${selectedId || "none"}`}
                        type={tab}
                        item={selectedItem}
                        detail={detail}
                        detailLoading={detailLoading}
                        detailError={detailError}
                        onClose={() => setSelectedId("")}
                        onApprove={(id) =>
                            decide("approve", id)
                        }
                        onReject={(id, reason) =>
                            decide("reject", id, reason)
                        }
                        decisionBusy={decisionBusy}
                    />
                </section>
            </div>
        </div>
    );
}
