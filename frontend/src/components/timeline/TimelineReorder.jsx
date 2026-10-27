
import { useEffect, useMemo, useState } from "react";
import {
    ArrowDown,
    ArrowUp,
    Check,
    GripVertical,
    Info,
    RotateCcw,
    Send,
    X,
} from "lucide-react";

function sortTasks(tasks) {
    return [...tasks].sort((a, b) => {
        const orderA = Number(a.display_order ?? 999999);
        const orderB = Number(b.display_order ?? 999999);

        if (orderA !== orderB) return orderA - orderB;

        return String(a.created_at || "").localeCompare(
            String(b.created_at || "")
        );
    });
}

function moveItem(items, fromIndex, toIndex) {
    if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= items.length ||
        toIndex >= items.length ||
        fromIndex === toIndex
    ) {
        return items;
    }

    const result = [...items];
    const [moved] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, moved);

    return result;
}

function sameOrder(a, b) {
    return (
        a.length === b.length &&
        a.every(
            (task, index) =>
                String(task.id) === String(b[index].id)
        )
    );
}

export default function TimelineReorder({
    tasks = [],
    onCancel,
    onReview,
    disabled = false,
}) {
    const originalTasks = useMemo(
        () => sortTasks(tasks),
        [tasks]
    );

    const [proposedTasks, setProposedTasks] = useState(
        () => sortTasks(tasks)
    );
    const [draggedId, setDraggedId] = useState(null);
    const [overId, setOverId] = useState(null);

    useEffect(() => {
        setProposedTasks(originalTasks);
        setDraggedId(null);
        setOverId(null);
    }, [originalTasks]);

    const changed = !sameOrder(
        proposedTasks,
        originalTasks
    );

    const originalPositions = useMemo(() => {
        return new Map(
            originalTasks.map((task, index) => [
                String(task.id),
                index,
            ])
        );
    }, [originalTasks]);

    const movedCount = proposedTasks.filter(
        (task, index) =>
            originalPositions.get(String(task.id)) !== index
    ).length;

    function moveByButton(index, direction) {
        if (disabled) return;

        setProposedTasks((current) =>
            moveItem(current, index, index + direction)
        );
    }

    function handleDrop(targetId) {
        if (disabled || !draggedId) return;

        setProposedTasks((current) => {
            const fromIndex = current.findIndex(
                (task) =>
                    String(task.id) === String(draggedId)
            );

            const toIndex = current.findIndex(
                (task) =>
                    String(task.id) === String(targetId)
            );

            return moveItem(current, fromIndex, toIndex);
        });

        setDraggedId(null);
        setOverId(null);
    }

    function reset() {
        if (disabled) return;

        setProposedTasks([...originalTasks]);
        setDraggedId(null);
        setOverId(null);
    }

    return (
        <section className="overflow-hidden rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA]">
            {/* HEADER */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EEE6DC] p-5 sm:p-6">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#716658]">
                        Supervisor / Timeline Management
                    </p>

                    <h2 className="mt-2 text-lg font-bold text-[#211E1A]">
                        Reorder Project Tasks
                    </h2>

                    <p className="mt-2 max-w-xl text-xs leading-6 text-[#716658]">
                        Drag tasks into the proposed sequence or use
                        the arrow buttons to move them individually.
                        Your changes are not applied until reviewed.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onCancel}
                    disabled={disabled}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#E4DCCD] px-4 py-2.5 text-xs font-bold text-[#665E53] hover:bg-[#F1EADF] disabled:opacity-50"
                >
                    <X size={16} />
                    Cancel
                </button>
            </div>

            {/* EXPLANATION */}
            <div className="mx-4 mt-4 flex items-start gap-3 rounded-2xl bg-[#E9F0FC] p-4 sm:mx-6">
                <Info
                    size={18}
                    className="mt-0.5 shrink-0 text-[#3565A5]"
                />

                <p className="text-xs leading-6 text-[#3565A5]">
                    <strong>Approval required:</strong> Reordering
                    approved tasks creates an Admin-reviewed order
                    change request. The official timeline remains
                    unchanged while the request is pending.
                </p>
            </div>

            {/* CHANGE SUMMARY */}
            <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 sm:mx-6">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-[#F1EADF] px-3 py-2 text-xs font-bold text-[#74614D]">
                        {proposedTasks.length} tasks
                    </span>

                    <span
                        className={`rounded-full px-3 py-2 text-xs font-bold ${changed
                                ? "bg-[#FFF2D8] text-[#94651D]"
                                : "bg-[#E7F2E8] text-[#296F40]"
                            }`}
                    >
                        {changed
                            ? `${movedCount} positions changed`
                            : "No changes"}
                    </span>
                </div>

                <button
                    type="button"
                    onClick={reset}
                    disabled={!changed || disabled}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#716658] hover:bg-[#F1EADF] disabled:opacity-40"
                >
                    <RotateCcw size={15} />
                    Reset Order
                </button>
            </div>

            {/* REORDERABLE TASK LIST */}
            <div className="space-y-3 p-4 sm:p-6">
                {proposedTasks.length === 0 && (
                    <div className="rounded-2xl bg-[#F8F4EE] p-8 text-center text-sm text-[#716658]">
                        There are no project tasks to reorder.
                    </div>
                )}

                {proposedTasks.map((task, index) => {
                    const originallyAt =
                        originalPositions.get(String(task.id));

                    const moved = originallyAt !== index;
                    const dragging =
                        String(draggedId) === String(task.id);
                    const dropTarget =
                        String(overId) === String(task.id);

                    return (
                        <div
                            key={task.id}
                            draggable={!disabled}
                            onDragStart={(event) => {
                                if (disabled) return;

                                event.dataTransfer.effectAllowed =
                                    "move";
                                event.dataTransfer.setData(
                                    "text/plain",
                                    String(task.id)
                                );

                                setDraggedId(String(task.id));
                            }}
                            onDragOver={(event) => {
                                if (disabled || !draggedId) return;

                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setOverId(String(task.id));
                            }}
                            onDragLeave={() => {
                                setOverId((current) =>
                                    current === String(task.id)
                                        ? null
                                        : current
                                );
                            }}
                            onDrop={(event) => {
                                event.preventDefault();
                                handleDrop(task.id);
                            }}
                            onDragEnd={() => {
                                setDraggedId(null);
                                setOverId(null);
                            }}
                            className={`
                flex items-center gap-3
                rounded-[18px] border p-3
                transition-all duration-200
                sm:gap-4 sm:p-4
                ${dropTarget && !dragging
                                    ? "border-[#3565A5] bg-[#EFF5FF]"
                                    : moved
                                        ? "border-[#E2C78F] bg-[#FFF9EB]"
                                        : "border-[#E7DED2] bg-[#FFFDFA]"
                                }
                ${dragging
                                    ? "opacity-40"
                                    : "opacity-100"
                                }
              `}
                        >
                            {/* DRAG HANDLE */}
                            <span
                                title="Drag to reorder"
                                className="hidden cursor-grab text-[#B6A997] active:cursor-grabbing sm:block"
                                aria-hidden="true"
                            >
                                <GripVertical size={20} />
                            </span>

                            {/* PROPOSED POSITION */}
                            <span
                                className={`
                  flex h-11 w-11 shrink-0
                  items-center justify-center
                  rounded-xl text-sm font-bold
                  ${moved
                                        ? "bg-[#FFF0CC] text-[#94651D]"
                                        : "bg-[#F1EADF] text-[#74614D]"
                                    }
                `}
                            >
                                {String(index + 1).padStart(2, "0")}
                            </span>

                            {/* TASK DETAILS */}
                            <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-bold text-[#211E1A]">
                                    {task.title || "Untitled Task"}
                                </p>

                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#716658]">
                                    <span>
                                        {String(
                                            task.approval_status || "PENDING"
                                        ).replaceAll("_", " ")}
                                    </span>

                                    <span>
                                        {String(
                                            task.work_status || "NOT_STARTED"
                                        ).replaceAll("_", " ")}
                                    </span>
                                </div>

                                {moved && (
                                    <p className="mt-2 text-xs font-bold text-[#94651D]">
                                        Originally position {originallyAt + 1}
                                    </p>
                                )}
                            </div>

                            {/* MOVE BUTTONS */}
                            <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                                <button
                                    type="button"
                                    title="Move task up"
                                    aria-label={`Move ${task.title} up`}
                                    disabled={index === 0 || disabled}
                                    onClick={() =>
                                        moveByButton(index, -1)
                                    }
                                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F1EADF] text-[#665E53] hover:bg-[#E8DCCB] disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    <ArrowUp size={17} />
                                </button>

                                <button
                                    type="button"
                                    title="Move task down"
                                    aria-label={`Move ${task.title} down`}
                                    disabled={
                                        index === proposedTasks.length - 1 ||
                                        disabled
                                    }
                                    onClick={() =>
                                        moveByButton(index, 1)
                                    }
                                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F1EADF] text-[#665E53] hover:bg-[#E8DCCB] disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    <ArrowDown size={17} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* FOOTER */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEE6DC] bg-[#F8F4EE] p-5 sm:px-6">
                <div className="flex items-center gap-2 text-xs text-[#716658]">
                    {changed ? (
                        <>
                            <Info size={16} />
                            Review the proposed order before submission.
                        </>
                    ) : (
                        <>
                            <Check size={16} />
                            Current order has not been changed.
                        </>
                    )}
                </div>

                <button
                    type="button"
                    disabled={!changed || disabled}
                    onClick={() => {
                        // Parent owns the review and submission workflow.
                        // Pass the entire ordered task array, not a filtered subset.
                        onReview?.([...proposedTasks]);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#39332B] disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Send size={17} />
                    Review Proposed Order
                </button>
            </div>
        </section>
    );
}
