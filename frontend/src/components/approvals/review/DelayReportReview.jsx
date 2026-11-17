import { Link } from "react-router-dom";
import Meta from "../ReviewFields";
import { formatDate, formatDateTime, formatText } from "../approvalUtils";
import ExtensionReview from "./ExtensionReview";
import InfoCard, { InfoField } from "../../common/InfoCard";
import { Clock3 } from "lucide-react";

export default function DelayReportReview({ record, role = "ADMIN" }) {
    const prefix = role === "ADMIN" ? "/admin" : "/supervisor";
    return <div className="rare-delay-review space-y-4">
        <InfoCard title="Delay information" eyebrow="Schedule impact" icon={Clock3}>
        <dl className="rare-info-grid">
            <InfoField label="Current approved deadline" value={formatDate(record.current_end_date)} />
            <InfoField label="Deadline when reported" value={record.deadline_history?.submission_deadline_recorded ? record.deadline_history.deadline_at_submission ? formatDate(record.deadline_history.deadline_at_submission) : "No deadline set" : "Not recorded"} />
            <InfoField label="Extension requested" value={record.extension_requested ? "Yes" : "No"} />
            <InfoField label="Submitted by" value={record.reported_by_name} />
            <InfoField label="Submitted at" value={formatDateTime(record.reported_at)} />
            <InfoField label="Delay type" value={formatText(record.delay_type)} /><InfoField label="Supervisor expected completion" value={formatDate(record.expected_completion_date)} />
        </dl>
        </InfoCard>
        <div className="rare-delay-review-reason"><Meta label="Reason" value={record.reason} /><Meta label="Description" value={record.description} /></div>
        <div className="rare-info-card">
            <h3 className="font-bold">Report decision</h3>
            <p className="mt-2 text-sm">{formatText(record.status)} · {record.reviewed_by_name || "Not yet reviewed"}</p>
            <p className="mt-1 text-xs text-muted">{formatDateTime(record.reviewed_at)}</p>
            {record.admin_comment && <p className="mt-3 whitespace-pre-wrap text-sm">{record.admin_comment}</p>}
        </div>
        <Link className="inline-block text-sm font-semibold text-info" to={`${prefix}/projects/${record.project_id}`}>View affected project</Link>
        <Link className="ml-4 inline-block text-sm font-semibold text-info" to={role === "ADMIN" ? `/admin/projects/${record.project_id}/tasks/${record.task}` : `${prefix}/projects/${record.project_id}/tasks/${record.task}`}>View affected task</Link>
        {role === "SUPERVISOR" && <Link className="block text-sm font-semibold text-info" to={`/supervisor/projects/${record.project_id}/delays`}>Open project delay register</Link>}
        {record.extension_requested && <ExtensionReview record={record} />}
        <p className="rounded-xl bg-pastel-sky p-4 text-xs leading-5 text-info">{record.extension_status === "APPROVED" ? "The deadline extension was approved separately. Its recorded deadline change is shown above." : record.extension_status === "REJECTED" ? "The extension was rejected. That decision did not change the task deadline." : record.extension_requested ? "Approving this report records the delay. The pending extension requires a separate decision before the task deadline can change." : "Approving this report records the delay and does not change the task deadline."}</p>
    </div>;
}
