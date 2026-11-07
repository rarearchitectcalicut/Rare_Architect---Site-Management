import { useRef, useState } from "react";
import { CalendarDays, ClipboardList, Info, Search, X } from "lucide-react";
import ApprovalModal from "../../components/approvals/ApprovalModal";
import { delayTypes } from "../../components/approvals/queueData";
import { formatDate, formatText } from "../../components/approvals/approvalUtils";
import { useConfirmation } from "../../hooks/useConfirmation";
import { validationMessage } from "../../hooks/useApprovalReview";
import { delayApi } from "../../api/delayApi";

const input = "mt-2 min-h-12 w-full min-w-0 rounded-xl border border-[#D7C8B5] bg-[#FFFDFA] p-3 text-base font-normal text-[#211E1A] outline-none transition-colors placeholder:text-[#716658] focus:border-[#A58A67] focus:ring-2 focus:ring-[#E8DDD0]";
const initial = { task: "", delay_type: "MATERIAL_DELAY", reason: "", description: "", expected_completion_date: "", extension_requested: false, requested_end_date: "" };

function dayAfter(value) {
    if (!value) return undefined;
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
}

function FieldError({ errors, name }) {
    const values = errors[name];
    const text = Array.isArray(values) ? values.filter((value) => typeof value === "string").join(" ") : typeof values === "string" ? values : "";
    return text ? <span id={`delay-${name}-error`} role="alert" className="mt-2 block text-xs font-medium text-red-700">{text}</span> : null;
}

export default function DelayReportForm({ tasks, taskOptions, onClose, onSaved }) {
    const [form, setForm] = useState(initial);
    const [selectedTask, setSelectedTask] = useState(null);
    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState("");
    const [errors, setErrors] = useState({});
    const inFlight = useRef(false);
    const extensionDateEdited = useRef(false);
    const { confirm, confirmationModal } = useConfirmation();
    const task = tasks.find((item) => String(item.id) === form.task) || selectedTask;
    function update(key, value) {
        if (key === "requested_end_date") extensionDateEdited.current = true;
        if (key === "extension_requested") extensionDateEdited.current = false;
        const syncForecast = key === "expected_completion_date" && !extensionDateEdited.current;
        setForm((previous) => ({
            ...previous,
            [key]: value,
            ...(key === "extension_requested" ? { requested_end_date: value ? previous.expected_completion_date : "" } : {}),
            ...(syncForecast && previous.extension_requested ? { requested_end_date: value } : {}),
        }));
        setError(""); setErrors({});
    }
    function chooseTask(id) {
        const selected = tasks.find((item) => String(item.id) === id);
        extensionDateEdited.current = false;
        setSelectedTask(selected || null);
        setForm((previous) => ({ ...previous, task: id,
            extension_requested: selected?.has_pending_extension ? false : previous.extension_requested,
            requested_end_date: selected?.has_pending_extension || !previous.extension_requested ? "" : previous.expected_completion_date,
        }));
        setErrors({}); setError("");
    }
    const field = (name) => ({ id: `delay-${name}`, "aria-invalid": Boolean(errors[name]),
        "aria-describedby": [
            { expected_completion_date: "delay-forecast-help", requested_end_date: "delay-requested-help", extension_requested: "delay-extension-help" }[name],
            errors[name] ? `delay-${name}-error` : "",
        ].filter(Boolean).join(" ") || undefined,
    });
    async function submit(event) {
        event.preventDefault();
        if (inFlight.current) return;
        const invalid = {};
        if (!task || task.approval_status !== "APPROVED" || ["COMPLETED", "CANCELLED"].includes(task.work_status)) invalid.task = "Select an approved unfinished task.";
        if (!form.reason.trim() || form.reason.trim().length > 200) invalid.reason = "Provide a reason of up to 200 characters.";
        if (!delayTypes.includes(form.delay_type)) invalid.delay_type = "Choose a supported delay type.";
        if (!task?.end_date) invalid.task = "Set an approved task deadline before reporting a delay.";
        if (!form.expected_completion_date || task?.end_date && form.expected_completion_date <= task.end_date) invalid.expected_completion_date = "Choose an expected completion date after the current task deadline.";
        if (form.expected_completion_date && task?.start_date && form.expected_completion_date < task.start_date) invalid.expected_completion_date = "Expected completion cannot precede the task start date.";
        if (form.extension_requested) {
            if (task?.has_pending_extension) invalid.extension_requested = "This task already has a pending deadline extension.";
            if (!form.requested_end_date || task?.end_date && form.requested_end_date <= task.end_date || task?.start_date && form.requested_end_date < task.start_date) invalid.requested_end_date = "Choose a date after the current deadline and on or after the task start date.";
        }
        if (Object.keys(invalid).length) { setErrors(invalid); setError("Please check the highlighted fields."); return; }
        inFlight.current = true; setConfirming(true); setError(""); setErrors({});
        try {
            if (!await confirm({ title: form.extension_requested ? "Submit delay and extension request?" : "Submit delay report?",
                message: `Expected completion: ${formatDate(form.expected_completion_date)}. ${form.extension_requested
                    ? `Request a new deadline of ${formatDate(form.requested_end_date)}? The current deadline of ${formatDate(task.end_date)} remains until Admin approves the extension separately.`
                    : `Submit this delay for Admin review? The approved deadline of ${formatDate(task.end_date)} will stay unchanged.`}`,
                confirmLabel: "Submit Report" })) return;
            setConfirming(false); setSaving(true);
            const { task: taskId, ...values } = form;
            const report = await delayApi.create(taskId, { ...values, reason: values.reason.trim(), expected_completion_date: values.expected_completion_date || null, requested_end_date: values.extension_requested ? values.requested_end_date : null });
            onSaved(report);
        } catch (failure) {
            const data = failure?.response?.data;
            setErrors(data && typeof data === "object" && !Array.isArray(data) ? data : {});
            setError(validationMessage(failure));
        } finally { inFlight.current = false; setSaving(false); setConfirming(false); }
    }
    const close = () => { if (!inFlight.current) onClose(); };
    return <ApprovalModal label="New delay report" onClose={close} busy={saving ? "Submitting delay report..." : ""} error={error}>
        <form onSubmit={submit} className="space-y-6 p-4 sm:p-8">
            <header className="flex items-start justify-between gap-4 border-b border-[#E7DED2] pb-5">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#716658]">RARE / Site reporting</p>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#211E1A]">Report a task delay</h2>
                    <p className="mt-2 text-sm leading-6 text-[#716658]">Explain the delay, update your completion forecast and request more time if needed.</p>
                </div>
                <button type="button" aria-label="Close delay form" disabled={saving || confirming} onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDFA] text-[#716658] hover:bg-[#F1EADF]"><X size={20} /></button>
            </header>
            <fieldset disabled={saving || confirming} className="min-w-0 space-y-6">
                <section aria-labelledby="delay-task-heading" className="space-y-4">
                    <h3 id="delay-task-heading" className="flex items-center gap-2 text-base font-semibold text-[#211E1A]"><ClipboardList size={18} aria-hidden="true" className="text-[#716658]" />Task &amp; approved deadline</h3>
                    {taskOptions && <div className="space-y-2">
                        <label className="block text-sm font-medium text-[#514538]">Find an eligible task<span className="relative block"><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center pt-2 text-[#716658]"><Search size={18} /></span><input type="search" value={taskOptions.search} maxLength={200} onChange={(event) => taskOptions.onSearch(event.target.value)} className={`${input} pl-11`} /></span></label>
                        {taskOptions.loading && <p role="status" className="text-sm text-[#716658]">Loading eligible tasks...</p>}
                        {taskOptions.error && <p role="alert" className="text-sm text-red-700">{taskOptions.error} <button type="button" onClick={taskOptions.onRetry} className="underline">Retry</button></p>}
                        {taskOptions.count > 20 && <nav aria-label="Delay task pages" className="rare-pagination text-xs"><button type="button" disabled={taskOptions.loading || taskOptions.page === 1} onClick={() => taskOptions.onPage(taskOptions.page - 1)}>Previous tasks</button><span aria-live="polite" aria-atomic="true">Page {taskOptions.page} / {Math.ceil(taskOptions.count / 20)}</span><button type="button" disabled={taskOptions.loading || taskOptions.page * 20 >= taskOptions.count} onClick={() => taskOptions.onPage(taskOptions.page + 1)}>Next tasks</button></nav>}
                    </div>}
                    <label className="block text-sm font-medium text-[#514538]">Task *<select {...field("task")} autoFocus required value={form.task} onChange={(event) => chooseTask(event.target.value)} className={input}><option value="">Select an approved task</option>{task && !tasks.some((item) => String(item.id) === form.task) && <option value={form.task}>{task.title}</option>}{tasks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><FieldError name="task" errors={errors} /></label>
                    {!tasks.length && !taskOptions?.loading && !taskOptions?.error && <p className="text-sm text-[#716658]">No eligible tasks match this search.</p>}
                    {task && <div className="rounded-2xl border border-[#E7DED2] bg-[#F8F4EE] p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#716658]">Current approved deadline</p>
                        <p className="mt-1 text-lg font-semibold text-[#211E1A]">{formatDate(task.end_date)}</p>
                        <p className="mt-1 text-sm text-[#716658]">This remains the official deadline unless Admin approves an extension.</p>
                    </div>}
                </section>
                <section aria-labelledby="delay-details-heading" className="space-y-4 border-t border-[#E7DED2] pt-6">
                    <div><h3 id="delay-details-heading" className="text-base font-semibold text-[#211E1A]">Delay details</h3><p className="mt-1 text-sm text-[#716658]">Help Admin understand what happened and what is affecting the work.</p></div>
                    <label className="block text-sm font-medium text-[#514538]">Delay type *<select {...field("delay_type")} value={form.delay_type} onChange={(event) => update("delay_type", event.target.value)} className={input}>{delayTypes.map((value) => <option key={value} value={value}>{formatText(value)}</option>)}</select><FieldError name="delay_type" errors={errors} /></label>
                    <label className="block text-sm font-medium text-[#514538]">Reason for delay *<input {...field("reason")} required maxLength={200} value={form.reason} onChange={(event) => update("reason", event.target.value)} placeholder="Briefly explain what is holding up the task" className={input} /><FieldError name="reason" errors={errors} /></label>
                    <label className="block text-sm font-medium text-[#514538]">Additional details <span className="font-normal text-[#716658]">(optional)</span><textarea {...field("description")} rows={3} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Add any context that will help Admin review this delay" className={input} /><FieldError name="description" errors={errors} /></label>
                </section>
                <section aria-labelledby="delay-completion-heading" className="space-y-4 border-t border-[#E7DED2] pt-6">
                    <h3 id="delay-completion-heading" className="flex items-center gap-2 text-base font-semibold text-[#211E1A]"><CalendarDays size={18} aria-hidden="true" className="text-[#716658]" />Completion forecast</h3>
                    <label className="block text-sm font-medium text-[#514538]">Expected completion date *<input {...field("expected_completion_date")} type="date" required min={dayAfter(task?.end_date)} value={form.expected_completion_date} onChange={(event) => update("expected_completion_date", event.target.value)} className={input} /><FieldError name="expected_completion_date" errors={errors} /></label>
                    <p id="delay-forecast-help" className="text-sm leading-6 text-[#716658]">Your estimate of when the work will finish. This does not change the approved deadline.</p>
                    <div className={`rounded-2xl border p-4 sm:p-5 ${form.extension_requested ? "border-[#B7CBE4] bg-[#F5F8FD]" : "border-[#E7DED2] bg-[#FFFDFA]"}`}>
                        <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-[#211E1A]">
                            <input {...field("extension_requested")} type="checkbox" disabled={Boolean(task?.has_pending_extension)} checked={form.extension_requested} onChange={(event) => update("extension_requested", event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#211E1A]" />
                            <span className="min-w-0"><span className="block">Request a deadline extension</span><span id="delay-extension-help" className="mt-1 block text-sm font-normal leading-6 text-[#716658]">Ask Admin to approve a new official task deadline.</span></span>
                        </label>
                        {task?.has_pending_extension && <p role="status" className="mt-3 rounded-xl bg-[#FFF2D8] p-3 text-sm leading-6 text-[#795016]">An extension request is already pending for this task. You can still report the delay; another extension cannot be requested yet.</p>}
                        <FieldError name="extension_requested" errors={errors} />
                        {form.extension_requested && <div className="mt-4 space-y-2 border-t border-[#D7E2F0] pt-4">
                            <label className="block text-sm font-medium text-[#514538]">Requested new end date *<input {...field("requested_end_date")} type="date" required min={dayAfter(task?.end_date)} value={form.requested_end_date} onChange={(event) => update("requested_end_date", event.target.value)} className={input} /><FieldError name="requested_end_date" errors={errors} /></label>
                            <p id="delay-requested-help" className="text-sm leading-6 text-[#716658]">Prefilled from your completion forecast. You can choose a different date. Admin reviews this extension separately.</p>
                        </div>}
                    </div>
                    <p className="flex items-start gap-2 rounded-xl bg-[#F8F4EE] p-3 text-sm leading-6 text-[#716658]"><Info size={17} aria-hidden="true" className="mt-1 shrink-0" /><span>{form.extension_requested ? "Admin approval updates the task deadline. If it exceeds the project finish date, the project finish date will also be extended." : "Submitting this report records the delay. The approved deadline stays unchanged."}</span></p>
                </section>
                <footer className="rare-action-footer flex flex-wrap justify-end gap-3">
                    <button type="button" onClick={close} className="rare-button rare-button-secondary">Cancel</button>
                    <button type="submit" disabled={!task || saving || confirming} className="rare-button rare-button-primary">{saving ? "Submitting..." : confirming ? "Awaiting confirmation..." : "Submit delay report"}</button>
                </footer>
            </fieldset>
        </form>
        {confirmationModal}
    </ApprovalModal>;
}
