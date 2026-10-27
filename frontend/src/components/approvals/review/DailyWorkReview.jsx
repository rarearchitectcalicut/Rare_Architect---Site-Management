import { TaskProgress } from "../../tasks/TaskExecutionActions";
import { Link } from "react-router-dom";
import Meta from "../ReviewFields";
import { formatDate, formatText } from "../approvalUtils";
import ReportEvidence from "../../daily-reports/ReportEvidence";

export default function DailyWorkReview({ record }) {
    const baseline = record.reviewed_baseline || record;
    const originalBaseline = record.original_work?.baseline || baseline;
    const quantityBased = baseline.measurement_method === "QUANTITY";
    const submittedWork = quantityBased
        ? `${record.quantity_completed_today} ${baseline.measurement_unit || ""}`
        : record.completion_claimed ? "Completion claimed" : "Completion not claimed";
    const verifiedWork = record.progress?.verified_quantity == null
        ? (record.progress?.is_fully_verified ? "Completion verified" : "Not yet verified")
        : `${record.progress.verified_quantity} ${record.measurement_unit}`;
    return <div className="space-y-5">
        <TaskProgress progress={record.progress} />
        {record.reviewed_baseline && <p className="text-xs text-[#817669]">Submitted measurements below use the approved baseline at the decision time.</p>}
        <div className="grid gap-4 rounded-2xl bg-[#F8F4EE] p-4 sm:grid-cols-2">
            <Meta label="Daily report reference" value={record.daily_report} />
            <Meta label="Report date" value={formatDate(record.report_date)} />
            <Meta label="Measurement method" value={formatText(baseline.measurement_method)} />
            <Meta label="Approved planned quantity" value={baseline.planned_quantity == null ? "Completion only" : `${baseline.planned_quantity} ${baseline.measurement_unit || ""}`} />
            <Meta label="Submitted work" value={submittedWork} />
            <Meta label="Current verified cumulative work" value={verifiedWork} />
            <Meta label="Location" value={record.location_detail} />
            <Meta label="Completion criteria" value={baseline.completion_criteria} />
        </div>
        <Meta label="Work description" value={record.work_description} />
        <Meta label="Report summary" value={record.report?.work_summary} />
        <Meta label="Site issues" value={record.report?.issues} />
        {record.original_work && <section className="space-y-3 rounded-2xl border border-[#ECD6AE] bg-[#FFFAEE] p-5 text-sm leading-6 text-[#795016]"><h3 className="text-base font-bold">Correction of rejected work</h3><p>Original rejected measurement: {originalBaseline.measurement_method === "QUANTITY" ? `${record.original_work.quantity_completed_today} ${originalBaseline.measurement_unit || ""}` : record.original_work.completion_claimed ? "Completion claimed" : "No completion claim"}</p><p className="whitespace-pre-wrap break-words">Original rejection reason: {record.original_work.verification_note}</p><p className="break-all">Original work reference: {record.original_work.id}</p><Link className="inline-block font-bold underline" to={`/admin/projects/${record.project_id}/daily-reports?report=${record.original_work.daily_report}`}>View original submitted report and evidence</Link></section>}
        <ReportEvidence files={record.attachments} />
        <Link className="inline-block text-sm font-semibold text-[#3565A5]" to={`/admin/projects/${record.project_id}/daily-reports?report=${record.daily_report}`}>View full daily report →</Link>
        <p className="rounded-xl bg-[#EDF3FC] p-4 text-xs leading-5 text-[#284F83]">Only verified work contributes to task progress. Each work entry is reviewed individually against the approved baseline.</p>
    </div>;
}
