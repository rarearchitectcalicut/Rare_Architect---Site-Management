
import {
    ClipboardList,
    CheckCircle2,
    Clock3,
    AlertTriangle,
} from "lucide-react";

const cards = [
    {
        key: "total",
        label: "Total Tasks",
        icon: ClipboardList,
        tone: "bg-pastel-sky text-info",
    },
    {
        key: "approved",
        label: "Approved Tasks",
        icon: CheckCircle2,
        tone: "bg-pastel-mint text-success",
    },
    {
        key: "inProgress",
        label: "In Progress",
        icon: Clock3,
        tone: "bg-pastel-butter text-warning",
    },
    {
        key: "overdue",
        label: "Overdue Tasks",
        icon: AlertTriangle,
        tone: "bg-pastel-blush text-danger",
    },
];

function isOverdue(task, today) {
    if (!task.end_date) return false;

    if (
        ["COMPLETED", "CANCELLED"].includes(task.work_status)
    ) {
        return false;
    }

    // Django DateField returns YYYY-MM-DD.
    // Compare date-only values to avoid timezone shifts.
    const endDate = String(task.end_date).slice(0, 10);

    return /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
        endDate < today;
}

function todayLocalDate() {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export default function TimelineSummary({ tasks = [] }) {
    const today = todayLocalDate();

    const stats = {
        total: tasks.length,

        approved: tasks.filter(
            (task) => task.approval_status === "APPROVED"
        ).length,

        inProgress: tasks.filter(
            (task) => task.work_status === "IN_PROGRESS"
        ).length,

        overdue: tasks.filter(
            (task) => isOverdue(task, today)
        ).length,
    };

    return (
        <section
            aria-label="Project timeline summary"
            className="rare-compact-stats grid grid-cols-2 gap-3 xl:grid-cols-4"
        >
            {cards.map((card) => {
                const Icon = card.icon;

                return (
                    <article
                        key={card.key}
                        className="
              group rounded-[22px]
              border border-border
              bg-surface p-4
              transition-all duration-300
              hover:-translate-y-0.5
              hover:border-border-strong
              hover:shadow-[0_10px_25px_rgba(33,30,26,0.06)]
              motion-reduce:transform-none
              sm:p-5
            "
                    >
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium leading-5 text-muted">
                                {card.label}
                            </p>

                            <span
                                className={`
                  flex h-8 w-8 shrink-0
                  items-center justify-center rounded-2xl
                  transition-transform duration-300
                  group-hover:rotate-[-6deg]
                  group-hover:scale-105
                  motion-reduce:transform-none
                  ${card.tone}
                `}
                            >
                                <Icon size={21} strokeWidth={1.8} />
                            </span>
                        </div>

                        <p className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                            {stats[card.key]}
                        </p>

                        <p className="mt-1 text-xs text-muted">
                            {card.key === "overdue"
                                ? "Past scheduled end date"
                                : card.key === "approved"
                                    ? "Approved by Admin"
                                    : card.key === "inProgress"
                                        ? "Work currently underway"
                                        : "Project timeline tasks"}
                        </p>
                    </article>
                );
            })}
        </section>
    );
}
