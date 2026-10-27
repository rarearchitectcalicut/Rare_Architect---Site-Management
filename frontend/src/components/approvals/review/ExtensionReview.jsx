import { formatDate, formatDateTime, formatText } from "../approvalUtils";
import Meta from "../ReviewFields";

export default function ExtensionReview({ record }) {
    const history = record.deadline_history;
    return <section className="space-y-4">
        <h3 className="font-bold">Deadline extension</h3>
        <div className="grid gap-4 rounded-2xl bg-[#F1EADF] p-4 sm:grid-cols-2">
            <Meta label="Current task deadline" value={formatDate(record.current_end_date)} />
            <Meta label="Requested new deadline" value={formatDate(record.requested_end_date)} />
            <Meta label="Deadline when reported" value={history?.submission_deadline_recorded ? history.deadline_at_submission ? formatDate(history.deadline_at_submission) : "No deadline set" : "Not recorded"} />
            <Meta label="Expected completion" value={formatDate(record.expected_completion_date)} />
        </div>
        <Meta label="Delay category" value={formatText(record.delay_type)} />
        <Meta label="Supervisor's reason" value={record.reason} />
        <Meta label="Detailed explanation" value={record.description} />
        <Meta label="Delay report decision" value={formatText(record.status)} />
        <Meta label="Extension decision" value={formatText(record.extension_status)} />
        {record.extension_admin_comment && <Meta label="Extension feedback" value={record.extension_admin_comment} />}
        <div className="grid gap-4 sm:grid-cols-2"><Meta label="Extension reviewed by" value={record.extension_reviewed_by_name} /><Meta label="Extension reviewed at" value={formatDateTime(record.extension_reviewed_at)} /></div>
        {record.extension_status === "APPROVED" && <div className="grid gap-4 rounded-xl bg-[#F1EADF] p-4 sm:grid-cols-2"><Meta label="Previous approved deadline" value={history?.previous_approved_deadline ? formatDate(history.previous_approved_deadline) : "Not recorded / no deadline set"} /><Meta label="New approved deadline" value={formatDate(history?.new_approved_deadline || record.requested_end_date)} /></div>}
        {record.extension_status === "REJECTED" && <Meta label="Deadline preserved at rejection" value={history?.deadline_at_rejection ? formatDate(history.deadline_at_rejection) : "Not recorded / no deadline set"} />}
        {record.extension_status === "PENDING" && record.status !== "APPROVED" && <p className="rounded-xl bg-[#FFF2D8] p-4 text-xs leading-5 text-[#94651D]">The delay report must be approved before this extension can be approved. Extension rejection is available independently.</p>}
    </section>;
}
