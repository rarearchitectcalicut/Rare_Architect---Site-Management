
import { useMemo } from "react";
import {
    ClipboardList,
    ListOrdered,
} from "lucide-react";

import TimelineTaskCard from "./TimelineTaskCard";

export default function TimelineSequence({
    tasks = [],
    projectId,
}) {
    const orderedTasks = useMemo(() => {
        return [...tasks].sort((a, b) => {
            const orderA = Number(a.display_order ?? 999999);
            const orderB = Number(b.display_order ?? 999999);

            if (orderA !== orderB) {
                return orderA - orderB;
            }

            return String(a.created_at || "").localeCompare(
                String(b.created_at || "")
            );
        });
    }, [tasks]);

    return (
        <section className="space-y-4">
            {/* SECTION HEADER */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-[#211E1A]">
                        <ListOrdered
                            size={20}
                            className="text-[#817669]"
                        />
                        Task Sequence
                    </h2>

                    <p className="mt-2 text-xs leading-5 text-[#817669]">
                        Tasks arranged in their current timeline order.
                    </p>
                </div>

                <span className="rounded-full bg-[#F1EADF] px-4 py-2 text-xs font-bold text-[#74614D]">
                    {orderedTasks.length}{" "}
                    {orderedTasks.length === 1 ? "Task" : "Tasks"}
                </span>
            </div>

            {/* EMPTY STATE */}
            {orderedTasks.length === 0 ? (
                <div className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] px-6 py-14 text-center">
                    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#817669]">
                        <ClipboardList size={30} />
                    </span>

                    <h3 className="mt-5 text-lg font-bold text-[#211E1A]">
                        No timeline tasks found
                    </h3>

                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#817669]">
                        Once tasks are created for this project, they will
                        appear in the timeline.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {orderedTasks.map((task, index) => (
                        <TimelineTaskCard
                            key={task.id}
                            task={task}
                            index={index}
                            projectId={projectId}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
