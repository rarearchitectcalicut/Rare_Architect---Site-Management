
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock3,
    ExternalLink,
    Info,
    RotateCcw,
} from "lucide-react";

// =====================================================
// CONFIGURATION
// =====================================================

const DAY_MS = 24 * 60 * 60 * 1000;

const VIEWS = {
    week: {
        days: 14,
        cellWidth: 48,
        step: 14,
        label: "2 Weeks",
    },
    month: {
        days: 35,
        cellWidth: 34,
        step: 35,
        label: "5 Weeks",
    },
};

const STATUS_STYLES = {
    COMPLETED: {
        bar: "#4D8F64",
        label: "Completed",
    },
    IN_PROGRESS: {
        bar: "#5185B5",
        label: "In Progress",
    },
    CANCELLED: {
        bar: "#A59A8C",
        label: "Cancelled",
    },
    DELAYED: {
        bar: "#C66A57",
        label: "Delayed",
    },
    NOT_STARTED: {
        bar: "#B99A68",
        label: "Not Started",
    },
};

function parseDay(value) {
    if (!value) return null;

    const match = String(value)
        .slice(0, 10)
        .match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);

    // Reject impossible dates instead of silently
    // rolling them into another month.
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return timestamp;
}

function todayTimestamp() {
    const now = new Date();

    return Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );
}

function addDays(timestamp, days) {
    return timestamp + days * DAY_MS;
}

function dayDifference(start, end) {
    return Math.round((end - start) / DAY_MS);
}

function shortDate(timestamp) {
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
    }).format(new Date(timestamp));
}

function longDate(timestamp) {
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(timestamp));
}

function monthLabel(timestamp) {
    return new Intl.DateTimeFormat("en-IN", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(timestamp));
}

function weekdayLabel(timestamp) {
    return new Intl.DateTimeFormat("en-IN", {
        weekday: "short",
        timeZone: "UTC",
    }).format(new Date(timestamp));
}

function getTaskStatus(task) {
    if (task.work_status === "COMPLETED") {
        return STATUS_STYLES.COMPLETED;
    }

    if (task.work_status === "CANCELLED") {
        return STATUS_STYLES.CANCELLED;
    }

    const end = parseDay(task.end_date);

    if (
        end !== null &&
        end < todayTimestamp()
    ) {
        return {
            bar: "#C66A57",
            label: "Overdue",
        };
    }

    return (
        STATUS_STYLES[task.work_status] ||
        STATUS_STYLES.NOT_STARTED
    );
}

function getTaskDates(task) {
    const start = parseDay(task.start_date);
    const end = parseDay(task.end_date);

    if (
        start === null ||
        end === null ||
        end < start
    ) {
        return null;
    }

    return { start, end };
}

function getInitialAnchor(tasks) {
    const starts = tasks
        .map((task) => getTaskDates(task)?.start)
        .filter((value) => value !== undefined)
        .sort((a, b) => a - b);

    // Begin at the first planned task date.
    // If no tasks have complete dates, show today.
    return starts[0] ?? todayTimestamp();
}

// =====================================================
// DATE GROUPING
// =====================================================

function buildMonthGroups(days, cellWidth) {
    if (!days.length) return [];

    const groups = [];

    for (const timestamp of days) {
        const label = monthLabel(timestamp);
        const last = groups[groups.length - 1];

        if (last?.label === label) {
            last.count += 1;
        } else {
            groups.push({
                label,
                count: 1,
            });
        }
    }

    return groups.map((group) => ({
        ...group,
        width: group.count * cellWidth,
    }));
}

// =====================================================
// TASK ROW
// =====================================================

function ScheduleTaskRow({
    task,
    projectId,
    getTaskHref,
    windowStart,
    windowEnd,
    numberOfDays,
    cellWidth,
}) {
    const dates = getTaskDates(task);
    const status = getTaskStatus(task);

    const gridWidth = numberOfDays * cellWidth;

    let barPosition = null;

    if (dates) {
        const visibleStart = Math.max(
            dates.start,
            windowStart
        );

        const visibleEnd = Math.min(
            dates.end,
            windowEnd
        );

        if (visibleStart <= visibleEnd) {
            const left =
                dayDifference(windowStart, visibleStart) *
                cellWidth;

            const duration =
                dayDifference(visibleStart, visibleEnd) + 1;

            barPosition = {
                left,
                width: duration * cellWidth,
                clippedStart: dates.start < windowStart,
                clippedEnd: dates.end > windowEnd,
            };
        }
    }

    const href = getTaskHref
        ? getTaskHref(task)
        : `/supervisor/projects/${projectId}/tasks?task=${encodeURIComponent(task.id)}`;

    return (
        <div className="flex min-h-[78px] border-b border-[#EEE6DC] last:border-b-0">
            {/* STICKY TASK LABEL */}
            <div
                className="
          sticky left-0 z-10
          flex w-[224px] min-w-[224px]
          flex-col justify-center
          gap-1 border-r border-[#EEE6DC]
          bg-[#FFFDFA] px-4 py-3
        "
            >
                <Link
                    to={href}
                    title="Open task details and documents"
                    className="group flex items-start gap-1.5"
                >
                    <span className="line-clamp-2 min-w-0 text-xs font-bold leading-5 text-[#211E1A] group-hover:underline">
                        {task.title || "Untitled Task"}
                    </span>

                    <ExternalLink
                        size={12}
                        className="mt-1 shrink-0 text-[#948778]"
                    />
                </Link>

                <span className="text-[10px] text-[#817669]">
                    {dates
                        ? `${shortDate(dates.start)} – ${shortDate(dates.end)}`
                        : "Dates not fully scheduled"}
                </span>

                <span
                    className="text-[10px] font-semibold"
                    style={{ color: status.bar }}
                >
                    {status.label}
                </span>
            </div>

            {/* DATE GRID */}
            <div
                className="relative shrink-0"
                style={{
                    width: gridWidth,
                    minHeight: 78,
                    backgroundImage: `
            repeating-linear-gradient(
              to right,
              transparent 0,
              transparent ${cellWidth - 1}px,
              #EEE6DC ${cellWidth - 1}px,
              #EEE6DC ${cellWidth}px
            )
          `,
                }}
            >
                {/* TASK DATE BAR */}
                {barPosition && (
                    <div
                        title={`${task.title}: ${longDate(dates.start)} to ${longDate(dates.end)} (${status.label})`}
                        className="
              absolute top-1/2
              flex h-[28px] items-center
              overflow-hidden px-2
              text-[10px] font-bold
              text-white shadow-sm
              -translate-y-1/2
            "
                        style={{
                            left: barPosition.left + 2,
                            width: Math.max(
                                4,
                                barPosition.width - 4
                            ),
                            backgroundColor: status.bar,
                            borderRadius: `${barPosition.clippedStart ? "3px" : "8px"
                                } ${barPosition.clippedEnd ? "3px" : "8px"
                                } ${barPosition.clippedEnd ? "3px" : "8px"
                                } ${barPosition.clippedStart ? "3px" : "8px"
                                }`,
                        }}
                    >
                        {barPosition.width >= 110
                            ? status.label
                            : ""}
                    </div>
                )}

                {/* UNSCHEDULED TASK HINT */}
                {!dates && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg bg-[#F1EADF] px-3 py-2 text-[10px] text-[#817669]">
                        No scheduled date range
                    </span>
                )}
            </div>
        </div>
    );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function TimelineSchedule({
    tasks = [],
    projectId,
    getTaskHref,
}) {
    const [scale, setScale] = useState("month");
    const [offset, setOffset] = useState(0);

    const config = VIEWS[scale];

    const initialAnchor = useMemo(
        () => getInitialAnchor(tasks),
        [tasks]
    );

    const windowStart = addDays(
        initialAnchor,
        offset
    );

    const windowEnd = addDays(
        windowStart,
        config.days - 1
    );

    const days = useMemo(
        () =>
            Array.from(
                { length: config.days },
                (_, index) => addDays(windowStart, index)
            ),
        [windowStart, config.days]
    );

    const monthGroups = useMemo(
        () => buildMonthGroups(days, config.cellWidth),
        [days, config.cellWidth]
    );

    const totalWidth = config.days * config.cellWidth;
    const today = todayTimestamp();

    const todayVisible =
        today >= windowStart && today <= windowEnd;

    const todayLeft =
        dayDifference(windowStart, today) *
        config.cellWidth +
        config.cellWidth / 2;

    const datedTasks = tasks.filter(
        (task) => getTaskDates(task) !== null
    ).length;

    function navigateDates(direction) {
        setOffset(
            (value) => value + direction * config.step
        );
    }

    function resetSchedule() {
        setOffset(0);
    }

    return (
        <section className="overflow-hidden rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA]">
            {/* HEADER */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EEE6DC] p-5 sm:p-6">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-[#211E1A]">
                        <CalendarDays
                            size={20}
                            className="text-[#817669]"
                        />
                        Schedule View
                    </h2>

                    <p className="mt-2 text-xs leading-6 text-[#817669]">
                        Visual overview of planned task dates and
                        overlapping work.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="inline-flex rounded-xl bg-[#F1EADF] p-1">
                        {Object.entries(VIEWS).map(
                            ([key, viewConfig]) => (
                                <button
                                    key={key}
                                    type="button"
                                    aria-pressed={scale === key}
                                    onClick={() => {
                                        setScale(key);
                                        setOffset(0);
                                    }}
                                    className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${scale === key
                                            ? "bg-[#211E1A] text-white"
                                            : "text-[#74614D] hover:bg-[#E8DCCB]"
                                        }`}
                                >
                                    {viewConfig.label}
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* DATE NAVIGATION */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEE6DC] bg-[#F8F4EE] p-4">
                <div>
                    <p className="text-sm font-bold text-[#211E1A]">
                        {longDate(windowStart)}
                        {" — "}
                        {longDate(windowEnd)}
                    </p>

                    <p className="mt-1 text-xs text-[#817669]">
                        {datedTasks} of {tasks.length} tasks have valid
                        schedule ranges
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => navigateDates(-1)}
                        aria-label="Previous date range"
                        className="rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] p-2.5 text-[#665E53] hover:bg-[#F1EADF]"
                    >
                        <ChevronLeft size={18} />
                    </button>

                    <button
                        type="button"
                        onClick={resetSchedule}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-3 py-2.5 text-xs font-bold text-[#665E53] hover:bg-[#F1EADF]"
                    >
                        <RotateCcw size={15} />
                        First Task
                    </button>

                    <button
                        type="button"
                        onClick={() => navigateDates(1)}
                        aria-label="Next date range"
                        className="rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] p-2.5 text-[#665E53] hover:bg-[#F1EADF]"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* EMPTY STATE */}
            {tasks.length === 0 ? (
                <div className="px-6 py-14 text-center">
                    <CalendarDays
                        size={32}
                        className="mx-auto text-[#948778]"
                    />

                    <h3 className="mt-4 font-bold text-[#211E1A]">
                        No tasks to display
                    </h3>

                    <p className="mt-2 text-sm text-[#817669]">
                        Tasks will appear here when added to the project.
                    </p>
                </div>
            ) : (
                <>
                    {/* SHARED HORIZONTAL SCROLL:
              Header and rows move together. */}
                    <div
                        className="overflow-x-auto"
                        role="region"
                        aria-label="Scrollable project task schedule"
                        tabIndex={0}
                    >
                        <div
                            style={{
                                width: 224 + totalWidth,
                                minWidth: "100%",
                            }}
                        >
                            {/* MONTH HEADERS */}
                            <div className="flex border-b border-[#EEE6DC] bg-[#F8F4EE]">
                                <div className="sticky left-0 z-20 flex w-[224px] min-w-[224px] items-center border-r border-[#EEE6DC] bg-[#F8F4EE] px-4 py-3">
                                    <span className="text-xs font-bold text-[#665E53]">
                                        Project Tasks
                                    </span>
                                </div>

                                <div
                                    className="flex shrink-0"
                                    style={{ width: totalWidth }}
                                >
                                    {monthGroups.map((group, index) => (
                                        <div
                                            key={`${group.label}-${index}`}
                                            style={{ width: group.width }}
                                            className="shrink-0 border-r border-[#E4DCCD] px-2 py-3 text-center text-xs font-bold text-[#665E53]"
                                        >
                                            {group.label}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* DAY HEADERS */}
                            <div className="flex border-b border-[#EEE6DC] bg-[#FCF9F5]">
                                <div className="sticky left-0 z-20 flex w-[224px] min-w-[224px] items-center border-r border-[#EEE6DC] bg-[#FCF9F5] px-4 py-3">
                                    <span className="text-[11px] text-[#948778]">
                                        Planned start / end
                                    </span>
                                </div>

                                <div
                                    className="flex shrink-0"
                                    style={{ width: totalWidth }}
                                >
                                    {days.map((timestamp) => {
                                        const current = timestamp === today;

                                        return (
                                            <div
                                                key={timestamp}
                                                style={{
                                                    width: config.cellWidth,
                                                }}
                                                className={`flex shrink-0 flex-col items-center justify-center gap-1 border-r border-[#EEE6DC] py-2 ${current
                                                        ? "bg-[#E9F0FC]"
                                                        : ""
                                                    }`}
                                            >
                                                <span
                                                    className={`text-[10px] ${current
                                                            ? "font-bold text-[#3565A5]"
                                                            : "text-[#948778]"
                                                        }`}
                                                >
                                                    {weekdayLabel(timestamp)}
                                                </span>

                                                <span
                                                    className={`text-xs font-bold ${current
                                                            ? "text-[#3565A5]"
                                                            : "text-[#665E53]"
                                                        }`}
                                                >
                                                    {new Date(timestamp).getUTCDate()}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* TASK ROWS + TODAY MARKER */}
                            <div className="relative">
                                {tasks.map((task) => (
                                    <ScheduleTaskRow
                                        key={task.id}
                                        task={task}
                                        projectId={projectId}
                                        getTaskHref={getTaskHref}
                                        windowStart={windowStart}
                                        windowEnd={windowEnd}
                                        numberOfDays={config.days}
                                        cellWidth={config.cellWidth}
                                    />
                                ))}

                                {todayVisible && (
                                    <div
                                        aria-hidden="true"
                                        className="pointer-events-none absolute bottom-0 top-0 z-[5] w-px bg-[#3565A5]/70"
                                        style={{
                                            left: 224 + todayLeft,
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* LEGEND */}
                    <div className="flex flex-wrap gap-x-5 gap-y-3 border-t border-[#EEE6DC] p-4 sm:px-6">
                        {Object.values(STATUS_STYLES).map(
                            (status) => (
                                <span
                                    key={status.label}
                                    className="inline-flex items-center gap-2 text-[11px] text-[#817669]"
                                >
                                    <span
                                        className="h-2.5 w-2.5 rounded-full"
                                        style={{
                                            backgroundColor: status.bar,
                                        }}
                                    />
                                    {status.label}
                                </span>
                            )
                        )}

                        <span className="inline-flex items-center gap-2 text-[11px] text-[#817669]">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#C66A57]" />
                            Overdue
                        </span>
                    </div>
                </>
            )}

            {/* FOOTNOTE */}
            <div className="flex items-start gap-2 border-t border-[#EEE6DC] bg-[#F8F4EE] px-5 py-4">
                <Info
                    size={16}
                    className="mt-0.5 shrink-0 text-[#817669]"
                />

                <p className="text-xs leading-5 text-[#817669]">
                    Bars represent planned task durations. They are
                    not editable here. Task progress and approval
                    remain controlled by the RARE workflow.
                </p>
            </div>
        </section>
    );
}
