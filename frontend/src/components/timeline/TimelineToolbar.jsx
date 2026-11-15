
import {
    CalendarRange,
    ListOrdered,
    Search,
    SlidersHorizontal,
} from "lucide-react";
import SearchFilterToolbar from "../common/SearchFilterToolbar";

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
    return (
        <section className="rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5">
            {/* HEADER */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <SlidersHorizontal
                        size={18}
                        className="text-[#716658]"
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
                                : "text-[#716658] hover:text-[#211E1A]"
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
                                : "text-[#716658] hover:text-[#211E1A]"
                            }
            `}
                    >
                        <CalendarRange size={16} />
                        Schedule
                    </button>
                </div>
            </div>

            {/* FILTERS */}
            <SearchFilterToolbar
                label="Timeline search and filters"
                search={<div className="relative">
                    <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#716658]" />
                    <input type="search" value={search} onChange={(e) => onSearchChange?.(e.target.value)} placeholder="Search task or worker..." aria-label="Search timeline tasks" className={`${selectClass} h-11 min-h-11 py-2 pl-10`} />
                </div>}
                activeCount={Number(Boolean(approval)) + Number(Boolean(workStatus)) + Number(Boolean(priority)) + Number(sort !== "order")}
                onClear={onClearFilters}
            >
                <div className="grid gap-3 sm:grid-cols-2">
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
            </SearchFilterToolbar>
        </section>
    );
}
