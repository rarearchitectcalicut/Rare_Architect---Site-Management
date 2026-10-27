
import {
    ArrowRight,
    CheckCircle2,
    ListOrdered,
} from "lucide-react";

function getOriginalOrder(tasks) {
    return [...tasks].sort((a, b) => {
        const aOrder = Number(a.display_order ?? 999999);
        const bOrder = Number(b.display_order ?? 999999);

        if (aOrder !== bOrder) return aOrder - bOrder;

        return String(a.created_at || "").localeCompare(
            String(b.created_at || "")
        );
    });
}

export default function TimelineOrderPreview({
    originalTasks = [],
    proposedTasks = [],
}) {
    const original = getOriginalOrder(originalTasks);

    const positions = new Map(
        original.map((task, index) => [
            String(task.id),
            index + 1,
        ])
    );

    const changedTasks = proposedTasks.filter(
        (task, index) =>
            positions.get(String(task.id)) !== index + 1
    );

    return (
        <section className="space-y-4">
            {/* HEADER */}
            <div>
                <h3 className="flex items-center gap-2 text-base font-bold text-[#211E1A]">
                    <ListOrdered size={19} />
                    Order Change Preview
                </h3>

                <p className="mt-2 text-xs leading-5 text-[#716658]">
                    Review every changed position before requesting
                    Admin approval.
                </p>
            </div>

            {/* SUMMARY */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#F8F4EE] p-4">
                <span className="rounded-full bg-[#F1EADF] px-3 py-2 text-xs font-bold text-[#74614D]">
                    {proposedTasks.length} Tasks
                </span>

                <span
                    className={`rounded-full px-3 py-2 text-xs font-bold ${changedTasks.length
                            ? "bg-[#FFF2D8] text-[#94651D]"
                            : "bg-[#E7F2E8] text-[#296F40]"
                        }`}
                >
                    {changedTasks.length} Position Changes
                </span>
            </div>

            {/* CHANGED TASKS */}
            {changedTasks.length === 0 ? (
                <div className="flex items-center gap-3 rounded-2xl border border-[#CFE2D2] bg-[#E7F2E8] p-4">
                    <CheckCircle2
                        size={19}
                        className="text-[#296F40]"
                    />
                    <p className="text-sm font-medium text-[#296F40]">
                        No task positions changed.
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {changedTasks.map((task) => {
                        const previous = positions.get(
                            String(task.id)
                        );
                        const proposed =
                            proposedTasks.findIndex(
                                (item) =>
                                    String(item.id) === String(task.id)
                            ) + 1;

                        return (
                            <div
                                key={task.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7DED2] bg-[#FFFDFA] p-4"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-sm font-bold text-[#211E1A]">
                                        {task.title}
                                    </p>

                                    <p className="mt-1 text-xs text-[#716658]">
                                        {String(
                                            task.approval_status || "PENDING"
                                        ).replaceAll("_", " ")}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F1EADF] text-xs font-bold text-[#74614D]">
                                        {previous ?? "—"}
                                    </span>

                                    <ArrowRight
                                        size={16}
                                        className="text-[#716658]"
                                    />

                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF2D8] text-xs font-bold text-[#94651D]">
                                        {proposed}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
