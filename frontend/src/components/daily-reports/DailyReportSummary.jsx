import { formatDate, formatText } from "../approvals/approvalUtils";
import ReportEvidence from "./ReportEvidence";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, UserRound, CloudSun, FileText, ClipboardList, MapPin, ShieldAlert, ArrowUpRight, CheckCircle2, Clock3 } from "lucide-react";

const input = "mt-2 w-full min-w-0 rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-3 py-3 text-sm text-[#211E1A] outline-none focus:border-[#A58A67] focus:ring-2 focus:ring-[#E8DDD0]";
const buttonBase = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-5 py-3 text-base font-bold leading-6 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] disabled:cursor-not-allowed disabled:opacity-50";
const button = `${buttonBase} border-[#C5AE8F] bg-[#F1EADF] text-[#4F3D27] hover:bg-[#E8DAC6]`;
const saveButton = `${buttonBase} border-[#D6A437] bg-[#F3C45C] text-[#35250C] shadow-sm hover:bg-[#EAB344]`;
const correctionButton = `${buttonBase} border-[#1D4ED8] bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]`;
const removeButton = `${buttonBase} border-[#EFACA5] bg-[#FEE2E2] text-[#991B1B] hover:bg-[#FECACA]`;
const diaryFields = ["report_date", "weather_condition", "site_condition", "work_summary", "site_notes", "issues", "next_day_plan"];

export function ReportStatusBadge({ status }) {
    const submitted = status === "SUBMITTED";
    const Icon = submitted ? CheckCircle2 : FileText;
    return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold ${submitted ? "border-[#B5DCCB] bg-[#E9F6EF] text-[#176647]" : "border-[#E8CE94] bg-[#FFF4D9] text-[#795016]"}`}><Icon size={15} aria-hidden="true" />{formatText(status)}</span>;
}

function DiarySection({ title, value, icon: Icon, tone = "neutral", empty = "Not recorded in this report." }) {
    return <section className={`min-w-0 rounded-2xl border p-5 sm:p-6 ${tone === "warning" && value ? "border-[#ECD6AE] bg-[#FFFAEE]" : "border-[#E9E1D6] bg-[#FFFDFA]"}`}>
        <h3 className="mb-3 flex items-center gap-3 text-base font-bold text-[#352D24]"><Icon size={19} className="shrink-0 text-[#85602F]" aria-hidden="true" />{title}</h3>
        <p className={`whitespace-pre-wrap break-words text-base leading-7 ${value ? "text-[#4F473D]" : "text-[#716658]"}`}>{value || empty}</p>
    </section>;
}

function ReportFact({ label, value }) {
    return <div className="min-w-0"><p className="text-xs font-bold text-[#716658]">{label}</p><p className="mt-2 whitespace-pre-wrap break-words text-base font-medium leading-7 text-[#352D24]">{value || "Not specified"}</p></div>;
}

export function ReportDiaryForm({ report, onSave, onCancel, busy, values: controlledValues, onChange, prefill = false }) {
    const [localValues, setLocalValues] = useState(() => Object.fromEntries(diaryFields.map((key) => [key, report?.[key] || (key === "report_date" ? new Date().toLocaleDateString("en-CA") : "")])));
    const values = controlledValues ?? localValues;
    const setValues = onChange ?? setLocalValues;
    return <form data-correction-confirmed={prefill ? "true" : undefined} onSubmit={(event) => { event.preventDefault(); onSave(values); }} className="space-y-4 rounded-2xl border border-[#D8C7B2] bg-[#F8F4EE] p-4 sm:p-6">
        <h3 className="font-semibold">{prefill ? "Site Diary — Prefilled" : report ? "Edit site diary" : "Create a draft report"}</h3>
        <p className="text-xs leading-5 text-[#817669]">Save each section before submitting. Drafts may have an empty work summary; submission requires an explanation of the day's work or why no work took place.</p>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">{diaryFields.map((key) => <label key={key} className={`text-xs font-medium text-[#817669] ${["work_summary", "site_notes", "issues", "next_day_plan"].includes(key) ? "sm:col-span-2" : ""}`}>{key === "issues" ? "Issues and safety observations" : formatText(key)}
            {key === "weather_condition" ? <select className={input} value={values[key]} onChange={(event) => setValues((v) => ({ ...v, [key]: event.target.value }))}><option value="">Not specified</option>{["SUNNY", "CLOUDY", "RAINY", "HEAVY_RAIN", "WINDY", "OTHER"].map((value) => <option key={value} value={value}>{formatText(value)}</option>)}</select> : ["report_date", "site_condition"].includes(key) ? <input type={key === "report_date" ? "date" : "text"} required={key === "report_date"} maxLength={key === "site_condition" ? 255 : undefined} className={input} value={values[key]} onChange={(event) => setValues((v) => ({ ...v, [key]: event.target.value }))} /> : <textarea rows={3} className={input} value={values[key]} onChange={(event) => setValues((v) => ({ ...v, [key]: event.target.value }))} />}
        </label>)}</fieldset>
        {!prefill && <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy} className={saveButton}>{busy ? "Saving..." : "Save Draft"}</button><button type="button" disabled={busy} onClick={onCancel} className={button}>Back</button></div>}
    </form>;
}

export function ReportRowForm({ section, initial, onSave, onCancel, busy, values: controlledValues, onChange, prefill = false, confirmed = false }) {
    const manpower = section === "manpower";
    const defaults = manpower ? { trade: "MASON", contractor_name: "", worker_count: "1", hours_worked: "", remarks: "" } : { material_name: "", entry_type: "RECEIVED", quantity: "", unit: "", remarks: "" };
    const [localValues, setLocalValues] = useState(() => Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, initial?.[key] ?? value])));
    const values = controlledValues ?? localValues;
    const setValues = onChange ?? setLocalValues;
    const choices = manpower ? ["MASON", "HELPER", "CARPENTER", "ELECTRICIAN", "PLUMBER", "PAINTER", "TILER", "WELDER", "SUPERVISOR", "OTHER"] : ["RECEIVED", "USED", "REQUIRED"];
    function submit(event) {
        event.preventDefault();
        const data = { ...values };
        if (manpower) { data.worker_count = Number(data.worker_count); data.hours_worked = data.hours_worked === "" ? null : data.hours_worked; }
        else data.quantity = data.quantity === "" ? null : data.quantity;
        onSave(data);
    }
    return <form data-correction-confirmed={prefill && confirmed ? "true" : undefined} onSubmit={submit} className="space-y-4 rounded-2xl border border-[#D8C7B2] bg-[#F8F4EE] p-4">
        <h3 className="text-sm font-semibold">{initial ? "Edit" : "Add"} {manpower ? "manpower record" : "material record"}</h3>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">{Object.keys(defaults).map((key) => <label key={key} className="text-xs text-[#817669]">{formatText(key)}
            {["trade", "entry_type"].includes(key) ? <select className={input} value={values[key]} onChange={(event) => setValues((v) => ({ ...v, [key]: event.target.value }))}>{choices.map((value) => <option key={value} value={value}>{formatText(value)}</option>)}</select> : <input type={["worker_count", "hours_worked", "quantity"].includes(key) ? "number" : "text"} min={key === "worker_count" ? 1 : key === "hours_worked" ? 0 : key === "quantity" ? "0.001" : undefined} max={key === "hours_worked" ? 24 : undefined} step={key === "worker_count" ? 1 : key === "hours_worked" ? "0.01" : "0.001"} required={["worker_count", "material_name"].includes(key) || key === "unit" && values.quantity !== ""} className={input} value={values[key]} onChange={(event) => setValues((v) => ({ ...v, [key]: event.target.value }))} />}
        </label>)}</fieldset>
        <p className="text-xs text-[#817669]">{manpower ? "A site manpower record; this is not attendance or payroll." : "A material observation; this does not change inventory."}</p>
        {!prefill && <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy} className={saveButton}>{busy ? "Saving..." : "Save record"}</button><button type="button" disabled={busy} className={button} onClick={onCancel}>Back</button></div>}
    </form>;
}

export function ReportWorkForm({ initial, tasks, onTaskSearch, onTaskPage, drafts, onDraftPage, correction, onSave, onCancel, busy, values: controlledValues, onChange, prefill = false }) {
    const [taskId, setTaskId] = useState(initial?.task || "");
    const [search, setSearch] = useState("");
    const [localValues, setLocalValues] = useState({ work_description: initial?.work_description || "", location_detail: initial?.location_detail || "", quantity_completed_today: initial?.quantity_completed_today || "", completion_claimed: initial?.completion_claimed || false, new_daily_report: "" });
    const values = controlledValues ?? localValues;
    const setValues = onChange ?? setLocalValues;
    const task = initial || tasks?.results?.find((item) => item.id === taskId);
    const quantity = task?.measurement_method === "QUANTITY";
    function submit(event) {
        event.preventDefault();
        const payload = { work_description: values.work_description, location_detail: values.location_detail, ...(quantity ? { quantity_completed_today: values.quantity_completed_today } : { completion_claimed: values.completion_claimed }) };
        if (correction) payload.new_daily_report = values.new_daily_report;
        else if (!initial) payload.task = taskId;
        onSave(payload);
    }
    return <form data-correction-confirmed={prefill ? "true" : undefined} onSubmit={submit} className="space-y-4 rounded-2xl border border-[#D8C7B2] bg-[#F8F4EE] p-4 sm:p-5">
        <h3 className="text-sm font-semibold">{correction ? "Create an audited correction in a draft" : initial ? "Edit task work" : "Add task work"}</h3>
        <fieldset disabled={busy} className="space-y-4">
            {!initial && <div><label className="block text-xs text-[#817669]">Find an approved task<input value={search} onChange={(event) => setSearch(event.target.value)} className={input} placeholder="Task name or description" /></label><div className="mt-2 flex flex-wrap gap-2"><button type="button" className={button} onClick={() => { setTaskId(""); onTaskSearch(search); }}>Search tasks</button><button type="button" disabled={!tasks?.previous} className={button} onClick={() => { setTaskId(""); onTaskPage(-1); }}>Previous tasks</button><button type="button" disabled={!tasks?.next} className={button} onClick={() => { setTaskId(""); onTaskPage(1); }}>Next tasks</button></div>
                <label className="mt-3 block text-xs text-[#817669]">Task<select required className={input} value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">Choose an eligible task</option>{(tasks?.results || []).filter((item) => !["COMPLETED", "CANCELLED"].includes(item.work_status)).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><p className="mt-2 text-xs text-[#817669]">Approved tasks only. Completed and cancelled tasks cannot receive new entries.</p></div>}
            {initial && <p className="text-sm font-semibold">{initial.task_title}</p>}
            {correction && !prefill && <div><label className="text-xs text-[#817669]">Your target draft<select required className={input} value={values.new_daily_report} onChange={(event) => setValues((v) => ({ ...v, new_daily_report: event.target.value }))}><option value="">Choose a draft report</option>{(drafts?.results || []).map((report) => <option key={report.id} value={report.id}>{report.report_date} - {report.id.slice(0, 8)}</option>)}</select></label><div className="mt-2 flex gap-2"><button type="button" className={button} disabled={!drafts?.previous} onClick={() => onDraftPage(-1)}>Previous drafts</button><button type="button" className={button} disabled={!drafts?.next} onClick={() => onDraftPage(1)}>Next drafts</button></div><p className="mt-2 text-xs text-[#817669]">Create a draft from the report register first if none is available. The rejected original stays unchanged.</p></div>}
            {prefill && <div className="space-y-2 rounded-xl border border-[#ECC4BA] bg-[#FFF1EC] p-4 text-sm leading-6 text-[#803D32]"><p className="font-bold">Original rejected work · {formatText(initial.measurement_method)}</p><p>Reported: {quantity ? `${initial.quantity_completed_today} ${initial.measurement_unit}` : initial.completion_claimed ? "Completion claimed" : "No completion claim"}</p><p className="whitespace-pre-wrap break-words">{initial.work_description}</p><p>Location: {initial.location_detail || "Not specified"}</p><p className="whitespace-pre-wrap break-words font-semibold">Admin rejection reason: {initial.verification_note || "Not specified"}</p></div>}
            <label className="block text-xs text-[#817669]">Work description<textarea required rows={3} className={input} value={values.work_description} onChange={(event) => setValues((v) => ({ ...v, work_description: event.target.value }))} /></label>
            <label className="block text-xs text-[#817669]">Location detail<input maxLength={255} className={input} value={values.location_detail} onChange={(event) => setValues((v) => ({ ...v, location_detail: event.target.value }))} /></label>
            {task && (quantity ? <label className="block text-xs text-[#817669]">Quantity completed today ({task.measurement_unit})<input type="number" required min="0.001" step="0.001" max={task.planned_quantity || undefined} className={input} value={values.quantity_completed_today} onChange={(event) => setValues((v) => ({ ...v, quantity_completed_today: event.target.value }))} /><span className="mt-2 block">Approved planned quantity: {task.planned_quantity} {task.measurement_unit}. Submitted work remains pending until verified.</span></label> : <div><p className="text-xs leading-5 text-[#817669]">Completion criteria: {task.completion_criteria || "Not specified"}</p><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" required checked={values.completion_claimed} onChange={(event) => setValues((v) => ({ ...v, completion_claimed: event.target.checked }))} />Claim completion for verification</label></div>)}
        </fieldset>
        {!prefill && <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || !task} className={correction ? correctionButton : saveButton}>{busy ? "Saving..." : correction ? "Save correction to draft" : "Save work entry"}</button><button type="button" disabled={busy} className={button} onClick={onCancel}>Back</button></div>}
    </form>;
}

export function ReportAttachmentForm({ entries, onPage, onSave, onCancel, busy, onStage, prefill = false }) {
    const [files, setFiles] = useState([]);
    const [caption, setCaption] = useState("");
    const [workId, setWorkId] = useState("");
    return <form onSubmit={(event) => { event.preventDefault(); onSave({ files, caption, task_work: workId }, (uploaded) => setFiles((current) => current.filter((file) => file !== uploaded))); }} className="space-y-4 rounded-2xl border border-[#D8C7B2] bg-[#F8F4EE] p-4">
        <h3 className="text-sm font-semibold">Upload supporting evidence</h3>
        <fieldset disabled={busy} className="space-y-4">
            <label className="block text-xs text-[#817669]">Photos or PDF files<input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" className={input} onChange={(event) => { const next = Array.from(event.target.files || []); setFiles(next); onStage?.({ files: next, caption, task_work: workId }); }} /></label>
            <p className="text-xs text-[#817669]">Up to 10 MB per file. Each file is validated by the server. {prefill ? "Files upload only when you save. Successful uploads are tracked and are not repeated on retry." : "Uploaded files are removed from the pending list so retries do not upload them twice."}</p>
            <ul className="space-y-1 text-xs text-[#665C50]">{files.map((file, index) => <li key={`${file.name}:${index}`} className="break-all">{file.name}</li>)}</ul>
            <label className="block text-xs text-[#817669]">Caption<input className={input} maxLength={1000} value={caption} onChange={(event) => { setCaption(event.target.value); onStage?.({ files, caption: event.target.value, task_work: workId }); }} /></label>
            <label className="block text-xs text-[#817669]">Associate with task work (optional)<select value={workId} onChange={(event) => setWorkId(event.target.value)} className={input}><option value="">General report evidence</option>{(entries?.results || []).map((entry) => <option key={entry.id} value={entry.id}>{entry.task_title}</option>)}</select></label>
            {!prefill && <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={!entries?.previous} onClick={() => onPage(-1)}>Previous work entries</button><button type="button" className={button} disabled={!entries?.next} onClick={() => onPage(1)}>Next work entries</button></div>}
        </fieldset>
        {!prefill && <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy || !files.length} className={saveButton}>{busy ? "Uploading..." : "Upload files"}</button><button type="button" disabled={busy} className={button} onClick={onCancel}>Back</button></div>}
    </form>;
}

export function ReportWorkEntry({ entry, role, canEdit, canCorrect, onEdit, onRemove, onCorrect, busy }) {
    return <article className="space-y-5 rounded-[22px] border border-[#E2D6C6] bg-[#FFFDFA] p-5 shadow-[0_4px_16px_-14px_rgba(61,42,20,0.3)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EDE5DA] pb-4"><div className="min-w-0"><p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#80603B]">Task work record</p><h3 className="break-words text-xl font-bold text-[#352D24]">{entry.task_title}</h3></div><span className={`rounded-full border px-3 py-1.5 text-sm font-bold ${entry.verification_status === "VERIFIED" ? "border-[#B5DCCB] bg-[#E9F6EF] text-[#176647]" : entry.verification_status === "REJECTED" ? "border-[#F0C1B9] bg-[#FCE9E6] text-[#A33229]" : "border-[#E8CE94] bg-[#FFF4D9] text-[#795016]"}`}>{formatText(entry.verification_status)}</span></div>
        <p className="whitespace-pre-wrap break-words text-base leading-7 text-[#4F473D]">{entry.work_description}</p>
        <div className="grid gap-x-6 gap-y-5 rounded-2xl border border-[#E9E1D6] bg-[#F8F4EE] p-5 sm:grid-cols-2"><ReportFact label="Location" value={entry.location_detail} /><ReportFact label="Submitted measurement" value={entry.measurement_method === "QUANTITY" ? `${entry.quantity_completed_today} ${entry.measurement_unit}` : entry.completion_claimed ? "Completion claimed" : "No completion claim"} /><ReportFact label="Completion criteria" value={entry.completion_criteria} /><ReportFact label="Reviewed by" value={entry.verified_by_name} /><ReportFact label="Reviewed at" value={entry.verified_at ? new Date(entry.verified_at).toLocaleString("en-IN") : null} /><ReportFact label="Verification note" value={entry.verification_note} /></div>
        {entry.verification_status === "REJECTED" && <p className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">Rejected measurements are not counted in verified progress. {entry.correction_id ? "An audited correction already exists." : "The original submitted record is read-only."}</p>}
        {entry.correction_of && <p className="break-all text-xs text-[#817669]">Correction of work entry {entry.correction_of}</p>}
        {entry.original_work && <div className="rounded-xl border border-[#ECD6AE] bg-[#FFFAEE] p-4 text-sm leading-6 text-[#795016]"><p className="font-bold">Original rejected measurement</p><p>{entry.measurement_method === "QUANTITY" ? `${entry.original_work.quantity_completed_today} ${entry.measurement_unit}` : entry.original_work.completion_claimed ? "Completion claimed" : "No completion claim"}</p><p className="whitespace-pre-wrap break-words">Admin rejection reason: {entry.original_work.verification_note}</p><Link className="mt-2 inline-block font-bold underline" to={`/${role === "ADMIN" ? "admin" : "supervisor"}/projects/${entry.project_id}/daily-reports?report=${entry.original_work.daily_report}`}>View original submitted report</Link></div>}
        {entry.correction_report && <Link className="inline-block text-sm font-bold text-[#1E40AF] underline" to={`/${role === "ADMIN" ? "admin" : "supervisor"}/projects/${entry.project_id}/daily-reports?report=${entry.correction_report.id}`}>Existing correction: {formatText(entry.correction_report.status)}</Link>}
        <div className="flex flex-wrap gap-2">
            {canEdit && <><button type="button" disabled={busy} className={saveButton} onClick={onEdit}>Edit work</button><button type="button" disabled={busy} className={removeButton} onClick={onRemove}>Remove work</button></>}
            {canCorrect && entry.verification_status === "REJECTED" && !entry.correction_id && !["COMPLETED", "CANCELLED"].includes(entry.task_work_status) && <button type="button" disabled={busy} className={correctionButton} onClick={onCorrect}>Create correction</button>}
            {role === "ADMIN" && entry.report_status === "SUBMITTED" && entry.verification_status === "PENDING" && <Link className={correctionButton} to={`/admin/approvals?tab=work&type=work&entry=${entry.id}`}>Open in Approval Center</Link>}
        </div>
    </article>;
}

export default function DailyReportSummary({ report, attachments }) {
    return <section className="overflow-hidden rounded-[26px] border border-[#E2D6C6] bg-[#F8F4EE] shadow-[0_8px_30px_-20px_rgba(61,42,20,0.25)]">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E9E1D6] bg-[#FFFDFA] p-5 sm:p-7">
            <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#80603B]">Daily site diary</p><h2 className="text-2xl font-semibold tracking-tight text-[#211E1A]">Site diary</h2><p className="mt-2 text-sm font-medium text-[#665C50]">{report.project_name || "Project report"} / {formatDate(report.report_date)}</p></div>
            <ReportStatusBadge status={report.status} />
        </header>
        <div className="grid items-start gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_290px]">
            <div className="min-w-0 space-y-5">
                <section className="rounded-2xl border border-[#E0CFB4] bg-white p-5 sm:p-7"><div className="mb-4 flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F8E7BE] text-[#795016]"><ClipboardList size={21} aria-hidden="true" /></span><h3 className="text-lg font-bold text-[#352D24]">Work summary</h3></div><p className="whitespace-pre-wrap break-words text-base leading-8 text-[#423A30]">{report.work_summary || "No work summary saved yet."}</p></section>
                <div className="grid gap-5 md:grid-cols-2"><DiarySection title="Site condition" value={report.site_condition} icon={MapPin} /><DiarySection title="Site notes" value={report.site_notes} icon={FileText} /></div>
                <DiarySection title="Issues & safety observations" value={report.issues} icon={ShieldAlert} tone="warning" empty="No issues or safety observations recorded." />
                <DiarySection title="Next day plan" value={report.next_day_plan} icon={ArrowUpRight} />
            </div>
            <aside aria-label="Report information" className="min-w-0 rounded-2xl border border-[#E2D6C6] bg-[#FFFDFA] p-5 sm:p-6">
                <h3 className="mb-5 text-base font-bold text-[#352D24]">Report information</h3>
                <dl className="space-y-5">{[[UserRound, "Supervisor", report.reported_by_name], [CalendarDays, "Report date", formatDate(report.report_date)], [CloudSun, "Weather", formatText(report.weather_condition)], [Clock3, "Submitted at", report.submitted_at ? new Date(report.submitted_at).toLocaleString("en-IN") : "Not submitted"]].map(([Icon, label, value]) => <div key={label} className="flex items-start gap-3"><Icon size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-[#8A6840]" /><div className="min-w-0"><dt className="text-xs font-semibold text-[#716658]">{label}</dt><dd className="mt-1 break-words text-sm font-semibold leading-6 text-[#352D24]">{value || "Not specified"}</dd></div></div>)}</dl>
                <div className="mt-6 border-t border-[#E9E1D6] pt-5"><p className="text-xs font-semibold text-[#716658]">Report reference</p><p className="mt-2 break-all font-mono text-xs leading-6 text-[#665C50]">{report.id || "Not specified"}</p></div>
                <p className="mt-5 rounded-xl bg-[#F3EDE3] p-3 text-sm leading-6 text-[#66543D]">{report.status === "SUBMITTED" ? "Submitted reports are read-only. Task work is verified individually." : "Private draft. Save your updates before submitting this report."}</p>
            </aside>
        </div>
        {Array.isArray(attachments) && <div className="border-t border-[#E9E1D6] bg-[#FFFDFA] p-5 sm:p-7"><ReportEvidence files={attachments} /></div>}
    </section>;
}
