import { createPortal } from "react-dom";
import { ProjectSearch } from "../../components/daily-reports/ReportProjectPicker";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Filter,
    FolderOpen,
    Layers3,
    LayoutGrid,
    List,
    Pencil,
    Plus,
    RefreshCw,
    X,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { isTaskOverdue, taskApi, taskScheduleErrors } from "../../api/taskApi";
import { delayApi } from "../../api/delayApi";
import DelayReportReview from "../../components/approvals/review/DelayReportReview";
import { formatDateTime } from "../../components/approvals/approvalUtils";
import LoadingScreen from "../../components/LoadingScreen";
import TaskDocuments from "../../components/tasks/TaskDocuments";
import TaskExecutionActions, { TaskProgress } from "../../components/tasks/TaskExecutionActions";
import TaskForm from "../../modal/supervisor/TaskForm";
import BulkAddTasks from "../../modal/supervisor/BulkAddTasks";
import DelayReportForm from "../../modal/supervisor/DelayReportForm";
import { MobileTaskCard, TaskPageStyles } from "../../components/admin/tasks/AdminTaskCard";

const inputClass =
    "h-11 w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-3 text-xs sm:text-sm text-[#211E1A] outline-none focus:border-[#B7A58E] focus:ring-2 focus:ring-[#E8DDD0]";

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

function canReportDelay(task, project) {
    return task?.approval_status === "APPROVED" &&
        !["COMPLETED", "CANCELLED"].includes(task.work_status) &&
        ["ACTIVE", "MAINTENANCE"].includes(project?.status);
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
            className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
                statusColors[value] || "bg-[#EEE8E0] text-[#74695D]"
            }`}
        >
            {readable(value)}
        </span>
    );
}

function DetailItem({ label, value }) {
    return (
        <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-[#716658]">
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

function SupervisorDelayCard({ report, taskName }) {
    const [open, setOpen] = useState(false);
    const cardRef = useRef(null);
    useEffect(() => {
        if (!open) return;
        function closeOutside(event) {
            if (event.button === 0 && !cardRef.current?.contains(event.target) && !document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]')) setOpen(false);
        }
        document.addEventListener("pointerdown", closeOutside);
        return () => document.removeEventListener("pointerdown", closeOutside);
    }, [open]);
    return <div ref={cardRef} className="rounded-xl border border-[#E7DED2] bg-[#FFFDFA]">
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-start justify-between gap-3 rounded-xl p-3 text-left focus-visible:outline-2 focus-visible:outline-[#94651D]">
            <span className="min-w-0"><span className="block text-sm font-bold">Delay report</span><span className="mt-1 block break-words text-sm font-semibold">{report.task_title || taskName}</span><span className="mt-1 block text-xs text-[#716658]">{formatDateTime(report.reported_at)}</span></span><ChevronDown size={18} className={'shrink-0 ' + (open ? 'rotate-180' : '')} />
        </button>
        {open && createPortal(<div role="dialog" aria-modal="true" aria-label="Delay report details" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-6" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="max-h-[85dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-6"><div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Delay report</h2><p className="mt-1 text-sm">{report.task_title || taskName}</p></div><button type="button" aria-label="Close delay report" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#E7DED2]"><X size={18} /></button></div><DelayReportReview record={report} role="SUPERVISOR" /></div></div>, document.body)}
    </div>;
}

function ExpandedTask({
    task,
    loading,
    error,
    onRetry,
    onEdit,
    onStatusChanged,
    canReportDelay = false,
    onReportDelay,
}) {
    const [documentsOpen, setDocumentsOpen] = useState(false);
    const [delayPage, setDelayPage] = useState(1);
    const [delayRevision, setDelayRevision] = useState(0);
    const [delayReports, setDelayReports] = useState(null);
    const delayKey = `${task?.id}:${task?.end_date}:${delayPage}:${delayRevision}`;
    const delayState = delayReports?.key === delayKey ? delayReports : null;
    useEffect(() => {
        if (!task?.id) return;
        const controller = new AbortController();
        delayApi.list({ task: task.id, page: delayPage, page_size: 5 }, controller.signal).then((data) => {
            if (!Array.isArray(data?.results) || !Number.isInteger(data.count)) throw new Error("Unexpected delay report response.");
            if (!controller.signal.aborted) setDelayReports({ key: delayKey, data });
        }).catch((failure) => {
            if (!controller.signal.aborted) setDelayReports({ key: delayKey, error: failure.response?.data?.detail || "Unable to load task delay reports." });
        });
        return () => controller.abort();
    }, [task?.id, delayPage, delayKey]);
    const [decisionPage, setDecisionPage] = useState(1);
    const [decisionRevision, setDecisionRevision] = useState(0);
    const [decisions, setDecisions] = useState(null);
    const decisionKey = `${task?.id}:${decisionPage}:${decisionRevision}`;
    const decisionState = decisions?.key === decisionKey ? decisions : null;
    useEffect(() => {
        if (!task?.id) return;
        const controller = new AbortController();
        taskApi.history(task.id, { decisions_only: true, page: decisionPage, page_size: 10 }, controller.signal).then((data) => {
            if (!Array.isArray(data?.results) || !Number.isInteger(data.count)) throw new Error("Unexpected decision history response.");
            if (!controller.signal.aborted) setDecisions({ key: decisionKey, data });
        }).catch((failure) => {
            if (!controller.signal.aborted) setDecisions({ key: decisionKey, error: failure.response?.data?.detail || "Unable to load Admin decisions." });
        });
        return () => controller.abort();
    }, [task?.id, decisionPage, decisionRevision, decisionKey]);

    if (loading) {
        return (
            <div className="flex items-center gap-3 border-t border-[#EEE6DC] p-6 text-sm text-[#716658]">
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

    const canEdit = task.project_status !== "CANCELLED" && ["PENDING", "REJECTED", "APPROVED"].includes(
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
        <div className="expanded-supervisor-task border-t border-[#EEE6DC] bg-[#FFFDFA] p-4 sm:p-6">
            {/* DETAILS HEADER */}
            <div className="expanded-task-heading flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#716658]">
                        Task Information
                    </p>

                    <h3 className="mt-2 text-lg font-bold text-[#211E1A]">
                        <span className="lg:hidden">Complete Task Details</span><span className="hidden lg:inline">{task.title}</span>
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-[#716658]">
                        Scope, scheduling, approval, execution and documents.
                    </p>
                </div>

                {canEdit && (
                    <button
                        type="button"
                        onClick={() => onEdit(task)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#F0D99A] bg-[#FFF5D6] px-4 py-2.5 text-xs font-bold text-[#8A620D] transition-colors hover:bg-[#FFE9A8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8A620D]"
                    >
                        <Pencil size={16} />
                        {editLabel}
                    </button>
                )}
            </div>

            {/* CURRENT STATUSES */}
            <div className="expanded-task-statuses mt-5 flex flex-wrap gap-3">
                {[
                    ["Approval Status", task.approval_status],
                    ["Work Status", task.work_status],
                    ["Priority", task.priority],
                ].map(([label, value]) => (
                    <div
                        key={label}
                        className="rounded-xl bg-[#F8F4EE] px-4 py-3"
                    >
                        <p className="mb-2 text-xs font-bold uppercase text-[#716658]">
                            {label}
                        </p>

                        <Badge value={value} />
                    </div>
                ))}
            </div>

            {/* START / COMPLETE TASK */}
            <div className="expanded-task-left contents lg:flex">
            <div className="expanded-task-execution contents lg:block">
            <TaskExecutionActions
                key={task.id}
                task={task}
                onSuccess={onStatusChanged}
            />

            <TaskProgress progress={task.progress} />
            </div>

            {/* DETAILS GRID */}
            <div className="expanded-task-details mt-5 grid gap-4 rounded-[20px] bg-[#F8F4EE] p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
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

            <aside className="expanded-task-review contents lg:hidden">
            <section aria-label="Admin decision history" className="mt-5 space-y-3 rounded-[18px] border border-[#E7DED2] bg-[#F8F4EE] p-4 sm:p-5">
                <h4 className="text-sm font-bold text-[#211E1A]">Admin decisions and comments</h4>
                {!decisionState && <p role="status" className="text-xs text-[#716658]">Loading decision history...</p>}
                {decisionState?.error && <p role="alert" className="text-xs text-red-700">{decisionState.error} <button type="button" className="underline" onClick={() => setDecisionRevision((value) => value + 1)}>Retry</button></p>}
                {decisionState?.data?.results.map((decision) => <article key={decision.id} className="rounded-xl border border-[#E7DED2] bg-[#FFFDFA] p-4">
                    <p className={`text-sm font-semibold ${decision.action.endsWith("REJECTED") ? "text-[#B42318]" : "text-[#166534]"}`}>{readable(decision.action)}</p>
                    <p className="mt-1 text-xs text-[#716658]">{decision.actor_name || "Reviewer unavailable"} / {formatDateTime(decision.created_at)}</p>
                    <p className="mt-3 whitespace-pre-wrap break-words text-xs text-[#211E1A] sm:text-sm">{decision.details?.reason || decision.details?.comment || decision.details?.admin_comment || "No comment provided."}</p>
                </article>)}
                {decisionState?.data?.count === 0 && <p className="text-xs text-[#716658]">No Admin decision has been recorded yet.</p>}
                {decisionState?.data && (decisionState.data.next || decisionState.data.previous) && <nav aria-label="Decision history pages" className="rare-pagination">
                    <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" disabled={!decisionState.data.previous} onClick={() => setDecisionPage((page) => page - 1)}>Previous decisions</button>
                    <span aria-live="polite" aria-atomic="true" className="text-xs text-[#716658]">Page {decisionPage} / {Math.max(1, Math.ceil(decisionState.data.count / 10))}</span>
                    <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" disabled={!decisionState.data.next} onClick={() => setDecisionPage((page) => page + 1)}>Next decisions</button>
                </nav>}
            </section>
            <section aria-label="Task delay reports" className="mt-5 space-y-4 rounded-[18px] border border-[#E7DED2] bg-[#F8F4EE] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-sm font-bold">Delay reports for this task</h4>
                    <div className="flex flex-wrap items-center gap-2">
                        {canReportDelay && <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" onClick={() => onReportDelay(task)}>Report delay</button>}
                        <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" onClick={() => setDelayRevision((value) => value + 1)}>Refresh reports</button>
                    </div>
                </div>
                <p className="text-xs text-[#716658]">Current approved deadline: {formatDate(task.end_date)}. Reporting a delay does not change this deadline; an extension needs separate approval.</p>
                {!delayState && <p role="status" className="text-xs text-[#716658]">Loading task delay reports...</p>}
                {delayState?.error && <p role="alert" className="text-xs text-red-700">{delayState.error} <button type="button" className="underline" onClick={() => setDelayRevision((value) => value + 1)}>Retry</button></p>}
                {delayState?.data?.count === 0 && <p className="text-xs text-[#716658]">No delays have been reported for this task.</p>}
                {delayState?.data?.results.map((report) => <div key={report.id}><div className="lg:hidden"><article className="rounded-xl border border-[#E7DED2] bg-[#FFFDFA] p-4"><DelayReportReview record={report} role="SUPERVISOR" /></article></div><div className="hidden lg:block"><SupervisorDelayCard report={report} taskName={task.title} /></div></div>)}
                {delayState?.data && (delayState.data.next || delayState.data.previous) && <nav aria-label="Task delay report pages" className="rare-pagination">
                    <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" disabled={!delayState.data.previous} onClick={() => setDelayPage((page) => page - 1)}>Previous reports</button>
                    <span aria-live="polite" aria-atomic="true" className="text-xs text-[#716658]">Page {delayPage} / {Math.max(1, Math.ceil(delayState.data.count / 5))}</span>
                    <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" disabled={!delayState.data.next} onClick={() => setDelayPage((page) => page + 1)}>Next reports</button>
                </nav>}
            </section>
            </aside>
            {/* DESCRIPTION AND COMPLETION CRITERIA */}
            <div className="expanded-task-description mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[18px] border border-[#EEE6DC] p-4 sm:p-5">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-[#211E1A]">
                        <ClipboardList size={18} className="text-[#3565A5]" />
                        Task Description
                    </h4>

                    <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[#716658] sm:text-sm">
                        {task.description || "No description provided."}
                    </p>
                </div>

                <div className="rounded-[18px] border border-[#EEE6DC] p-4 sm:p-5">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-[#211E1A]">
                        <CheckCircle2 size={18} className="text-[#368250]" />
                        Completion Criteria
                    </h4>

                    <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[#716658] sm:text-sm">
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
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[18px] border border-[#E4DCCD] bg-[#F8F4EE] px-4 py-3.5 text-left transition-colors hover:bg-[#F1EADF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A] sm:px-5 sm:py-4"
                >
                    <span className="flex items-center gap-3">
                        <span className="rounded-xl bg-[#F0EAF8] p-2.5 text-[#7C5BA4] sm:p-3">
                            <FolderOpen size={20} />
                        </span>

                        <span>
                            <span className="block text-sm font-bold text-[#211E1A]">
                                Documents & Drawings
                            </span>

                            <span className="mt-1 block text-xs text-[#716658]">
                                View, upload, download and manage versions
                            </span>
                        </span>
                    </span>

                    <ChevronDown
                        size={19}
                        className={`shrink-0 text-[#716658] transition-transform ${
                            documentsOpen ? "rotate-180" : ""
                        }`}
                    />
                </button>

                {documentsOpen && (
                    <TaskDocuments taskId={task.id} readOnly={task.project_status === "CANCELLED"} />
                )}
            </div>
            </div>
            <aside className="expanded-task-review hidden lg:block lg:space-y-4">
            <section aria-label="Admin decision history" className="mt-5 space-y-3 rounded-[18px] border border-[#E7DED2] bg-[#F8F4EE] p-4 sm:p-5">
                <h4 className="text-sm font-bold text-[#211E1A]">Admin decisions and comments</h4>
                {!decisionState && <p role="status" className="text-xs text-[#716658]">Loading decision history...</p>}
                {decisionState?.error && <p role="alert" className="text-xs text-red-700">{decisionState.error} <button type="button" className="underline" onClick={() => setDecisionRevision((value) => value + 1)}>Retry</button></p>}
                {decisionState?.data?.results.map((decision) => <article key={decision.id} className="rounded-xl border border-[#E7DED2] bg-[#FFFDFA] p-4">
                    <p className={`text-sm font-semibold ${decision.action.endsWith("REJECTED") ? "text-[#B42318]" : "text-[#166534]"}`}>{readable(decision.action)}</p>
                    <p className="mt-1 text-xs text-[#716658]">{decision.actor_name || "Reviewer unavailable"} / {formatDateTime(decision.created_at)}</p>
                    <p className="mt-3 whitespace-pre-wrap break-words text-xs text-[#211E1A] sm:text-sm">{decision.details?.reason || decision.details?.comment || decision.details?.admin_comment || "No comment provided."}</p>
                </article>)}
                {decisionState?.data?.count === 0 && <p className="text-xs text-[#716658]">No Admin decision has been recorded yet.</p>}
                {decisionState?.data && (decisionState.data.next || decisionState.data.previous) && <nav aria-label="Decision history pages" className="rare-pagination">
                    <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" disabled={!decisionState.data.previous} onClick={() => setDecisionPage((page) => page - 1)}>Previous decisions</button>
                    <span aria-live="polite" aria-atomic="true" className="text-xs text-[#716658]">Page {decisionPage} / {Math.max(1, Math.ceil(decisionState.data.count / 10))}</span>
                    <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" disabled={!decisionState.data.next} onClick={() => setDecisionPage((page) => page + 1)}>Next decisions</button>
                </nav>}
            </section>
            <section aria-label="Task delay reports" className="mt-5 space-y-4 rounded-[18px] border border-[#E7DED2] bg-[#F8F4EE] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-sm font-bold">Delay reports for this task</h4>
                    <div className="flex flex-wrap items-center gap-2">
                        {canReportDelay && <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" onClick={() => onReportDelay(task)}>Report delay</button>}
                        <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" onClick={() => setDelayRevision((value) => value + 1)}>Refresh reports</button>
                    </div>
                </div>
                <p className="text-xs text-[#716658]">Current approved deadline: {formatDate(task.end_date)}. Reporting a delay does not change this deadline; an extension needs separate approval.</p>
                {!delayState && <p role="status" className="text-xs text-[#716658]">Loading task delay reports...</p>}
                {delayState?.error && <p role="alert" className="text-xs text-red-700">{delayState.error} <button type="button" className="underline" onClick={() => setDelayRevision((value) => value + 1)}>Retry</button></p>}
                {delayState?.data?.count === 0 && <p className="text-xs text-[#716658]">No delays have been reported for this task.</p>}
                {delayState?.data?.results.map((report) => <div key={report.id}><div className="lg:hidden"><article className="rounded-xl border border-[#E7DED2] bg-[#FFFDFA] p-4"><DelayReportReview record={report} role="SUPERVISOR" /></article></div><div className="hidden lg:block"><SupervisorDelayCard report={report} taskName={task.title} /></div></div>)}
                {delayState?.data && (delayState.data.next || delayState.data.previous) && <nav aria-label="Task delay report pages" className="rare-pagination">
                    <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" disabled={!delayState.data.previous} onClick={() => setDelayPage((page) => page - 1)}>Previous reports</button>
                    <span aria-live="polite" aria-atomic="true" className="text-xs text-[#716658]">Page {delayPage} / {Math.max(1, Math.ceil(delayState.data.count / 5))}</span>
                    <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" disabled={!delayState.data.next} onClick={() => setDelayPage((page) => page + 1)}>Next reports</button>
                </nav>}
            </section>
            </aside>
        </div>
    );
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
            className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4 text-[#211E1A] shadow-[0_-12px_36px_rgba(33,30,26,0.18)] backdrop:bg-[#211E1A]/45 min-[1024px]:inset-auto min-[1024px]:top-1/2 min-[1024px]:left-1/2 min-[1024px]:-translate-x-1/2 min-[1024px]:-translate-y-1/2 min-[1024px]:w-[min(28rem,calc(100vw-2rem))] min-[1024px]:rounded-2xl min-[1024px]:shadow-2xl"
        >
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#EEE6DC] pb-3">
                <h2 id="task-filters-sheet-title" className="text-base font-semibold text-[#211E1A]">
                    Filters and sorting
                </h2>
                <button
                    ref={closeRef}
                    type="button"
                    onClick={onClose}
                    aria-label="Close filters"
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-[#716658] hover:bg-[#F1EADF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                >
                    <X size={20} aria-hidden="true" />
                </button>
            </div>

            <div className="space-y-4">
                <label className="block text-xs font-semibold text-[#716658]">
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

                <label className="block text-xs font-semibold text-[#716658]">
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

                <label className="block text-xs font-semibold text-[#716658]">
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

                <label className="block text-xs font-semibold text-[#716658]">
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

                <div className="flex justify-end border-t border-[#EEE6DC] pt-4">
                    <button
                        type="button"
                        onClick={onClearAll}
                        className="flex min-h-11 items-center gap-2 rounded-xl border border-[#9A8872] bg-[#FFFDFA] px-4 py-2 text-xs font-semibold text-[#514538] hover:bg-[#F8F4EE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                    >
                        <X size={15} aria-hidden="true" />
                        Clear all filters
                    </button>
                </div>
            </div>
        </dialog>
    );
}

function TaskCard({
    project,
    task,
    projectId,
    expanded,
    onToggle,
    detail,
    detailLoading,
    detailError,
    onRetry,
    onEdit,
    onStatusChanged,
}) {
    const priorityTone = {
        URGENT: "bg-[#B5473E]",
        HIGH: "bg-[#94651D]",
        MEDIUM: "bg-[#74614D]",
        LOW: "bg-[#3565A5]",
    };

    const overdue = typeof task.is_overdue === "boolean" ? task.is_overdue : isTaskOverdue(task);

    const rawWorker = task.worker_name?.trim();
    const assignee = rawWorker && rawWorker !== "Not specified"
        ? rawWorker
        : Array.isArray(task.supervisors)
            ? task.supervisors.map((s) => s.name).filter(Boolean).join(", ")
            : "";

    const formatSafeDate = (value) => {
        if (!value || value === "Not specified") return "";
        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        if (Number.isNaN(date.getTime())) return "";
        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    };

    const startDate = formatSafeDate(task.start_date);
    const endDate = formatSafeDate(task.end_date);
    let datesText = "";
    if (startDate && endDate) {
        datesText = `${startDate} → ${endDate}`;
    } else if (endDate) {
        datesText = `Due ${endDate}`;
    } else if (startDate) {
        datesText = `Starts ${startDate}`;
    }

    const hasLineInfo = Boolean(overdue || assignee || datesText);

    const rawProgress = task.progress?.progress_percentage;
    const progress = Number(rawProgress);
    const showProgress = Number.isFinite(progress) && progress > 0;
    const isAwaitingVerification = !showProgress && task.work_status === "COMPLETED";

    const taskHref = `/supervisor/projects/${projectId}/tasks?task=${encodeURIComponent(task.id)}`;

    return (
        <article className="overflow-hidden rounded-xl border border-[#E7DED2] bg-[#FFFDFA] transition-all hover:border-[#C9B9A6] hover:shadow-sm">
            <Link
                to={expanded ? `/supervisor/projects/${projectId}/tasks` : taskHref}
                onClick={(event) => {
                    event.preventDefault();
                    onToggle();
                }}
                aria-expanded={expanded}
                aria-controls={`task-details-${task.id}`}
                aria-label={`${task.title || "Untitled Task"}`}
                className="group flex min-h-11 min-w-0 flex-col gap-1.5 p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
            >
                {/* Priority dot plus title, chevron */}
                <span className="flex min-w-0 items-center gap-2">
                    <span
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            priorityTone[task.priority] || "bg-[#74614D]"
                        }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-base font-semibold leading-5 text-[#211E1A]">
                        {task.title || "Untitled Task"}
                    </span>
                    <ChevronRight
                        size={18}
                        aria-hidden="true"
                        className={`shrink-0 text-[#716658] transition-transform ${
                            expanded ? "rotate-90" : ""
                        }`}
                    />
                </span>

                {/* Chips for Work status and Approval status only */}
                <span className="flex min-w-0 flex-wrap gap-1.5">
                    {[
                        ["Work", task.work_status],
                        ["Approval", task.approval_status],
                    ]
                        .filter(([, value]) => value)
                        .map(([label, value]) => (
                            <span
                                key={label}
                                className={`max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold leading-4 ${
                                    statusColors[value] || "bg-[#F1EADF] text-[#74614D]"
                                }`}
                            >
                                {label}: {readable(value)}
                            </span>
                        ))}
                </span>

                {/* One line with assignee and dates (hide "Not specified") */}
                {hasLineInfo && (
                    <span className="flex min-w-0 items-center gap-1 truncate text-xs font-medium leading-4 text-[#716658]">
                        {overdue && <span className="shrink-0 font-semibold text-red-700">Overdue · </span>}
                        {assignee && <span className="truncate">{assignee}</span>}
                        {assignee && datesText && <span className="shrink-0"> · </span>}
                        {datesText && <span className="shrink-0">{datesText}</span>}
                    </span>
                )}

                {/* Show the progress bar only when progress is above 0, otherwise "Completed, awaiting verification" when that applies */}
                {showProgress ? (
                    <TaskProgress progress={task.progress} />
                ) : (
                    isAwaitingVerification && (
                        <span className="truncate text-xs font-medium text-[#94651D]">
                            Completed, awaiting verification
                        </span>
                    )
                )}

                {Object.keys(taskScheduleErrors(task, project)).length > 0 && (
                    <span role="status" className="rounded-lg bg-[#F1EADF] p-2 text-xs text-[#665E53]">
                        Task schedule conflicts with current project schedule.
                    </span>
                )}
            </Link>

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

    const [expandedId, setExpandedId] = useState(null);
    const expandedCardRef = useRef(null);
    const [expandedTask, setExpandedTask] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");
    const [detailRefreshKey, setDetailRefreshKey] = useState(0);

    const [formOpen, setFormOpen] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [delayReportTask, setDelayReportTask] = useState(null);
    const [notice, setNotice] = useState("");
    const [creationError, setCreationError] = useState("");

    useEffect(() => {
        if (!expandedId) return;
        function collapseOutside(event) {
            if (!window.matchMedia("(min-width: 1024px)").matches ||
                event.button !== 0 || formOpen || bulkOpen || delayReportTask ||
                filterSheetOpen || document.querySelector('dialog[open], [role="dialog"]:not(.supervisor-task-popup), [role="alertdialog"]') ||
                !expandedCardRef.current || expandedCardRef.current.contains(event.target)) return;
            setExpandedId(null);
            setExpandedTask(null);
            setDetailError("");
            setSearchParams((previous) => {
                const next = new URLSearchParams(previous);
                next.delete("task");
                return next;
            }, { replace: true });
        }
        document.addEventListener("pointerdown", collapseOutside);
        return () => document.removeEventListener("pointerdown", collapseOutside);
    }, [expandedId, formOpen, bulkOpen, delayReportTask, filterSheetOpen, setSearchParams]);

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
            const next = new URLSearchParams(searchParams);
            next.delete("task");
            setSearchParams(next, { replace: true });
            return;
        }

        setExpandedTask(null);
        setDetailError("");
        setExpandedId(taskId);
        const next = new URLSearchParams(searchParams);
        next.set("task", String(taskId));
        setSearchParams(next, { replace: true });
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
        setNotice(
            ({
                start: "Task started successfully.",
                complete: "Task completed successfully.",
                cancel: "Cancellation request submitted for Admin approval.",
            })[action] || "Task updated successfully."
        );

        refreshTasks();
    }

    function handleDelayReportSaved(report) {
        setDelayReportTask(null);
        setNotice(`Delay report submitted: ${report.status === "PENDING" ? "Pending Admin review" : report.status}.`);
        setDetailRefreshKey((value) => value + 1);
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

        setPage(Math.floor(sortedIndex / pageSize) + 1);
        setExpandedId(linkedTaskId);
    }, [linkedTaskId, loading, error, tasks, pageSize]);

    return (
        <div className="supervisor-project-tasks rare-tasks mx-auto w-full min-w-0 max-w-[1400px] space-y-4 pb-8 text-[#211E1A]">
            <TaskPageStyles />
            {loading && (
                <LoadingScreen message="Loading project tasks..." />
            )}

            {/* 1. BACK LINK ABOVE HEADER */}
            <div>
                <Link
                    to={`/supervisor/projects/${projectId}`}
                    aria-label={`Back to ${project?.name || "Project"}`}
                    className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[#716658] hover:text-[#211E1A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                >
                    <ChevronLeft size={16} aria-hidden="true" />
                    <span className="truncate">{project?.name || "Project"}</span>
                </Link>
            </div>

            {/* 2. HEADER ROW: title + refresh, project name caption, then actions row */}
            <header className="min-w-0">
                <div className="project-task-title-row flex w-full min-w-0 items-center justify-between gap-3">
                    <h1 className="min-w-0 truncate text-xl font-bold tracking-tight text-[#211E1A] sm:text-2xl">
                        Project Tasks
                    </h1>

                    <button
                        type="button"
                        onClick={refreshTasks}
                        disabled={loading}
                        aria-label="Refresh tasks"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] text-[#514538] hover:bg-[#F1EADF] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                    >
                        <RefreshCw
                            size={18}
                            className={loading ? "motion-safe:animate-spin" : ""}
                            aria-hidden="true"
                        />
                    </button>
                </div>

                {project?.name && (
                    <p className="mt-0.5 truncate text-xs text-[#716658]">
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
                        className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[#211E1A] px-4 text-xs font-semibold text-white hover:bg-[#39332B] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A] sm:flex-none sm:text-sm"
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
                        className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-4 text-xs font-semibold text-[#514538] hover:bg-[#F1EADF] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A] sm:flex-none sm:text-sm"
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
                            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A] ${
                                isSelected
                                    ? "border-[#211E1A] bg-[#211E1A] text-[#FFFDFA]"
                                    : "border-[#E7DED2] bg-[#FFFDFA] text-[#665C50] hover:bg-[#F8F5F0]"
                            }`}
                        >
                            <span>{chip.label}</span>
                            <span className={isSelected ? "text-white/80" : "text-[#716658]"}>
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
                        to: `/supervisor/projects/${projectId}/tasks?task=${encodeURIComponent(task.id)}`,
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
                    className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E7DED2] bg-[#FFFDFA] text-[#211E1A] hover:bg-[#F8F5F0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                >
                    <Filter size={18} aria-hidden="true" />
                    {activeFilterCount > 0 && (
                        <span
                            aria-hidden="true"
                            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#211E1A] px-1 text-xs font-semibold text-[#FFFDFA]"
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
                <p role="status" className="rounded-xl border border-[#E7DED2] bg-[#FFFDFA] p-4 text-xs text-[#716658]">
                    This project has been cancelled. Existing records remain available for reference.
                </p>
            )}
            {creationError && (
                <p role="alert" className="rounded-xl bg-red-50 p-4 text-xs text-red-700">
                    {creationError}
                </p>
            )}
            {notice && (
                <div
                    role="status"
                    className="flex items-start gap-3 rounded-2xl border border-[#C9E2CE] bg-[#E7F2E8] p-4"
                >
                    <CheckCircle2
                        size={20}
                        className="shrink-0 text-[#296F40]"
                    />

                    <p className="flex-1 text-xs font-medium text-[#296F40]">
                        {notice}
                    </p>

                    <button
                        type="button"
                        onClick={() => setNotice("")}
                        aria-label="Dismiss message"
                        className="flex h-11 w-11 -mr-2 -mt-2 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#296F40]"
                    >
                        <X size={17} className="text-[#296F40]" />
                    </button>
                </div>
            )}

            {/* 5. CAPTION AND LIST/GALLERY TOGGLE */}
            <div className="project-task-view flex w-full min-w-0 items-center justify-between gap-3">
                <p
                    role="status"
                    aria-live="polite"
                    className="min-w-0 truncate text-sm font-medium text-[#716658]"
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
                    className="ml-auto inline-flex shrink-0 gap-1 rounded-2xl border border-[#D8C7B2] bg-[#F1EADF] p-1"
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
                            className={`inline-flex h-11 w-11 min-h-11 items-center justify-center rounded-xl p-0 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] ${
                                layout === value
                                    ? "bg-[#FFFDFA] text-[#352D24] shadow-sm"
                                    : "text-[#66543D] hover:bg-white/60"
                            }`}
                        >
                            <Icon size={18} aria-hidden="true" />
                        </button>
                    ))}
                </div>
            </div>

            {/* ERROR */}
            {!loading && error && (
                <div className="rounded-2xl border border-red-200 bg-[#FFFDFA] p-5">
                    <p role="alert" className="text-xs text-red-700 sm:text-sm">
                        {error}
                    </p>

                    <button
                        type="button"
                        onClick={refreshTasks}
                        className="mt-3 flex min-h-11 items-center gap-2 text-xs font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A] sm:text-sm"
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
                            {pageTasks.map((task) => {
                                const expanded =
                                    String(expandedId) === String(task.id);

                                return (
                                    <div key={task.id} ref={expanded ? expandedCardRef : null} className="min-w-0">
                                        <MobileTaskCard
                                            task={task}
                                            to={`/supervisor/projects/${projectId}/tasks?task=${encodeURIComponent(task.id)}`}
                                            showProject={false}
                                            expanded={expanded}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                toggleTask(task.id);
                                            }}
                                        />
                                        {!expanded && canReportDelay(task, project) && <div className="-mt-2 flex lg:hidden justify-end rounded-b-xl border-x border-b border-[#E7DED2] bg-[#FFFDFA] px-3 pb-2">
                                            <button type="button" aria-label={`Report delay for ${task.title || "task"}`} onClick={() => setDelayReportTask(task)} className="min-h-11 px-3 text-sm font-semibold text-[#514538] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]">Report delay</button>
                                        </div>}
                                        {expanded && createPortal(<div className="supervisor-task-backdrop hidden lg:block" aria-hidden="true" onPointerDown={(event) => {
                                            if (event.button !== 0) return;
                                            event.preventDefault();
                                            event.stopPropagation();
                                            toggleTask(task.id);
                                        }} />, document.body)}
                                        {expanded && (
                                            <div id={`task-details-${task.id}`} className="supervisor-task-popup overflow-hidden rounded-b-xl border-x border-b border-[#E7DED2] bg-[#FFFDFA]">
                                                <ExpandedTask
                                                    key={task.id}
                                                    task={expandedTask}
                                                    loading={detailLoading}
                                                    error={detailError}
                                                    onCollapse={() => toggleTask(task.id)}
                                                    onRetry={retryDetails}
                                                    onEdit={openEdit}
                                                    onStatusChanged={handleStatusChanged}
                                                    canReportDelay={canReportDelay(expandedTask, project)}
                                                    onReportDelay={setDelayReportTask}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] px-5 py-14 text-center">
                            <ClipboardList
                                size={32}
                                className="mx-auto text-[#716658]"
                            />

                            <h3 className="mt-5 text-lg font-bold text-[#211E1A]">
                                {hasFilters
                                    ? "No matching tasks"
                                    : "No tasks added yet"}
                            </h3>

                            <p className="mt-2 text-xs text-[#716658]">
                                {hasFilters
                                    ? "Try adjusting the filters."
                                    : "Create your first project task to get started."}
                            </p>

                            {hasFilters ? (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="mt-5 min-h-11 rounded-xl border border-[#9A8872] bg-[#FFFDFA] px-4 py-2.5 text-xs font-semibold text-[#514538] hover:bg-[#F8F4EE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                                >
                                    Clear Filters
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={openCreate}
                                    disabled={project?.status === "CANCELLED"}
                                    className="rare-button rare-button-primary mt-5 min-h-11 px-4 py-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                                >
                                    <Plus size={18} aria-hidden="true" />
                                    Create First Task
                                </button>
                            )}
                        </div>
                    )}

                    {/* 7. PAGINATION AND PER PAGE: HIDE WHEN ONE PAGE */}
                    {pageCount > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E0D5C6] pt-4">
                            <label className="flex items-center gap-2 text-xs font-medium text-[#716658]">
                                Per page
                                <select
                                    aria-label="Tasks per page"
                                    value={pageSize}
                                    onChange={(event) => {
                                        setPageSize(Number(event.target.value));
                                        setPage(1);
                                    }}
                                    className="min-h-11 rounded-lg border border-[#E7DED2] bg-[#FFFDFA] px-2 py-2 text-xs text-[#211E1A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
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
                                        setExpandedId(null);
                                        setExpandedTask(null);
                                        setPage((value) =>
                                            Math.max(1, value - 1)
                                        );
                                    }}
                                    className="flex min-h-11 items-center gap-1 rounded-xl border border-[#9A8872] bg-[#FFFDFA] px-3 py-2 text-xs font-semibold text-[#514538] hover:bg-[#F8F4EE] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                                >
                                    <ChevronLeft size={16} aria-hidden="true" />
                                    Previous
                                </button>

                                <span
                                    aria-live="polite"
                                    aria-atomic="true"
                                    className="px-1 text-[#716658]"
                                >
                                    Page{" "}
                                    <strong className="font-semibold text-[#211E1A]">
                                        {safePage}
                                    </strong>{" "}
                                    of {pageCount}
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
                                    className="flex min-h-11 items-center gap-1 rounded-xl border border-[#9A8872] bg-[#FFFDFA] px-3 py-2 text-xs font-semibold text-[#514538] hover:bg-[#F8F4EE] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
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
