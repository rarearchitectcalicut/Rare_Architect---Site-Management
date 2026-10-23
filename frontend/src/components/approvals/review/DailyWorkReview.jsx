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
        </div>
        <Meta label="Work description" value={record.work_description} />
        <Meta label="Report summary" value={record.report?.work_summary} />
        <Meta label="Site issues" value={record.report?.issues} />
        <ReportEvidence files={record.attachments} />
        <Link className="inline-block text-sm font-semibold text-[#3565A5]" to={`/admin/reports?report=${record.daily_report}`}>View full daily report →</Link>
        <p className="rounded-xl bg-[#EDF3FC] p-4 text-xs leading-5 text-[#284F83]">Only verified work contributes to task progress. Each work entry is reviewed individually against the approved baseline.</p>
    </div>;
}
