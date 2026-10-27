import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Ban, CheckCircle2, Play, RotateCcw } from "lucide-react";
import { taskApi } from "../../api/taskApi";

function extractError(error) {
    const data = error?.response?.data;
    if (typeof data?.detail === "string") return data.detail;
    if (data && typeof data === "object") {
        const messages = Object.values(data).flat().filter((value) => typeof value === "string");
        if (messages.length) return messages.join(" ");
    }
    return "Unable to update this task. Please try again.";
}

export default function TaskExecutionActions({ task, onSuccess, role = "SUPERVISOR" }) {
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [dialogAction, setDialogAction] = useState(null);
    const [reason, setReason] = useState("");
    const inFlight = useRef(false);
    const mounted = useRef(false);
    const dialogRef = useRef(null);
    const titleId = useId();
    const reasonId = useId();
    const errorId = useId();
    const descriptionId = useId();

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    useEffect(() => {
        if (!dialogAction) return;
        const dialog = dialogRef.current;
        dialog.showModal();
        return () => dialog.close();
    }, [dialogAction]);

    if (!task?.id) return null;
    const approved = task.approval_status === "APPROVED";
    const supervisor = role === "SUPERVISOR";
    const canStart = supervisor && approved && task.work_status === "NOT_STARTED";
    const canComplete = supervisor && approved && task.work_status === "IN_PROGRESS";
    const canCancel = canStart || canComplete;
    const finished = task.work_status === "COMPLETED";
    const cancelled = task.work_status === "CANCELLED";
    const canReopen = role === "ADMIN" && approved && finished;
    if (!canStart && !canComplete && !canReopen && !(supervisor && (finished || cancelled))) return null;

    function openDialog(action) {
        setError(""); setReason(""); setDialogAction(action);
    }
    function closeDialog() {
        if (inFlight.current) return;
        setDialogAction(null); setReason(""); setError("");
    }
    async function run(action) {
        if (inFlight.current) return;
        setError("");
        if (["cancel", "reopen"].includes(action) && !reason.trim()) {
            setError("An explanation is required.");
            return;
        }
        if (["start", "complete"].includes(action) && !window.confirm(action === "start" ? "Start this task?" : "Mark this task completed?")) return;
        inFlight.current = true; setBusy(action);
        let response;
        try {
            if (action === "cancel" || action === "reopen") response = await taskApi[action](task.id, reason.trim());
            else response = await taskApi[action](task.id);
        } catch (err) {
            if (mounted.current) setError(extractError(err));
            return;
        } finally {
            inFlight.current = false;
            if (mounted.current) setBusy("");
        }
        if (!mounted.current) return;
        setDialogAction(null); setReason("");
        await onSuccess?.(action, response.task);
    }

    const secondary = "rounded-xl border border-[#E4DCCD] px-4 py-3 text-xs font-semibold text-[#665C50] hover:bg-[#F1EADF] focus-visible:outline-2 focus-visible:outline-[#A58A67] disabled:opacity-50";
    return <section aria-label="Task execution" className="mt-5 rounded-[20px] border border-[#E7DED2] bg-[#F8F4EE] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h4 className="text-sm font-bold text-[#211E1A]">{role === "ADMIN" ? "Task lifecycle" : "Task execution"}</h4>
                <p className="mt-1 text-xs leading-5 text-[#716658]">{finished ? "This task is completed." : cancelled ? "This task is cancelled. Historical records are preserved." : "Update the task as work progresses on site."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
                {supervisor && (finished || cancelled) && <span className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold ${cancelled ? "bg-[#EEE8E0] text-[#74695D]" : "bg-[#E7F2E8] text-[#296F40]"}`}>{cancelled ? <Ban size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}{cancelled ? "Cancelled" : "Completed"}</span>}
                {(canStart || canComplete) && <button type="button" disabled={Boolean(busy)} onClick={() => run(canStart ? "start" : "complete")} className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-4 py-3 text-xs font-semibold text-white hover:bg-[#39332B] disabled:opacity-50">{canStart ? <Play size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}{busy ? "Updating..." : canStart ? "Start Task" : "Complete Task"}</button>}
                {canCancel && <button type="button" disabled={Boolean(busy)} onClick={() => openDialog("cancel")} className={`${secondary} inline-flex items-center gap-2`}><Ban size={16} aria-hidden="true" />Cancel Task</button>}
                {canReopen && <button type="button" disabled={Boolean(busy)} onClick={() => openDialog("reopen")} className={`${secondary} inline-flex items-center gap-2`}><RotateCcw size={16} aria-hidden="true" />Reopen Task</button>}
            </div>
        </div>
        {error && !dialogAction && <p role="alert" className="mt-3 flex items-start gap-2 text-xs leading-5 text-red-700"><AlertCircle size={16} className="shrink-0" aria-hidden="true" />{error}</p>}
        {dialogAction && createPortal(<dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId} aria-modal="true"
            onCancel={(event) => { event.preventDefault(); event.stopPropagation(); closeDialog(); }}
            onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
            className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] p-6 text-[#211E1A] shadow-2xl backdrop:bg-[#211E1A]/55 backdrop:backdrop-blur-sm">
            <form onSubmit={(event) => { event.preventDefault(); run(dialogAction); }}>
                <h2 id={titleId} className="text-xl font-bold">{dialogAction === "cancel" ? "Cancel this task?" : "Reopen this task?"}</h2>
                <p id={descriptionId} className="mt-3 text-sm leading-6 text-[#716658]">{dialogAction === "cancel" ? "Work on this task will stop. Documents and past reports will be preserved." : "The task will return to In Progress. Existing verified work and progress remain unchanged; reopening does not create a new measurement baseline."}</p>
                <label htmlFor={reasonId} className="mt-5 block text-xs font-semibold text-[#665C50]">Required explanation</label>
                <textarea id={reasonId} autoFocus required maxLength={1000} rows={4} value={reason} disabled={Boolean(busy)} onChange={(event) => { setReason(event.target.value); setError(""); }} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="mt-2 w-full rounded-xl border border-[#E4DCCD] bg-[#F8F4EE] px-4 py-3 text-sm outline-none focus:border-[#A58A67] focus:ring-2 focus:ring-[#E8DDD0]" />
                {error && <p id={errorId} role="alert" className="mt-3 text-xs leading-5 text-red-700">{error}</p>}
                <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" disabled={Boolean(busy)} onClick={closeDialog} className={secondary}>Back</button><button type="submit" disabled={Boolean(busy) || !reason.trim()} className="rounded-xl bg-[#211E1A] px-4 py-3 text-xs font-semibold text-white hover:bg-[#39332B] disabled:opacity-50">{busy ? "Saving..." : dialogAction === "cancel" ? "Confirm Cancellation" : "Confirm Reopen"}</button></div>
            </form>
        </dialog>, document.body)}
    </section>;
}


export function TaskProgress({ progress }) {
    const raw = progress?.progress_percentage;
    const percent = typeof raw === "number" || (typeof raw === "string" && raw.trim()) ? Number(raw) : NaN;
    const quantity = progress?.measurement_method === "QUANTITY";
    const validQuantity = (value) => (typeof value === "number" || typeof value === "string" && value.trim()) && Number.isFinite(Number(value));
    const valid = Number.isFinite(percent) && ["QUANTITY", "COMPLETION_ONLY"].includes(progress?.measurement_method)
        && (quantity || percent === 0 || percent === 100)
        && (!quantity || validQuantity(progress.verified_quantity) && validQuantity(progress.planned_quantity) && Number(progress.planned_quantity) > 0 && typeof progress.measurement_unit === "string" && progress.measurement_unit.trim());
    if (!valid) return <span className="my-3 block text-xs text-[#716658]">Progress unavailable / Awaiting approval/baseline</span>;
    const width = Math.min(100, Math.max(0, percent));
    return <span className="my-3 block min-w-0 space-y-2 text-xs text-[#211E1A]">
        <span className="flex flex-wrap justify-between gap-2"><span>Admin-verified progress</span><strong>{percent}%</strong></span>
        <span role="progressbar" aria-label="Admin-verified task progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={width} className="block h-2 overflow-hidden rounded-full bg-[#E7DED2]">
            <span className="block h-full rounded-full bg-[#817669]" style={{ width: `${width}%` }} />
        </span>
        <span className="block break-words leading-5 text-[#716658]">{quantity
            ? `${progress.verified_quantity} / ${progress.planned_quantity} ${progress.measurement_unit} verified`
            : percent === 100 ? "Completion verified" : "Completion not yet verified"}</span>
    </span>;
}
