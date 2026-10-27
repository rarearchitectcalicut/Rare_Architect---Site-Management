import { TaskProgress } from "../../tasks/TaskExecutionActions";
import { ArrowUpRight, CalendarDays, UserRound } from "lucide-react";
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
        .rare-tasks .task-panel { border: 1px solid #E7DED2; background: #FFFDFA; border-radius: 24px; box-shadow: 0 4px 24px #422F1605; }
        .rare-tasks .task-hero { background: #FFFDFA; color: #211E1A; box-shadow: none; border-color: #E7DED2; }
        .rare-tasks :is(button,a,input,select) { transition: color 200ms, background-color 200ms, border-color 200ms, box-shadow 200ms, transform 200ms; }
        .rare-tasks :is(button,a,input,select):focus-visible { outline: 2px solid #A58A67; outline-offset: 4px; }
        .rare-tasks button:disabled { cursor: not-allowed; }
        .rare-tasks .task-secondary { border: 1px solid #E7DED2; border-radius: 14px; background: #FFFDFA; box-shadow: 0 2px 4px #211E1A03; }
        .rare-tasks .task-secondary:hover:not(:disabled) { border-color: #C9B9A4; background: #F8F4EE; box-shadow: 0 5px 14px #211E1A08; }
        .rare-tasks .task-primary { background: #211E1A; color: #FFFDFA; box-shadow: 0 4px 12px #211E1A12; }
        .rare-tasks .task-primary:hover { background: #44382B; box-shadow: 0 6px 18px #211E1A20; }
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
    APPROVED: "bg-[#E7F2E8] text-[#296F40]", COMPLETED: "bg-[#E7F2E8] text-[#296F40]",
    PENDING: "bg-[#FFF2D8] text-[#94651D]", HIGH: "bg-[#FFF2D8] text-[#94651D]",
    REJECTED: "bg-[#FCE9E6] text-[#B5473E]", URGENT: "bg-[#FCE9E6] text-[#B5473E]",
    IN_PROGRESS: "bg-[#E9F0FC] text-[#3565A5]",
};

export function TaskBadges({ task }) {
    return <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {[["Priority", task.priority], ["Approval", task.approval_status], ["Work", task.work_status]].map(([label, value]) =>
            <span key={label} className={`rounded-full border border-current/5 px-3 py-1.5 ${tones[value] || "bg-[#F1EADF] text-[#74614D]"}`}>{label}: {formatText(value)}</span>)}
        {(typeof task.is_overdue === "boolean" ? task.is_overdue : isTaskOverdue(task)) && <span className="rounded-full bg-red-50 px-3 py-1.5 text-red-700">Overdue</span>}
    </div>;
}

export default function AdminTaskCard({ task, to, showProject = false, actionLabel = "Open Details", approvalTo }) {
    const overdue = typeof task.is_overdue === "boolean" ? task.is_overdue : isTaskOverdue(task);
    return <article className="task-panel task-lift group relative flex min-w-0 flex-col overflow-hidden p-4 transition-colors duration-150 sm:p-5">
        <div aria-hidden="true" className={`absolute inset-x-6 top-0 h-0.5 rounded-b-full ${overdue ? "bg-[#C78576]" : "bg-[#B8A181]/50"}`} />
        {showProject && <p className="mb-3 break-words text-xs font-semibold text-[#8B6944]">{task.project_name}</p>}
        <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#716658]">Timeline order {task.display_order ?? "Not assigned"}</p>
                <h2 className="mt-2 break-words text-lg font-semibold leading-7 tracking-tight"><Link to={to} className="hover:text-[#8B6944]">{task.title}</Link></h2></div>
            <span className="rounded-xl border border-[#E7DED2] bg-[#F8F4EE] p-2 text-[#716658] transition-colors group-hover:bg-[#EDE2D2]"><ArrowUpRight size={17} aria-hidden="true" /></span>
        </div>
        <TaskBadges task={task} />
        <TaskProgress progress={task.progress} />
        {showProject && Array.isArray(task.supervisors) && <p className="mt-3 break-words text-xs leading-5 text-[#716658]">Assigned Supervisor: {task.supervisors.map((supervisor) => supervisor.name).join(", ") || "Not assigned"}</p>}
        {task.description && <p className="mt-4 line-clamp-2 break-words text-sm leading-6 text-[#716658]">{task.description}</p>}
        <div className="mb-4 mt-4 space-y-2 rounded-xl bg-[#F8F5F0] p-4">
            <p className="flex items-center gap-2.5 break-words text-sm text-[#665C50]"><UserRound size={16} className="shrink-0 text-[#A38D72]" aria-hidden="true" />{task.worker_name || "Worker/team not assigned"}</p>
            <p className="flex items-start gap-2.5 text-xs leading-5 text-[#716658]"><CalendarDays size={16} className="mt-0.5 shrink-0 text-[#A38D72]" aria-hidden="true" />{formatDate(task.start_date)} – {formatDate(task.end_date)}</p>
        </div>
        <Link to={to} className="task-primary mt-auto inline-flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold">{actionLabel}<span className="sr-only">: {task.title}</span><ArrowUpRight size={16} aria-hidden="true" /></Link>
        {approvalTo && <Link to={approvalTo} className="mt-3 rounded-lg py-1 text-center text-xs font-semibold text-[#8B6944] hover:underline">Open in Approval Center</Link>}
    </article>;
}
