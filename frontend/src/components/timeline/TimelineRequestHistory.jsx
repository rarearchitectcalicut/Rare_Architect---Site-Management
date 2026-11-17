import { isRecordIdField, recordDisplayText } from "../../utils/recordPresentation";

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
        style: "bg-pastel-butter text-warning",
    },
    APPROVED: {
        icon: CheckCircle2,
        label: "Approved",
        style: "bg-pastel-mint text-success",
    },
    REJECTED: {
        icon: XCircle,
        label: "Rejected",
        style: "bg-pastel-blush text-danger",
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

const displayValue = recordDisplayText;

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

function TimelineSnapshot({ value, tasks }) {
    let entries = value;
    if (typeof entries === "string") { try { entries = JSON.parse(entries); } catch { return <p className="mt-2 text-xs text-muted">Timeline snapshot unavailable.</p>; } }
    if (!Array.isArray(entries)) return <p className="mt-2 text-xs text-muted">Timeline snapshot unavailable.</p>;
    const ordered = [...entries].sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0));
    return <ol className="mt-3 space-y-2">{ordered.map((entry, index) => {
        const id = entry.task_id ?? entry.task?.id ?? entry.task ?? entry.id;
        const task = tasks.find((item) => String(item.id) === String(id));
        const title = entry.task_title || entry.title || entry.task?.title || task?.title || "Task no longer available";
        return <li key={String(id) + ':' + index} className="flex items-start gap-2 rounded-lg bg-white/60 p-2 text-xs text-muted"><span className="shrink-0 font-bold">{index + 1}.</span><span className="min-w-0 break-words">{title}</span></li>;
    })}{!ordered.length && <li className="text-xs text-muted">No tasks recorded.</li>}</ol>;
}

function RequestCard({ request, tasks }) {
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
        (key) => !isRecordIdField(key) &&
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
        <article className="overflow-hidden rounded-[20px] border border-border bg-surface transition-all hover:border-border-strong">
            <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`timeline-request-${request.id}`}
                onClick={() =>
                    setExpanded((previous) => !previous)
                }
                className="flex w-full items-start gap-3 p-4 text-left hover:bg-surface-soft sm:p-5"
            >
                <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${configuration.style}`}
                >
                    <Icon size={20} />
                </span>

                <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-bold text-ink">
                        {taskTitle}
                    </span>

                    <span className="mt-1 block text-xs text-muted">
                        Requested {formatDate(request.created_at)}
                    </span>

                    <span className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                            className={`rounded-full px-3 py-1.5 text-xs font-bold ${configuration.style}`}
                        >
                            {configuration.label}
                        </span>

                        <span className="rounded-full bg-app px-3 py-1.5 text-xs font-bold text-muted">
                            Order Change
                        </span>
                    </span>

                    {request.reason && (
                        <span className="mt-3 line-clamp-2 block text-xs leading-5 text-muted">
                            {request.reason}
                        </span>
                    )}
                </span>

                <ChevronDown
                    size={19}
                    className={`mt-2 shrink-0 text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""
                        }`}
                />
            </button>

            {expanded && (
                <div
                    id={`timeline-request-${request.id}`}
                    className="space-y-5 border-t border-border p-4 sm:p-5"
                >
                    {/* REQUEST DETAILS */}
                    <div className="grid gap-4 rounded-2xl bg-surface-soft p-4 sm:grid-cols-2">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-muted">
                                Request Type
                            </p>
                            <p className="mt-2 text-sm font-semibold text-ink">
                                {readable(request.change_type || "ORDER_CHANGE")}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-muted">
                                Status
                            </p>
                            <p className="mt-2 text-sm font-semibold text-ink">
                                {configuration.label}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-muted">
                                Requested On
                            </p>
                            <p className="mt-2 text-sm font-semibold text-ink">
                                {formatDate(request.created_at)}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-muted">
                                Reviewed On
                            </p>
                            <p className="mt-2 text-sm font-semibold text-ink">
                                {formatDate(request.reviewed_at)}
                            </p>
                        </div>
                    </div>

                    {/* REQUEST REASON */}
                    <div>
                        <h4 className="flex items-center gap-2 text-sm font-bold text-ink">
                            <MessageSquareText
                                size={17}
                                className="text-muted"
                            />
                            Reason for Reordering
                        </h4>

                        <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-surface-soft p-4 text-sm leading-6 text-muted">
                            {request.reason ||
                                "No reason was included in this response."}
                        </p>
                    </div>

                    {/* BEFORE / AFTER SNAPSHOT */}
                    <div>
                        <h4 className="text-sm font-bold text-ink">
                            Proposed Changes
                        </h4>

                        {changes.length > 0 ? (
                            <div className="mt-3 space-y-3">
                                {changes.map((field) => (
                                    <div
                                        key={field}
                                        className="rounded-2xl border border-border p-4"
                                    >
                                        <p className="mb-3 text-xs font-bold text-muted">
                                            {readable(field)}
                                        </p>

                                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                                            <div className="min-w-0 rounded-xl bg-pastel-blush p-3">
                                                <p className="text-xs font-bold uppercase text-danger">
                                                    Original
                                                </p>

                                                {field === "timeline" ? <TimelineSnapshot value={oldValues[field]} tasks={tasks || []} /> : <p className="mt-2 whitespace-pre-wrap break-all text-xs text-muted">{displayValue(oldValues[field])}</p>}
                                            </div>

                                            <ArrowRight
                                                size={17}
                                                className="mx-auto rotate-90 text-muted sm:rotate-0"
                                            />

                                            <div className="min-w-0 rounded-xl bg-pastel-mint p-3">
                                                <p className="text-xs font-bold uppercase text-success">
                                                    Proposed
                                                </p>

                                                {field === "timeline" ? <TimelineSnapshot value={newValues[field]} tasks={tasks || []} /> : <p className="mt-2 whitespace-pre-wrap break-all text-xs text-muted">{displayValue(newValues[field])}</p>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface-soft p-4">
                                <AlertCircle
                                    size={17}
                                    className="mt-0.5 shrink-0 text-muted"
                                />

                                <p className="text-xs leading-5 text-muted">
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
                        <div className="rounded-2xl border border-border bg-app p-4">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-ink">
                                <MessageSquareText size={18} />
                                Admin Feedback
                            </h4>

                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">
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
    tasks,
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
                    <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                        <History size={20} className="text-muted" />
                        Timeline Change Requests
                    </h2>

                    <p className="mt-2 text-xs leading-5 text-muted">
                        Review submitted order changes and Admin decisions.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {pendingCount > 0 && (
                        <span className="rounded-full bg-pastel-butter px-3 py-2 text-xs font-bold text-warning">
                            {pendingCount} Pending
                        </span>
                    )}

                    {onRefresh && (
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={loading}
                            className="rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-muted transition-colors hover:bg-app disabled:opacity-50"
                        >
                            Refresh
                        </button>
                    )}
                </div>
            </div>

            {/* FILTERS */}
            <div className="flex flex-wrap gap-3 rounded-2xl border border-border bg-surface p-4">
                <label className="min-w-[140px] flex-1">
                    <span className="mb-2 block text-xs font-bold text-muted">
                        Status
                    </span>

                    <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-border-strong"
                    >
                        <option value="ALL">All Requests</option>
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                    </select>
                </label>

                <label className="min-w-[140px] flex-1">
                    <span className="mb-2 block text-xs font-bold text-muted">
                        Sort By
                    </span>

                    <select
                        value={sort}
                        onChange={(event) => setSort(event.target.value)}
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-border-strong"
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
                <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
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
                                    tasks={tasks}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-[22px] border border-border bg-surface px-6 py-12 text-center">
                            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-app text-muted">
                                <ClipboardList size={26} />
                            </span>

                            <h3 className="mt-4 text-base font-bold text-ink">
                                No timeline requests found
                            </h3>

                            <p className="mt-2 text-sm text-muted">
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
