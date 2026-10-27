
import { useState } from "react";
import { Link } from "react-router-dom";
import {
    CalendarDays,
    ChevronDown,
    ClipboardList,
    Clock3,
    ExternalLink,
    FileText,
    GripVertical,
    Ruler,
    UserRound,
} from "lucide-react";

const approvalStyles = {
    PENDING: "bg-[#FFF2D8] text-[#94651D]",
    APPROVED: "bg-[#E7F2E8] text-[#296F40]",
    REJECTED: "bg-[#FCE9E6] text-[#B5473E]",
};

const workStyles = {
    NOT_STARTED: "bg-[#F1EADF] text-[#74614D]",
    IN_PROGRESS: "bg-[#E9F0FC] text-[#3565A5]",
    COMPLETED: "bg-[#E7F2E8] text-[#296F40]",
    DELAYED: "bg-[#FCE9E6] text-[#B5473E]",
    CANCELLED: "bg-[#EEE8E0] text-[#74695D]",
};

const priorityStyles = {
    LOW: "bg-[#E9F0FC] text-[#3565A5]",
    MEDIUM: "bg-[#F1EADF] text-[#74614D]",
    HIGH: "bg-[#FFF2D8] text-[#94651D]",
    URGENT: "bg-[#FCE9E6] text-[#B5473E]",
};

function readable(value) {
    if (value === null || value === undefined || value === "") {
        return "Not specified";
    }

    return String(value)
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
    if (!value) return "Not set";

    const datePart = String(value).slice(0, 10);
    const date = new Date(`${datePart}T00:00:00`);

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function localToday() {
    const now = new Date();

    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("-");
}

function Badge({ value, styles }) {
    if (!value) return null;

    return (
        <span
            className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${styles[value] || "bg-[#EEE8E0] text-[#74695D]"
                }`}
        >
            {readable(value)}
        </span>
    );
}

function Detail({ label, value }) {
    return (
        <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-[#716658]">
                {label}
            </p>

            <p className="mt-2 break-words text-sm font-semibold text-[#211E1A]">
                {value === null || value === undefined || value === ""
                    ? "Not specified"
                    : value}
            </p>
        </div>
    );
}

export default function TimelineTaskCard({
    task,
    index,
    projectId,
}) {
    const [expanded, setExpanded] = useState(false);

    const endDate = task.end_date
        ? String(task.end_date).slice(0, 10)
        : "";

    const overdue =
        /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
        endDate < localToday() &&
        !["COMPLETED", "CANCELLED"].includes(
            task.work_status
        );

    const taskLink =
        `/supervisor/projects/${projectId}/tasks` +
        `?task=${encodeURIComponent(task.id)}`;

    const quantity =
        task.planned_quantity !== null &&
            task.planned_quantity !== undefined
            ? `${task.planned_quantity} ${task.measurement_unit || ""
                }`.trim()
            : "Not applicable";

    return (
        <article
            className={`
        overflow-hidden rounded-[21px]
        border bg-[#FFFDFA]
        transition-all duration-300
        hover:shadow-[0_10px_24px_rgba(33,30,26,0.06)]
        ${expanded
                    ? "border-[#C9B9A6]"
                    : "border-[#E7DED2] hover:border-[#C9B9A6]"
                }
      `}
        >
            {/* MAIN TASK ROW */}
            <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`timeline-details-${task.id}`}
                onClick={() => setExpanded((value) => !value)}
                className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-[#FCF9F4] sm:gap-4 sm:p-5"
            >
                {/* FUTURE DRAG HANDLE PLACEHOLDER */}
                <span
                    className="mt-3 hidden shrink-0 text-[#B7A996] sm:block"
                    aria-hidden="true"
                >
                    <GripVertical size={19} />
                </span>

                {/* SEQUENCE NUMBER */}
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F1EADF] text-sm font-bold text-[#74614D]">
                    {String(index + 1).padStart(2, "0")}
                </span>

                {/* TASK INFORMATION */}
                <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-bold text-[#211E1A] sm:text-base">
                        {task.title || "Untitled Task"}
                    </span>

                    <span className="mt-2 flex flex-wrap gap-2">
                        <Badge
                            value={task.approval_status}
                            styles={approvalStyles}
                        />

                        <Badge
                            value={task.work_status}
                            styles={workStyles}
                        />

                        <Badge
                            value={task.priority}
                            styles={priorityStyles}
                        />

                        {overdue && (
                            <span className="inline-flex rounded-full bg-[#FCE9E6] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#B5473E]">
                                Overdue
                            </span>
                        )}
                    </span>

                    <span className="mt-3 grid gap-2 text-xs text-[#716658] md:grid-cols-2">
                        <span className="flex items-start gap-2">
                            <UserRound size={15} className="mt-0.5 shrink-0" />

                            <span className="break-words">
                                {task.worker_name || "No worker assigned"}
                            </span>
                        </span>

                        <span className="flex items-start gap-2">
                            <CalendarDays
                                size={15}
                                className="mt-0.5 shrink-0"
                            />

                            <span>
                                {formatDate(task.start_date)}
                                {" → "}
                                {formatDate(task.end_date)}
                            </span>
                        </span>
                    </span>

                    <span className="mt-3 block text-xs font-semibold text-[#74614D]">
                        {expanded ? "Hide details" : "View task details"}
                    </span>
                </span>

                <ChevronDown
                    size={20}
                    className={`mt-3 shrink-0 text-[#716658] transition-transform duration-200 ${expanded ? "rotate-180" : ""
                        }`}
                />
            </button>

            {/* EXPANDED DETAILS */}
            {expanded && (
                <div
                    id={`timeline-details-${task.id}`}
                    className="space-y-5 border-t border-[#EEE6DC] p-5 sm:p-6"
                >
                    <div className="grid gap-5 rounded-2xl bg-[#F8F4EE] p-5 sm:grid-cols-2 lg:grid-cols-3">
                        <Detail
                            label="Timeline Position"
                            value={String(index + 1).padStart(2, "0")}
                        />

                        <Detail
                            label="Start Date"
                            value={formatDate(task.start_date)}
                        />

                        <Detail
                            label="End Date"
                            value={formatDate(task.end_date)}
                        />

                        <Detail
                            label="Worker / Team"
                            value={task.worker_name}
                        />

                        <Detail
                            label="Measurement Method"
                            value={readable(task.measurement_method)}
                        />

                        <Detail
                            label="Planned Quantity"
                            value={quantity}
                        />
                    </div>

                    {/* DESCRIPTION & CRITERIA */}
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-[#EEE6DC] p-4">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-[#211E1A]">
                                <ClipboardList size={17} className="text-[#3565A5]" />
                                Task Description
                            </h4>

                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#716658]">
                                {task.description || "No description added."}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-[#EEE6DC] p-4">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-[#211E1A]">
                                <Ruler size={17} className="text-[#368250]" />
                                Completion Criteria
                            </h4>

                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#716658]">
                                {task.completion_criteria ||
                                    "No completion criteria specified."}
                            </p>
                        </div>
                    </div>

                    {/* OPEN TASK MANAGEMENT */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E4DCCD] bg-[#F8F4EE] p-4">
                        <div className="flex items-start gap-3">
                            <span className="rounded-xl bg-[#F0EAF8] p-3 text-[#7C5BA4]">
                                <FileText size={19} />
                            </span>

                            <div>
                                <p className="text-sm font-bold text-[#211E1A]">
                                    Task Documents & Management
                                </p>

                                <p className="mt-1 text-xs leading-5 text-[#716658]">
                                    Open the full task page to view documents,
                                    upload files, or request changes.
                                </p>
                            </div>
                        </div>

                        <Link
                            to={taskLink}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-4 py-3 text-xs font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#39332B]"
                        >
                            Open Task
                            <ExternalLink size={15} />
                        </Link>
                    </div>
                </div>
            )}
        </article>
    );
}
