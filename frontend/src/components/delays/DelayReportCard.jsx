import { ArrowUpRight, CalendarDays, Clock3, FolderKanban, UserRound } from "lucide-react";
import { formatDate, formatText } from "../approvals/approvalUtils";

const tones = { APPROVED: "bg-pastel-mint text-success", REJECTED: "bg-pastel-blush text-danger", PENDING: "bg-pastel-butter text-warning" };

export default function DelayReportCard({ item, onOpen }) {
    const record = item.raw || {};
    const delayStatus = record.status || item.status;
    const extension = record.extension_requested;
    return <button type="button" onClick={() => onOpen(item)} aria-haspopup="dialog"
        aria-label={`Open ${item.requestType === "extension" ? "extension" : "delay report"}: ${item.title || "Task delay"}, ${item.projectName || "Project"}`}
        className="rare-delay-card">
        <span className="rare-delay-card-heading"><span className="rare-delay-card-icon"><Clock3 size={18} aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="rare-delay-card-project"><FolderKanban size={12} aria-hidden="true" />{item.projectName || "Project"}</span><span className="rare-delay-card-title">{item.title || "Task delay"}</span></span><ArrowUpRight size={16} className="shrink-0 text-muted" aria-hidden="true" /></span>
        <span className="rare-delay-card-status"><span className={tones[delayStatus] || "bg-app text-muted"}>Delay: {formatText(delayStatus)}</span>{extension && <span className={tones[record.extension_status] || "bg-app text-muted"}>Extension: {formatText(record.extension_status || "PENDING")}</span>}</span>
        <span className="rare-delay-card-reason"><strong>{formatText(record.delay_type || "Delay")}</strong><span>{item.preview || record.reason || "Open to view the delay details."}</span></span>
        <span className="rare-delay-card-dates"><span><span className="rare-delay-field-label"><CalendarDays size={12} aria-hidden="true" />Current deadline</span><strong>{formatDate(record.current_end_date)}</strong></span><span><span className="rare-delay-field-label">{extension ? "Requested deadline" : "Expected completion"}</span><strong>{formatDate(extension ? record.requested_end_date : record.expected_completion_date)}</strong></span></span>
        <span className="rare-delay-card-footer"><span className="inline-flex min-w-0 items-center gap-1"><UserRound size={12} className="shrink-0" aria-hidden="true" /><span className="truncate">{item.creator || record.reported_by_name || "Supervisor"}</span></span><span>{formatDate(item.createdAt || record.reported_at)}</span></span>
    </button>;
}
