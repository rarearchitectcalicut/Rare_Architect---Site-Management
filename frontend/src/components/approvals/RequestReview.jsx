import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, RefreshCw, X, XCircle } from "lucide-react";
import ApprovalModal from "./ApprovalModal";
import Meta from "./ReviewFields";
import ApprovalHistory from "./ApprovalHistory";
import ApprovalDecisionModal from "../../modal/admin/ApprovalDecisionModal";
import { useApprovalReview } from "../../hooks/useApprovalReview";
import { requestLabels } from "./queueData";
import { formatDateTime, formatText, getChanges } from "./approvalUtils";
import TaskApprovalReview from "./review/TaskApprovalReview";
import TaskChangeReview from "./review/TaskChangeReview";
import TimelineOrderReview from "./review/TimelineOrderReview";
import DelayReportReview from "./review/DelayReportReview";
import ExtensionReview from "./review/ExtensionReview";
import DailyWorkReview from "./review/DailyWorkReview";

const reviewers = { tasks: TaskApprovalReview, changes: TaskChangeReview, timeline: TimelineOrderReview, delay: DelayReportReview, extension: ExtensionReview, work: DailyWorkReview };

export default function RequestReview({ item, onClose, onSuccess, readOnly = false, role = "ADMIN" }) {
    const { record, loading, error, busy, decide, retry } = useApprovalReview(item, onSuccess);
    const [action, setAction] = useState(null);
    const requestType = record?.change_type === "ORDER_CHANGE" ? "timeline" : item.requestType;
    const Review = reviewers[requestType];
    const liveStatus = item.requestType === "extension" ? record?.extension_status : record?.verification_status || record?.approval_status || record?.status;
    const status = item.historyId ? item.status : liveStatus || item.status;
    const decision = requestType === "extension"
        ? { reviewer: record?.extension_reviewed_by_name, date: record?.extension_reviewed_at, comment: record?.extension_admin_comment }
        : requestType === "work"
            ? { reviewer: record?.verified_by_name, date: record?.verified_at, comment: record?.verification_note }
            : { reviewer: record?.reviewed_by_name, date: record?.reviewed_at, comment: record?.admin_comment };
    const canDecide = !readOnly && !item.historyId && status === "PENDING" && record && !loading && (requestType !== "work" || record.report_status === "SUBMITTED");
    const approveBlocked = requestType === "extension" && record?.status !== "APPROVED" || requestType === "changes" && !getChanges(record).length || requestType === "work" && record?.task_work_status === "CANCELLED";
    return <ApprovalModal onClose={onClose} error={action ? "" : error}>
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-[#252B2A] p-6 text-white sm:px-8">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#CBB99A]">RARE / Request review</p><h2 className="mt-2 text-xl font-semibold">{requestLabels[requestType]}</h2></div>
            <button autoFocus type="button" disabled={Boolean(busy)} aria-label="Close selected approval" onClick={onClose} className="rounded-full border border-white/20 p-2.5 disabled:opacity-40"><X size={18} /></button>
        </header>
        <div className="space-y-6 p-5 sm:p-8">
            <div><h3 className="text-xl font-bold">{record?.task_title || record?.title || item.title || requestLabels[item.requestType]}</h3>
                <p className="mt-2 text-sm text-[#817669]">{record?.project_name || item.projectName || "Project request"}</p>
                <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${status === "REJECTED" ? "bg-[#FCE9E6] text-[#B5473E]" : "bg-[#EDF3FC] text-[#3565A5]"}`}>{formatText(status)}</span>
            </div>
            {loading ? <p role="status" className="flex items-center gap-2 text-sm"><RefreshCw size={17} className="animate-spin" />Loading request details…</p> : record ? <>
                <div className="grid gap-4 rounded-2xl bg-[#F8F4EE] p-4 sm:grid-cols-2"><Meta label={item.historyId ? "Original task decision" : "Submitted by"} value={item.historyId ? "Historical approval cycle" : record.reported_by_name || record.requested_by_name || record.created_by_name || item.creator} /><Meta label="Submitted" value={formatDateTime(item.createdAt || record.reported_at || record.created_at)} /></div>
                {item.historyId && <p className="text-xs text-[#817669]">The decision below is preserved from task history. Task details reflect the current task record.</p>}
                {Review && <Review record={record} item={item} role={role} />}
                {status !== "PENDING" && <ApprovalHistory status={status} reviewer={item.historyId ? item.reviewedBy : decision.reviewer || item.reviewedBy} date={item.historyId ? item.reviewedAt : decision.date || item.reviewedAt} comment={item.historyId ? item.comment : decision.comment || item.comment} />}
                {role === "ADMIN" && item.requestType === "delay" && record.extension_requested && record.extension_status === "PENDING" && <Link className="inline-block text-sm font-semibold text-[#3565A5]" to={`/admin/approvals?tab=delays&type=extension&request=${item.id}`}>Review deadline extension →</Link>}
                {canDecide && <div className="grid grid-cols-2 gap-3 border-t border-[#E7DED2] pt-5">
                    <button type="button" disabled={Boolean(busy) || approveBlocked} onClick={() => setAction("approve")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E7F2E8] px-4 py-3 text-sm font-bold text-[#296F40] disabled:opacity-40"><Check size={18} />{item.requestType === "work" ? "Verify" : "Approve"}</button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => setAction("reject")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FCE9E6] px-4 py-3 text-sm font-bold text-[#B5473E]"><XCircle size={18} />Reject</button>
                </div>}
            </> : <button type="button" onClick={retry} className="rounded-xl border border-[#E4DCCD] px-4 py-2 text-sm font-semibold">Retry loading details</button>}
        </div>
        {action && <ApprovalDecisionModal action={action} label={requestLabels[requestType]} onClose={() => setAction(null)} busy={busy} error={error} onSubmit={(comment) => decide(action, comment)} />}
    </ApprovalModal>;
}
