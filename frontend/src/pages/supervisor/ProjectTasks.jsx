
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
    AlertCircle,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
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
import TaskExecutionActions, { TaskProgress } from "../../components/tasks/TaskExecutionActions";
import TaskForm from "../../modal/supervisor/TaskForm";
import BulkAddTasks from "../../modal/supervisor/BulkAddTasks";

const PAGE_SIZE = 10;

const inputClass =
    "h-11 w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-3 text-sm text-[#211E1A] outline-none focus:border-[#B7A58E] focus:ring-4 focus:ring-[#E8DDD0]/50";

const statusColors = {
    LOW: "bg-[#E9F0FC] text-[#3565A5]",
    MEDIUM: "bg-[#F1EADF] text-[#74614D]",
    HIGH: "bg-[#FFF2D8] text-[#94651D]",
    URGENT: "bg-[#FCE9E6] text-[#B5473E]",
    PENDING: "bg-[#FFF2D8] text-[#94651D]",
    APPROVED: "bg-[#E7F2E8] text-[#296F40]",
    REJECTED: "bg-[#FCE9E6] text-[#B5473E]",
    NOT_STARTED: "bg-[#F1EADF] text-[#74614D]",
    IN_PROGRESS: "bg-[#E9F0FC] text-[#3565A5]",
    COMPLETED: "bg-[#E7F2E8] text-[#296F40]",
    DELAYED: "bg-[#FCE9E6] text-[#B5473E]",
    CANCELLED: "bg-[#EEE8E0] text-[#74695D]",
};

function readable(value) {
    if (value === null || value === undefined || value === "") {
        return "Not specified";
    }

    return String(value)
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
    if (!value) return "Not specified";

    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function getError(error, fallback) {
    const data = error?.response?.data;

    if (typeof data?.detail === "string") return data.detail;

    if (Array.isArray(data?.non_field_errors)) {
        return data.non_field_errors.join(" ");
    }

    if (error?.response?.status === 403) {
        return "You do not have permission to access these tasks.";
    }

    if (error?.response?.status === 404) {
        return "The requested resource was not found.";
    }

    return fallback;
}

function getItems(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.results)) return response.results;

    throw new Error("Unexpected task list response.");
}

async function fetchAllTasks(projectId) {
    const tasks = [];
    const seen = new Set();
    let page = 1;

    while (page <= 500) {
        const response = await taskApi.list(projectId, { page });

        for (const task of getItems(response)) {
            const id = String(task.id ?? "");

            if (id && seen.has(id)) continue;

            if (id) seen.add(id);
            tasks.push(task);
        }

        if (Array.isArray(response) || !response?.next) {
            return tasks;
        }

        page += 1;
    }

    throw new Error("Task pagination limit exceeded.");
}

function Badge({ value }) {
    if (!value) return null;

    return (
        <span
            className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${statusColors[value] || "bg-[#EEE8E0] text-[#74695D]"
                }`}
        >
            {readable(value)}
        </span>
    );
}

function SummaryCard({ label, value, icon: Icon, tone }) {
    return (
        <div className="rounded-[20px] border border-[#E7DED2] bg-[#FFFDFA] p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-[#817669]">
                    {label}
                </p>

                <span
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}
                >
                    <Icon size={21} />
                </span>
            </div>

            <p className="mt-3 text-2xl font-bold text-[#211E1A] sm:text-3xl">
                {value}
            </p>
        </div>
    );
}

function DetailItem({ label, value }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#938778]">
                {label}
            </p>

            <p className="mt-2 break-words text-sm font-semibold text-[#211E1A]">
                {value === null || value === undefined || value === ""
                    ? "Not specified"
                    : value}
            </p>
        </div>
    );
}

function ExpandedTask({
    task,
    loading,
    error,
    onRetry,
    onEdit,
    onStatusChanged,
}) {
    const [documentsOpen, setDocumentsOpen] = useState(false);

    if (loading) {
        return (
            <div className="flex items-center gap-3 border-t border-[#EEE6DC] p-6 text-sm text-[#817669]">
                <RefreshCw size={18} className="animate-spin" />
                Loading task details...
            </div>
        );
    }

    if (error) {
        return (
            <div className="border-t border-[#EEE6DC] p-5">
                <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                    <p role="alert">{error}</p>

                    <button
                        type="button"
                        onClick={onRetry}
                        className="mt-3 flex items-center gap-2 font-semibold underline"
                    >
                        <RefreshCw size={15} />
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    if (!task) return null;

    const canEdit = ["PENDING", "REJECTED", "APPROVED"].includes(
        task.approval_status
    );

    const editLabel =
        task.approval_status === "REJECTED"
            ? "Correct & Resubmit"
            : task.approval_status === "APPROVED"
                ? "Request Changes"
                : "Edit Task";

    const quantity =
        task.planned_quantity !== null &&
            task.planned_quantity !== undefined
            ? `${task.planned_quantity} ${task.measurement_unit || ""}`.trim()
            : "Not applicable";

    return (
        <div className="border-t border-[#EEE6DC] bg-[#FFFDFA] p-5 sm:p-6">
            {/* DETAILS HEADER */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#948778]">
                        Task Information
                    </p>

                    <h3 className="mt-2 text-lg font-bold text-[#211E1A]">
                        Complete Task Details
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-[#817669]">
                        Scope, scheduling, approval, execution and documents.
                    </p>
                </div>

                {canEdit && (
                    <button
                        type="button"
                        onClick={() => onEdit(task)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#F0D99A] bg-[#FFF5D6] px-4 py-3 text-xs font-bold text-[#8A620D] transition-colors hover:bg-[#FFE9A8]"
                    >
                        <Pencil size={16} />
                        {editLabel}
                    </button>
                )}
            </div>

            {/* CURRENT STATUSES */}
            <div className="mt-5 flex flex-wrap gap-3">
                {[
                    ["Approval Status", task.approval_status],
                    ["Work Status", task.work_status],
                    ["Priority", task.priority],
                ].map(([label, value]) => (
                    <div
                        key={label}
                        className="rounded-xl bg-[#F8F4EE] px-4 py-3"
                    >
                        <p className="mb-2 text-[10px] font-bold uppercase text-[#938778]">
                            {label}
                        </p>

                        <Badge value={value} />
                    </div>
                ))}
            </div>

            {/* START / COMPLETE TASK */}
            <TaskExecutionActions
                key={task.id}
                task={task}
                onSuccess={onStatusChanged}
            />

            <TaskProgress progress={task.progress} />

            {/* DETAILS GRID */}
            <div className="mt-5 grid gap-5 rounded-[20px] bg-[#F8F4EE] p-5 sm:grid-cols-2 xl:grid-cols-3">
                <DetailItem label="Task Name" value={task.title} />
                <DetailItem
                    label="Worker / Team"
                    value={task.worker_name}
                />
                <DetailItem
                    label="Timeline Order"
                    value={task.display_order}
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
                    value={readable(task.measurement_method)}
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

            {/* DESCRIPTION AND COMPLETION CRITERIA */}
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[18px] border border-[#EEE6DC] p-5">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-[#211E1A]">
                        <ClipboardList size={18} className="text-[#3565A5]" />
                        Task Description
                    </h4>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#817669]">
                        {task.description || "No description provided."}
                    </p>
                </div>

                <div className="rounded-[18px] border border-[#EEE6DC] p-5">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-[#211E1A]">
                        <CheckCircle2 size={18} className="text-[#368250]" />
                        Completion Criteria
                    </h4>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#817669]">
                        {task.completion_criteria ||
                            "No completion criteria specified."}
                    </p>
                </div>
            </div>

            {/* DOCUMENTS */}
            <div className="mt-5">
                <button
                    type="button"
                    aria-expanded={documentsOpen}
                    onClick={() => setDocumentsOpen((value) => !value)}
                    className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-[#E4DCCD] bg-[#F8F4EE] px-5 py-4 text-left transition-colors hover:bg-[#F1EADF]"
                >
                    <span className="flex items-center gap-3">
                        <span className="rounded-xl bg-[#F0EAF8] p-3 text-[#7C5BA4]">
                            <FolderOpen size={21} />
                        </span>

                        <span>
                            <span className="block text-sm font-bold text-[#211E1A]">
                                Documents & Drawings
                            </span>

                            <span className="mt-1 block text-xs text-[#817669]">
                                View, upload, download and manage versions
                            </span>
                        </span>
                    </span>

                    <ChevronDown
                        size={19}
                        className={`shrink-0 text-[#817669] transition-transform ${documentsOpen ? "rotate-180" : ""
                            }`}
                    />
                </button>

                {documentsOpen && (
                    <TaskDocuments taskId={task.id} />
                )}
            </div>
        </div>
    );
}

function TaskCard({
    task,
    expanded,
    onToggle,
    detail,
    detailLoading,
    detailError,
    onRetry,
    onEdit,
    onStatusChanged,
}) {
    return (
        <article className="overflow-hidden rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] transition-all hover:border-[#C9B9A6] hover:shadow-sm">
            <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`task-details-${task.id}`}
                onClick={onToggle}
                className="flex w-full items-start gap-3 p-4 text-left hover:bg-[#FCF9F4] sm:gap-4 sm:p-6"
            >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E9F0FC] text-[#3565A5]">
                    <ClipboardList size={22} />
                </span>

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
                        <Badge value={task.approval_status} />
                        <Badge value={task.priority} />
                        <Badge value={task.work_status} />
                    </span>

                    <TaskProgress progress={task.progress} />
                    <span className="mt-4 grid gap-2 text-xs text-[#817669] sm:grid-cols-2">
                        <span className="flex items-start gap-2">
                            <UserRound size={15} className="shrink-0" />
                            {task.worker_name || "No worker assigned"}
                        </span>

                        <span className="flex items-start gap-2">
                            <CalendarDays size={15} className="shrink-0" />
                            {formatDate(task.start_date)}
                            {" → "}
                            {formatDate(task.end_date)}
                        </span>
                    </span>

                    <span className="mt-4 block text-xs font-semibold text-[#665E53]">
                        {expanded ? "Hide task details" : "View complete task details"}
                    </span>
                </span>

                <ChevronDown
                    size={20}
                    className={`mt-2 shrink-0 text-[#817669] transition-transform ${expanded ? "rotate-180" : ""
                        }`}
                />
            </button>

            {expanded && (
                <div id={`task-details-${task.id}`}>
                    <ExpandedTask
                        key={task.id}
                        task={detail}
                        loading={detailLoading}
                        error={detailError}
                        onRetry={onRetry}
                        onEdit={onEdit}
                        onStatusChanged={onStatusChanged}
                    />
                </div>
            )}
        </article>
    );
}

export default function SupervisorProjectTasks() {
    const { projectId } = useParams();
    const [searchParams] = useSearchParams();
    const linkedTaskId = searchParams.get("task");

    const [project, setProject] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    const [search, setSearch] = useState("");
    const [approval, setApproval] = useState("");
    const [priority, setPriority] = useState("");
    const [workStatus, setWorkStatus] = useState("");
    const [sort, setSort] = useState("order");
    const [page, setPage] = useState(1);

    const [expandedId, setExpandedId] = useState(null);
    const [expandedTask, setExpandedTask] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");
    const [detailRefreshKey, setDetailRefreshKey] = useState(0);

    const [formOpen, setFormOpen] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [notice, setNotice] = useState("");

    // LOAD PROJECT AND TASK LIST
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
                if (!cancelled) {
                    setError(getError(err, "Unable to load project tasks."));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [projectId, refreshKey]);

    // LOAD EXPANDED TASK
    useEffect(() => {
        if (!expandedId) return;

        let cancelled = false;

        async function loadDetail() {
            setDetailLoading(true);
            setDetailError("");
            setExpandedTask(null);

            try {
                const result = await taskApi.get(expandedId);

                if (!cancelled) setExpandedTask(result);
            } catch (err) {
                if (!cancelled) {
                    setDetailError(
                        getError(err, "Unable to load task details.")
                    );
                }
            } finally {
                if (!cancelled) setDetailLoading(false);
            }
        }

        loadDetail();

        return () => {
            cancelled = true;
        };
    }, [expandedId, detailRefreshKey]);

    // RESET WHEN SWITCHING PROJECTS
    useEffect(() => {
        setExpandedId(null);
        setExpandedTask(null);
        setSearch("");
        setApproval("");
        setPriority("");
        setWorkStatus("");
        setSort("order");
        setPage(1);
        setNotice("");
    }, [projectId]);

    // FILTERS AND SORTING
    const filteredTasks = useMemo(() => {
        const query = search.trim().toLowerCase();

        const result = tasks.filter((task) => {
            const text = [
                task.title,
                task.description,
                task.worker_name,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return (
                text.includes(query) &&
                (!approval || task.approval_status === approval) &&
                (!priority || task.priority === priority) &&
                (!workStatus || task.work_status === workStatus)
            );
        });

        result.sort((a, b) => {
            switch (sort) {
                case "title":
                    return String(a.title || "").localeCompare(
                        String(b.title || "")
                    );

                case "title-desc":
                    return String(b.title || "").localeCompare(
                        String(a.title || "")
                    );

                case "newest":
                    return String(b.created_at || "").localeCompare(
                        String(a.created_at || "")
                    );

                case "oldest":
                    return String(a.created_at || "").localeCompare(
                        String(b.created_at || "")
                    );

                case "start-date":
                    return String(a.start_date || "9999-12-31").localeCompare(
                        String(b.start_date || "9999-12-31")
                    );

                case "end-date":
                    return String(a.end_date || "9999-12-31").localeCompare(
                        String(b.end_date || "9999-12-31")
                    );

                default:
                    return (
                        Number(a.display_order ?? 999999) -
                        Number(b.display_order ?? 999999) ||
                        String(a.created_at || "").localeCompare(
                            String(b.created_at || "")
                        )
                    );
            }
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

    const pageCount = Math.max(
        1,
        Math.ceil(filteredTasks.length / PAGE_SIZE)
    );

    const safePage = Math.min(page, pageCount);

    const pageTasks = filteredTasks.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );

    const stats = {
        total: tasks.length,
        pending: tasks.filter(
            (task) => task.approval_status === "PENDING"
        ).length,
        approved: tasks.filter(
            (task) => task.approval_status === "APPROVED"
        ).length,
        rejected: tasks.filter(
            (task) => task.approval_status === "REJECTED"
        ).length,
    };

    const workStatuses = [
        ...new Set(tasks.map((task) => task.work_status).filter(Boolean)),
    ].sort();

    const hasFilters = Boolean(
        search ||
        approval ||
        priority ||
        workStatus ||
        sort !== "order"
    );

    function refreshTasks() {
        setRefreshKey((value) => value + 1);

        if (expandedId) {
            setDetailRefreshKey((value) => value + 1);
        }
    }

    function clearFilters() {
        setSearch("");
        setApproval("");
        setPriority("");
        setWorkStatus("");
        setSort("order");
        setPage(1);
    }

    function updateFilter(setter, value) {
        setter(value);
        setPage(1);
    }

    function toggleTask(taskId) {
        if (String(expandedId) === String(taskId)) {
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
        setDetailRefreshKey((value) => value + 1);
    }

    function openCreate() {
        setEditingTask(null);
        setFormOpen(true);
        setNotice("");
    }

    function openEdit(task) {
        setEditingTask(task);
        setFormOpen(true);
        setNotice("");
    }

    function closeTaskForm() {
        setFormOpen(false);
        setEditingTask(null);
    }

    function handleTaskSaved() {
        const message = !editingTask
            ? "Task created and sent for Admin approval."
            : editingTask.approval_status === "REJECTED"
                ? "Task corrected and resubmitted for approval."
                : editingTask.approval_status === "APPROVED"
                    ? "Task change request submitted for approval."
                    : "Task updated successfully.";

        setNotice(message);
        refreshTasks();
    }

    function handleBulkSaved() {
        setNotice("Task batch submitted for Admin approval.");
        setPage(1);
        refreshTasks();
    }

    function handleStatusChanged(action) {
        setNotice(({ start: "Task started successfully.", complete: "Task completed successfully.", cancel: "Task cancelled successfully." })[action] || "Task updated successfully.");

        refreshTasks();
    }

    // SUPPORT LINKS FROM TIMELINE AND NOTIFICATIONS
    useEffect(() => {
        if (!linkedTaskId || loading || error || !tasks.length) {
            return;
        }

        const index = tasks.findIndex(
            (task) => String(task.id) === String(linkedTaskId)
        );

        if (index === -1) return;

        setSearch("");
        setApproval("");
        setPriority("");
        setWorkStatus("");
        setSort("order");

        const ordered = [...tasks].sort(
            (a, b) =>
                Number(a.display_order ?? 999999) -
                Number(b.display_order ?? 999999) ||
                String(a.created_at || "").localeCompare(
                    String(b.created_at || "")
                )
        );

        const sortedIndex = ordered.findIndex(
            (task) => String(task.id) === String(linkedTaskId)
        );

        setPage(Math.floor(sortedIndex / PAGE_SIZE) + 1);
        setExpandedId(linkedTaskId);
    }, [linkedTaskId, loading, error, tasks]);

    return (
        <div className="space-y-6 pb-8">
            {loading && (
                <LoadingScreen message="Loading project tasks..." />
            )}

            {/* BREADCRUMB */}
            <nav
                aria-label="Breadcrumb"
                className="flex flex-wrap items-center gap-2 text-xs text-[#817669]"
            >
                <Link
                    to="/supervisor/projects"
                    className="hover:text-[#211E1A]"
                >
                    My Projects
                </Link>

                <span>/</span>

                <Link
                    to={`/supervisor/projects/${projectId}`}
                    className="hover:text-[#211E1A]"
                >
                    {project?.name || "Project"}
                </Link>

                <span>/</span>

                <span className="font-bold text-[#211E1A]">
                    Tasks
                </span>
            </nav>

            {/* HEADER */}
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#948778]">
                        Supervisor / Project Workspace
                    </p>

                    <h1 className="mt-2 text-2xl font-bold text-[#211E1A] sm:text-3xl">
                        Project Tasks
                    </h1>

                    <p className="mt-2 text-sm text-[#817669]">
                        {project?.name || "Assigned Project"}
                        {" · "}
                        Create, manage and execute project tasks.
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={() => setBulkOpen(true)}
                        disabled={loading || Boolean(error)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#D6C6B2] bg-[#F1EADF] px-5 py-3 text-sm font-semibold text-[#66513D] hover:bg-[#E8DCCB] disabled:opacity-50"
                    >
                        <Layers3 size={18} />
                        Bulk Add Tasks
                    </button>

                    <button
                        type="button"
                        onClick={openCreate}
                        disabled={loading || Boolean(error)}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white hover:bg-[#39332B] disabled:opacity-50"
                    >
                        <Plus size={18} />
                        Create Task
                    </button>
                </div>
            </header>

            {/* SUCCESS NOTICE */}
            {notice && (
                <div
                    role="status"
                    className="flex items-start gap-3 rounded-2xl border border-[#C9E2CE] bg-[#E7F2E8] p-4"
                >
                    <CheckCircle2
                        size={20}
                        className="shrink-0 text-[#296F40]"
                    />

                    <p className="flex-1 text-sm font-medium text-[#296F40]">
                        {notice}
                    </p>

                    <button
                        type="button"
                        onClick={() => setNotice("")}
                        aria-label="Dismiss message"
                    >
                        <X size={17} className="text-[#296F40]" />
                    </button>
                </div>
            )}

            {/* SUMMARY */}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <SummaryCard
                    label="Total Tasks"
                    value={error ? "—" : stats.total}
                    icon={ClipboardList}
                    tone="bg-[#E9F0FC] text-[#3565A5]"
                />

                <SummaryCard
                    label="Pending Approval"
                    value={error ? "—" : stats.pending}
                    icon={CalendarDays}
                    tone="bg-[#FFF2D8] text-[#94651D]"
                />

                <SummaryCard
                    label="Approved"
                    value={error ? "—" : stats.approved}
                    icon={CheckCircle2}
                    tone="bg-[#E7F2E8] text-[#296F40]"
                />

                <SummaryCard
                    label="Rejected"
                    value={error ? "—" : stats.rejected}
                    icon={AlertCircle}
                    tone="bg-[#FCE9E6] text-[#B5473E]"
                />
            </div>

            {/* SEARCH AND FILTERS */}
            <section className="rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#211E1A]">
                    <SlidersHorizontal size={18} />
                    Search & Filter Tasks
                </h2>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_145px_140px_155px_150px]">
                    <div className="relative">
                        <Search
                            size={17}
                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#938778]"
                        />

                        <input
                            type="search"
                            value={search}
                            onChange={(event) =>
                                updateFilter(setSearch, event.target.value)
                            }
                            placeholder="Search task, worker, description..."
                            aria-label="Search tasks"
                            className={`${inputClass} pl-11`}
                        />
                    </div>

                    <select
                        value={approval}
                        onChange={(event) =>
                            updateFilter(setApproval, event.target.value)
                        }
                        aria-label="Approval status"
                        className={inputClass}
                    >
                        <option value="">All Approvals</option>
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                    </select>

                    <select
                        value={priority}
                        onChange={(event) =>
                            updateFilter(setPriority, event.target.value)
                        }
                        aria-label="Priority"
                        className={inputClass}
                    >
                        <option value="">All Priorities</option>
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                    </select>

                    <select
                        value={workStatus}
                        onChange={(event) =>
                            updateFilter(setWorkStatus, event.target.value)
                        }
                        aria-label="Work status"
                        className={inputClass}
                    >
                        <option value="">All Work Statuses</option>

                        {workStatuses.map((value) => (
                            <option key={value} value={value}>
                                {readable(value)}
                            </option>
                        ))}
                    </select>

                    <select
                        value={sort}
                        onChange={(event) =>
                            updateFilter(setSort, event.target.value)
                        }
                        aria-label="Sort tasks"
                        className={inputClass}
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
                            className="flex items-center gap-2 text-xs font-semibold text-[#817669] hover:text-[#211E1A]"
                        >
                            <X size={15} />
                            Clear Filters
                        </button>
                    </div>
                )}
            </section>

            {/* DIRECTORY HEADER */}
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-[#211E1A]">
                        Task Directory
                    </h2>

                    <p className="mt-1 text-xs text-[#817669]">
                        {filteredTasks.length} matching tasks
                    </p>
                </div>

                <button
                    type="button"
                    onClick={refreshTasks}
                    disabled={loading}
                    aria-label="Refresh tasks"
                    className="rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] p-3 hover:bg-[#F1EADF] disabled:opacity-50"
                >
                    <RefreshCw size={18} />
                </button>
            </div>

            {/* ERROR */}
            {!loading && error && (
                <div className="rounded-2xl border border-red-200 bg-[#FFFDFA] p-5">
                    <p role="alert" className="text-sm text-red-700">
                        {error}
                    </p>

                    <button
                        type="button"
                        onClick={refreshTasks}
                        className="mt-3 flex items-center gap-2 text-sm font-semibold underline"
                    >
                        <RefreshCw size={16} />
                        Try Again
                    </button>
                </div>
            )}

            {/* TASK LIST */}
            {!loading && !error && (
                <>
                    {pageTasks.length > 0 ? (
                        <div className="space-y-4">
                            {pageTasks.map((task) => {
                                const expanded =
                                    String(expandedId) === String(task.id);

                                return (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        expanded={expanded}
                                        onToggle={() => toggleTask(task.id)}
                                        detail={expanded ? expandedTask : null}
                                        detailLoading={expanded && detailLoading}
                                        detailError={expanded ? detailError : ""}
                                        onRetry={retryDetails}
                                        onEdit={openEdit}
                                        onStatusChanged={handleStatusChanged}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <div className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] px-5 py-14 text-center">
                            <ClipboardList
                                size={32}
                                className="mx-auto text-[#948778]"
                            />

                            <h3 className="mt-5 text-lg font-bold text-[#211E1A]">
                                {hasFilters
                                    ? "No matching tasks"
                                    : "No tasks added yet"}
                            </h3>

                            <p className="mt-2 text-sm text-[#817669]">
                                {hasFilters
                                    ? "Try adjusting the filters."
                                    : "Create your first project task to get started."}
                            </p>

                            {hasFilters ? (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="mt-5 rounded-xl border px-4 py-2.5 text-sm font-semibold"
                                >
                                    Clear Filters
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={openCreate}
                                    className="mt-5 rounded-xl bg-[#211E1A] px-4 py-2.5 text-sm font-semibold text-white"
                                >
                                    Create First Task
                                </button>
                            )}
                        </div>
                    )}

                    {/* PAGINATION */}
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
                                    setPage((value) => Math.max(1, value - 1));
                                }}
                                className="flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-[#F1EADF] disabled:opacity-35"
                            >
                                <ChevronLeft size={18} />
                                Previous
                            </button>

                            <span className="text-xs font-semibold text-[#817669]">
                                Page {safePage} of {pageCount}
                            </span>

                            <button
                                type="button"
                                disabled={safePage >= pageCount}
                                onClick={() => {
                                    setExpandedId(null);
                                    setExpandedTask(null);
                                    setPage((value) =>
                                        Math.min(pageCount, value + 1)
                                    );
                                }}
                                className="flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-[#F1EADF] disabled:opacity-35"
                            >
                                Next
                                <ChevronRight size={18} />
                            </button>
                        </nav>
                    )}
                </>
            )}

            {/* EXISTING MODALS */}
            <TaskForm
                open={formOpen}
                projectId={projectId}
                task={editingTask}
                onClose={closeTaskForm}
                onSaved={handleTaskSaved}
            />

            <BulkAddTasks
                open={bulkOpen}
                projectId={projectId}
                onClose={() => setBulkOpen(false)}
                onSaved={handleBulkSaved}
            />
        </div>
    );
}
