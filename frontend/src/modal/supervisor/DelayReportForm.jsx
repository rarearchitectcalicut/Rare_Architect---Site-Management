import { useRef, useState } from "react";
import { X } from "lucide-react";
import ApprovalModal from "../../components/approvals/ApprovalModal";
import { delayTypes } from "../../components/approvals/queueData";
import { formatText } from "../../components/approvals/approvalUtils";
import { useConfirmation } from "../../hooks/useConfirmation";
import { validationMessage } from "../../hooks/useApprovalReview";
import { delayApi } from "../../api/delayApi";

const input = "mt-2 w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] p-3 text-sm outline-none focus:border-[#3565A5]";
const initial = { task: "", delay_type: "MATERIAL_DELAY", reason: "", description: "", expected_completion_date: "", extension_requested: false, requested_end_date: "" };

export default function DelayReportForm({ tasks, onClose, onSaved }) {
    const [form, setForm] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const inFlight = useRef(false);
    const { confirm, confirmationModal } = useConfirmation();
    const task = tasks.find((item) => String(item.id) === form.task);
    const update = (key, value) => { setForm((previous) => ({ ...previous, [key]: value })); setError(""); };
    async function submit(event) {
        event.preventDefault();
        if (inFlight.current) return;
        if (!task || !form.reason.trim()) { setError("Select a task and provide a reason."); return; }
        if (form.extension_requested && (!form.requested_end_date || task.end_date && form.requested_end_date <= task.end_date)) { setError("The requested deadline must be later than the current deadline."); return; }
        if (!await confirm({ title: "Submit delay report?", message: form.extension_requested ? "Submit this delay and a separate deadline extension request for Admin review?" : "Submit this delay report for Admin review?", confirmLabel: "Submit Report" })) return;
        inFlight.current = true; setSaving(true); setError("");
        try {
            const { task: taskId, ...values } = form;
            await delayApi.create(taskId, { ...values, reason: values.reason.trim(), expected_completion_date: values.expected_completion_date || null, requested_end_date: values.extension_requested ? values.requested_end_date : null });
            onSaved();
        } catch (failure) { setError(validationMessage(failure)); }
        finally { inFlight.current = false; setSaving(false); }
    }
    return <ApprovalModal label="New delay report" onClose={onClose} busy={saving ? "Submitting delay report…" : ""} error={error}>
        <form onSubmit={submit} className="space-y-5 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Report a task delay</h2><p className="mt-2 text-sm text-[#817669]">The deadline changes only after a separate extension approval.</p></div><button type="button" aria-label="Close delay form" disabled={saving} onClick={onClose} className="rounded-full bg-[#F1EADF] p-2"><X size={18} /></button></div>
            <label className="block text-xs font-semibold text-[#817669]">Task *<select autoFocus required value={form.task} onChange={(event) => update("task", event.target.value)} className={input}><option value="">Select an approved task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
            {!tasks.length && <p className="text-sm text-[#94651D]">No approved, unfinished tasks are available for delay reporting.</p>}
            <label className="block text-xs font-semibold text-[#817669]">Delay type *<select value={form.delay_type} onChange={(event) => update("delay_type", event.target.value)} className={input}>{delayTypes.map((value) => <option key={value} value={value}>{formatText(value)}</option>)}</select></label>
            <label className="block text-xs font-semibold text-[#817669]">Reason *<input required maxLength={200} value={form.reason} onChange={(event) => update("reason", event.target.value)} className={input} /></label>
            <label className="block text-xs font-semibold text-[#817669]">Description<textarea rows={3} value={form.description} onChange={(event) => update("description", event.target.value)} className={input} /></label>
            <label className="block text-xs font-semibold text-[#817669]">Expected completion date<input type="date" min={task?.start_date || undefined} value={form.expected_completion_date} onChange={(event) => update("expected_completion_date", event.target.value)} className={input} /></label>
            <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={form.extension_requested} onChange={(event) => update("extension_requested", event.target.checked)} />Request a deadline extension</label>
            {form.extension_requested && <label className="block text-xs font-semibold text-[#817669]">Requested new end date *<input type="date" required min={task?.end_date || task?.start_date || undefined} value={form.requested_end_date} onChange={(event) => update("requested_end_date", event.target.value)} className={input} /><span className="mt-2 block">Current deadline: {task?.end_date || "Not set"}</span></label>}
            <div className="flex justify-end gap-3"><button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-[#E4DCCD] px-4 py-3 text-sm font-semibold">Cancel</button><button type="submit" disabled={saving || !tasks.length} className="rounded-xl bg-[#252B2A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Submit delay report</button></div>
        </form>
        {confirmationModal}
    </ApprovalModal>;
}
