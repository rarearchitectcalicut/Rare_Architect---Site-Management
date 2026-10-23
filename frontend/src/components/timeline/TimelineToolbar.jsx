
import {
    CalendarRange,
    ListOrdered,
    Search,
    SlidersHorizontal,
    X,
} from "lucide-react";

const selectClass = `
  h-11 w-full rounded-xl
  border border-[#E4DCCD]
  bg-[#FFFDFA] px-3
  text-sm text-[#211E1A]
  outline-none
  transition-all duration-200
  focus:border-[#B7A58E]
  focus:ring-4 focus:ring-[#E8DDD0]/50
`;

export default function TimelineToolbar({
    search = "",
    onSearchChange,

    approval = "",
    onApprovalChange,

    workStatus = "",
    onWorkStatusChange,

    priority = "",
    onPriorityChange,

    sort = "order",
    onSortChange,

    view = "sequence",
    onViewChange,

    onClearFilters,
}) {
    const hasFilters = Boolean(
        search ||
        approval ||
        workStatus ||
        priority ||
        sort !== "order"
    );

    return (
        <section className="rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5">
            {/* HEADER */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <SlidersHorizontal
                        size={18}
                        className="text-[#817669]"
                    />

                    <h2 className="text-sm font-bold text-[#211E1A]">
                        Timeline Controls
                    </h2>
                </div>

                {/* VIEW SWITCH */}
                <div className="inline-flex rounded-xl bg-[#F1EADF] p-1">
                    <button
                        type="button"
                        onClick={() => onViewChange?.("sequence")}
                        aria-pressed={view === "sequence"}
                        className={`
              inline-flex items-center gap-2
              rounded-lg px-3 py-2
              text-xs font-semibold
              transition-all duration-200
              ${view === "sequence"
                                ? "bg-[#211E1A] text-white shadow-sm"
                                : "text-[#817669] hover:text-[#211E1A]"
                            }
            `}
                    >
                        <ListOrdered size={16} />
                        Sequence
                    </button>

                    <button
                        type="button"
                        onClick={() => onViewChange?.("schedule")}
                        aria-pressed={view === "schedule"}
                        className={`
              inline-flex items-center gap-2
              rounded-lg px-3 py-2
              text-xs font-semibold
              transition-all duration-200
              ${view === "schedule"
                                ? "bg-[#211E1A] text-white shadow-sm"
                                : "text-[#817669] hover:text-[#211E1A]"
                            }
            `}
                    >
                        <CalendarRange size={16} />
                        Schedule
                    </button>
                </div>
            </div>

            {/* FILTERS */}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_160px_170px_145px_160px]">
                {/* SEARCH */}
                <div className="relative">
                    <Search
                        size={17}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#948778]"
                    />

                    <input
                        type="search"
                        value={search}
                        onChange={(e) =>
                            onSearchChange?.(e.target.value)
                        }
                        placeholder="Search task or worker..."
                        aria-label="Search timeline tasks"
                        className={`${selectClass} pl-10`}
                    />
                </div>

                {/* APPROVAL STATUS */}
                <select
                    value={approval}
                    onChange={(e) =>
                        onApprovalChange?.(e.target.value)
                    }
                    aria-label="Filter by approval status"
                    className={selectClass}
                >
                    <option value="">All Approvals</option>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                </select>

                {/* WORK STATUS */}
                <select
                    value={workStatus}
                    onChange={(e) =>
                        onWorkStatusChange?.(e.target.value)
                    }
                    aria-label="Filter by work status"
                    className={selectClass}
                >
                    <option value="">All Work Statuses</option>
                    <option value="NOT_STARTED">Not Started</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="DELAYED">Delayed</option>
                    <option value="CANCELLED">Cancelled</option>
                </select>

                {/* PRIORITY */}
                <select
                    value={priority}
                    onChange={(e) =>
                        onPriorityChange?.(e.target.value)
                    }
                    aria-label="Filter by priority"
                    className={selectClass}
                >
                    <option value="">All Priorities</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                </select>

                {/* SORTING */}
                <select
                    value={sort}
                    onChange={(e) =>
                        onSortChange?.(e.target.value)
                    }
                    aria-label="Sort timeline tasks"
                    className={selectClass}
                >
                    <option value="order">Timeline Order</option>
                    <option value="start-date">Start Date</option>
                    <option value="end-date">End Date</option>
                    <option value="priority">Highest Priority</option>
                    <option value="title">Task Name A–Z</option>
                </select>
            </div>

            {/* CLEAR */}
            {hasFilters && (
                <div className="mt-4 flex justify-end">
                    <button
                        type="button"
                        onClick={onClearFilters}
                        className="inline-flex items-center gap-2 text-xs font-semibold text-[#817669] transition-colors hover:text-[#211E1A]"
                    >
                        <X size={15} />
                        Clear Filters
                    </button>
                </div>
            )}
        </section>
    );
}
