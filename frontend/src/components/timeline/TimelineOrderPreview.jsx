
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
                <h3 className="flex items-center gap-2 text-base font-bold text-ink">
                    <ListOrdered size={19} />
                    Order Change Preview
                </h3>

                <p className="mt-2 text-xs leading-5 text-muted">
                    Review every changed position before requesting
                    Admin approval.
                </p>
            </div>

            {/* SUMMARY */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-soft p-4">
                <span className="rounded-full bg-app px-3 py-2 text-xs font-bold text-muted">
                    {proposedTasks.length} Tasks
                </span>

                <span
                    className={`rounded-full px-3 py-2 text-xs font-bold ${changedTasks.length
                            ? "bg-pastel-butter text-warning"
                            : "bg-pastel-mint text-success"
                        }`}
                >
                    {changedTasks.length} Position Changes
                </span>
            </div>

            {/* CHANGED TASKS */}
            {changedTasks.length === 0 ? (
                <div className="flex items-center gap-3 rounded-2xl border border-[#CFE2D2] bg-pastel-mint p-4">
                    <CheckCircle2
                        size={19}
                        className="text-success"
                    />
                    <p className="text-sm font-medium text-success">
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
                                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-sm font-bold text-ink">
                                        {task.title}
                                    </p>

                                    <p className="mt-1 text-xs text-muted">
                                        {String(
                                            task.approval_status || "PENDING"
                                        ).replaceAll("_", " ")}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-app text-xs font-bold text-muted">
                                        {previous ?? "—"}
                                    </span>

                                    <ArrowRight
                                        size={16}
                                        className="text-muted"
                                    />

                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-pastel-butter text-xs font-bold text-warning">
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
