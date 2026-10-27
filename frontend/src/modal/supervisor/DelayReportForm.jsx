import { useRef, useState } from "react";
import { X } from "lucide-react";
import ApprovalModal from "../../components/approvals/ApprovalModal";
import { delayTypes } from "../../components/approvals/queueData";
import { formatDate, formatText } from "../../components/approvals/approvalUtils";
import { useConfirmation } from "../../hooks/useConfirmation";
import { validationMessage } from "../../hooks/useApprovalReview";
import { delayApi } from "../../api/delayApi";

const input = "mt-2 w-full rounded-xl border border-[#E7DED2] bg-[#FFFDFA] p-3 text-sm outline-none focus:border-[#817669]";
const initial = { task: "", delay_type: "MATERIAL_DELAY", reason: "", description: "", expected_completion_date: "", extension_requested: false, requested_end_date: "" };

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
    const { confirm, confirmationModal } = useConfirmation();
    const task = tasks.find((item) => String(item.id) === form.task) || selectedTask;
    function update(key, value) {
        setForm((previous) => ({ ...previous, [key]: value, ...(key === "extension_requested" && !value ? { requested_end_date: "" } : {}) }));
        setError(""); setErrors({});
    }
    function chooseTask(id) {
        const selected = tasks.find((item) => String(item.id) === id);
        setSelectedTask(selected || null);
        setForm((previous) => ({ ...previous, task: id, extension_requested: selected?.has_pending_extension ? false : previous.extension_requested, requested_end_date: "" }));
        setErrors({}); setError("");
    }
    const field = (name) => ({ id: `delay-${name}`, "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `delay-${name}-error` : undefined });
    async function submit(event) {
        event.preventDefault();
        if (inFlight.current) return;
        const invalid = {};
        if (!task || task.approval_status !== "APPROVED" || ["COMPLETED", "CANCELLED"].includes(task.work_status)) invalid.task = "Select an approved unfinished task.";
        if (!form.reason.trim() || form.reason.trim().length > 200) invalid.reason = "Provide a reason of up to 200 characters.";
        if (!delayTypes.includes(form.delay_type)) invalid.delay_type = "Choose a supported delay type.";
        if (form.expected_completion_date && task?.start_date && form.expected_completion_date < task.start_date) invalid.expected_completion_date = "Expected completion cannot precede the task start date.";
        if (form.extension_requested) {
            if (task?.has_pending_extension) invalid.extension_requested = "This task already has a pending deadline extension.";
            if (!form.requested_end_date || task?.end_date && form.requested_end_date <= task.end_date || task?.start_date && form.requested_end_date < task.start_date) invalid.requested_end_date = "Choose a date after the current deadline and on or after the task start date.";
        }
        if (Object.keys(invalid).length) { setErrors(invalid); setError("Please check the highlighted fields."); return; }
        inFlight.current = true; setConfirming(true); setError(""); setErrors({});
        try {
            if (!await confirm({ title: "Submit delay report?", message: form.extension_requested ? "Submit this delay and a separate deadline extension request for Admin review?" : "Submit this delay report for Admin review?", confirmLabel: "Submit Report" })) return;
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
        <form onSubmit={submit} className="space-y-5 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Report a task delay</h2><p className="mt-2 text-sm text-[#817669]">The deadline changes only after a separate extension approval.</p></div><button type="button" aria-label="Close delay form" disabled={saving || confirming} onClick={close} className="rounded-full bg-[#F1EADF] p-2"><X size={18} /></button></div>
            <fieldset disabled={saving || confirming} className="min-w-0 space-y-5">
                {taskOptions && <div className="space-y-2">
                    <label className="block text-xs font-semibold text-[#817669]">Find an eligible task<input type="search" value={taskOptions.search} maxLength={200} onChange={(event) => taskOptions.onSearch(event.target.value)} className={input} /></label>
                    {taskOptions.loading && <p role="status" className="text-xs text-[#817669]">Loading eligible tasks...</p>}
                    {taskOptions.error && <p role="alert" className="text-xs text-red-700">{taskOptions.error} <button type="button" onClick={taskOptions.onRetry} className="underline">Retry</button></p>}
                    {taskOptions.count > 20 && <div className="flex items-center gap-3 text-xs"><button type="button" disabled={taskOptions.loading || taskOptions.page === 1} onClick={() => taskOptions.onPage(taskOptions.page - 1)}>Previous tasks</button><span>Page {taskOptions.page} / {Math.ceil(taskOptions.count / 20)}</span><button type="button" disabled={taskOptions.loading || taskOptions.page * 20 >= taskOptions.count} onClick={() => taskOptions.onPage(taskOptions.page + 1)}>Next tasks</button></div>}
                </div>}
                <label className="block text-xs font-semibold text-[#817669]">Task *<select {...field("task")} autoFocus required value={form.task} onChange={(event) => chooseTask(event.target.value)} className={input}><option value="">Select an approved task</option>{task && !tasks.some((item) => String(item.id) === form.task) && <option value={form.task}>{task.title}</option>}{tasks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><FieldError name="task" errors={errors} /></label>
                {!tasks.length && !taskOptions?.loading && !taskOptions?.error && <p className="text-sm text-[#817669]">No eligible tasks match this search.</p>}
                {task && <p className="text-xs text-[#817669]">Current approved deadline: {formatDate(task.end_date)}{task.has_pending_extension ? " / A deadline extension is already pending." : ""}</p>}
                <label className="block text-xs font-semibold text-[#817669]">Delay type *<select {...field("delay_type")} value={form.delay_type} onChange={(event) => update("delay_type", event.target.value)} className={input}>{delayTypes.map((value) => <option key={value} value={value}>{formatText(value)}</option>)}</select><FieldError name="delay_type" errors={errors} /></label>
                <label className="block text-xs font-semibold text-[#817669]">Reason *<input {...field("reason")} required maxLength={200} value={form.reason} onChange={(event) => update("reason", event.target.value)} className={input} /><FieldError name="reason" errors={errors} /></label>
                <label className="block text-xs font-semibold text-[#817669]">Description<textarea {...field("description")} rows={3} value={form.description} onChange={(event) => update("description", event.target.value)} className={input} /><FieldError name="description" errors={errors} /></label>
                <label className="block text-xs font-semibold text-[#817669]">Expected completion date<input {...field("expected_completion_date")} type="date" min={task?.start_date || undefined} value={form.expected_completion_date} onChange={(event) => update("expected_completion_date", event.target.value)} className={input} /><FieldError name="expected_completion_date" errors={errors} /></label>
                <label className="flex items-center gap-3 text-sm font-semibold"><input {...field("extension_requested")} type="checkbox" disabled={Boolean(task?.has_pending_extension)} checked={form.extension_requested} onChange={(event) => update("extension_requested", event.target.checked)} />Request a deadline extension</label>
                <FieldError name="extension_requested" errors={errors} />
                {form.extension_requested && <label className="block text-xs font-semibold text-[#817669]">Requested new end date *<input {...field("requested_end_date")} type="date" required min={task?.end_date || task?.start_date || undefined} value={form.requested_end_date} onChange={(event) => update("requested_end_date", event.target.value)} className={input} /><FieldError name="requested_end_date" errors={errors} /></label>}
                <div className="flex justify-end gap-3"><button type="button" onClick={close} className="rounded-xl border border-[#E7DED2] px-4 py-3 text-sm font-semibold">Cancel</button><button type="submit" disabled={!task} className="rounded-xl bg-[#211E1A] px-4 py-3 text-sm font-semibold text-[#FFFDFA] disabled:opacity-40">Submit delay report</button></div>
            </fieldset>
        </form>
        {confirmationModal}
    </ApprovalModal>;
}
