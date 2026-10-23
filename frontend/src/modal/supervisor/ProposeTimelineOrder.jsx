
import { useEffect, useRef, useState } from "react";
import {
    AlertCircle,
    ArrowRightLeft,
    CheckCircle2,
    Info,
    Send,
    ShieldCheck,
    X,
} from "lucide-react";

import { timelineApi } from "../../api/timelineApi";
import LoadingScreen from "../../components/LoadingScreen";
import TimelineOrderPreview from "../../components/timeline/TimelineOrderPreview";

// =====================================================
// HELPERS
// =====================================================

function orderedTasks(tasks) {
    return [...tasks].sort((a, b) => {
        const aOrder = Number(a.display_order ?? 999999);
        const bOrder = Number(b.display_order ?? 999999);

        if (aOrder !== bOrder) return aOrder - bOrder;

        return String(a.created_at || "").localeCompare(
            String(b.created_at || "")
        );
    });
}

function ids(tasks) {
    return tasks.map((task) => String(task.id));
}

function sameSequence(a, b) {
    const aIds = ids(a);
    const bIds = ids(b);

    return (
        aIds.length === bIds.length &&
        aIds.every((id, index) => id === bIds[index])
    );
}

function validTaskSet(original, proposed) {
    const oldIds = ids(original);
    const newIds = ids(proposed);

    return (
        oldIds.length === newIds.length &&
        new Set(oldIds).size === oldIds.length &&
        new Set(newIds).size === newIds.length &&
        oldIds.every((id) => newIds.includes(id))
    );
}

function getApiError(error) {
    const data = error?.response?.data;

    if (typeof data?.detail === "string") {
        return data.detail;
    }

    if (typeof data?.reason === "string") {
        return data.reason;
    }

    if (Array.isArray(data?.reason)) {
        return data.reason.join(" ");
    }

    if (data && typeof data === "object") {
        const messages = Object.entries(data)
            .map(([key, value]) => {
                const message = Array.isArray(value)
                    ? value.join(" ")
                    : typeof value === "string"
                        ? value
                        : JSON.stringify(value);

                return `${key}: ${message}`;
            })
            .filter(Boolean);

        if (messages.length) {
            return messages.join(" · ");
        }
    }

    if (error?.response?.status === 403) {
        return "You do not have permission to reorder these tasks.";
    }

    if (error?.response?.status === 409) {
        return "The timeline has changed or another request is pending. Refresh the timeline and try again.";
    }

    return "Unable to submit the order change. Please try again.";
}

// =====================================================
// REQUEST PAYLOAD
// =====================================================
//
// IMPORTANT:
// The implementation confirms the endpoint, but
// does not define the JSON request serializer fields.
//
// We are using task_ids + reason as an integration
// assumption. If your Django serializer expects
// ordered_task_ids or another shape, update only
// this function.

function buildReorderPayload(proposedTasks, reason) {
    return {
        task_ids: proposedTasks.map((task) => task.id),
        reason: reason.trim(),
    };
}

// =====================================================
// COMPONENT
// =====================================================

export default function ProposeTimelineOrder({
    open,
    projectId,
    originalTasks = [],
    proposedTasks = [],
    onClose,
    onSubmitted,
}) {
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const submittingRef = useRef(false);

    const original = orderedTasks(originalTasks);

    const changed = !sameSequence(
        original,
        proposedTasks
    );

    const validSet = validTaskSet(
        original,
        proposedTasks
    );

    const movedCount = proposedTasks.filter(
        (task, index) =>
            String(original[index]?.id) !== String(task.id)
    ).length;

    // ----------------------------------------------
    // RESET WHEN OPENING
    // ----------------------------------------------

    useEffect(() => {
        if (!open) return;

        setReason("");
        setError("");

        const previousOverflow =
            document.body.style.overflow;

        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow =
                previousOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        function onEscape(event) {
            if (
                event.key === "Escape" &&
                !submittingRef.current
            ) {
                onClose?.();
            }
        }

        document.addEventListener(
            "keydown",
            onEscape
        );

        return () => {
            document.removeEventListener(
                "keydown",
                onEscape
            );
        };
    }, [open, onClose]);

    if (!open) return null;

    // ----------------------------------------------
    // SUBMIT REQUEST
    // ----------------------------------------------

    async function submit(event) {
        event.preventDefault();

        if (submittingRef.current) return;

        const trimmedReason = reason.trim();

        if (!trimmedReason) {
            setError(
                "Please explain why the timeline order needs to change."
            );
            return;
        }

        if (!validSet) {
            setError(
                "The proposed order must contain every original task exactly once. Refresh the timeline and try again."
            );
            return;
        }

        if (!changed) {
            setError(
                "No task positions have changed."
            );
            return;
        }

        if (!projectId) {
            setError("Project ID is missing.");
            return;
        }

        submittingRef.current = true;
        setSaving(true);
        setError("");

        try {
            const payload = buildReorderPayload(
                proposedTasks,
                trimmedReason
            );

            const response = await timelineApi.proposeReorder(
                projectId,
                payload
            );

            onSubmitted?.(response);
            onClose?.();
        } catch (err) {
            setError(getApiError(err));
        } finally {
            submittingRef.current = false;
            setSaving(false);
        }
    }

    // ----------------------------------------------
    // RENDER
    // ----------------------------------------------

    return (
        <>
            {saving && (
                <LoadingScreen message="Submitting timeline order request..." />
            )}

            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-[#211E1A]/55 p-3 backdrop-blur-sm sm:p-6"
                onMouseDown={(event) => {
                    if (
                        event.target === event.currentTarget &&
                        !submittingRef.current
                    ) {
                        onClose?.();
                    }
                }}
            >
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="timeline-order-modal-title"
                    className="flex max-h-[92dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-[26px] border border-[#E7DED2] bg-[#FFFDFA] shadow-2xl"
                >
                    {/* HEADER */}
                    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#EEE6DC] px-5 py-5 sm:px-7">
                        <div className="flex items-start gap-3">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E9F0FC] text-[#3565A5]">
                                <ArrowRightLeft size={23} />
                            </span>

                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#948778]">
                                    Supervisor / Timeline
                                </p>

                                <h2
                                    id="timeline-order-modal-title"
                                    className="mt-1 text-xl font-bold text-[#211E1A]"
                                >
                                    Propose Timeline Order
                                </h2>

                                <p className="mt-2 text-xs leading-5 text-[#817669]">
                                    Review the changes before submitting
                                    them for approval.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => onClose?.()}
                            aria-label="Close order proposal"
                            className="rounded-full bg-[#F1EADF] p-2.5 text-[#665E53] hover:bg-[#E8DCCB] disabled:opacity-50"
                        >
                            <X size={19} />
                        </button>
                    </header>

                    <form
                        onSubmit={submit}
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        {/* CONTENT */}
                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
                            {/* CHANGE SUMMARY */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-[#F8F4EE] p-4">
                                    <p className="text-xs text-[#817669]">
                                        Project Tasks
                                    </p>

                                    <p className="mt-2 text-2xl font-bold text-[#211E1A]">
                                        {original.length}
                                    </p>
                                </div>

                                <div className="rounded-2xl bg-[#FFF2D8] p-4">
                                    <p className="text-xs text-[#94651D]">
                                        Positions Changed
                                    </p>

                                    <p className="mt-2 text-2xl font-bold text-[#94651D]">
                                        {movedCount}
                                    </p>
                                </div>
                            </div>

                            {/* WARNING */}
                            <div className="flex items-start gap-3 rounded-2xl bg-[#E9F0FC] p-4">
                                <ShieldCheck
                                    size={20}
                                    className="mt-0.5 shrink-0 text-[#3565A5]"
                                />

                                <p className="text-xs leading-6 text-[#3565A5]">
                                    <strong>Admin approval:</strong> Changes
                                    affecting approved tasks must be reviewed
                                    before they update the official timeline.
                                    Submitting this request does not itself
                                    approve the proposed order.
                                </p>
                            </div>

                            {/* ORDER COMPARISON */}
                            <TimelineOrderPreview
                                originalTasks={original}
                                proposedTasks={proposedTasks}
                            />

                            {/* REASON */}
                            <div className="space-y-2">
                                <label
                                    htmlFor="timeline-order-reason"
                                    className="block text-xs font-bold uppercase tracking-wide text-[#817669]"
                                >
                                    Reason for Reordering *
                                </label>

                                <textarea
                                    id="timeline-order-reason"
                                    rows={4}
                                    value={reason}
                                    onChange={(event) => {
                                        setReason(event.target.value);
                                        setError("");
                                    }}
                                    maxLength={2000}
                                    placeholder="Explain why the work sequence needs to change, such as site conditions, material availability, or construction dependencies..."
                                    className="w-full resize-y rounded-2xl border border-[#E4DCCD] bg-[#FFFDFA] px-4 py-3 text-sm leading-6 text-[#211E1A] outline-none transition-all focus:border-[#B7A58E] focus:ring-4 focus:ring-[#E8DDD0]/50"
                                />

                                <p className="text-[11px] text-[#948778]">
                                    This reason will be provided to Admin
                                    for review.
                                </p>
                            </div>

                            {!validSet && (
                                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4">
                                    <AlertCircle
                                        size={18}
                                        className="shrink-0 text-red-700"
                                    />
                                    <p className="text-xs text-red-700">
                                        The proposed sequence doesn't contain
                                        exactly the same tasks as the current
                                        project timeline. Refresh before submitting.
                                    </p>
                                </div>
                            )}

                            {error && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4"
                                >
                                    <AlertCircle
                                        size={18}
                                        className="shrink-0 text-red-700"
                                    />

                                    <p className="text-sm leading-6 text-red-700">
                                        {error}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* FOOTER */}
                        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#EEE6DC] bg-[#FFFDFA] px-5 py-4 sm:px-7">
                            <p className="flex items-center gap-2 text-xs text-[#817669]">
                                <Info size={15} />
                                {movedCount} positions changed
                            </p>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => onClose?.()}
                                    className="rounded-xl border border-[#E4DCCD] px-4 py-3 text-sm font-semibold text-[#211E1A] hover:bg-[#F1EADF] disabled:opacity-50"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={
                                        saving ||
                                        !changed ||
                                        !validSet ||
                                        !reason.trim()
                                    }
                                    className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#39332B] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <Send size={17} />
                                    Submit Request
                                </button>
                            </div>
                        </footer>
                    </form>
                </section>
            </div>
        </>
    );
}
