import Meta from "./ReviewFields";
import { formatDateTime, formatText } from "./approvalUtils";

export default function ApprovalHistory({ status, reviewer, date, comment }) {
    return <section className="space-y-4 rounded-2xl border border-[#E7DED2] bg-[#F8F4EE] p-4">
        <h3 className="text-sm font-bold">Recorded decision · {formatText(status)}</h3>
        <div className="grid gap-4 sm:grid-cols-2"><Meta label="Reviewed by" value={reviewer} /><Meta label="Decision date" value={formatDateTime(date)} /></div>
        <Meta label="Reason / comment" value={comment || "No comment recorded."} />
    </section>;
}
