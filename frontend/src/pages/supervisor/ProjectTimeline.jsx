
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    AlertCircle,
    ArrowLeft,
    CalendarRange,
    ClipboardList,
    Clock3,
    GripVertical,
    RefreshCw,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { timelineApi } from "../../api/timelineApi";

import LoadingScreen from "../../components/LoadingScreen";

import TimelineSummary from "../../components/timeline/TimelineSummary";
import TimelineToolbar from "../../components/timeline/TimelineToolbar";
import TimelineSequence from "../../components/timeline/TimelineSequence";
import TimelineSchedule from "../../components/timeline/TimelineSchedule";
import TimelineReorder from "../../components/timeline/TimelineReorder";
import TimelineRequestHistory from "../../components/timeline/TimelineRequestHistory";

import ProposeTimelineOrder from "../../modal/supervisor/ProposeTimelineOrder";

// =====================================================
// HELPERS
// =====================================================

function getList(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.tasks)) return data.tasks;

    throw new Error("Unexpected timeline response format.");
}

async function getCompleteTimeline(projectId) {
    const all = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
        if (page > 500) {
            throw new Error("Timeline pagination limit exceeded.");
        }

        const response = await timelineApi.getTimeline(
            projectId,
            { page }
        );

        all.push(...getList(response));

        hasNext =
            !Array.isArray(response) &&
            Boolean(response?.next);

        page += 1;
    }

    return all.sort((a, b) => {
        const first = Number(a.display_order ?? 999999);
        const second = Number(b.display_order ?? 999999);

        if (first !== second) return first - second;

        return String(a.created_at || "").localeCompare(
            String(b.created_at || "")
        );
    });
}

async function getAllChangeRequests() {
    const all = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
        if (page > 500) {
            throw new Error(
                "Change request pagination limit exceeded."
            );
        }

        const response =
            await timelineApi.getChangeRequests({ page });

        all.push(...getList(response));

        hasNext =
            !Array.isArray(response) &&
            Boolean(response?.next);

        page += 1;
    }

    return all;
}

function idOf(value) {
    if (value && typeof value === "object") {
        return String(value.id ?? value.uuid ?? "");
    }

    return value == null ? "" : String(value);
}

// Only include history records that can be
// positively matched to this project.
//
// Some Django serializers expose project_id,
// while others only expose task_id.
//
// Avoid showing another project's request when
// its relationship is unknown.
function belongsToProject(request, projectId, taskIds) {
    const projectReference =
        request.project_id ??
        request.project ??
        request.task?.project_id ??
        request.task?.project;

    if (projectReference !== undefined &&
        projectReference !== null) {
        return idOf(projectReference) === String(projectId);
    }

    const taskReference =
        request.task_id ?? request.task;

    return taskIds.has(idOf(taskReference));
}

function hasProjectRelationship(request, taskIds) {
    const projectReference =
        request.project_id ??
        request.project ??
        request.task?.project_id ??
        request.task?.project;

    if (projectReference != null) return true;

    return taskIds.has(
        idOf(request.task_id ?? request.task)
    );
}

function errorMessage(error, fallback) {
    const detail = error?.response?.data?.detail;

    if (typeof detail === "string") return detail;

    if (
        error?.response?.status === 403 ||
        error?.response?.status === 404
    ) {
        return "You do not have access to this project timeline.";
    }

    return fallback;
}

function priorityWeight(value) {
    return {
        URGENT: 4,
        HIGH: 3,
        MEDIUM: 2,
        LOW: 1,
    }[value] ?? 0;
}

// =====================================================
// MAIN PAGE
// =====================================================

export default function SupervisorProjectTimeline() {
    const { projectId } = useParams();

    // DATA
    const [project, setProject] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [timelineRequests, setTimelineRequests] =
        useState([]);

    // LOADING / ERRORS
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [historyLoading, setHistoryLoading] =
        useState(true);
    const [historyError, setHistoryError] = useState("");
    const [unmatchedHistory, setUnmatchedHistory] =
        useState(false);

    // REFRESH
    const [refreshKey, setRefreshKey] = useState(0);
    const [historyRefreshKey, setHistoryRefreshKey] =
        useState(0);

    // TOOLBAR
    const [search, setSearch] = useState("");
    const [approval, setApproval] = useState("");
    const [workStatus, setWorkStatus] = useState("");
    const [priority, setPriority] = useState("");
    const [sort, setSort] = useState("order");
    const [view, setView] = useState("sequence");

    // REORDER WORKFLOW
    const [reorderMode, setReorderMode] = useState(false);
    const [proposedTasks, setProposedTasks] = useState(null);
    const [proposalOpen, setProposalOpen] = useState(false);

    // FEEDBACK
    const [notice, setNotice] = useState("");

    // =====================================================
    // FETCH PROJECT + TIMELINE
    // =====================================================

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError("");

            try {
                const [projectData, timelineData] =
                    await Promise.all([
                        projectApi.getProjectOverview(projectId),
                        getCompleteTimeline(projectId),
                    ]);

                if (cancelled) return;

                setProject(projectData);
                setTasks(timelineData);
            } catch (err) {
                if (cancelled) return;

                setError(
                    errorMessage(
                        err,
                        "Unable to load the project timeline."
                    )
                );
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [projectId, refreshKey]);

    // =====================================================
    // FETCH ORDER-CHANGE REQUEST HISTORY
    // =====================================================

    useEffect(() => {
        if (loading || error) return;

        let cancelled = false;

        async function loadHistory() {
            setHistoryLoading(true);
            setHistoryError("");
            setUnmatchedHistory(false);

            try {
                const results = await getAllChangeRequests();

                if (cancelled) return;

                const taskIds = new Set(
                    tasks.map((task) => String(task.id))
                );

                const relevantType = results.filter(
                    (item) =>
                        !item.change_type ||
                        item.change_type === "ORDER_CHANGE"
                );

                const scoped = relevantType.filter((item) =>
                    belongsToProject(item, projectId, taskIds)
                );

                const anyUnknown = relevantType.some(
                    (item) =>
                        !hasProjectRelationship(item, taskIds)
                );

                setTimelineRequests(scoped);
                setUnmatchedHistory(anyUnknown);
            } catch (err) {
                if (!cancelled) {
                    setHistoryError(
                        errorMessage(
                            err,
                            "Unable to load timeline request history."
                        )
                    );
                }
            } finally {
                if (!cancelled) {
                    setHistoryLoading(false);
                }
            }
        }

        loadHistory();

        return () => {
            cancelled = true;
        };
    }, [
        projectId,
        tasks,
        loading,
        error,
        historyRefreshKey,
    ]);

    // =====================================================
    // RESET PAGE-SPECIFIC UI WHEN PROJECT CHANGES
    // =====================================================

    useEffect(() => {
        setSearch("");
        setApproval("");
        setWorkStatus("");
        setPriority("");
        setSort("order");
        setView("sequence");

        setReorderMode(false);
        setProposedTasks(null);
        setProposalOpen(false);
        setNotice("");

        setTimelineRequests([]);
        setHistoryError("");
    }, [projectId]);

    // =====================================================
    // FILTERED TASKS
    // =====================================================

    const filteredTasks = useMemo(() => {
        const query = search.trim().toLowerCase();

        const result = tasks.filter((task) => {
            const text = [
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

            return (
                text.includes(query) &&
                (!approval ||
                    task.approval_status === approval) &&
                (!workStatus ||
                    task.work_status === workStatus) &&
                (!priority || task.priority === priority)
            );
        });

        // Official order is kept by TimelineSequence.
        // Alternative sorting is for Schedule View only.
        if (view === "schedule") {
            result.sort((a, b) => {
                if (sort === "title") {
                    return String(a.title || "").localeCompare(
                        String(b.title || "")
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

                if (sort === "priority") {
                    return (
                        priorityWeight(b.priority) -
                        priorityWeight(a.priority)
                    );
                }

                return (
                    Number(a.display_order ?? 999999) -
                    Number(b.display_order ?? 999999)
                );
            });
        }

        return result;
    }, [
        tasks,
        search,
        approval,
        workStatus,
        priority,
        sort,
        view,
    ]);

    // =====================================================
    // PENDING REQUEST CHECK
    // =====================================================

    const pendingOrderRequest = timelineRequests.some(
        (request) =>
            request.status === "PENDING" &&
            (
                !request.change_type ||
                request.change_type === "ORDER_CHANGE"
            )
    );

    const hasFilters = Boolean(
        search ||
        approval ||
        workStatus ||
        priority ||
        sort !== "order"
    );

    // =====================================================
    // ACTIONS
    // =====================================================

    function refreshTimeline() {
        setRefreshKey((value) => value + 1);
    }

    function refreshHistory() {
        setHistoryRefreshKey((value) => value + 1);
    }

    function clearFilters() {
        setSearch("");
        setApproval("");
        setWorkStatus("");
        setPriority("");
        setSort("order");
    }

    function enterReorderMode() {
        if (
            loading ||
            error ||
            historyLoading ||
            historyError ||
            unmatchedHistory ||
            pendingOrderRequest ||
            tasks.length < 2
        ) {
            return;
        }

        // Reordering works on ALL project tasks,
        // never the filtered subset.
        clearFilters();
        setView("sequence");

        setProposedTasks(null);
        setProposalOpen(false);
        setReorderMode(true);
        setNotice("");
    }

    function exitReorderMode() {
        setReorderMode(false);
        setProposedTasks(null);
        setProposalOpen(false);
    }

    function handleReview(orderedTasks) {
        setProposedTasks(orderedTasks);
        setProposalOpen(true);
    }

    function handleSubmitted() {
        setNotice(
            "Timeline order proposal submitted. The current approved order remains in place until Admin review."
        );

        exitReorderMode();

        // Refresh both the timeline and request history.
        refreshTimeline();
        refreshHistory();
    }

    // =====================================================
    // RENDER
    // =====================================================

    return (
        <div className="supervisor-timeline space-y-6 pb-8">
            {loading && (
                <LoadingScreen message="Loading project timeline..." />
            )}

            {/* BREADCRUMB */}
            <nav
                aria-label="Breadcrumb"
                className="flex flex-wrap items-center gap-2 text-xs text-muted"
            >
                <Link
                    to="/supervisor/projects"
                    className="hover:text-ink"
                >
                    My Projects
                </Link>

                <span>/</span>

                <Link
                    to={`/supervisor/projects/${projectId}`}
                    className="hover:text-ink"
                >
                    {project?.name || "Project"}
                </Link>

                <span>/</span>

                <span className="font-bold text-ink">
                    Timeline
                </span>
            </nav>

            {/* PAGE HEADER */}
            <header className="rare-page-header flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.17em] text-muted">
                        Supervisor / Project Workspace
                    </p>

                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                        Project Timeline
                    </h1>

                    <p className="mt-2 text-sm leading-6 text-muted">
                        {project?.name || "Assigned Project"}
                        {" · "}
                        Track task sequence, planned dates and
                        proposed timeline changes.
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={refreshTimeline}
                        disabled={loading || reorderMode}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-muted hover:bg-app disabled:opacity-50"
                    >
                        <RefreshCw size={17} />
                        Refresh
                    </button>

                    {!reorderMode && (
                        <button
                            type="button"
                            onClick={enterReorderMode}
                            disabled={
                                loading ||
                                project?.status === "CANCELLED" ||
                                Boolean(error) ||
                                historyLoading ||
                                Boolean(historyError) ||
                                unmatchedHistory ||
                                pendingOrderRequest ||
                                tasks.length < 2
                            }
                            className="inline-flex items-center gap-2 rounded-xl bg-action px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <GripVertical size={18} />
                            Reorder Tasks
                        </button>
                    )}
                </div>
            </header>

            {/* SUCCESS MESSAGE */}
            {notice && (
                <div
                    role="status"
                    className="flex items-start gap-3 rounded-2xl border border-pastel-mint bg-pastel-mint p-4"
                >
                    <span className="min-w-0 flex-1 text-sm leading-6 text-success">
                        {notice}
                    </span>

                    <button
                        type="button"
                        onClick={() => setNotice("")}
                        className="text-success"
                        aria-label="Dismiss notice"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* TIMELINE ERROR */}
            {!loading && error && (
                <div className="rounded-2xl border border-danger/30 bg-surface p-6">
                    <div className="flex items-start gap-3">
                        <AlertCircle
                            size={20}
                            className="shrink-0 text-danger"
                        />

                        <div>
                            <p
                                role="alert"
                                className="text-sm text-danger"
                            >
                                {error}
                            </p>

                            <button
                                type="button"
                                onClick={refreshTimeline}
                                className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-ink underline"
                            >
                                <RefreshCw size={16} />
                                Try Again
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!loading && !error && (
                <>
                    {/* SUMMARY CARDS */}
                    <div className="supervisor-timeline-summary"><TimelineSummary tasks={tasks} /></div>

                    {/* ORDER CHANGE STATUS */}
                    {pendingOrderRequest && (
                        <div className="flex items-start gap-3 rounded-2xl border border-pastel-butter bg-pastel-butter p-4">
                            <Clock3
                                size={20}
                                className="mt-0.5 shrink-0 text-warning"
                            />

                            <div>
                                <p className="text-sm font-bold text-warning">
                                    Timeline approval pending
                                </p>

                                <p className="mt-1 text-xs leading-6 text-warning">
                                    An order-change request for this project
                                    is awaiting Admin review. The approved
                                    timeline has not changed.
                                </p>
                            </div>
                        </div>
                    )}

                    {!pendingOrderRequest &&
                        !historyLoading &&
                        (historyError || unmatchedHistory) && (
                            <div className="rounded-2xl border border-border bg-surface-soft p-4 text-xs leading-6 text-muted">
                                Reordering is temporarily disabled because
                                the existing change-request state could
                                not be verified. Refresh request history
                                after checking the API.
                            </div>
                        )}

                    <div className="supervisor-timeline-content space-y-6">
                    {!reorderMode ? (
                        <>
                            {/* TOOLBAR */}
                            <div className="supervisor-timeline-toolbar"><TimelineToolbar
                                search={search}
                                onSearchChange={setSearch}
                                approval={approval}
                                onApprovalChange={setApproval}
                                workStatus={workStatus}
                                onWorkStatusChange={setWorkStatus}
                                priority={priority}
                                onPriorityChange={setPriority}
                                sort={sort}
                                onSortChange={setSort}
                                view={view}
                                onViewChange={setView}
                                onClearFilters={clearFilters}
                            /></div>

                            <div className="supervisor-timeline-main space-y-3">
                            {/* RESULTS COUNTER */}
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs text-muted">
                                    Showing{" "}
                                    <strong className="text-ink">
                                        {filteredTasks.length}
                                    </strong>{" "}
                                    of {tasks.length} tasks
                                </p>

                                {hasFilters && (
                                    <button
                                        type="button"
                                        onClick={clearFilters}
                                        className="text-xs font-bold text-muted underline"
                                    >
                                        Show All Tasks
                                    </button>
                                )}
                            </div>

                            <div className="timeline-desktop-view-heading hidden items-center justify-between gap-4 lg:flex">
                                <div><h2 className="text-lg font-bold text-ink">{view === "sequence" ? "Task Sequence" : "Schedule View"}</h2>{view === "sequence" && <p className="mt-2 text-xs leading-5 text-muted">Tasks arranged in their current timeline order.</p>}</div>
                                <div className="inline-flex shrink-0 rounded-xl bg-app p-1">{[["sequence", "Sequence", ClipboardList], ["schedule", "Schedule", CalendarRange]].map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={"inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold " + (view === value ? "bg-action text-white shadow-sm" : "text-muted")}><Icon size={16} />{label}</button>)}</div>
                            </div>
                            {/* VIEW SWITCH */}
                            {view === "sequence" ? (
                                <TimelineSequence
                                    tasks={filteredTasks}
                                    projectId={projectId}
                                />
                            ) : (
                                <TimelineSchedule
                                    tasks={filteredTasks}
                                    projectId={projectId}
                                />
                            )}
                            </div>
                        </>
                    ) : (
                        <TimelineReorder
                            tasks={tasks}
                            onCancel={exitReorderMode}
                            onReview={handleReview}
                        />
                    )}

                    {/* REQUEST HISTORY */}
                    <div className="supervisor-timeline-history border-t border-border pt-7">
                        <TimelineRequestHistory
                            requests={timelineRequests}
                            tasks={tasks}
                            loading={historyLoading}
                            error={historyError}
                            onRefresh={refreshHistory}
                        />
                    </div>
                    </div>
                </>
            )}

            {/* REORDER SUBMISSION MODAL */}
            <ProposeTimelineOrder
                open={proposalOpen}
                projectId={projectId}
                originalTasks={tasks}
                proposedTasks={proposedTasks || []}
                onClose={() => setProposalOpen(false)}
                onSubmitted={handleSubmitted}
            />
        </div>
    );
}
