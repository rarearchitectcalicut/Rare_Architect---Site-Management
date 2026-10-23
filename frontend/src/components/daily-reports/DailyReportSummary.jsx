import Meta from "../approvals/ReviewFields";
import { formatDate, formatText } from "../approvals/approvalUtils";
import ReportEvidence from "./ReportEvidence";

export default function DailyReportSummary({ report, attachments }) {
    return <section className="space-y-5 rounded-[26px] border border-[#E5DDD1] bg-[#FFFDFA] p-6">
        <h2 className="text-xl font-bold">{report.project_name} · {formatDate(report.report_date)}</h2>
        <div className="grid gap-4 sm:grid-cols-3"><Meta label="Supervisor" value={report.reported_by_name} /><Meta label="Report status" value={formatText(report.status)} /><Meta label="Weather" value={report.weather_condition} /></div>
        <Meta label="Work summary" value={report.work_summary} />
        <div className="grid gap-4 sm:grid-cols-2"><Meta label="Site condition" value={report.site_condition} /><Meta label="Site notes" value={report.site_notes} /><Meta label="Issues" value={report.issues} /><Meta label="Next day plan" value={report.next_day_plan} /></div>
        <ReportEvidence files={attachments} />
    </section>;
}
