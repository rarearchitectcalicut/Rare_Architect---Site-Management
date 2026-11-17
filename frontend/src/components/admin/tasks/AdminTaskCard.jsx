import { InfoField } from "../../common/InfoCard";
import { TaskProgress } from "../../tasks/TaskExecutionActions";
import { ArrowUpRight, CalendarDays, ChevronRight, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, formatText } from "../../approvals/approvalUtils";

import { isTaskOverdue } from "../../../api/taskApi";

export function TaskPageStyles() {
    return <style>{`
        @keyframes rare-task-enter {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .rare-tasks .task-enter { animation: none; }
        .rare-tasks .task-panel { border: 1px solid var(--color-border); background: var(--color-surface); border-radius: 24px; box-shadow: 0 4px 24px #422F1605; }
        .rare-tasks .task-hero { background: var(--color-surface); color: var(--color-ink); box-shadow: none; border-color: var(--color-border); }
        .rare-tasks :is(button,a,input,select) { transition: color 200ms, background-color 200ms, border-color 200ms, box-shadow 200ms, transform 200ms; }
        .rare-tasks :is(button,a,input,select):focus-visible { outline: 2px solid var(--color-subtle); outline-offset: 4px; }
        .rare-tasks button:disabled { cursor: not-allowed; }
        .rare-tasks .task-secondary { min-height: 44px; border: 1px solid var(--color-subtle); border-radius: 14px; background: var(--color-surface); box-shadow: 0 2px 4px #211E1A03; }
        .rare-tasks .task-secondary:hover:not(:disabled) { border-color: var(--color-border-strong); background: var(--color-surface-soft); box-shadow: 0 5px 14px #211E1A08; }
        .rare-tasks .task-primary { min-height: 48px; border: 1px solid var(--color-ink); background: var(--color-ink); color: var(--color-surface); box-shadow: 0 4px 12px #211E1A12; }
        .rare-tasks .task-primary:hover { background: var(--color-ink); box-shadow: 0 6px 18px #211E1A20; }
        @media (hover:hover) and (prefers-reduced-motion:no-preference) {
            .rare-tasks .task-lift:hover { transform: translateY(-3px); box-shadow: 0 14px 30px #422F160C; }
            .rare-tasks button:active:not(:disabled) { transform: scale(.98); }
        }
        @media (prefers-reduced-motion:reduce) {
            .rare-tasks .task-enter { animation: none; }
            .rare-tasks *, .rare-tasks *::before, .rare-tasks *::after { transition: none !important; scroll-behavior: auto !important; }
        }
    `}</style>;
}

const tones = {
    APPROVED: "bg-pastel-mint text-success", COMPLETED: "bg-pastel-mint text-success",
    PENDING: "bg-pastel-butter text-warning", HIGH: "bg-pastel-butter text-warning",
    REJECTED: "bg-pastel-blush text-danger", URGENT: "bg-pastel-blush text-danger",
    IN_PROGRESS: "bg-pastel-sky text-info",
};

export function TaskBadges({ task }) {
    return <div className="rare-task-badges flex flex-wrap gap-2 text-xs font-semibold">
        {[["Priority", task.priority], ["Approval", task.approval_status], ["Work", task.work_status]].map(([label, value]) =>
            <span key={label} className={`rounded-full border border-current/5 px-3 py-1.5 ${tones[value] || "bg-app text-muted"}`}>{label}: {formatText(value)}</span>)}
        {(typeof task.is_overdue === "boolean" ? task.is_overdue : isTaskOverdue(task)) && <span className="rounded-full bg-red-50 px-3 py-1.5 text-red-700">Overdue</span>}
    </div>;
}

export function MobileTaskCard({
    task,
    to,
    showProject = true,
    expanded = false,
    onClick,
    className = "",
    mobilePresentation,
    narrowMobileOnly = false,
    "aria-label": customAriaLabel,
    ariaLabel,
}) {
    const overdue = typeof task.is_overdue === "boolean" ? task.is_overdue : isTaskOverdue(task);
    const priorityTone = {
        URGENT: "bg-danger",
        HIGH: "bg-warning",
        MEDIUM: "bg-muted",
        LOW: "bg-info",
    };

    const rawWorker = task.worker_name?.trim();
    const assignee = rawWorker && rawWorker !== "Not specified"
        ? rawWorker
        : Array.isArray(task.supervisors)
            ? task.supervisors.map((supervisor) => supervisor.name).filter(Boolean).join(", ")
            : "";

    function formatSafeDate(value, includeYear = true) {
        if (!value || value === "Not specified") return "";
        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        if (Number.isNaN(date.getTime())) return "";
        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            ...(includeYear ? { year: "numeric" } : {}),
        });
    }

    let datesText = "";
    const hasStart = Boolean(task.start_date && task.start_date !== "Not specified");
    const hasEnd = Boolean(task.end_date && task.end_date !== "Not specified");

    if (hasStart && hasEnd) {
        const d1 = new Date(`${String(task.start_date).slice(0, 10)}T00:00:00`);
        const d2 = new Date(`${String(task.end_date).slice(0, 10)}T00:00:00`);
        const sameYear = !Number.isNaN(d1.getTime()) && !Number.isNaN(d2.getTime()) && d1.getFullYear() === d2.getFullYear();
        const startFormatted = formatSafeDate(task.start_date, !sameYear);
        const endFormatted = formatSafeDate(task.end_date, true);
        if (startFormatted && endFormatted) {
            datesText = `${startFormatted} → ${endFormatted}`;
        } else if (endFormatted) {
            datesText = `Due ${endFormatted}`;
        }
    } else if (hasEnd) {
        const endFormatted = formatSafeDate(task.end_date, true);
        if (endFormatted) datesText = `Due ${endFormatted}`;
    } else if (hasStart) {
        const startFormatted = formatSafeDate(task.start_date, true);
        if (startFormatted) datesText = `Starts ${startFormatted}`;
    }

    const progress = Number(task.progress?.progress_percentage);
    const showProgress = Number.isFinite(progress) && progress > 0;
    const awaitingVerification = !showProgress && task.work_status === "COMPLETED";
    const statusClass = (value) => tones[value] || "bg-app text-muted";

    const computedAriaLabel =
        customAriaLabel ||
        ariaLabel ||
        (showProject && task.project_name
            ? `${task.title || "Untitled Task"}, ${task.project_name}`
            : `Open task: ${task.title || "Untitled Task"}`);

    const row = mobilePresentation === "row";
    const gallery = mobilePresentation === "gallery";
    const presentationClass = row
        ? narrowMobileOnly ? "max-[480px]:flex-row max-[480px]:items-center max-[480px]:gap-2" : "max-md:flex-row max-md:items-center max-md:gap-2"
        : gallery
            ? narrowMobileOnly ? "max-[480px]:gap-3 max-[480px]:p-4" : "max-md:gap-3 max-md:p-4"
            : "";
    const rowContentClass = narrowMobileOnly
        ? "contents max-[480px]:flex max-[480px]:min-w-0 max-[480px]:flex-1 max-[480px]:flex-col max-[480px]:gap-1"
        : "contents max-md:flex max-md:min-w-0 max-md:flex-1 max-md:flex-col max-md:gap-1";
    const content = <>
        <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${priorityTone[task.priority] || "bg-muted"}`} />
            <span className={`rare-task-summary-title min-w-0 flex-1 truncate text-base font-semibold leading-5 text-ink ${gallery ? narrowMobileOnly ? "max-[480px]:whitespace-normal max-[480px]:break-words" : "max-md:whitespace-normal max-md:break-words" : ""}`}>{task.title || "Untitled Task"}</span>
            <ChevronRight size={18} aria-hidden="true" className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""} ${row ? narrowMobileOnly ? "max-[480px]:hidden" : "max-md:hidden" : ""}`} />
        </span>
        {showProject && <span className="truncate text-[12px] font-medium leading-4 text-muted">{task.project_name}</span>}
        <span className="mt-1 flex min-w-0 flex-wrap gap-1.5">{task.priority && <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold leading-4 ${statusClass(task.priority)}`}>Priority: {formatText(task.priority)}</span>}
            {[["Approval", task.approval_status], ["Work", task.work_status]].filter(([, value]) => value).map(([label, value]) =>
                <span key={label} className={`max-w-full truncate rounded-full px-2.5 py-1 text-[12px] font-semibold leading-4 ${statusClass(value)}`}>{label}: {formatText(value)}</span>)}
        </span>
        {(overdue || assignee || datesText) && <span className="rare-task-summary-meta flex min-w-0 items-center gap-1 truncate text-[12px] font-medium leading-4 text-muted">
            {overdue && <span className="shrink-0 font-semibold text-red-700">Overdue{assignee || datesText ? " · " : ""}</span>}
            {assignee && <span className="truncate">{assignee}</span>}
            {assignee && datesText && <span className="shrink-0"> · </span>}
            {datesText && <span className="shrink-0">{datesText}</span>}
        </span>}
        {showProgress ? (
            <span className="rare-task-summary-progress">
            <span className="flex justify-between gap-3 text-xs text-muted"><span>Verified progress</span><strong className="text-ink">{progress}%</strong></span>
            <span role="progressbar" aria-label={`${task.title || "Task"} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(progress, 100)} className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-border">
                <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(progress, 100)}%` }} />
            </span>
            </span>
        ) : awaitingVerification ? (
            <span className="truncate text-[12px] font-medium text-warning">Completed, awaiting verification</span>
        ) : null}
    </>;

    return <Link
        to={to}
        onClick={onClick}
        aria-label={computedAriaLabel}
        className={`rare-premium-task-card rare-task-summary group flex min-h-11 min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-surface p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${presentationClass} ${className}`}
    >
        {row ? <span className={rowContentClass}>{content}</span> : content}
        {row && <ChevronRight size={18} aria-hidden="true" className={`hidden shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""} ${narrowMobileOnly ? "max-[480px]:block" : "max-md:block"}`} />}
    </Link>;
}

export default function AdminTaskCard({ task, to, showProject = false, actionLabel = "Open Details", approvalTo, compact = false }) {
    const overdue = typeof task.is_overdue === "boolean" ? task.is_overdue : isTaskOverdue(task);
    const displayOrder = Number(task.display_order);
    const hasDisplayOrder = Number.isInteger(displayOrder) && displayOrder > 0;
    return <article className={`rare-premium-task-card task-panel task-lift group flex min-w-0 flex-col ${compact ? "rare-task-card-compact" : ""}`}>
        {showProject && <p className="rare-task-card-project">{task.project_name}</p>}
        <div className="rare-task-card-heading">
            <div className="min-w-0">{hasDisplayOrder && <p className="rare-info-eyebrow">Timeline order {displayOrder}</p>}
                <h2><Link to={to} className="hover:text-info">{task.title}</Link></h2></div>
            <span aria-hidden="true"><ArrowUpRight size={18} /></span>
        </div>
        <TaskBadges task={task} />
        {task.description && <p className="rare-task-card-description line-clamp-2">{task.description}</p>}
        <dl className="rare-task-card-meta">
            <InfoField icon={UserRound} label="Worker / team" value={task.worker_name || "Not assigned"} />
            <InfoField icon={CalendarDays} className={overdue ? "is-overdue" : ""} label="Due date" value={formatDate(task.end_date)} />
            <InfoField icon={CalendarDays} label="Start date" value={formatDate(task.start_date)} />
            {showProject && Array.isArray(task.supervisors) && <InfoField icon={UserRound} label="Assigned Supervisor" value={task.supervisors.map((supervisor) => supervisor.name).join(", ") || "Not assigned"} />}
        </dl>
        <div className="rare-task-card-progress"><TaskProgress progress={task.progress} compact /></div>
        <div className="rare-task-card-footer">
            <Link to={to}>{actionLabel}<span className="sr-only">: {task.title}</span><ArrowUpRight size={16} aria-hidden="true" /></Link>
            {approvalTo && <Link to={approvalTo}>Open in Approval Center</Link>}
        </div>
    </article>;
}
