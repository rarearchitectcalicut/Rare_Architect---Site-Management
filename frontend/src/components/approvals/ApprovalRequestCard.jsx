import { ChevronRight, FolderKanban } from "lucide-react";
import { requestLabels } from "./queueData";
import { formatDate, formatText } from "./approvalUtils";

export default function ApprovalRequestCard({ item, onOpen, compact = false }) {
    const final = item.status !== "PENDING";
    if (compact) return <button type="button" onClick={() => onOpen(item)} aria-haspopup="dialog" className="group flex min-w-0 flex-col rounded-[20px] border border-[#E7DED2] bg-[#FFFDFA] p-4 text-left transition-colors hover:border-[#A8BDD7] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3565A5] sm:aspect-square sm:p-5">
        <span className="flex w-full flex-wrap items-center justify-between gap-2"><span className="text-[11px] font-bold uppercase tracking-wider text-[#74695D]">Delay report</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === "REJECTED" ? "bg-[#FCE9E6] text-[#B5473E]" : item.status === "APPROVED" ? "bg-[#E7F2E8] text-[#296F40]" : "bg-[#FFF2D8] text-[#94651D]"}`}>{formatText(item.status)}</span></span>
        <span className="mt-3 line-clamp-2 wrap-anywhere text-sm font-bold text-[#252B2A] sm:text-base">{item.title || "Task delay"}</span>
        <span className="mt-2 flex min-w-0 items-start gap-2 text-xs text-[#716658]"><FolderKanban size={14} className="shrink-0" /><span className="min-w-0 line-clamp-1 wrap-anywhere">{item.projectName}</span></span>
        <span className="mt-2 line-clamp-1 text-xs font-medium text-[#716658]">{formatText(item.raw.delay_type || "Delay")}{item.raw.extension_requested ? " · Extension requested" : ""}</span>
        <span className="mt-2 line-clamp-3 text-xs leading-5 text-[#716658]">{item.preview || "Open to view delay report details."}</span>
        <span className="mt-auto flex items-center justify-between gap-2 border-t border-[#EEE6DC] pt-3"><span className="min-w-0"><span className="block max-w-36 truncate text-xs font-semibold text-[#665E53]">{item.creator}</span><span className="block text-xs text-[#716658]">{formatDate(item.createdAt)}</span></span><span className="shrink-0 text-xs font-bold text-[#3565A5]">View report <ChevronRight size={14} className="inline" /></span></span>
    </button>;
    return <button type="button" onClick={() => onOpen(item)} aria-haspopup="dialog" className="group flex min-w-0 flex-col rounded-[20px] border border-[#E7DED2] bg-[#FFFDFA] p-5 text-left transition-colors hover:border-[#A8BDD7] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3565A5] sm:p-6">
        <span className="flex w-full flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wider text-[#74695D]">{requestLabels[item.requestType]}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === "REJECTED" ? "bg-[#FCE9E6] text-[#B5473E]" : ["APPROVED", "VERIFIED"].includes(item.status) ? "bg-[#E7F2E8] text-[#296F40]" : final ? "bg-[#F1EADF] text-[#716658]" : "bg-[#FFF2D8] text-[#94651D]"}`}>{formatText(item.status)}</span></span>
        <span className="mt-4 wrap-anywhere line-clamp-2 text-base font-bold text-[#252B2A]">{item.title}</span>
        <span className="mt-2 flex items-start gap-2 text-xs text-[#716658]"><FolderKanban size={14} className="shrink-0" /><span className="min-w-0 wrap-anywhere line-clamp-2">{item.projectName}</span></span>
        <span className="mt-3 line-clamp-2 text-xs leading-5 text-[#716658]">{final ? item.comment || item.preview || "Open to view this recorded decision." : item.preview || "Open this request to review its full details."}</span>
        {item.priority && item.requestType === "tasks" && <span className="mt-4 self-start rounded-md bg-[#F1EADF] px-2 py-1 text-xs font-semibold text-[#74695D]">{formatText(item.priority)} priority{item.batchId ? " · Bulk submission" : ""}</span>}
        {item.requestType === "delay" && item.raw.extension_requested && <span className="mt-3 self-start rounded-md bg-[#EDF3FC] px-2 py-1 text-xs font-semibold text-[#3565A5]">Extension: {formatText(item.raw.extension_status)}</span>}
        {item.requestType === "delay" && item.raw.delay_type && <span className="mt-3 grid w-full gap-1 break-words text-xs leading-5 text-[#716658]">
            <span>Category: {formatText(item.raw.delay_type)}</span>
            <span>Reported by: {item.raw.reported_by_name || "Unavailable"} / {formatDate(item.raw.reported_at)}</span>
            <span>Current deadline: {formatDate(item.raw.current_end_date)}</span>
            {item.raw.extension_requested && <span>Requested deadline: {formatDate(item.raw.requested_end_date)}</span>}
            {item.raw.admin_comment && <span>Report feedback: {item.raw.admin_comment}</span>}
            {item.raw.extension_admin_comment && <span>Extension feedback: {item.raw.extension_admin_comment}</span>}
        </span>}
        <span className="mt-auto w-full pt-5"><span className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EEE6DC] pt-4"><span className="min-w-0"><span className="block max-w-40 truncate text-xs font-semibold text-[#665E53]">{final ? item.reviewedBy || item.creator : item.creator}</span><span className="block text-xs text-[#716658]">{formatDate(final ? item.reviewedAt || item.createdAt : item.createdAt)}</span></span><span className="inline-flex items-center gap-1 text-xs font-bold text-[#3565A5]">{final ? "View decision" : "Review request"}<ChevronRight size={15} /></span></span></span>
    </button>;
}
