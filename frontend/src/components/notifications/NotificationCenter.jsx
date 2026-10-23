import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Bell,
    BellRing,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    ClipboardList,
    Clock3,
    FileText,
    Inbox,
    RefreshCw,
    Search,
    UserRoundCheck,
    X,
} from "lucide-react";

import { notificationApi } from "../../api/notificationApi";
import { taskApi } from "../../api/taskApi";
import LoadingScreen from "../LoadingScreen";

const PAGE_SIZE = 10;

const TYPE_CONFIG = {
    TASK_APPROVAL: {
        label: "Task approval",
        icon: ClipboardCheck,
        tone: "bg-[#E7F2E8] text-[#296F40]",
    },
    TASK_CHANGE_REQUEST: {
        label: "Change request",
        icon: ClipboardList,
        tone: "bg-[#FFF2D8] text-[#94651D]",
    },
    PROJECT_ASSIGNMENT: {
        label: "Project assignment",
        icon: UserRoundCheck,
        tone: "bg-[#E9F0FC] text-[#3565A5]",
    },
    DAILY_REPORT: {
        label: "Daily report",
        icon: FileText,
        tone: "bg-[#F0EAF8] text-[#7855A0]",
    },
    DELAY_REPORT: {
        label: "Delay report",
        icon: Clock3,
        tone: "bg-[#FCE9E6] text-[#B5473E]",
    },
    EXTENSION_REQUEST: {
        label: "Extension request",
        icon: Clock3,
        tone: "bg-[#FFF2D8] text-[#94651D]",
    },
    SYSTEM: {
        label: "System",
        icon: Bell,
        tone: "bg-[#F1EADF] text-[#74614D]",
    },
};

// =====================================================
// DATA HELPERS (unchanged logic)
// =====================================================

function itemsFrom(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    throw new Error("Unexpected notifications response.");
}

async function fetchNotifications() {
    const items = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
        if (page > 500) {
            throw new Error("Notification pagination limit exceeded.");
        }

        const response = await notificationApi.list({ page });
        items.push(...itemsFrom(response));

        hasNext =
            !Array.isArray(response) && Boolean(response.next);
        page += 1;
    }

    return items;
}

function readableType(type) {
    if (TYPE_CONFIG[type]) return TYPE_CONFIG[type].label;

    const text = String(type || "OTHER")
        .replaceAll("_", " ")
        .toLowerCase();

    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatRelative(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: date.getFullYear() === new Date().getFullYear()
            ? undefined
            : "numeric",
    });
}

function groupLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Earlier";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const day = new Date(date);
    day.setHours(0, 0, 0, 0);

    const diff = Math.round((today - day) / 86400000);

    if (diff <= 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return "This week";
    return "Earlier";
}

function idOf(value) {
    if (value && typeof value === "object") {
        return String(value.id ?? value.uuid ?? "");
    }
    return value == null ? "" : String(value);
}

function readError(error, fallback) {
    const data = error?.response?.data;

    if (typeof data?.detail === "string") return data.detail;

    if (error?.response?.status === 403) {
        return "You cannot access this notification.";
    }

    return fallback;
}

// =====================================================
// NAVIGATION RESOLVER (unchanged logic)
// =====================================================

async function resolveDestination(notification, role) {
    const supervisor = role === "SUPERVISOR";

    const kind = String(
        notification.reference_type || ""
    ).toUpperCase();

    const type = String(notification.type || "").toUpperCase();

    const ref = idOf(notification.reference_id);

    let projectId = idOf(
        notification.project_id || notification.project
    );

    let taskId = idOf(
        notification.task_id || notification.task
    );

    if (
        ["PROJECT", "PROJECT_ASSIGNMENT"].includes(kind) &&
        ref
    ) {
        projectId = ref;
    }

    if (["TASK", "TASK_APPROVAL"].includes(kind) && ref) {
        taskId = ref;
    }

    const taskRelated =
        type === "TASK_APPROVAL" ||
        type === "TASK_CHANGE_REQUEST";

    if (
        supervisor &&
        taskRelated &&
        !projectId &&
        taskId
    ) {
        const task = await taskApi.get(taskId);
        projectId = idOf(
            task.project_id || task.project
        );
    }

    if (supervisor) {
        if (taskRelated && projectId) {
            return (
                `/supervisor/projects/${projectId}/tasks` +
                (taskId
                    ? `?task=${encodeURIComponent(taskId)}`
                    : "")
            );
        }

        if (type === "PROJECT_ASSIGNMENT" && projectId) {
            return `/supervisor/projects/${projectId}`;
        }

        if (type === "DAILY_REPORT" && projectId) {
            return `/supervisor/projects/${projectId}/daily-reports`;
        }

        if (
            ["DELAY_REPORT", "EXTENSION_REQUEST"].includes(type) &&
            projectId
        ) {
            return `/supervisor/projects/${projectId}/delays`;
        }

        if (projectId) {
            return `/supervisor/projects/${projectId}`;
        }

        return null;
    }

    if (type === "TASK_APPROVAL" && taskId) {
        return `/admin/approvals?task=${encodeURIComponent(taskId)}`;
    }

    if (type === "TASK_CHANGE_REQUEST") {
        const requestId = idOf(
            notification.change_request_id ||
            (
                ["TASK_CHANGE_REQUEST", "CHANGE_REQUEST"].includes(kind)
                    ? ref
                    : ""
            )
        );

        return requestId
            ? `/admin/approvals?tab=changes&request=${encodeURIComponent(requestId)}`
            : "/admin/approvals?tab=changes";
    }

    if (
        type === "PROJECT_ASSIGNMENT" &&
        projectId
    ) {
        return `/admin/projects/${projectId}`;
    }

    if (projectId) {
        return `/admin/projects/${projectId}`;
    }

    if (kind === "TASK" && taskId) {
        return `/admin/approvals?task=${encodeURIComponent(taskId)}`;
    }

    return null;
}

function configFor(notification) {
    return (
        TYPE_CONFIG[notification.type] || {
            label: readableType(notification.type),
            icon: Bell,
            tone: "bg-[#F1EADF] text-[#74614D]",
        }
    );
}

// =====================================================
// NOTIFICATION ROW
// =====================================================

function NotificationRow({ notification, busy, onOpen }) {
    const configuration = configFor(notification);
    const Icon = configuration.icon;
    const unread = !notification.is_read;

    return (
        <button
            type="button"
            disabled={busy}
            onClick={() => onOpen(notification)}
            className={`group relative flex w-full items-start gap-3.5 px-4 py-4 text-left transition-colors duration-200 focus:outline-none focus-visible:bg-[#F0EAF8] disabled:cursor-wait disabled:opacity-70 sm:gap-4 sm:px-6 sm:py-5 ${unread
                    ? "bg-[#FAF6FD] hover:bg-[#F5EFFA]"
                    : "bg-[#FFFDFA] hover:bg-[#F8F4EE]"
                }`}
        >
            {unread && (
                <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-1 bg-[#7855A0]"
                />
            )}

            <span className="relative shrink-0">
                <span
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${configuration.tone}`}
                >
                    <Icon size={21} strokeWidth={1.8} />
                </span>

                {unread && (
                    <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#FAF6FD] bg-[#7855A0] group-hover:border-[#F5EFFA]" />
                )}
            </span>

            <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                    <span
                        className={`line-clamp-2 break-words text-sm leading-snug text-[#211E1A] sm:text-[15px] ${unread ? "font-bold" : "font-semibold"
                            }`}
                    >
                        {notification.title || "Notification"}
                    </span>

                    <time
                        dateTime={notification.created_at}
                        title={formatDate(notification.created_at)}
                        className={`shrink-0 pt-0.5 text-xs ${unread
                                ? "font-semibold text-[#7855A0]"
                                : "text-[#948778]"
                            }`}
                    >
                        {formatRelative(notification.created_at)}
                    </time>
                </span>

                <span className="mt-1.5 block line-clamp-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#817669]">
                    {notification.message || "Open to view details."}
                </span>

                <span className="mt-2.5 inline-flex items-center rounded-full bg-[#F1EADF] px-2.5 py-1 text-[11px] font-semibold text-[#665E53]">
                    {configuration.label}
                </span>
            </span>

            <ChevronRight
                size={18}
                className="mt-3 hidden shrink-0 text-[#B7AC9C] transition-all group-hover:translate-x-0.5 group-hover:text-[#211E1A] sm:block"
            />
        </button>
    );
}

// =====================================================
// SHARED NOTIFICATION CENTER
// =====================================================

export default function NotificationCenter({
    role = "ADMIN",
}) {
    const navigate = useNavigate();

    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openingId, setOpeningId] = useState("");
    const openingRef = useRef(false);

    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    const [search, setSearch] = useState("");
    const [type, setType] = useState("");
    const [visibility, setVisibility] = useState("ALL");
    const [sort, setSort] = useState("NEWEST");
    const [page, setPage] = useState(1);

    const [openedNotification, setOpenedNotification] =
        useState(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError("");

            try {
                const data = await fetchNotifications();

                if (!cancelled) setNotifications(data);
            } catch (err) {
                if (!cancelled) {
                    setError(
                        readError(
                            err,
                            "Unable to load notifications. Please retry."
                        )
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    // Close the detail dialog with Escape.
    useEffect(() => {
        if (!openedNotification) return undefined;

        const onKey = (event) => {
            if (event.key === "Escape") setOpenedNotification(null);
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [openedNotification]);

    const types = useMemo(
        () =>
            [...new Set(
                notifications
                    .map((item) => item.type)
                    .filter(Boolean)
            )].sort(),
        [notifications]
    );

    const unreadCount = notifications.filter(
        (item) => !item.is_read
    ).length;

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        const results = notifications.filter((item) => {
            const text = [
                item.title,
                item.message,
                item.type,
                item.reference_type,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return (
                text.includes(q) &&
                (!type || item.type === type) &&
                (
                    visibility === "ALL" ||
                    (visibility === "UNREAD" && !item.is_read) ||
                    (visibility === "READ" && item.is_read)
                )
            );
        });

        results.sort((a, b) => {
            if (sort === "OLDEST") {
                return String(a.created_at || "").localeCompare(
                    String(b.created_at || "")
                );
            }

            return String(b.created_at || "").localeCompare(
                String(a.created_at || "")
            );
        });

        return results;
    }, [notifications, search, type, visibility, sort]);

    const pageCount = Math.max(
        1,
        Math.ceil(filtered.length / PAGE_SIZE)
    );

    const safePage = Math.min(page, pageCount);

    const pageItems = filtered.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );

    // Group consecutive items under a date heading.
    const groups = useMemo(() => {
        const result = [];

        pageItems.forEach((item) => {
            const label = groupLabel(item.created_at);
            const last = result[result.length - 1];

            if (last && last.label === label) {
                last.items.push(item);
            } else {
                result.push({ label, items: [item] });
            }
        });

        return result;
    }, [pageItems]);

    function resetFilters() {
        setSearch("");
        setType("");
        setVisibility("ALL");
        setSort("NEWEST");
        setPage(1);
    }

    async function openNotification(notification) {
        if (openingRef.current) return;

        openingRef.current = true;
        setOpeningId(notification.id);
        setError("");
        setNotice("");

        try {
            if (!notification.is_read) {
                await notificationApi.markRead(notification.id);

                setNotifications((previous) =>
                    previous.map((item) =>
                        item.id === notification.id
                            ? {
                                ...item,
                                is_read: true,
                                read_at: new Date().toISOString(),
                            }
                            : item
                    )
                );

                window.dispatchEvent(
                    new Event("rare:notifications-updated")
                );
            }

            let destination = null;

            try {
                destination = await resolveDestination(
                    notification,
                    role
                );
            } catch {
                setNotice(
                    "Notification opened, but its related record is unavailable."
                );
            }

            if (destination) {
                navigate(destination);
                return;
            }

            setOpenedNotification(notification);
        } catch (err) {
            setError(
                readError(
                    err,
                    "Unable to open this notification. Please retry."
                )
            );
        } finally {
            openingRef.current = false;
            setOpeningId("");
        }
    }

    const hasFilters =
        Boolean(search || type) ||
        visibility !== "ALL" ||
        sort !== "NEWEST";

    const tabs = [
        { key: "ALL", label: "All", count: notifications.length },
        { key: "UNREAD", label: "Unread", count: unreadCount },
        {
            key: "READ",
            label: "Read",
            count: notifications.length - unreadCount,
        },
    ];

    const selectClass =
        "h-11 w-full appearance-none rounded-xl border border-[#E4DCCD] bg-white pl-4 pr-10 text-sm text-[#211E1A] outline-none transition-all hover:border-[#CFC3B1] focus:border-[#7855A0] focus:ring-4 focus:ring-[#7855A0]/15";

    return (
        <div className="mx-auto max-w-4xl space-y-5 pb-10 sm:space-y-6">
            {(loading || openingId) && (
                <LoadingScreen
                    message={
                        openingId
                            ? "Opening notification..."
                            : "Loading notifications..."
                    }
                />
            )}

            {/* HEADER */}
            <header className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                    <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#211E1A] text-white shadow-lg shadow-[#211E1A]/20">
                        <BellRing size={25} strokeWidth={1.7} />

                        {unreadCount > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-[#FFFDFA] bg-[#7855A0] px-1.5 text-[11px] font-bold">
                                {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                        )}
                    </span>

                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                            Notifications
                        </h1>

                        <p className="mt-1 text-sm text-[#817669]">
                            {loading
                                ? "Checking for updates..."
                                : unreadCount > 0
                                    ? `You have ${unreadCount} unread ${unreadCount === 1 ? "update" : "updates"}`
                                    : "You're all caught up"}
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => setRefreshKey((v) => v + 1)}
                    disabled={loading}
                    aria-label="Refresh notifications"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E4DCCD] bg-white text-[#211E1A] transition-colors hover:bg-[#F1EADF] disabled:opacity-50 sm:w-auto sm:gap-2 sm:px-4"
                >
                    <RefreshCw size={17} />
                    <span className="hidden text-sm font-semibold sm:inline">
                        Refresh
                    </span>
                </button>
            </header>

            {/* TOOLBAR */}
            <section aria-label="Find notifications" className="space-y-3">
                <div className="relative">
                    <Search
                        size={18}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#938778]"
                    />

                    <input
                        type="search"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Search notifications"
                        aria-label="Search notifications"
                        className="h-12 w-full rounded-xl border border-[#E4DCCD] bg-white pl-11 pr-4 text-sm text-[#211E1A] outline-none transition-all placeholder:text-[#B7AC9C] hover:border-[#CFC3B1] focus:border-[#7855A0] focus:ring-4 focus:ring-[#7855A0]/15"
                    />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {/* Read-state tabs */}
                    <div
                        role="tablist"
                        aria-label="Read status"
                        className="flex rounded-xl bg-[#F1EADF] p-1"
                    >
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                role="tab"
                                aria-selected={visibility === tab.key}
                                onClick={() => {
                                    setVisibility(tab.key);
                                    setPage(1);
                                }}
                                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7855A0] sm:flex-none ${visibility === tab.key
                                        ? "bg-white text-[#211E1A] shadow-sm"
                                        : "text-[#817669] hover:text-[#211E1A]"
                                    }`}
                            >
                                {tab.label}
                                <span
                                    className={`ml-1.5 text-xs ${visibility === tab.key
                                            ? "text-[#7855A0]"
                                            : "opacity-70"
                                        }`}
                                >
                                    {loading ? "" : tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:flex">
                        <div className="relative sm:w-48">
                            <select
                                value={type}
                                aria-label="Filter notification type"
                                onChange={(e) => {
                                    setType(e.target.value);
                                    setPage(1);
                                }}
                                className={selectClass}
                            >
                                <option value="">All types</option>

                                {types.map((value) => (
                                    <option key={value} value={value}>
                                        {readableType(value)}
                                    </option>
                                ))}
                            </select>

                            <ChevronDown
                                size={16}
                                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#938778]"
                            />
                        </div>

                        <div className="relative sm:w-40">
                            <select
                                value={sort}
                                aria-label="Sort notifications"
                                onChange={(e) => {
                                    setSort(e.target.value);
                                    setPage(1);
                                }}
                                className={selectClass}
                            >
                                <option value="NEWEST">Newest first</option>
                                <option value="OLDEST">Oldest first</option>
                            </select>

                            <ChevronDown
                                size={16}
                                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#938778]"
                            />
                        </div>
                    </div>
                </div>

                {hasFilters && (
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-[#7855A0] transition-colors hover:bg-[#F0EAF8]"
                    >
                        <X size={15} />
                        Clear filters
                    </button>
                )}
            </section>

            {/* MESSAGES */}
            {error && (
                <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    {error}
                </div>
            )}

            {notice && (
                <div
                    role="status"
                    className="rounded-xl border border-[#F0DDB0] bg-[#FFF2D8] p-4 text-sm text-[#94651D]"
                >
                    {notice}
                </div>
            )}

            {/* INBOX */}
            {!loading && !error && (
                <section className="overflow-hidden rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] shadow-[0_20px_50px_-30px_rgba(33,30,26,0.25)]">
                    {groups.length ? (
                        groups.map((group) => (
                            <div key={group.label}>
                                <h2 className="border-b border-[#EEE6DC] bg-[#F8F4EE] px-4 py-2.5 text-xs font-semibold text-[#817669] sm:px-6">
                                    {group.label}
                                </h2>

                                <div className="divide-y divide-[#EEE6DC] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[#EEE6DC]">
                                    {group.items.map((notification) => (
                                        <NotificationRow
                                            key={notification.id}
                                            notification={notification}
                                            busy={Boolean(openingId)}
                                            onOpen={openNotification}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="px-6 py-16 text-center">
                            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F0EAF8] text-[#7855A0]">
                                <Inbox size={29} strokeWidth={1.6} />
                            </span>

                            <h3 className="mt-5 text-lg font-bold text-[#211E1A]">
                                {hasFilters
                                    ? "No matching notifications"
                                    : "Your inbox is empty"}
                            </h3>

                            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#817669]">
                                {hasFilters
                                    ? "Try a different search or clear your filters."
                                    : "Important project updates will appear here."}
                            </p>

                            {hasFilters && (
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="mt-6 rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#7855A0]"
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>
                    )}

                    {pageCount > 1 && (
                        <div className="flex items-center justify-between gap-3 border-t border-[#EEE6DC] bg-[#FFFDFA] p-3 sm:px-5">
                            <button
                                type="button"
                                disabled={safePage === 1}
                                onClick={() =>
                                    setPage((v) => Math.max(1, v - 1))
                                }
                                className="inline-flex h-10 items-center gap-1 rounded-xl pl-2.5 pr-3.5 text-sm font-semibold text-[#211E1A] transition-colors hover:bg-[#F1EADF] disabled:opacity-35 disabled:hover:bg-transparent"
                            >
                                <ChevronLeft size={18} />
                                Previous
                            </button>

                            <span className="text-sm text-[#817669]">
                                <span className="font-semibold text-[#211E1A]">
                                    {safePage}
                                </span>{" "}
                                of {pageCount}
                            </span>

                            <button
                                type="button"
                                disabled={safePage === pageCount}
                                onClick={() =>
                                    setPage((v) =>
                                        Math.min(pageCount, v + 1)
                                    )
                                }
                                className="inline-flex h-10 items-center gap-1 rounded-xl pl-3.5 pr-2.5 text-sm font-semibold text-[#211E1A] transition-colors hover:bg-[#F1EADF] disabled:opacity-35 disabled:hover:bg-transparent"
                            >
                                Next
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    )}
                </section>
            )}

            {/* DETAIL DIALOG (bottom sheet on phones) */}
            {openedNotification && (() => {
                const configuration = configFor(openedNotification);
                const Icon = configuration.icon;

                return (
                    <div
                        className="fixed inset-0 z-50 flex items-end justify-center bg-[#211E1A]/55 backdrop-blur-sm sm:items-center sm:p-4"
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) {
                                setOpenedNotification(null);
                            }
                        }}
                    >
                        <section
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="notification-detail-title"
                            className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-[#FFFDFA] p-6 pb-8 shadow-2xl sm:max-w-md sm:rounded-3xl sm:pb-6"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <span
                                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${configuration.tone}`}
                                >
                                    <Icon size={22} strokeWidth={1.8} />
                                </span>

                                <button
                                    type="button"
                                    onClick={() => setOpenedNotification(null)}
                                    aria-label="Close notification"
                                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1EADF] text-[#665E53] transition-colors hover:bg-[#E8DDD0]"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <p className="mt-5 text-xs font-semibold text-[#7855A0]">
                                {configuration.label}
                            </p>

                            <h2
                                id="notification-detail-title"
                                className="mt-1.5 break-words text-xl font-bold leading-snug text-[#211E1A]"
                            >
                                {openedNotification.title || "Notification"}
                            </h2>

                            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-[#665E53]">
                                {openedNotification.message}
                            </p>

                            <p className="mt-5 border-t border-[#EEE6DC] pt-4 text-xs text-[#948778]">
                                {formatDate(openedNotification.created_at)}
                            </p>

                            <button
                                type="button"
                                onClick={() => setOpenedNotification(null)}
                                className="mt-5 h-12 w-full rounded-xl bg-[#211E1A] text-sm font-semibold text-white transition-colors hover:bg-[#7855A0]"
                            >
                                Done
                            </button>
                        </section>
                    </div>
                );
            })()}
        </div>
    );
}