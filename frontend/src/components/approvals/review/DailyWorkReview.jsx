import { Link } from "react-router-dom";
import Meta from "../ReviewFields";
import { formatDate, formatText } from "../approvalUtils";
import ReportEvidence from "../../daily-reports/ReportEvidence";

export default function DailyWorkReview({ record }) {
    const quantityBased = record.measurement_method === "QUANTITY";
    const submittedWork = quantityBased
        ? `${record.quantity_completed_today} ${record.measurement_unit}`
        : record.completion_claimed ? "Completion claimed" : "Completion not claimed";
    const verifiedWork = record.progress?.verified_quantity == null
        ? (record.progress?.is_fully_verified ? "Completion verified" : "Not yet verified")
        : `${record.progress.verified_quantity} ${record.measurement_unit}`;
    return <div className="space-y-5">
        <div className="grid gap-4 rounded-2xl bg-[#F8F4EE] p-4 sm:grid-cols-2">
            <Meta label="Report date" value={formatDate(record.report_date)} />
            <Meta label="Measurement method" value={formatText(record.measurement_method)} />
            <Meta label="Approved planned quantity" value={record.planned_quantity == null ? "Completion only" : `${record.planned_quantity} ${record.measurement_unit}`} />
            <Meta label="Submitted work" value={submittedWork} />
            <Meta label="Previously verified quantity" value={verifiedWork} />
            <Meta label="Location" value={record.location_detail} />
            <Meta label="Completion criteria" value={record.completion_criteria} />
        </div>
        <Meta label="Work description" value={record.work_description} />
        <Meta label="Report summary" value={record.report?.work_summary} />
        <Meta label="Site issues" value={record.report?.issues} />
        {record.original_work && <section className="space-y-3 rounded-2xl border border-[#ECD6AE] bg-[#FFFAEE] p-5 text-sm leading-6 text-[#795016]"><h3 className="text-base font-bold">Correction of rejected work</h3><p>Original rejected measurement: {quantityBased ? `${record.original_work.quantity_completed_today} ${record.measurement_unit}` : record.original_work.completion_claimed ? "Completion claimed" : "No completion claim"}</p><p className="whitespace-pre-wrap break-words">Original rejection reason: {record.original_work.verification_note}</p><p className="break-all">Original work reference: {record.original_work.id}</p><Link className="inline-block font-bold underline" to={`/admin/projects/${record.project_id}/daily-reports?report=${record.original_work.daily_report}`}>View original submitted report and evidence</Link></section>}
        <ReportEvidence files={record.attachments} />
        <Link className="inline-block text-sm font-semibold text-[#3565A5]" to={`/admin/projects/${record.project_id}/daily-reports?report=${record.daily_report}`}>View full daily report →</Link>
        <p className="rounded-xl bg-[#EDF3FC] p-4 text-xs leading-5 text-[#284F83]">Only verified work contributes to task progress. Each work entry is reviewed individually against the approved baseline.</p>
    </div>;
}
