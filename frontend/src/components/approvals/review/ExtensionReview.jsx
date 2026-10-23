import { formatDate, formatText } from "../approvalUtils";
import Meta from "../ReviewFields";

export default function ExtensionReview({ record }) {
    return <div className="space-y-4">
        <div className="grid gap-4 rounded-2xl bg-[#EDF3FC] p-4 sm:grid-cols-2">
            <Meta label="Current task deadline" value={formatDate(record.current_end_date)} />
            <Meta label="Requested new deadline" value={formatDate(record.requested_end_date)} />
        </div>
        <Meta label="Supervisor's reason" value={record.reason} />
        <Meta label="Extension decision" value={formatText(record.extension_status)} />
        {record.extension_admin_comment && <Meta label="Extension feedback" value={record.extension_admin_comment} />}
        <div className="grid gap-4 sm:grid-cols-2"><Meta label="Reviewed by" value={record.extension_reviewed_by_name} /><Meta label="Reviewed on" value={formatDate(record.extension_reviewed_at)} /></div>
        {record.status !== "APPROVED" && <p className="rounded-xl bg-[#FFF2D8] p-4 text-xs leading-5 text-[#94651D]">The delay report must be approved before this extension can be approved. Extension rejection is available independently.</p>}
    </div>;
}
