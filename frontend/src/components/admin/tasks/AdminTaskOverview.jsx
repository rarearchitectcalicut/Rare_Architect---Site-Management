import { formatDate, formatText } from "../../approvals/approvalUtils";
import { CalendarDays, ChevronDown, ClipboardList, Ruler, ShieldCheck } from "lucide-react";
import InfoCard, { InfoField } from "../../common/InfoCard";

export default function AdminTaskOverview({ task }) {
    const groups = [
        { title: "Task essentials", icon: ClipboardList, fields: [["Title", task.title], ["Project", task.project_name], ["Worker / team", task.worker_name], ["Priority", formatText(task.priority)]] },
        { title: "Schedule & status", icon: CalendarDays, fields: [["Start date", formatDate(task.start_date)], ["End date", formatDate(task.end_date)], ["Display order", task.display_order], ["Approval status", formatText(task.approval_status)], ["Work status", formatText(task.work_status)]] },
        { title: "Measurement baseline", icon: Ruler, fields: [["Measurement method", formatText(task.measurement_method)], ["Planned quantity", task.planned_quantity], ["Measurement unit", formatText(task.measurement_unit)]] },
        { title: "Approval & audit", icon: ShieldCheck, fields: [["Created by", task.created_by_name], ["Approved by", task.approved_by_name], ["Approval date", formatDate(task.approved_at)], ["Created date", formatDate(task.created_at)], ["Updated date", formatDate(task.updated_at)]] },
    ];
    return <div className="rare-task-overview">
        <div className="space-y-4">
            <InfoCard title={groups[0].title} eyebrow="The brief" icon={ClipboardList}>
                <dl className="rare-info-grid">{groups[0].fields.map(([label, value]) => <InfoField key={label} label={label} value={value} />)}</dl>
            </InfoCard>
            <InfoCard title={groups[2].title} eyebrow="Approved scope" icon={Ruler}>
                <dl className="rare-info-grid">{groups[2].fields.map(([label, value]) => <InfoField key={label} label={label} value={value} />)}</dl>
                <p className="mt-4 text-xs leading-5 text-muted">Progress is based on Admin-verified work against this baseline.</p>
            </InfoCard>
        </div>
        <InfoCard title={groups[1].title} eyebrow="Execution" icon={CalendarDays}>
            <dl className="rare-info-grid">{groups[1].fields.map(([label, value]) => <InfoField key={label} label={label} value={value} />)}</dl>
            <details className="rare-task-audit">
                <summary><span className="inline-flex items-center gap-2"><ShieldCheck size={16} aria-hidden="true" />Approval &amp; audit</span><ChevronDown size={16} aria-hidden="true" /></summary>
                <dl className="rare-info-grid">{groups[3].fields.map(([label, value]) => <InfoField key={label} label={label} value={value} />)}</dl>
            </details>
        </InfoCard>
        <div className="rare-task-overview-description">{[["Description", task.description], ["Completion criteria", task.completion_criteria]].map(([label, value]) =>
            <section key={label} className="rare-info-card"><h3>{label}</h3><p>{value || "Not specified"}</p></section>)}
        </div>
    </div>;
}
