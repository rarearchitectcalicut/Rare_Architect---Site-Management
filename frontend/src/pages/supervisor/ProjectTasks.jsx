import { ProjectSearch } from "../../components/daily-reports/ReportProjectPicker";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Filter,
    Layers3,
    LayoutGrid,
    List,
    Plus,
    RefreshCw,
    X,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { taskApi } from "../../api/taskApi";
import LoadingScreen from "../../components/LoadingScreen";
import TaskForm from "../../modal/supervisor/TaskForm";
import BulkAddTasks from "../../modal/supervisor/BulkAddTasks";
import DelayReportForm from "../../modal/supervisor/DelayReportForm";
import { MobileTaskCard, TaskPageStyles } from "../../components/admin/tasks/AdminTaskCard";

const inputClass =
    "h-11 w-full rounded-xl border border-border bg-surface px-3 text-xs sm:text-sm text-ink outline-none focus:border-border-strong focus:ring-2 focus:ring-pastel-lavender";

function readable(value) {
    if (value === null || value === undefined || value === "") {
        return "Not specified";
    }

    return String(value)
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function canReportDelay(task, project) {
    return task?.approval_status === "APPROVED" &&
        !["COMPLETED", "CANCELLED"].includes(task.work_status) &&
        ["ACTIVE", "MAINTENANCE"].includes(project?.status);
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

function ProjectTaskFilterSheet({
    open,
    onClose,
    approval,
    priority,
    workStatus,
    sort,
    workStatuses,
    onApprovalChange,
    onPriorityChange,
    onWorkStatusChange,
    onSortChange,
    onClearAll,
    triggerRef,
}) {
    const dialogRef = useRef(null);
    const closeRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const dialog = dialogRef.current;
        const trigger = triggerRef.current;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        if (dialog && !dialog.open) dialog.showModal();
        document.body.style.overflow = "hidden";
        closeRef.current?.focus();
        return () => {
            dialog?.close();
            document.body.style.overflow = previousOverflow;
            if (trigger?.isConnected) trigger.focus();
            else previousFocus?.focus?.();
        };
    }, [open, triggerRef]);

    function trapFocus(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
        }
        if (event.key !== "Tab") return;
        const focusable = [...event.currentTarget.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    return (
        <dialog
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-filters-sheet-title"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onKeyDown={trapFocus}
            onClick={(event) => {
                if (event.target === dialogRef.current) onClose();
            }}
            className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 text-ink shadow-[0_-12px_36px_rgba(33,30,26,0.18)] backdrop:bg-overlay/45 min-[1024px]:inset-auto min-[1024px]:top-1/2 min-[1024px]:left-1/2 min-[1024px]:-translate-x-1/2 min-[1024px]:-translate-y-1/2 min-[1024px]:w-[min(28rem,calc(100vw-2rem))] min-[1024px]:rounded-2xl min-[1024px]:shadow-2xl"
        >
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
                <h2 id="task-filters-sheet-title" className="text-base font-semibold text-ink">
                    Filters and sorting
                </h2>
                <button
                    ref={closeRef}
                    type="button"
                    onClick={onClose}
                    aria-label="Close filters"
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-app focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                    <X size={20} aria-hidden="true" />
                </button>
            </div>

            <div className="space-y-4">
                <label className="block text-xs font-semibold text-muted">
                    Approvals
                    <select
                        value={approval}
                        onChange={(e) => onApprovalChange(e.target.value)}
                        aria-label="Approval status"
                        className={`${inputClass} mt-1.5`}
                    >
                        <option value="">All Approvals</option>
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                    </select>
                </label>

                <label className="block text-xs font-semibold text-muted">
                    Priorities
                    <select
                        value={priority}
                        onChange={(e) => onPriorityChange(e.target.value)}
                        aria-label="Priority"
                        className={`${inputClass} mt-1.5`}
                    >
                        <option value="">All Priorities</option>
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                    </select>
                </label>

                <label className="block text-xs font-semibold text-muted">
                    Work statuses
                    <select
                        value={workStatus}
                        onChange={(e) => onWorkStatusChange(e.target.value)}
                        aria-label="Work status"
                        className={`${inputClass} mt-1.5`}
                    >
                        <option value="">All Work Statuses</option>
                        {workStatuses.map((value) => (
                            <option key={value} value={value}>
                                {readable(value)}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block text-xs font-semibold text-muted">
                    Sort by
                    <select
                        value={sort}
                        onChange={(e) => onSortChange(e.target.value)}
                        aria-label="Sort tasks"
                        className={`${inputClass} mt-1.5`}
                    >
                        <option value="order">Timeline Order</option>
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="title">Title A–Z</option>
                        <option value="title-desc">Title Z–A</option>
                        <option value="start-date">Start Date</option>
                        <option value="end-date">End Date</option>
                    </select>
                </label>

                <div className="flex justify-end border-t border-border pt-4">
                    <button
                        type="button"
                        onClick={onClearAll}
                        className="flex min-h-11 items-center gap-2 rounded-xl border border-subtle bg-surface px-4 py-2 text-xs font-semibold text-muted hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                        <X size={15} aria-hidden="true" />
                        Clear all filters
                    </button>
                </div>
            </div>
        </dialog>
    );
}

export default function SupervisorProjectTasks() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
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
    const [pageSize, setPageSize] = useState(12);

    const [layout, setLayout] = useState("gallery");
    const [filterSheetOpen, setFilterSheetOpen] = useState(false);
    const filterButtonRef = useRef(null);

    const [formOpen, setFormOpen] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [delayReportTask, setDelayReportTask] = useState(null);
    const [notice, setNotice] = useState("");
    const [creationError, setCreationError] = useState("");

    useEffect(() => {
        if (searchParams.get("create") !== "true" || loading || String(project?.id) !== projectId || error) return;
        const next = new URLSearchParams(searchParams);
        next.delete("create");
        setSearchParams(next, { replace: true });
        if (["ACTIVE", "MAINTENANCE"].includes(project.status)) {
            setEditingTask(null);
            setFormOpen(true);
        } else {
            setCreationError("Task creation is unavailable for this project's current status.");
        }
    }, [searchParams, setSearchParams, loading, project, projectId, error]);

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

    // RESET WHEN SWITCHING PROJECTS
    useEffect(() => {
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
        Math.ceil(filteredTasks.length / pageSize)
    );

    const safePage = Math.min(page, pageCount);

    const pageTasks = filteredTasks.slice(
        (safePage - 1) * pageSize,
        safePage * pageSize
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

    const activeFilterCount =
        (approval ? 1 : 0) +
        (priority ? 1 : 0) +
        (workStatus ? 1 : 0) +
        (sort !== "order" ? 1 : 0);

    const hasFilters = Boolean(
        search ||
        approval ||
        priority ||
        workStatus ||
        sort !== "order"
    );

    function refreshTasks() {
        setRefreshKey((value) => value + 1);
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

    function openCreate() {
        setEditingTask(null);
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

    function handleDelayReportSaved(report) {
        setDelayReportTask(null);
        setNotice(`Delay report submitted: ${report.status === "PENDING" ? "Pending Admin review" : report.status}.`);
    }

    // Preserve bookmarked notification/timeline links while using the full page.
    useEffect(() => {
        if (linkedTaskId) navigate(`/supervisor/projects/${projectId}/tasks/${encodeURIComponent(linkedTaskId)}`, { replace: true });
    }, [linkedTaskId, projectId, navigate]);

    return (
        <div className="supervisor-project-tasks rare-tasks mx-auto w-full min-w-0 max-w-[1400px] space-y-4 pb-8 text-ink">
            <TaskPageStyles />
            {loading && (
                <LoadingScreen message="Loading project tasks..." />
            )}

            {/* 1. BACK LINK ABOVE HEADER */}
            <div>
                <Link
                    to={`/supervisor/projects/${projectId}`}
                    aria-label={`Back to ${project?.name || "Project"}`}
                    className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                    <ChevronLeft size={16} aria-hidden="true" />
                    <span className="truncate">{project?.name || "Project"}</span>
                </Link>
            </div>

            {/* 2. HEADER ROW: title + refresh, project name caption, then actions row */}
            <header className="min-w-0">
                <div className="project-task-title-row flex w-full min-w-0 items-center justify-between gap-3">
                    <h1 className="min-w-0 truncate text-xl font-bold tracking-tight text-ink sm:text-2xl">
                        Project Tasks
                    </h1>

                    <button
                        type="button"
                        onClick={refreshTasks}
                        disabled={loading}
                        aria-label="Refresh tasks"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted hover:bg-app disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                        <RefreshCw
                            size={18}
                            className={loading ? "motion-safe:animate-spin" : ""}
                            aria-hidden="true"
                        />
                    </button>
                </div>

                {project?.name && (
                    <p className="mt-0.5 truncate text-xs text-muted">
                        {project.name}
                    </p>
                )}

                {/* Actions row: side-by-side buttons */}
                <div className="project-task-actions mt-3 flex min-w-0 items-center gap-2">
                    <button
                        type="button"
                        onClick={openCreate}
                        disabled={
                            loading ||
                            Boolean(error) ||
                            !["ACTIVE", "MAINTENANCE"].includes(project?.status)
                        }
                        className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-action px-4 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:flex-none sm:text-sm"
                    >
                        <Plus size={17} aria-hidden="true" className="shrink-0" />
                        Create Task
                    </button>

                    <button
                        type="button"
                        onClick={() => setBulkOpen(true)}
                        disabled={
                            loading ||
                            Boolean(error) ||
                            !["ACTIVE", "MAINTENANCE"].includes(project?.status)
                        }
                        className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-xs font-semibold text-muted hover:bg-app disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:flex-none sm:text-sm"
                    >
                        <Layers3 size={17} aria-hidden="true" className="shrink-0" />
                        Bulk Add Tasks
                    </button>
                </div>
            </header>

            {/* 3. HORIZONTALLY SCROLLABLE FILTER CHIPS ROW */}
            <div
                role="region"
                aria-label="Filter tasks by approval status"
                className="flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {[
                    { id: "", label: "All", count: stats.total },
                    { id: "PENDING", label: "Pending approval", count: stats.pending },
                    { id: "APPROVED", label: "Approved", count: stats.approved },
                    { id: "REJECTED", label: "Rejected", count: stats.rejected },
                ].map((chip) => {
                    const isSelected = approval === chip.id;
                    return (
                        <button
                            key={chip.label}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => updateFilter(setApproval, chip.id)}
                            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                                isSelected
                                    ? "border-ink bg-action text-white"
                                    : "border-border bg-surface text-muted hover:bg-surface-soft"
                            }`}
                        >
                            <span>{chip.label}</span>
                            <span className={isSelected ? "text-white/80" : "text-muted"}>
                                {error ? "—" : chip.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* 4. SEARCH ROW PLUS ICON-ONLY FILTER BUTTON (OPENS BOTTOM SHEET / POPOVER) */}
            <div className="project-task-search flex w-full min-w-0 items-center gap-2">
                <ProjectSearch
                    query={search}
                    delay={0}
                    onSearch={(value) => updateFilter(setSearch, value)}
                    label="Search tasks"
                    labelClassName="sr-only"
                    placeholder="Task, worker or description"
                    suggestions={filteredTasks.map((task) => ({
                        id: task.id,
                        name: task.title,
                        context: task.worker_name,
                        to: `/supervisor/projects/${projectId}/tasks/${encodeURIComponent(task.id)}`,
                    }))}
                    className="min-w-0 flex-1"
                />

                <button
                    ref={filterButtonRef}
                    type="button"
                    onClick={() => setFilterSheetOpen(true)}
                    aria-label={`Filters and sorting, ${activeFilterCount} active ${
                        activeFilterCount === 1 ? "filter" : "filters"
                    }`}
                    className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                    <Filter size={18} aria-hidden="true" />
                    {activeFilterCount > 0 && (
                        <span
                            aria-hidden="true"
                            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-action px-1 text-xs font-semibold text-white"
                        >
                            {activeFilterCount}
                        </span>
                    )}
                </button>

                <ProjectTaskFilterSheet
                    open={filterSheetOpen}
                    onClose={() => setFilterSheetOpen(false)}
                    approval={approval}
                    priority={priority}
                    workStatus={workStatus}
                    sort={sort}
                    workStatuses={workStatuses}
                    onApprovalChange={(val) => updateFilter(setApproval, val)}
                    onPriorityChange={(val) => updateFilter(setPriority, val)}
                    onWorkStatusChange={(val) => updateFilter(setWorkStatus, val)}
                    onSortChange={(val) => updateFilter(setSort, val)}
                    onClearAll={clearFilters}
                    triggerRef={filterButtonRef}
                />
            </div>

            {/* NOTICES */}
            {project?.status === "CANCELLED" && (
                <p role="status" className="rounded-xl border border-border bg-surface p-4 text-xs text-muted">
                    This project has been cancelled. Existing records remain available for reference.
                </p>
            )}
            {creationError && (
                <p role="alert" className="rounded-xl bg-pastel-blush p-4 text-xs text-danger">
                    {creationError}
                </p>
            )}
            {notice && (
                <div
                    role="status"
                    className="flex items-start gap-3 rounded-2xl border border-pastel-mint bg-pastel-mint p-4"
                >
                    <CheckCircle2
                        size={20}
                        className="shrink-0 text-success"
                    />

                    <p className="flex-1 text-xs font-medium text-success">
                        {notice}
                    </p>

                    <button
                        type="button"
                        onClick={() => setNotice("")}
                        aria-label="Dismiss message"
                        className="flex h-11 w-11 -mr-2 -mt-2 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success"
                    >
                        <X size={17} className="text-success" />
                    </button>
                </div>
            )}

            {/* 5. CAPTION AND LIST/GALLERY TOGGLE */}
            <div className="project-task-view flex w-full min-w-0 items-center justify-between gap-3">
                <p
                    role="status"
                    aria-live="polite"
                    className="min-w-0 truncate text-sm font-medium text-muted"
                >
                    {loading
                        ? "Updating tasks..."
                        : error
                            ? "Tasks are unavailable"
                            : `${filteredTasks.length} ${
                                  filteredTasks.length === 1 ? "task" : "tasks"
                              }`}
                </p>

                <div
                    role="group"
                    aria-label="Task view"
                    className="ml-auto inline-flex shrink-0 gap-1 rounded-2xl border border-border-strong bg-app p-1"
                >
                    {[
                        ["list", "List", List],
                        ["gallery", "Gallery", LayoutGrid],
                    ].map(([value, label, Icon]) => (
                        <button
                            key={value}
                            type="button"
                            aria-label={`${label} view`}
                            aria-pressed={layout === value}
                            onClick={() => setLayout(value)}
                            className={`inline-flex h-11 w-11 min-h-11 items-center justify-center rounded-xl p-0 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning ${
                                layout === value
                                    ? "bg-surface text-ink shadow-sm"
                                    : "text-muted hover:bg-surface/60"
                            }`}
                        >
                            <Icon size={18} aria-hidden="true" />
                        </button>
                    ))}
                </div>
            </div>

            {/* ERROR */}
            {!loading && error && (
                <div className="rounded-2xl border border-danger/30 bg-surface p-5">
                    <p role="alert" className="text-xs text-danger sm:text-sm">
                        {error}
                    </p>

                    <button
                        type="button"
                        onClick={refreshTasks}
                        className="mt-3 flex min-h-11 items-center gap-2 text-xs font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:text-sm"
                    >
                        <RefreshCw size={16} />
                        Try Again
                    </button>
                </div>
            )}

            {/* 6, 7 & 8: TASK LIST / GALLERY GRID */}
            {!loading && !error && (
                <>
                    {pageTasks.length > 0 ? (
                        <div
                            className={
                                layout === "gallery"
                                    ? "grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
                                    : "flex flex-col gap-3"
                            }
                        >
                            {pageTasks.map((task) => (
                                <div key={task.id} className="rare-task-card-item min-w-0">
                                    <MobileTaskCard task={task}
                                        to={`/supervisor/projects/${projectId}/tasks/${encodeURIComponent(task.id)}`}
                                        showProject={false}
                                        mobilePresentation={layout === "list" ? "row" : "gallery"} />
                                    {canReportDelay(task, project) && <div className="rare-task-card-actions flex justify-end lg:hidden">
                                        <button type="button" aria-label={`Report delay for ${task.title || "task"}`} onClick={() => setDelayReportTask(task)} className="min-h-11 px-3 text-sm font-semibold text-muted underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Report delay</button>
                                    </div>}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-[24px] border border-border bg-surface px-5 py-14 text-center">
                            <ClipboardList
                                size={32}
                                className="mx-auto text-muted"
                            />

                            <h3 className="mt-5 text-lg font-bold text-ink">
                                {hasFilters
                                    ? "No matching tasks"
                                    : "No tasks added yet"}
                            </h3>

                            <p className="mt-2 text-xs text-muted">
                                {hasFilters
                                    ? "Try adjusting the filters."
                                    : "Create your first project task to get started."}
                            </p>

                            {hasFilters ? (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="mt-5 min-h-11 rounded-xl border border-subtle bg-surface px-4 py-2.5 text-xs font-semibold text-muted hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                >
                                    Clear Filters
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={openCreate}
                                    disabled={project?.status === "CANCELLED"}
                                    className="rare-button rare-button-primary mt-5 min-h-11 px-4 py-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                >
                                    <Plus size={18} aria-hidden="true" />
                                    Create First Task
                                </button>
                            )}
                        </div>
                    )}

                    {/* 7. PAGINATION AND PER PAGE: HIDE WHEN ONE PAGE */}
                    {pageCount > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                            <label className="flex items-center gap-2 text-xs font-medium text-muted">
                                Per page
                                <select
                                    aria-label="Tasks per page"
                                    value={pageSize}
                                    onChange={(event) => {
                                        setPageSize(Number(event.target.value));
                                        setPage(1);
                                    }}
                                    className="min-h-11 rounded-lg border border-border bg-surface px-2 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                >
                                    {[12, 24, 48].map((size) => (
                                        <option key={size} value={size}>
                                            {size}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <nav
                                aria-label="Task pagination"
                                className="rare-pagination flex flex-1 items-center justify-end gap-2 text-xs"
                            >
                                <button
                                    type="button"
                                    disabled={safePage === 1}
                                    onClick={() => {
                                        setPage((value) =>
                                            Math.max(1, value - 1)
                                        );
                                    }}
                                    className="flex min-h-11 items-center gap-1 rounded-xl border border-subtle bg-surface px-3 py-2 text-xs font-semibold text-muted hover:bg-surface-soft disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                >
                                    <ChevronLeft size={16} aria-hidden="true" />
                                    Previous
                                </button>

                                <span
                                    aria-live="polite"
                                    aria-atomic="true"
                                    className="px-1 text-muted"
                                >
                                    Page{" "}
                                    <strong className="font-semibold text-ink">
                                        {safePage}
                                    </strong>{" "}
                                    of {pageCount}
                                </span>

                                <button
                                    type="button"
                                    disabled={safePage >= pageCount}
                                    onClick={() => {
                                        setPage((value) =>
                                            Math.min(pageCount, value + 1)
                                        );
                                    }}
                                    className="flex min-h-11 items-center gap-1 rounded-xl border border-subtle bg-surface px-3 py-2 text-xs font-semibold text-muted hover:bg-surface-soft disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                >
                                    Next
                                    <ChevronRight size={16} aria-hidden="true" />
                                </button>
                            </nav>
                        </div>
                    )}
                </>
            )}

            {/* EXISTING MODALS */}
            <TaskForm
                open={formOpen}
                projectId={projectId}
                project={project}
                task={editingTask}
                onClose={closeTaskForm}
                onSaved={handleTaskSaved}
            />

            <BulkAddTasks
                open={bulkOpen}
                projectId={projectId}
                project={project}
                onClose={() => setBulkOpen(false)}
                onSaved={handleBulkSaved}
            />
            {delayReportTask && <DelayReportForm
                key={`${projectId}:${delayReportTask.id}`}
                projectId={projectId}
                taskId={delayReportTask.id}
                onClose={() => setDelayReportTask(null)}
                onSaved={handleDelayReportSaved}
            />}
        </div>
    );
}
