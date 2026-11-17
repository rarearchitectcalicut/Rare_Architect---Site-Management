import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Pencil, RefreshCw } from "lucide-react";
import { InfoField } from "../common/InfoCard";
import { delayApi } from "../../api/delayApi";
import { taskApi } from "../../api/taskApi";
import DelayReportReview from "../approvals/review/DelayReportReview";
import { formatDateTime } from "../approvals/approvalUtils";
import TaskDocuments from "./TaskDocuments";
import TaskExecutionActions, { TaskProgress } from "./TaskExecutionActions";
import TaskSectionNavigation from "./TaskSectionNavigation";

const statusColors = {
    LOW: "bg-pastel-sky text-info",
    MEDIUM: "bg-app text-muted",
    HIGH: "bg-pastel-butter text-warning",
    URGENT: "bg-pastel-blush text-danger",
    PENDING: "bg-pastel-butter text-warning",
    APPROVED: "bg-pastel-mint text-success",
    REJECTED: "bg-pastel-blush text-danger",
    NOT_STARTED: "bg-app text-muted",
    IN_PROGRESS: "bg-pastel-sky text-info",
    COMPLETED: "bg-pastel-mint text-success",
    DELAYED: "bg-pastel-blush text-danger",
    CANCELLED: "bg-border text-muted",
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

function Badge({ value }) {
    if (!value) return null;

    return (
        <span
            className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
                statusColors[value] || "bg-border text-muted"
            }`}
        >
            {readable(value)}
        </span>
    );
}

function DetailItem({ label, value }) {
    return <InfoField label={label} value={value} />;
}

export default function SupervisorTaskContent({
    task,
    loading,
    error,
    onRetry,
    onStatusChanged,
    canReportDelay = false,
    onReportDelay,
}) {
    const [tab, setTab] = useState("overview");
    const [delayPage, setDelayPage] = useState(1);
    const [delayRevision, setDelayRevision] = useState(0);
    const [delayReports, setDelayReports] = useState(null);
    const delayKey = `${task?.id}:${task?.end_date}:${delayPage}:${delayRevision}`;
    const delayState = delayReports?.key === delayKey ? delayReports : null;
    useEffect(() => {
        if (!task?.id || tab !== "delays") return;
        const controller = new AbortController();
        delayApi.list({ task: task.id, page: delayPage, page_size: 5 }, controller.signal).then((data) => {
            if (!Array.isArray(data?.results) || !Number.isInteger(data.count)) throw new Error("Unexpected delay report response.");
            if (!controller.signal.aborted) setDelayReports({ key: delayKey, data });
        }).catch((failure) => {
            if (!controller.signal.aborted) setDelayReports({ key: delayKey, error: failure.response?.data?.detail || "Unable to load task delay reports." });
        });
        return () => controller.abort();
    }, [task?.id, delayPage, delayKey, tab]);
    const [decisionPage, setDecisionPage] = useState(1);
    const [decisionRevision, setDecisionRevision] = useState(0);
    const [decisions, setDecisions] = useState(null);
    const decisionKey = `${task?.id}:${decisionPage}:${decisionRevision}`;
    const decisionState = decisions?.key === decisionKey ? decisions : null;
    useEffect(() => {
        if (!task?.id || tab !== "decisions") return;
        const controller = new AbortController();
        taskApi.history(task.id, { decisions_only: true, page: decisionPage, page_size: 10 }, controller.signal).then((data) => {
            if (!Array.isArray(data?.results) || !Number.isInteger(data.count)) throw new Error("Unexpected decision history response.");
            if (!controller.signal.aborted) setDecisions({ key: decisionKey, data });
        }).catch((failure) => {
            if (!controller.signal.aborted) setDecisions({ key: decisionKey, error: failure.response?.data?.detail || "Unable to load Admin decisions." });
        });
        return () => controller.abort();
    }, [task?.id, decisionPage, decisionRevision, decisionKey, tab]);

    if (loading) {
        return (
            <div className="flex items-center gap-3 border-t border-border p-6 text-sm text-muted">
                <RefreshCw size={18} className="animate-spin" />
                Loading task details...
            </div>
        );
    }

    if (error) {
        return (
            <div className="border-t border-border p-5">
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

    const quantity =
        task.planned_quantity !== null &&
            task.planned_quantity !== undefined
            ? `${task.planned_quantity} ${task.measurement_unit || ""}`.trim()
            : "Not applicable";

    return <section className="supervisor-task-content rare-task-sections">
        <TaskSectionNavigation tabs={[["overview", "Overview"], ["documents", "Docs"], ["decisions", "Decisions"], ["delays", "Delays"]]} activeTab={tab} onChange={setTab} panelId="supervisor-task-section" />
        <div id="supervisor-task-section" className="mt-4" data-section={tab}>
            {tab === "overview" && <div className="supervisor-task-overview">
                <div className="supervisor-task-facts">
            {/* CURRENT STATUSES */}
            <div className="supervisor-task-statuses mt-5 flex flex-wrap gap-3">
                {[
                    ["Approval Status", task.approval_status],
                    ["Work Status", task.work_status],
                    ["Priority", task.priority],
                ].map(([label, value]) => (
                    <div
                        key={label}
                        className="rounded-xl bg-surface-soft px-4 py-3"
                    >
                        <p className="mb-2 text-xs font-bold uppercase text-muted">
                            {label}
                        </p>

                        <Badge value={value} />
                    </div>
                ))}
            </div>

            <dl className="rare-info-grid supervisor-task-fields mt-5 grid gap-4 rounded-[20px] bg-surface-soft p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
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
            </dl>

                </div>
                <div className="supervisor-task-work rounded-2xl border border-border bg-surface p-5">
                    <h2 className="mb-4 text-sm font-semibold">Work & verified progress</h2>
            <TaskExecutionActions
                key={task.id}
                task={task}
                onSuccess={onStatusChanged}
            />

            <TaskProgress progress={task.progress} />

                </div>
            {/* DESCRIPTION AND COMPLETION CRITERIA */}
            <div className="supervisor-task-description mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[18px] border border-border p-4 sm:p-5">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-ink">
                        <ClipboardList size={18} className="text-info" />
                        Task Description
                    </h4>

                    <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-muted sm:text-sm">
                        {task.description || "No description provided."}
                    </p>
                </div>

                <div className="rounded-[18px] border border-border p-4 sm:p-5">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-ink">
                        <CheckCircle2 size={18} className="text-success" />
                        Completion Criteria
                    </h4>

                    <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-muted sm:text-sm">
                        {task.completion_criteria ||
                            "No completion criteria specified."}
                    </p>
                </div>
            </div>

            </div>}
            {tab === "documents" && <TaskDocuments taskId={task.id} readOnly={task.project_status === "CANCELLED"} />}
            {tab === "decisions" && <div className="supervisor-task-decisions">            <section aria-label="Admin decision history" className="mt-5 space-y-3 rounded-[18px] border border-border bg-surface-soft p-4 sm:p-5">
                <h4 className="text-sm font-bold text-ink">Admin decisions and comments</h4>
                {!decisionState && <p role="status" className="text-xs text-muted">Loading decision history...</p>}
                {decisionState?.error && <p role="alert" className="text-xs text-red-700">{decisionState.error} <button type="button" className="underline" onClick={() => setDecisionRevision((value) => value + 1)}>Retry</button></p>}
                {decisionState?.data?.results.map((decision) => <article key={decision.id} className="rounded-xl border border-border bg-surface p-4">
                    <p className={`text-sm font-semibold ${decision.action.endsWith("REJECTED") ? "text-danger" : "text-success"}`}>{readable(decision.action)}</p>
                    <p className="mt-1 text-xs text-muted">{decision.actor_name || "Reviewer unavailable"} / {formatDateTime(decision.created_at)}</p>
                    <p className="mt-3 whitespace-pre-wrap break-words text-xs text-ink sm:text-sm">{decision.details?.reason || decision.details?.comment || decision.details?.admin_comment || "No comment provided."}</p>
                </article>)}
                {decisionState?.data?.count === 0 && <p className="text-xs text-muted">No Admin decision has been recorded yet.</p>}
                {decisionState?.data && (decisionState.data.next || decisionState.data.previous) && <nav aria-label="Decision history pages" className="rare-pagination">
                    <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" disabled={!decisionState.data.previous} onClick={() => setDecisionPage((page) => page - 1)}>Previous decisions</button>
                    <span aria-live="polite" aria-atomic="true" className="text-xs text-muted">Page {decisionPage} / {Math.max(1, Math.ceil(decisionState.data.count / 10))}</span>
                    <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" disabled={!decisionState.data.next} onClick={() => setDecisionPage((page) => page + 1)}>Next decisions</button>
                </nav>}
            </section>
</div>}
            {tab === "delays" && <div className="supervisor-task-delays">            <section aria-label="Task delay reports" className="mt-5 space-y-4 rounded-[18px] border border-border bg-surface-soft p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-sm font-bold">Delay reports for this task</h4>
                    <div className="flex flex-wrap items-center gap-2">
                        {canReportDelay && <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" onClick={() => onReportDelay(task)}>Report delay</button>}
                        <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" onClick={() => setDelayRevision((value) => value + 1)}>Refresh reports</button>
                    </div>
                </div>
                <p className="text-xs text-muted">Current approved deadline: {formatDate(task.end_date)}. Reporting a delay does not change this deadline; an extension needs separate approval.</p>
                {!delayState && <p role="status" className="text-xs text-muted">Loading task delay reports...</p>}
                {delayState?.error && <p role="alert" className="text-xs text-red-700">{delayState.error} <button type="button" className="underline" onClick={() => setDelayRevision((value) => value + 1)}>Retry</button></p>}
                {delayState?.data?.count === 0 && <p className="text-xs text-muted">No delays have been reported for this task.</p>}
                {delayState?.data?.results.map((report) => <article key={report.id} className="rounded-xl border border-border bg-surface p-4"><DelayReportReview record={report} role="SUPERVISOR" /></article>)}
                {delayState?.data && (delayState.data.next || delayState.data.previous) && <nav aria-label="Task delay report pages" className="rare-pagination">
                    <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" disabled={!delayState.data.previous} onClick={() => setDelayPage((page) => page - 1)}>Previous reports</button>
                    <span aria-live="polite" aria-atomic="true" className="text-xs text-muted">Page {delayPage} / {Math.max(1, Math.ceil(delayState.data.count / 5))}</span>
                    <button type="button" className="rare-button rare-button-secondary min-h-11 text-xs" disabled={!delayState.data.next} onClick={() => setDelayPage((page) => page + 1)}>Next reports</button>
                </nav>}
            </section>
</div>}
        </div>
    </section>;
}

export function SupervisorTaskEditAction({ task, onEdit }) {
    if (task.project_status === "CANCELLED" || !["PENDING", "REJECTED", "APPROVED"].includes(task.approval_status)) return null;
    const label = task.approval_status === "REJECTED" ? "Correct & Resubmit" : task.approval_status === "APPROVED" ? "Request Changes" : "Edit Task";
    return <button type="button" onClick={() => onEdit(task)} className="rare-button rare-button-secondary min-h-11 text-xs"><Pencil size={15} aria-hidden="true" />{label}</button>;
}
