
import { useMemo, useState } from "react";
import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    ChevronDown,
    ClipboardList,
    Clock3,
    History,
    MessageSquareText,
    XCircle,
} from "lucide-react";

const STATUS_CONFIG = {
    PENDING: {
        icon: Clock3,
        label: "Pending Review",
        style: "bg-[#FFF2D8] text-[#94651D]",
    },
    APPROVED: {
        icon: CheckCircle2,
        label: "Approved",
        style: "bg-[#E7F2E8] text-[#296F40]",
    },
    REJECTED: {
        icon: XCircle,
        label: "Rejected",
        style: "bg-[#FCE9E6] text-[#B5473E]",
    },
};

function readable(value) {
    return String(value ?? "Not specified")
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function displayValue(value) {
    if (value === null || value === undefined) {
        return "Not specified";
    }

    if (typeof value === "boolean") {
        return value ? "Yes" : "No";
    }

    if (Array.isArray(value)) {
        return value
            .map((item) =>
                typeof item === "object"
                    ? JSON.stringify(item)
                    : String(item)
            )
            .join(", ");
    }

    if (typeof value === "object") {
        return JSON.stringify(value, null, 2);
    }

    return String(value);
}

function getSnapshot(request, key) {
    const value = request?.[key];

    if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    ) {
        return value;
    }

    return {};
}

function RequestCard({ request }) {
    const [expanded, setExpanded] = useState(false);

    const status = String(
        request.status || "PENDING"
    ).toUpperCase();

    const configuration =
        STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;

    const Icon = configuration.icon;

    const oldValues = getSnapshot(request, "old_values");
    const newValues = getSnapshot(request, "new_values");

    const snapshotKeys = [
        ...new Set([
            ...Object.keys(oldValues),
            ...Object.keys(newValues),
        ]),
    ];

    const changes = snapshotKeys.filter(
        (key) =>
            JSON.stringify(oldValues[key] ?? null) !==
            JSON.stringify(newValues[key] ?? null)
    );

    const taskTitle =
        request.task_title ||
        (
            typeof request.task === "object"
                ? request.task?.title
                : ""
        ) ||
        "Timeline Order Change";

    return (
        <article className="overflow-hidden rounded-[20px] border border-[#E7DED2] bg-[#FFFDFA] transition-all hover:border-[#CBBBA9]">
            <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`timeline-request-${request.id}`}
                onClick={() =>
                    setExpanded((previous) => !previous)
                }
                className="flex w-full items-start gap-3 p-4 text-left hover:bg-[#FCF9F5] sm:p-5"
            >
                <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${configuration.style}`}
                >
                    <Icon size={20} />
                </span>

                <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-bold text-[#211E1A]">
                        {taskTitle}
                    </span>

                    <span className="mt-1 block text-xs text-[#716658]">
                        Requested {formatDate(request.created_at)}
                    </span>

                    <span className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                            className={`rounded-full px-3 py-1.5 text-xs font-bold ${configuration.style}`}
                        >
                            {configuration.label}
                        </span>

                        <span className="rounded-full bg-[#F1EADF] px-3 py-1.5 text-xs font-bold text-[#74614D]">
                            Order Change
                        </span>
                    </span>

                    {request.reason && (
                        <span className="mt-3 line-clamp-2 block text-xs leading-5 text-[#716658]">
                            {request.reason}
                        </span>
                    )}
                </span>

                <ChevronDown
                    size={19}
                    className={`mt-2 shrink-0 text-[#716658] transition-transform duration-200 ${expanded ? "rotate-180" : ""
                        }`}
                />
            </button>

            {expanded && (
                <div
                    id={`timeline-request-${request.id}`}
                    className="space-y-5 border-t border-[#EEE6DC] p-4 sm:p-5"
                >
                    {/* REQUEST DETAILS */}
                    <div className="grid gap-4 rounded-2xl bg-[#F8F4EE] p-4 sm:grid-cols-2">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-[#716658]">
                                Request Type
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#211E1A]">
                                {readable(request.change_type || "ORDER_CHANGE")}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-[#716658]">
                                Status
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#211E1A]">
                                {configuration.label}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-[#716658]">
                                Requested On
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#211E1A]">
                                {formatDate(request.created_at)}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-[#716658]">
                                Reviewed On
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#211E1A]">
                                {formatDate(request.reviewed_at)}
                            </p>
                        </div>
                    </div>

                    {/* REQUEST REASON */}
                    <div>
                        <h4 className="flex items-center gap-2 text-sm font-bold text-[#211E1A]">
                            <MessageSquareText
                                size={17}
                                className="text-[#716658]"
                            />
                            Reason for Reordering
                        </h4>

                        <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-[#F8F4EE] p-4 text-sm leading-6 text-[#665E53]">
                            {request.reason ||
                                "No reason was included in this response."}
                        </p>
                    </div>

                    {/* BEFORE / AFTER SNAPSHOT */}
                    <div>
                        <h4 className="text-sm font-bold text-[#211E1A]">
                            Proposed Changes
                        </h4>

                        {changes.length > 0 ? (
                            <div className="mt-3 space-y-3">
                                {changes.map((field) => (
                                    <div
                                        key={field}
                                        className="rounded-2xl border border-[#E7DED2] p-4"
                                    >
                                        <p className="mb-3 text-xs font-bold text-[#665E53]">
                                            {readable(field)}
                                        </p>

                                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                                            <div className="min-w-0 rounded-xl bg-[#FCE9E6] p-3">
                                                <p className="text-xs font-bold uppercase text-[#B5473E]">
                                                    Original
                                                </p>

                                                <p className="mt-2 whitespace-pre-wrap break-all text-xs text-[#665E53]">
                                                    {displayValue(oldValues[field])}
                                                </p>
                                            </div>

                                            <ArrowRight
                                                size={17}
                                                className="mx-auto rotate-90 text-[#716658] sm:rotate-0"
                                            />

                                            <div className="min-w-0 rounded-xl bg-[#E7F2E8] p-3">
                                                <p className="text-xs font-bold uppercase text-[#296F40]">
                                                    Proposed
                                                </p>

                                                <p className="mt-2 whitespace-pre-wrap break-all text-xs text-[#665E53]">
                                                    {displayValue(newValues[field])}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#F8F4EE] p-4">
                                <AlertCircle
                                    size={17}
                                    className="mt-0.5 shrink-0 text-[#716658]"
                                />

                                <p className="text-xs leading-5 text-[#716658]">
                                    The API response does not contain a
                                    comparable before/after snapshot.
                                    The request status and reason are
                                    still available.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ADMIN COMMENT */}
                    {request.admin_comment && (
                        <div className="rounded-2xl border border-[#E4DCCD] bg-[#F1EADF] p-4">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-[#211E1A]">
                                <MessageSquareText size={18} />
                                Admin Feedback
                            </h4>

                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#665E53]">
                                {request.admin_comment}
                            </p>
                        </div>
                    )}

                    {/* STATUS DESCRIPTION */}
                    <div
                        className={`flex items-start gap-3 rounded-xl p-4 ${configuration.style}`}
                    >
                        <Icon size={18} className="mt-0.5 shrink-0" />

                        <p className="text-xs leading-6">
                            {status === "PENDING"
                                ? "The proposed sequence is waiting for Admin review. Approved ordering has not changed."
                                : status === "APPROVED"
                                    ? "Admin approved this order-change request. The backend applies approved changes to the official timeline."
                                    : "Admin rejected this order-change request. The previous approved ordering remains unchanged."}
                        </p>
                    </div>
                </div>
            )}
        </article>
    );
}

// =====================================================
// MAIN HISTORY COMPONENT
// =====================================================

export default function TimelineRequestHistory({
    requests = [],
    loading = false,
    error = "",
    onRefresh,
}) {
    const [status, setStatus] = useState("ALL");
    const [sort, setSort] = useState("NEWEST");

    // Only order-change requests belong here.
    // Also accept entries with no change_type when
    // the dedicated endpoint already scopes them.
    const orderRequests = useMemo(
        () =>
            requests.filter(
                (request) =>
                    !request.change_type ||
                    request.change_type === "ORDER_CHANGE"
            ),
        [requests]
    );

    const filteredRequests = useMemo(() => {
        const result = orderRequests.filter(
            (request) =>
                status === "ALL" ||
                request.status === status
        );

        result.sort((a, b) => {
            const first = String(a.created_at || "");
            const second = String(b.created_at || "");

            return sort === "OLDEST"
                ? first.localeCompare(second)
                : second.localeCompare(first);
        });

        return result;
    }, [orderRequests, status, sort]);

    const pendingCount = orderRequests.filter(
        (request) => request.status === "PENDING"
    ).length;

    return (
        <section className="space-y-4">
            {/* HEADER */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-[#211E1A]">
                        <History size={20} className="text-[#716658]" />
                        Timeline Change Requests
                    </h2>

                    <p className="mt-2 text-xs leading-5 text-[#716658]">
                        Review submitted order changes and Admin decisions.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {pendingCount > 0 && (
                        <span className="rounded-full bg-[#FFF2D8] px-3 py-2 text-xs font-bold text-[#94651D]">
                            {pendingCount} Pending
                        </span>
                    )}

                    {onRefresh && (
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={loading}
                            className="rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-4 py-2.5 text-xs font-semibold text-[#665E53] transition-colors hover:bg-[#F1EADF] disabled:opacity-50"
                        >
                            Refresh
                        </button>
                    )}
                </div>
            </div>

            {/* FILTERS */}
            <div className="flex flex-wrap gap-3 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4">
                <label className="min-w-[140px] flex-1">
                    <span className="mb-2 block text-xs font-bold text-[#716658]">
                        Status
                    </span>

                    <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-3 py-2.5 text-sm text-[#211E1A] outline-none focus:border-[#B7A58E]"
                    >
                        <option value="ALL">All Requests</option>
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                    </select>
                </label>

                <label className="min-w-[140px] flex-1">
                    <span className="mb-2 block text-xs font-bold text-[#716658]">
                        Sort By
                    </span>

                    <select
                        value={sort}
                        onChange={(event) => setSort(event.target.value)}
                        className="w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-3 py-2.5 text-sm text-[#211E1A] outline-none focus:border-[#B7A58E]"
                    >
                        <option value="NEWEST">Newest First</option>
                        <option value="OLDEST">Oldest First</option>
                    </select>
                </label>
            </div>

            {/* ERROR */}
            {error && (
                <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    {error}
                </div>
            )}

            {/* LOADING */}
            {loading && (
                <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-6 text-sm text-[#716658]">
                    Loading timeline change requests...
                </div>
            )}

            {/* REQUEST LIST */}
            {!loading && !error && (
                <>
                    {filteredRequests.length > 0 ? (
                        <div className="space-y-3">
                            {filteredRequests.map((request) => (
                                <RequestCard
                                    key={request.id}
                                    request={request}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] px-6 py-12 text-center">
                            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#716658]">
                                <ClipboardList size={26} />
                            </span>

                            <h3 className="mt-4 text-base font-bold text-[#211E1A]">
                                No timeline requests found
                            </h3>

                            <p className="mt-2 text-sm text-[#716658]">
                                {status === "ALL"
                                    ? "Submitted timeline order changes will appear here."
                                    : `No ${status.toLowerCase()} order-change requests found.`}
                            </p>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
