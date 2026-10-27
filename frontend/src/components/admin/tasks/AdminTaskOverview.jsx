import { formatDate, formatText } from "../../approvals/approvalUtils";
import { CalendarDays, ClipboardList, Ruler, ShieldCheck } from "lucide-react";

export default function AdminTaskOverview({ task }) {
    const groups = [
        { title: "Task essentials", icon: ClipboardList, fields: [["Title", task.title], ["Project", task.project_name], ["Worker / team", task.worker_name], ["Priority", formatText(task.priority)]] },
        { title: "Schedule & status", icon: CalendarDays, fields: [["Start date", formatDate(task.start_date)], ["End date", formatDate(task.end_date)], ["Display order", task.display_order], ["Approval status", formatText(task.approval_status)], ["Work status", formatText(task.work_status)]] },
        { title: "Measurement baseline", icon: Ruler, fields: [["Measurement method", formatText(task.measurement_method)], ["Planned quantity", task.planned_quantity], ["Measurement unit", formatText(task.measurement_unit)]] },
        { title: "Approval & audit", icon: ShieldCheck, fields: [["Created by", task.created_by_name], ["Approved by", task.approved_by_name], ["Approval date", formatDate(task.approved_at)], ["Created date", formatDate(task.created_at)], ["Updated date", formatDate(task.updated_at)], ["Batch reference", task.batch]] },
    ];
    return <div className="space-y-6">
        <div className="grid items-start gap-5 xl:grid-cols-2">{groups.map(({ title, icon: Icon, fields }) => (
            <section key={title} className="rounded-[20px] border border-[#EAE1D5] bg-[#FFFDFA] p-4 sm:p-5">
                <h3 className="mb-5 flex items-center gap-2.5 text-sm font-semibold"><span className="rounded-lg bg-[#EEE5D8] p-2 text-[#8B6944]"><Icon size={16} aria-hidden="true" /></span>{title}</h3>
                <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">{fields.map(([label, value]) => (
                    <div key={label} className="min-w-0 border-t border-[#F0E9DF] pt-3">
                        <dt className="text-xs font-medium text-[#716658]">{label}</dt>
                        <dd className="mt-1.5 break-words text-sm font-medium leading-6 text-[#3E352B]">{value == null || value === "" ? "Not specified" : value}</dd>
                    </div>
                ))}</dl>
            </section>
        ))}</div>
        <div className="grid gap-5 lg:grid-cols-2">{[["Description", task.description], ["Completion criteria", task.completion_criteria]].map(([label, value]) => (
            <section key={label} className="rounded-[20px] border border-[#E7DED2] bg-[#F5F0E8] p-5 sm:p-6">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B6944]">{label}</h3>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#665C50]">{value || "Not specified"}</p>
            </section>
        ))}</div>
    </div>;
}
