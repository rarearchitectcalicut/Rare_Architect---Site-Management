import { useState } from "react";
import { X } from "lucide-react";
import ApprovalModal from "../../components/approvals/ApprovalModal";

export default function ApprovalDecisionModal({ action, label, busy, error, onClose, onSubmit }) {
    const [comment, setComment] = useState("");
    const rejecting = action === "reject";
    return <ApprovalModal compact label={rejecting ? "Confirm rejection" : "Confirm approval"} onClose={onClose} busy={busy} error={error}>
        <form className="space-y-5 p-6 sm:p-8" onSubmit={(event) => { event.preventDefault(); onSubmit(comment); }}>
            <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-bold">{rejecting ? "Reject" : "Approve"} {label}</h2>
                <button type="button" disabled={Boolean(busy)} onClick={onClose} aria-label="Close decision" className="rounded-full bg-[#F1EADF] p-2"><X size={18} /></button>
            </div>
            <p className="text-sm leading-6 text-[#716658]">{rejecting ? "Explain what needs to be corrected. The supervisor will be able to read your feedback." : "Confirm that you have reviewed this request and its supporting details."}</p>
            <label className="block text-sm font-semibold">{rejecting ? "Rejection reason (required)" : "Admin comment (optional)"}
                <textarea autoFocus required={rejecting} maxLength={1000} rows={4} value={comment} onChange={(event) => setComment(event.target.value)} className="mt-2 w-full rounded-xl border border-[#E4DCCD] p-3 text-sm outline-none focus:border-[#3565A5]" />
            </label>
            <div className="flex flex-wrap justify-end gap-3">
                <button type="button" disabled={Boolean(busy)} onClick={onClose} className="rounded-xl border border-[#E4DCCD] px-5 py-3 text-sm font-semibold">Cancel</button>
                <button type="submit" disabled={Boolean(busy) || (rejecting && !comment.trim())} className={`rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 ${rejecting ? "bg-[#B5473E]" : "bg-[#296F40]"}`}>{rejecting ? "Confirm Rejection" : "Confirm Approval"}</button>
            </div>
        </form>
    </ApprovalModal>;
}
