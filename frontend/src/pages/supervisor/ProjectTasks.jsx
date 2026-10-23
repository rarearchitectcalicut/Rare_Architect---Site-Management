
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
    AlertCircle,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    FileText,
    FolderOpen,
    Layers3,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    SlidersHorizontal,
    UserRound,
    X,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { taskApi } from "../../api/taskApi";

import LoadingScreen from "../../components/LoadingScreen";
import TaskDocuments from "../../components/tasks/TaskDocuments";

import TaskForm from "../../modal/supervisor/TaskForm";
import BulkAddTasks from "../../modal/supervisor/BulkAddTasks";

// =====================================================
// CONSTANTS
// =====================================================

const PAGE_SIZE = 10;

const selectClass = `
  h-12 w-full rounded-xl
  border border-[#E4DCCD]
  bg-[#FFFDFA] px-4
  text-sm text-[#211E1A]
  outline-none
  transition-all duration-200
  focus:border-[#B7A58E]
  focus:ring-4 focus:ring-[#E8DDD0]/50
`;

const priorityColors = {
    LOW: "bg-[#E9F0FC] text-[#3565A5]",
    MEDIUM: "bg-[#F1EADF] text-[#74614D]",
    HIGH: "bg-[#FFF2D8] text-[#94651D]",
    URGENT: "bg-[#FCE9E6] text-[#B5473E]",
};

const approvalColors = {
    PENDING: "bg-[#FFF2D8] text-[#94651D]",
    APPROVED: "bg-[#E7F2E8] text-[#296F40]",
    REJECTED: "bg-[#FCE9E6] text-[#B5473E]",
};

const workColors = {
    NOT_STARTED: "bg-[#F1EADF] text-[#74614D]",
    IN_PROGRESS: "bg-[#E9F0FC] text-[#3565A5]",
    COMPLETED: "bg-[#E7F2E8] text-[#296F40]",
    CANCELLED: "bg-[#FCE9E6] text-[#B5473E]",
};

// =====================================================
// HELPERS
// =====================================================

function extractItems(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.results)) {
        return response.results;
    }

    throw new Error("Unexpected task list response.");
}

async function fetchAllTasks(projectId) {
    const all = [];
    const ids = new Set();

    let page = 1;
    let hasMore = true;

    while (hasMore) {
        if (page > 500) {
            throw new Error("Task pagination limit exceeded.");
        }

        const response = await taskApi.list(projectId, {
            page,
        });

        const items = extractItems(response);

        for (const task of items) {
            const key = String(task.id ?? "");

            if (!key || !ids.has(key)) {
                all.push(task);
                if (key) ids.add(key);
            }
        }

        hasMore =
            !Array.isArray(response) &&
            Boolean(response.next);

        page += 1;
    }

    return all;
}

function formatDate(value) {
    if (!value) return "Not specified";

    const string = String(value);
    const date = new Date(
        `${string.slice(0, 10)}T00:00:00`
    );

    if (Number.isNaN(date.getTime())) {
        return string;
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function nice(value, fallback = "Not specified") {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }

    return String(value)
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getApiError(error, fallback) {
    const data = error?.response?.data;

    if (typeof data?.detail === "string") {
        return data.detail;
    }

    if (Array.isArray(data?.non_field_errors)) {
        return data.non_field_errors.join(" ");
    }

    if (
        error?.response?.status === 403 ||
        error?.response?.status === 404
    ) {
        return "You do not have access to this project's tasks.";
    }

    return fallback;
}

// =====================================================
// STATUS PILL
// =====================================================

function StatusPill({ value, colors }) {
    return (
        <span
            className={`
        inline-flex items-center
        rounded-full px-3 py-1.5
        text-[10px] font-bold
        uppercase tracking-wide
        ${colors[value] ||
                "bg-[#EEE8E0] text-[#74695D]"
                }
      `}
        >
            {nice(value)}
        </span>
    );
}

// =====================================================
// SUMMARY CARD
// =====================================================

function SummaryCard({
    label,
    value,
    icon: Icon,
    tone,
}) {
    return (
        <div
            className="
        group rounded-[20px]
        border border-[#E7DED2]
        bg-[#FFFDFA] p-4
        transition-all duration-300
        hover:-translate-y-0.5
        hover:shadow-[0_10px_25px_rgba(33,30,26,0.06)]
        motion-reduce:transform-none
        sm:p-5
      "
        >
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-[#817669]">
                    {label}
                </p>

                <span
                    className={`
            flex h-11 w-11 shrink-0
            items-center justify-center
            rounded-2xl
            transition-transform duration-300
            group-hover:rotate-[-5deg]
            group-hover:scale-105
            motion-reduce:transform-none
            ${tone}
          `}
                >
                    <Icon size={21} strokeWidth={1.8} />
                </span>
            </div>

            <p className="mt-3 text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                {value}
            </p>
        </div>
    );
}

// =====================================================
// TASK DETAIL ITEM
// =====================================================

function DetailItem({ label, value }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#938778]">
                {label}
            </p>

            <p className="mt-2 break-words text-sm font-semibold text-[#211E1A]">
                {value === null ||
                    value === undefined ||
                    value === ""
                    ? "Not specified"
                    : value}
            </p>
        </div>
    );
}

// =====================================================
// EXPANDED TASK DETAILS
// =====================================================

function ExpandedTask({
    task,
    taskId,
    loading,
    error,
    onRetry,
    onEdit,
}) {
    const [documentsOpen, setDocumentsOpen] =
        useState(false);

    // Keep this accordion state local to the task.
    // The parent supplies key={taskId}, so opening a
    // different task resets the documents dropdown.

    if (loading) {
        return (
            <div className="border-t border-[#EEE6DC] p-6">
                <div className="flex items-center gap-3 text-sm text-[#817669]">
                    <RefreshCw
                        size={18}
                        className="animate-spin"
                    />
                    Loading task details...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="border-t border-[#EEE6DC] p-5 sm:p-6">
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle
                            size={19}
                            className="shrink-0 text-red-600"
                        />

                        <div className="min-w-0 flex-1">
                            <p
                                role="alert"
                                className="text-sm text-red-700"
                            >
                                {error}
                            </p>

                            <button
                                type="button"
                                onClick={onRetry}
                                className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-red-700 underline"
                            >
                                <RefreshCw size={14} />
                                Try Again
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!task) return null;

    const quantity =
        task.planned_quantity !== null &&
            task.planned_quantity !== undefined
            ? `${task.planned_quantity} ${task.measurement_unit || ""
                }`.trim()
            : "Not applicable";

    const canRequestEdit = [
        "PENDING",
        "REJECTED",
        "APPROVED",
    ].includes(task.approval_status);

    const editLabel =
        task.approval_status === "REJECTED"
            ? "Correct & Resubmit"
            : task.approval_status === "APPROVED"
                ? "Request Changes"
                : "Edit Task";

    return (
        <div
            id={`task-details-${taskId}`}
            className="border-t border-[#EEE6DC] bg-[#FFFDFA] p-5 sm:p-6"
        >
            {/* DETAIL HEADER */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#948778]">
                        Task Information
                    </p>

                    <h3 className="mt-2 text-lg font-bold text-[#211E1A]">
                        Complete Task Details
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-[#817669]">
                        Scope, schedule, approval, progress measurement
                        and documents.
                    </p>
                </div>

                {canRequestEdit && (
                    <button
                        type="button"
                        onClick={() => onEdit(task)}
                        className="
              group inline-flex items-center gap-2
              rounded-xl border border-[#F0D99A]
              bg-[#FFF5D6] px-4 py-3
              text-xs font-bold text-[#8A620D]
              transition-all duration-200
              hover:-translate-y-0.5
              hover:bg-[#FFE9A8]
              hover:shadow-[0_8px_20px_rgba(178,126,24,0.12)]
            "
                    >
                        <Pencil
                            size={16}
                            className="transition-transform duration-200 group-hover:rotate-[-7deg]"
                        />
                        {editLabel}
                    </button>
                )}
            </div>

            {/* APPROVAL & WORK STATUS */}
            <div className="mt-5 flex flex-wrap gap-3">
                <div className="rounded-xl bg-[#F8F4EE] px-4 py-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#938778]">
                        Approval Status
                    </p>
                    <StatusPill
                        value={task.approval_status}
                        colors={approvalColors}
                    />
                </div>

                <div className="rounded-xl bg-[#F8F4EE] px-4 py-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#938778]">
                        Work Status
                    </p>
                    <StatusPill
                        value={task.work_status}
                        colors={workColors}
                    />
                </div>

                <div className="rounded-xl bg-[#F8F4EE] px-4 py-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#938778]">
                        Priority
                    </p>
                    <StatusPill
                        value={task.priority}
                        colors={priorityColors}
                    />
                </div>
            </div>

            {/* DETAILS GRID */}
            <div className="mt-5 grid gap-5 rounded-[20px] bg-[#F8F4EE] p-5 sm:grid-cols-2 xl:grid-cols-3">
                <DetailItem
                    label="Task Name"
                    value={task.title}
                />

                <DetailItem
                    label="Worker / Team"
                    value={task.worker_name}
                />

                <DetailItem
                    label="Timeline Order"
                    value={
                        task.display_order === null ||
                            task.display_order === undefined
                            ? "Not specified"
                            : String(task.display_order)
                    }
                />

                <DetailItem
                    label="Start Date"
                    value={formatDate(task.start_date)}
                />

                <DetailItem
                    label="End Date"
                    value={formatDate(task.end_date)}
                />

                <DetailItem
                    label="Measurement Method"
                    value={nice(task.measurement_method)}
                />

                <DetailItem
                    label="Planned Quantity"
                    value={quantity}
                />

                <DetailItem
                    label="Created At"
                    value={formatDate(task.created_at)}
                />

                <DetailItem
                    label="Last Updated"
                    value={formatDate(task.updated_at)}
                />
            </div>

            {/* DESCRIPTION & CRITERIA */}
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[18px] border border-[#EEE6DC] bg-[#FFFDFA] p-5">
                    <p className="flex items-center gap-2 text-sm font-bold text-[#211E1A]">
                        <ClipboardList
                            size={18}
                            className="text-[#3565A5]"
                        />
                        Task Description
                    </p>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#817669]">
                        {task.description ||
                            "No task description has been added."}
                    </p>
                </div>

                <div className="rounded-[18px] border border-[#EEE6DC] bg-[#FFFDFA] p-5">
                    <p className="flex items-center gap-2 text-sm font-bold text-[#211E1A]">
                        <CheckCircle2
                            size={18}
                            className="text-[#368250]"
                        />
                        Completion Criteria
                    </p>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#817669]">
                        {task.completion_criteria ||
                            "No completion criteria specified."}
                    </p>
                </div>
            </div>

            {/* DOCUMENTS ACCORDION */}
            <div className="mt-5">
                <button
                    type="button"
                    aria-expanded={documentsOpen}
                    aria-controls={`task-documents-${taskId}`}
                    onClick={() =>
                        setDocumentsOpen((previous) => !previous)
                    }
                    className="
            group flex w-full items-center
            justify-between gap-3
            rounded-[18px]
            border border-[#E4DCCD]
            bg-[#F8F4EE] px-5 py-4
            text-left transition-all duration-200
            hover:border-[#CBBBA9]
            hover:bg-[#F1EADF]
          "
                >
                    <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0EAF8] text-[#7C5BA4]">
                            <FolderOpen size={21} />
                        </span>

                        <span className="min-w-0">
                            <span className="block text-sm font-bold text-[#211E1A]">
                                Documents & Drawings
                            </span>

                            <span className="mt-1 block text-xs text-[#817669]">
                                View, upload, download and manage file versions
                            </span>
                        </span>
                    </span>

                    <ChevronDown
                        size={19}
                        className={`
              shrink-0 text-[#817669]
              transition-transform duration-200
              ${documentsOpen ? "rotate-180" : ""}
            `}
                    />
                </button>

                {documentsOpen && (
                    <div id={`task-documents-${taskId}`}>
                        <TaskDocuments
                            key={taskId}
                            taskId={taskId}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

// =====================================================
// TASK LIST CARD
// =====================================================

function TaskCard({
    task,
    expanded,
    onToggle,
    expandedTask,
    detailLoading,
    detailError,
    onDetailRetry,
    onEdit,
}) {
    return (
        <article
            className={`
        overflow-hidden rounded-[22px]
        border bg-[#FFFDFA]
        transition-all duration-300
        hover:shadow-[0_10px_25px_rgba(33,30,26,0.06)]
        ${expanded
                    ? "border-[#C9B9A6]"
                    : "border-[#E7DED2] hover:border-[#C9B9A6]"
                }
      `}
        >
            <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`task-details-${task.id}`}
                onClick={onToggle}
                className="
          group flex w-full items-start
          gap-3 p-4 text-left
          transition-colors hover:bg-[#FCF9F4]
          sm:gap-4 sm:p-6
        "
            >
                {/* TASK ICON */}
                <span
                    className="
            flex h-11 w-11 shrink-0
            items-center justify-center
            rounded-2xl bg-[#E9F0FC]
            text-[#3565A5]
            transition-transform duration-300
            group-hover:rotate-[-5deg]
            sm:h-12 sm:w-12
          "
                >
                    <ClipboardList size={22} strokeWidth={1.8} />
                </span>

                {/* TASK CONTENT */}
                <span className="min-w-0 flex-1">
                    <span className="block break-words text-base font-bold text-[#211E1A]">
                        {task.title || "Untitled Task"}
                    </span>

                    {task.description && (
                        <span className="mt-2 line-clamp-2 block text-xs leading-5 text-[#817669]">
                            {task.description}
                        </span>
                    )}

                    <span className="mt-3 flex flex-wrap gap-2">
                        <StatusPill
                            value={task.approval_status}
                            colors={approvalColors}
                        />

                        <StatusPill
                            value={task.priority}
                            colors={priorityColors}
                        />

                        {task.work_status && (
                            <StatusPill
                                value={task.work_status}
                                colors={workColors}
                            />
                        )}
                    </span>

                    <span className="mt-4 grid gap-2 text-xs text-[#817669] sm:grid-cols-2">
                        <span className="flex min-w-0 items-start gap-2">
                            <UserRound
                                size={15}
                                className="mt-0.5 shrink-0"
                            />
                            <span className="break-words">
                                {task.worker_name ||
                                    "No worker / team specified"}
                            </span>
                        </span>

                        <span className="flex min-w-0 items-start gap-2">
                            <CalendarDays
                                size={15}
                                className="mt-0.5 shrink-0"
                            />

                            <span className="break-words">
                                {formatDate(task.start_date)}
                                {" → "}
                                {formatDate(task.end_date)}
                            </span>
                        </span>
                    </span>

                    <span className="mt-4 block text-xs font-semibold text-[#665E53]">
                        {expanded
                            ? "Hide task details"
                            : "View complete task details"}
                    </span>
                </span>

                {/* EXPAND ARROW */}
                <ChevronDown
                    size={20}
                    className={`
            mt-2 shrink-0 text-[#817669]
            transition-transform duration-200
            ${expanded ? "rotate-180" : ""}
          `}
                />
            </button>

            {expanded && (
                <ExpandedTask
                    key={task.id}
                    taskId={task.id}
                    task={expandedTask}
                    loading={detailLoading}
                    error={detailError}
                    onRetry={onDetailRetry}
                    onEdit={onEdit}
                />
            )}
        </article>
    );
}

// =====================================================
// SUPERVISOR PROJECT TASKS PAGE
// =====================================================

export default function SupervisorProjectTasks() {
    const { projectId } = useParams();

    // ---------------------------------------------
    // PROJECT & TASK DATA
    // ---------------------------------------------

    const [project, setProject] = useState(null);
    const [tasks, setTasks] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [refreshKey, setRefreshKey] = useState(0);

    // ---------------------------------------------
    // FILTERS
    // ---------------------------------------------

    const [search, setSearch] = useState("");
    const [approval, setApproval] = useState("");
    const [priority, setPriority] = useState("");
    const [workStatus, setWorkStatus] = useState("");
    const [sort, setSort] = useState("order");
    const [page, setPage] = useState(1);

    // ---------------------------------------------
    // EXPANDED TASK
    // ---------------------------------------------

    const [expandedId, setExpandedId] = useState(null);
    const [expandedTask, setExpandedTask] = useState(null);

    const [detailLoading, setDetailLoading] =
        useState(false);

    const [detailError, setDetailError] = useState("");

    const [detailRefreshKey, setDetailRefreshKey] =
        useState(0);

    // ---------------------------------------------
    // MODALS
    // ---------------------------------------------

    const [formOpen, setFormOpen] = useState(false);
    const [editingTask, setEditingTask] = useState(null);

    const [bulkOpen, setBulkOpen] = useState(false);

    // ---------------------------------------------
    // SUCCESS NOTIFICATION
    // ---------------------------------------------

    const [notice, setNotice] = useState("");

    // =====================================================
    // LOAD PROJECT AND TASKS
    // =====================================================

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError("");

            try {
                const [projectData, taskData] = await Promise.all([
                    projectApi.getProjectOverview(projectId),
                    fetchAllTasks(projectId),
                ]);

                if (cancelled) return;

                setProject(projectData);
                setTasks(taskData);
            } catch (err) {
                if (cancelled) return;

                setError(
                    getApiError(
                        err,
                        "Unable to load project tasks. Please try again."
                    )
                );
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [projectId, refreshKey]);

    // =====================================================
    // LOAD EXPANDED TASK DETAILS
    // =====================================================

    useEffect(() => {
        if (!expandedId) return;

        let cancelled = false;

        async function loadDetails() {
            setDetailLoading(true);
            setDetailError("");

            try {
                const result = await taskApi.get(expandedId);

                if (cancelled) return;

                setExpandedTask(result);
            } catch (err) {
                if (cancelled) return;

                setDetailError(
                    getApiError(
                        err,
                        "Unable to load complete task details."
                    )
                );
            } finally {
                if (!cancelled) {
                    setDetailLoading(false);
                }
            }
        }

        loadDetails();

        return () => {
            cancelled = true;
        };
    }, [expandedId, detailRefreshKey]);

    // When switching projects, reset the task panel
    // and prevent another project's details showing.
    useEffect(() => {
        setExpandedId(null);
        setExpandedTask(null);
        setSearch("");
        setApproval("");
        setPriority("");
        setWorkStatus("");
        setPage(1);
        setNotice("");
    }, [projectId]);

    // =====================================================
    // SEARCH, FILTER & SORT
    // =====================================================

    const filteredTasks = useMemo(() => {
        const query = search.trim().toLowerCase();

        const result = tasks.filter((task) => {
            const searchable = [
                task.title,
                task.description,
                task.worker_name,
                task.priority,
                task.approval_status,
                task.work_status,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const matchesSearch = searchable.includes(query);

            const matchesApproval =
                !approval ||
                task.approval_status === approval;

            const matchesPriority =
                !priority ||
                task.priority === priority;

            const matchesWorkStatus =
                !workStatus ||
                task.work_status === workStatus;

            return (
                matchesSearch &&
                matchesApproval &&
                matchesPriority &&
                matchesWorkStatus
            );
        });

        result.sort((a, b) => {
            if (sort === "title") {
                return (a.title || "").localeCompare(
                    b.title || ""
                );
            }

            if (sort === "title-desc") {
                return (b.title || "").localeCompare(
                    a.title || ""
                );
            }

            if (sort === "newest") {
                return String(b.created_at || "").localeCompare(
                    String(a.created_at || "")
                );
            }

            if (sort === "oldest") {
                return String(a.created_at || "").localeCompare(
                    String(b.created_at || "")
                );
            }

            if (sort === "start-date") {
                return String(
                    a.start_date || "9999-12-31"
                ).localeCompare(
                    String(b.start_date || "9999-12-31")
                );
            }

            if (sort === "end-date") {
                return String(
                    a.end_date || "9999-12-31"
                ).localeCompare(
                    String(b.end_date || "9999-12-31")
                );
            }

            // Default: Timeline / display order
            const orderA = Number(
                a.display_order ?? 999999
            );
            const orderB = Number(
                b.display_order ?? 999999
            );

            return (
                orderA - orderB ||
                String(a.created_at || "").localeCompare(
                    String(b.created_at || "")
                )
            );
        });

        return result;
    }, [
        tasks,
        search,
        approval,
        priority,
        workStatus,
        sort,
    ]);

    // =====================================================
    // PAGINATION
    // =====================================================

    const pageCount = Math.max(
        1,
        Math.ceil(filteredTasks.length / PAGE_SIZE)
    );

    const safePage = Math.min(page, pageCount);

    const pageTasks = filteredTasks.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );

    // =====================================================
    // SUMMARY VALUES
    // =====================================================

    const totalTasks = tasks.length;

    const pendingTasks = tasks.filter(
        (task) =>
            task.approval_status === "PENDING"
    ).length;

    const approvedTasks = tasks.filter(
        (task) =>
            task.approval_status === "APPROVED"
    ).length;

    const rejectedTasks = tasks.filter(
        (task) =>
            task.approval_status === "REJECTED"
    ).length;

    const workStatuses = useMemo(
        () =>
            [...new Set(
                tasks.map((task) => task.work_status).filter(Boolean)
            )].sort(),
        [tasks]
    );

    // =====================================================
    // ACTIONS
    // =====================================================

    function refreshTasks() {
        setRefreshKey((value) => value + 1);

        // Refresh the currently expanded task too.
        if (expandedId) {
            setDetailRefreshKey((value) => value + 1);
        }
    }

    function toggleTask(taskId) {
        if (expandedId === taskId) {
            setExpandedId(null);
            setExpandedTask(null);
            setDetailError("");
            return;
        }

        setExpandedTask(null);
        setDetailError("");

        setExpandedId(taskId);
    }

    function retryDetails() {
        if (!expandedId) return;

        setExpandedTask(null);
        setDetailRefreshKey((value) => value + 1);
    }

    function openCreate() {
        if (loading || error) return;

        setEditingTask(null);
        setFormOpen(true);
        setNotice("");
    }

    function openEdit(task) {
        if (loading || error || !task) return;

        setEditingTask(task);
        setFormOpen(true);
        setNotice("");
    }

    function closeTaskForm() {
        setFormOpen(false);
        setEditingTask(null);
    }

    function onTaskSaved() {
        const message = !editingTask
            ? "Task created successfully and sent for Admin approval."
            : editingTask.approval_status === "REJECTED"
                ? "Task corrected and resubmitted for Admin approval."
                : editingTask.approval_status === "APPROVED"
                    ? "Task change request submitted for Admin approval."
                    : "Task updated successfully.";

        setNotice(message);
        refreshTasks();
    }

    function onBulkSaved() {
        setNotice(
            "Task batch submitted successfully. Each task is awaiting Admin approval."
        );

        setPage(1);
        refreshTasks();
    }

    function updateFilter(setter, value) {
        setter(value);
        setPage(1);
    }

    function clearFilters() {
        setSearch("");
        setApproval("");
        setPriority("");
        setWorkStatus("");
        setSort("order");
        setPage(1);
    }

    const hasFilters =
        Boolean(search || approval || priority || workStatus) ||
        sort !== "order";

    // =====================================================
    // RENDER
    // =====================================================

    return (
        <div className="space-y-6 pb-8">
            {/* =====================================
          LOADING SCREEN
          ===================================== */}

            {loading && (
                <LoadingScreen message="Loading project tasks..." />
            )}

            {/* =====================================
          BREADCRUMB
          ===================================== */}

            <nav className="flex flex-wrap items-center gap-2 text-xs text-[#817669]">
                <Link
                    to="/supervisor/projects"
                    className="transition-colors hover:text-[#211E1A]"
                >
                    My Projects
                </Link>

                <span>/</span>

                <Link
                    to={`/supervisor/projects/${projectId}`}
                    className="transition-colors hover:text-[#211E1A]"
                >
                    {project?.name || "Project Overview"}
                </Link>

                <span>/</span>

                <span className="font-bold text-[#211E1A]">
                    Tasks
                </span>
            </nav>

            {/* =====================================
          PAGE HEADER
          ===================================== */}

            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#948778]">
                        Supervisor / Project Workspace
                    </p>

                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                        Project Tasks
                    </h1>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#817669]">
                        {project?.name || "Assigned Project"}
                        {" · "}
                        Create tasks, track approvals and manage
                        task-related documents.
                    </p>
                </div>

                {/* TASK CREATION ACTIONS */}
                <div className="flex w-full flex-wrap gap-3 sm:w-auto">
                    <button
                        type="button"
                        onClick={() => {
                            if (loading || error) return;

                            setBulkOpen(true);
                            setNotice("");
                        }}
                        disabled={loading || Boolean(error)}
                        className="
              group inline-flex flex-1 items-center
              justify-center gap-2 rounded-xl
              border border-[#D6C6B2]
              bg-[#F1EADF] px-5 py-3
              text-sm font-semibold text-[#66513D]
              transition-all duration-200
              hover:-translate-y-0.5
              hover:bg-[#E8DCCB]
              hover:shadow-[0_8px_20px_rgba(33,30,26,0.08)]
              disabled:pointer-events-none
              disabled:opacity-50
              sm:flex-none
            "
                    >
                        <Layers3
                            size={18}
                            className="transition-transform duration-200 group-hover:rotate-[-6deg]"
                        />

                        Bulk Add Tasks
                    </button>

                    <button
                        type="button"
                        onClick={openCreate}
                        disabled={loading || Boolean(error)}
                        className="
              inline-flex flex-1 items-center
              justify-center gap-2 rounded-xl
              bg-[#211E1A] px-5 py-3
              text-sm font-semibold text-white
              transition-all duration-200
              hover:-translate-y-0.5
              hover:bg-[#39332B]
              hover:shadow-[0_8px_20px_rgba(33,30,26,0.14)]
              disabled:pointer-events-none
              disabled:opacity-50
              sm:flex-none
            "
                    >
                        <Plus size={18} />

                        Create Task
                    </button>
                </div>
            </header>

            {/* =====================================
          SUCCESS NOTICE
          ===================================== */}

            {notice && (
                <div
                    role="status"
                    className="
            flex items-start gap-3
            rounded-2xl border border-[#C9E2CE]
            bg-[#E7F2E8] p-4
          "
                >
                    <CheckCircle2
                        size={20}
                        className="mt-0.5 shrink-0 text-[#296F40]"
                    />

                    <p className="min-w-0 flex-1 text-sm font-medium leading-6 text-[#296F40]">
                        {notice}
                    </p>

                    <button
                        type="button"
                        onClick={() => setNotice("")}
                        aria-label="Dismiss notification"
                        className="rounded-lg p-1 text-[#296F40] hover:bg-[#D3EAD8]"
                    >
                        <X size={17} />
                    </button>
                </div>
            )}

            {/* =====================================
          SUMMARY CARDS
          ===================================== */}

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <SummaryCard
                    label="Total Tasks"
                    value={error ? "—" : totalTasks}
                    icon={ClipboardList}
                    tone="bg-[#E9F0FC] text-[#3565A5]"
                />

                <SummaryCard
                    label="Pending Approval"
                    value={error ? "—" : pendingTasks}
                    icon={CalendarDays}
                    tone="bg-[#FFF2D8] text-[#94651D]"
                />

                <SummaryCard
                    label="Approved"
                    value={error ? "—" : approvedTasks}
                    icon={CheckCircle2}
                    tone="bg-[#E7F2E8] text-[#296F40]"
                />

                <SummaryCard
                    label="Rejected"
                    value={error ? "—" : rejectedTasks}
                    icon={AlertCircle}
                    tone="bg-[#FCE9E6] text-[#B5473E]"
                />
            </div>

            {/* =====================================
          SEARCH & FILTERS
          ===================================== */}

            <section className="rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2">
                    <SlidersHorizontal
                        size={18}
                        className="text-[#817669]"
                    />

                    <h2 className="text-sm font-bold text-[#211E1A]">
                        Search & Filter Tasks
                    </h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_145px_140px_155px_150px]">
                    {/* SEARCH */}
                    <div className="relative">
                        <Search
                            size={18}
                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#938778]"
                        />

                        <input
                            type="search"
                            value={search}
                            onChange={(event) =>
                                updateFilter(setSearch, event.target.value)
                            }
                            placeholder="Search task, worker, description..."
                            aria-label="Search project tasks"
                            className={`${selectClass} pl-11`}
                        />
                    </div>

                    {/* APPROVAL */}
                    <select
                        value={approval}
                        onChange={(event) =>
                            updateFilter(
                                setApproval,
                                event.target.value
                            )
                        }
                        aria-label="Filter approval status"
                        className={selectClass}
                    >
                        <option value="">All Approvals</option>
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                    </select>

                    {/* PRIORITY */}
                    <select
                        value={priority}
                        onChange={(event) =>
                            updateFilter(
                                setPriority,
                                event.target.value
                            )
                        }
                        aria-label="Filter priority"
                        className={selectClass}
                    >
                        <option value="">All Priorities</option>
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                    </select>

                    {/* WORK STATUS */}
                    <select
                        value={workStatus}
                        onChange={(event) =>
                            updateFilter(
                                setWorkStatus,
                                event.target.value
                            )
                        }
                        aria-label="Filter work status"
                        className={selectClass}
                    >
                        <option value="">All Work Statuses</option>

                        {workStatuses.map((value) => (
                            <option key={value} value={value}>
                                {nice(value)}
                            </option>
                        ))}
                    </select>

                    {/* SORT */}
                    <select
                        value={sort}
                        onChange={(event) =>
                            updateFilter(
                                setSort,
                                event.target.value
                            )
                        }
                        aria-label="Sort tasks"
                        className={selectClass}
                    >
                        <option value="order">Timeline Order</option>
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="title">Title A–Z</option>
                        <option value="title-desc">Title Z–A</option>
                        <option value="start-date">Start Date</option>
                        <option value="end-date">End Date</option>
                    </select>
                </div>

                {hasFilters && (
                    <div className="mt-4 flex justify-end">
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="inline-flex items-center gap-2 text-xs font-bold text-[#817669] transition-colors hover:text-[#211E1A]"
                        >
                            <X size={15} />
                            Clear Filters
                        </button>
                    </div>
                )}
            </section>

            {/* =====================================
          TASK DIRECTORY HEADER
          ===================================== */}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-[#211E1A]">
                        Task Directory
                    </h2>

                    <p className="mt-1 text-xs text-[#817669]">
                        {filteredTasks.length}{" "}
                        {filteredTasks.length === 1
                            ? "matching task"
                            : "matching tasks"}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={refreshTasks}
                    disabled={loading}
                    aria-label="Refresh project tasks"
                    className="
            flex h-11 w-11 items-center
            justify-center rounded-xl
            border border-[#E4DCCD]
            bg-[#FFFDFA]
            text-[#211E1A]
            transition-colors hover:bg-[#F1EADF]
            disabled:opacity-50
          "
                >
                    <RefreshCw size={18} />
                </button>
            </div>

            {/* =====================================
          LIST ERROR
          ===================================== */}

            {!loading && error && (
                <section className="rounded-[22px] border border-red-200 bg-[#FFFDFA] p-6">
                    <div className="flex items-start gap-3">
                        <AlertCircle
                            size={21}
                            className="shrink-0 text-red-600"
                        />

                        <div>
                            <p
                                role="alert"
                                className="text-sm leading-6 text-red-700"
                            >
                                {error}
                            </p>

                            <button
                                type="button"
                                onClick={refreshTasks}
                                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-4 py-2.5 text-xs font-semibold text-white"
                            >
                                <RefreshCw size={16} />
                                Try Again
                            </button>
                        </div>
                    </div>
                </section>
            )}

            {/* =====================================
          TASK CARDS
          ===================================== */}

            {!loading && !error && (
                <>
                    {pageTasks.length > 0 ? (
                        <div className="space-y-4">
                            {pageTasks.map((task) => {
                                const expanded =
                                    String(expandedId) ===
                                    String(task.id);

                                return (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        expanded={expanded}
                                        onToggle={() =>
                                            toggleTask(task.id)
                                        }
                                        expandedTask={
                                            expanded ? expandedTask : null
                                        }
                                        detailLoading={
                                            expanded && detailLoading
                                        }
                                        detailError={
                                            expanded ? detailError : ""
                                        }
                                        onDetailRetry={retryDetails}
                                        onEdit={openEdit}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <section className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] px-5 py-14 text-center">
                            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#948778]">
                                <ClipboardList size={30} />
                            </span>

                            <h3 className="mt-5 text-lg font-bold text-[#211E1A]">
                                {hasFilters
                                    ? "No matching tasks"
                                    : "No tasks added yet"}
                            </h3>

                            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#817669]">
                                {hasFilters
                                    ? "Try adjusting your search or filters."
                                    : "Create a task individually or use Bulk Add Tasks to prepare multiple tasks together."}
                            </p>

                            {hasFilters ? (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="mt-5 rounded-xl border border-[#E4DCCD] px-4 py-3 text-sm font-semibold text-[#211E1A] transition-colors hover:bg-[#F1EADF]"
                                >
                                    Clear Filters
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={openCreate}
                                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white"
                                >
                                    <Plus size={17} />
                                    Create First Task
                                </button>
                            )}
                        </section>
                    )}

                    {/* =====================================
              PAGINATION
              ===================================== */}

                    {pageCount > 1 && (
                        <nav
                            aria-label="Task pagination"
                            className="flex items-center justify-between gap-3 rounded-[20px] border border-[#E7DED2] bg-[#FFFDFA] p-3"
                        >
                            <button
                                type="button"
                                disabled={safePage === 1}
                                onClick={() => {
                                    setExpandedId(null);
                                    setExpandedTask(null);

                                    setPage((previous) =>
                                        Math.max(1, previous - 1)
                                    );
                                }}
                                className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-xs font-bold text-[#211E1A] transition-colors hover:bg-[#F1EADF] disabled:opacity-35 sm:text-sm"
                            >
                                <ChevronLeft size={18} />
                                Previous
                            </button>

                            <p className="text-xs font-semibold text-[#817669]">
                                Page {safePage} of {pageCount}
                            </p>

                            <button
                                type="button"
                                disabled={safePage >= pageCount}
                                onClick={() => {
                                    setExpandedId(null);
                                    setExpandedTask(null);

                                    setPage((previous) =>
                                        Math.min(pageCount, previous + 1)
                                    );
                                }}
                                className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-xs font-bold text-[#211E1A] transition-colors hover:bg-[#F1EADF] disabled:opacity-35 sm:text-sm"
                            >
                                Next
                                <ChevronRight size={18} />
                            </button>
                        </nav>
                    )}
                </>
            )}

            {/* =====================================
          CREATE / EDIT / RESUBMIT TASK MODAL
          ===================================== */}

            <TaskForm
                open={formOpen}
                projectId={projectId}
                task={editingTask}
                onClose={closeTaskForm}
                onSaved={onTaskSaved}
            />

            {/* =====================================
          BULK CREATE TASKS MODAL
          ===================================== */}

            <BulkAddTasks
                open={bulkOpen}
                projectId={projectId}
                onClose={() => setBulkOpen(false)}
                onSaved={onBulkSaved}
            />
        </div>
    );
}
