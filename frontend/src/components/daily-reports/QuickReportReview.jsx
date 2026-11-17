import { formatDate, formatText } from "../approvals/approvalUtils";

export default function QuickReportReview({ report, resources, onEdit, onRetry }) {
    return <section className="rare-report-review space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Review your report</h2><button type="button" onClick={() => onEdit(0)} className="rare-button rare-button-secondary">Edit site update</button></div>
        <p className="break-words text-sm text-muted">{report.project_name} · {formatDate(report.report_date)}</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{report.work_summary || "Add a work summary or no-work explanation before submitting."}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
            {report.weather_condition && <div><dt className="text-muted">Weather</dt><dd className="mt-1 font-medium">{formatText(report.weather_condition)}</dd></div>}
            {[["work-entries", "Task work"], ["manpower", "Manpower records"], ["materials", "Material records"], ["attachments", "Uploaded files"]].map(([section, label]) => {
                const resource = resources(section);
                if (["manpower", "materials"].includes(section) && resource?.data?.count === 0) return null;
                return <div key={section}><dt className="text-muted">{label}</dt><dd className="mt-1 font-medium">{resource?.error ? "Could not load" : resource?.data ? resource.data.count : "Loading…"}</dd></div>;
            })}
        </dl>
        {report.work_summary?.startsWith("No work today:") && resources("work-entries")?.data?.count > 0 && <p className="rounded-xl bg-pastel-butter p-3 text-sm text-warning">Your summary says no work, but task work is recorded. Check both before submitting.</p>}
        {!!resources("work-entries")?.data?.count && <div className="space-y-2"><h3 className="text-sm font-semibold">Task measurements to review</h3>{resources("work-entries").data.results.slice(0, 5).map((work) => <div className="rounded-xl bg-surface-soft p-3 text-sm" key={work.id}><p className="font-semibold">{work.task_title}</p><p className="mt-1 text-muted">{work.measurement_method === "QUANTITY" ? `${work.quantity_completed_today} ${work.measurement_unit || ""} reported` : work.completion_claimed ? "Completion claimed for review" : "No completion claimed"}</p><p className="mt-1 whitespace-pre-wrap break-words text-muted">{work.work_description}</p></div>)}{resources("work-entries").data.count > 5 && <p className="text-xs text-muted">Showing up to five saved entries. Open Work &amp; crew to review every entry.</p>}</div>}
        {["work-entries", "manpower", "materials", "attachments"].some((section) => resources(section)?.error) && <button type="button" onClick={onRetry} className="rare-button rare-button-secondary">Retry loading records</button>}
        <div className="rounded-xl bg-surface-soft p-3"><p className="text-xs font-medium text-muted">Issues or safety concerns</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{report.issues || "Not recorded"}</p></div>
        {["site_condition", "site_notes", "next_day_plan"].some((field) => report[field]) && <details className="rounded-xl border border-border p-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold">More site details</summary><dl className="mt-2 space-y-3">{[["site_condition", "Site condition"], ["site_notes", "Observations"], ["next_day_plan", "Tomorrow's plan"]].filter(([field]) => report[field]).map(([field, label]) => <div key={field}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{report[field]}</dd></div>)}</dl></details>}
        <button type="button" onClick={() => onEdit(1)} className="rare-button rare-button-secondary">Edit work & resources</button>
        <p className="text-xs leading-5 text-muted">After submission, this report becomes read-only. Task work will be reviewed separately by Admin.</p>
    </section>;
}
