import { Link } from "react-router-dom";
import Meta from "../ReviewFields";
import { formatDate, formatDateTime, formatText } from "../approvalUtils";
import ExtensionReview from "./ExtensionReview";

export default function DelayReportReview({ record, role = "ADMIN" }) {
    const prefix = role === "ADMIN" ? "/admin" : "/supervisor";
    return <div className="space-y-5">
        <div className="grid gap-4 rounded-2xl bg-[#F8F4EE] p-4 sm:grid-cols-2">
            <Meta label="Current approved deadline" value={formatDate(record.current_end_date)} />
            <Meta label="Deadline when reported" value={record.deadline_history?.submission_deadline_recorded ? record.deadline_history.deadline_at_submission ? formatDate(record.deadline_history.deadline_at_submission) : "No deadline set" : "Not recorded"} />
            <Meta label="Extension requested" value={record.extension_requested ? "Yes" : "No"} />
            <Meta label="Submitted by" value={record.reported_by_name} />
            <Meta label="Submitted at" value={formatDateTime(record.reported_at)} />
            <Meta label="Delay type" value={formatText(record.delay_type)} /><Meta label="Expected completion" value={formatDate(record.expected_completion_date)} />
        </div>
        <Meta label="Reason" value={record.reason} /><Meta label="Description" value={record.description} />
        <div className="rounded-2xl border border-[#E7DED2] p-4">
            <h3 className="font-bold">Report decision</h3>
            <p className="mt-2 text-sm">{formatText(record.status)} · {record.reviewed_by_name || "Not yet reviewed"}</p>
            <p className="mt-1 text-xs text-[#817669]">{formatDateTime(record.reviewed_at)}</p>
            {record.admin_comment && <p className="mt-3 whitespace-pre-wrap text-sm">{record.admin_comment}</p>}
        </div>
        <Link className="inline-block text-sm font-semibold text-[#3565A5]" to={`${prefix}/projects/${record.project_id}`}>View affected project</Link>
        <Link className="ml-4 inline-block text-sm font-semibold text-[#3565A5]" to={role === "ADMIN" ? `/admin/projects/${record.project_id}/tasks/${record.task}` : `${prefix}/projects/${record.project_id}/tasks?task=${record.task}`}>View affected task</Link>
        {role === "ADMIN" && record.status === "PENDING" && <Link className="block text-sm font-semibold text-[#3565A5]" to={`/admin/approvals?tab=delays&type=delay&request=${record.id}`}>Review delay in Approval Center</Link>}
        {role === "SUPERVISOR" && <Link className="block text-sm font-semibold text-[#3565A5]" to={`/supervisor/projects/${record.project_id}/delays`}>Open project delay register</Link>}
        {record.extension_requested && <ExtensionReview record={record} />}
        <p className="rounded-xl bg-[#EDF3FC] p-4 text-xs leading-5 text-[#284F83]">Approving a delay report records the delay. A separate extension approval is required to change the task deadline.</p>
    </div>;
}
