import { ProjectSearch } from "../daily-reports/ReportProjectPicker";
import ApprovalModal from "../approvals/ApprovalModal";
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
    UserRoundCheck,
    X,
    XCircle,
    CheckCircle2,
} from "lucide-react";

import { notificationApi } from "../../api/notificationApi";
import { taskApi } from "../../api/taskApi";
import { approvalApi } from "../../api/approvalApi";
import { delayApi } from "../../api/delayApi";
import { dailyReportApi } from "../../api/dailyReportApi";
import LoadingScreen from "../LoadingScreen";

const PAGE_SIZE = 10;

const TYPE_CONFIG = {
    TASK_APPROVAL: {
        label: "Task approval",
        icon: ClipboardCheck,
        tone: "bg-[#F1EADF] text-[#74614D]",
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
        tone: "bg-[#EDF3FC] text-[#3565A5]",
    },
    DELAY_REPORT: {
        label: "Delay report",
        icon: Clock3,
        tone: "bg-[#FFF2D8] text-[#94651D]",
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
// DATA HELPERS
// =====================================================

function itemsFrom(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    throw new Error("Unexpected notifications response.");
}

async function fetchNotifications(signal) {
    let unread = null;
    let total = null;
    const items = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
        if (page > 500) {
            throw new Error("Notification pagination limit exceeded.");
        }

        const response = await notificationApi.list({ page, ...(page === 1 ? { include_counts: true } : {}) }, signal);
        if (signal?.aborted) return null;
        if (page === 1 && Number.isInteger(response.unread_count) && response.unread_count >= 0) unread = response.unread_count;
        if (page === 1 && Number.isInteger(response.total_count) && response.total_count >= 0) total = response.total_count;
        items.push(...itemsFrom(response).map((notification) => ({
            ...notification,
            type: notification.notification_type || notification.type,
        })));

        hasNext =
            !Array.isArray(response) && Boolean(response.next);
        page += 1;
    }

    return { items, unread_count: unread, total_count: total };
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
// NOTIFICATION DESTINATIONS
// =====================================================

async function resolveDestination(notification, role) {
    const supervisor = role === "SUPERVISOR";

    const kind = String(
        notification.reference_type || ""
    ).toUpperCase();

    const type = String(notification.notification_type || notification.type || "").toUpperCase();

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

    if (["TASK_CHANGE_REQUEST", "CHANGE_REQUEST"].includes(kind) && ref) {
        const request = await approvalApi.getChangeRequest(ref);
        const timeline = request.change_type === "ORDER_CHANGE";
        if (supervisor) return `/supervisor/projects/${request.project_id}/${timeline ? "timeline" : `tasks?task=${encodeURIComponent(idOf(request.task))}`}`;
        return `/admin/approvals?tab=${timeline ? "timeline" : "changes"}&request=${encodeURIComponent(ref)}`;
    }
    if (["DELAY_REPORT", "EXTENSION_REQUEST"].includes(type) && ref) {
        const report = await delayApi.get(ref);
        return supervisor
            ? `/supervisor/projects/${report.project_id}/delays?request=${encodeURIComponent(ref)}${type === "EXTENSION_REQUEST" ? "&type=extension" : ""}`
            : `/admin/delays?request=${encodeURIComponent(ref)}&type=${type === "EXTENSION_REQUEST" ? "extension" : "delay"}`;
    }
    if (kind === "DAILY_TASK_WORK" && ref) {
        const entry = await dailyReportApi.work(ref);
        return supervisor ? `/supervisor/projects/${entry.project_id}/daily-reports?report=${encodeURIComponent(idOf(entry.daily_report))}` : `/admin/approvals?tab=work&entry=${encodeURIComponent(ref)}`;
    }
    if (kind === "DAILY_REPORT" && ref) {
        const report = await dailyReportApi.get(ref);
        return supervisor ? `/supervisor/projects/${report.project}/daily-reports?report=${encodeURIComponent(ref)}` : `/admin/reports?report=${encodeURIComponent(ref)}`;
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

    if (kind === "TASK_BATCH" && projectId) return `/${supervisor ? "supervisor" : "admin"}/projects/${projectId}/tasks`;

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
    const type = notification.notification_type || notification.type;
    const base = TYPE_CONFIG[type] || { label: readableType(type), icon: Bell, tone: "bg-[#F1EADF] text-[#74614D]" };
    const event = notification.event || "";
    if (["TASK_REJECTED", "TASK_EDIT_REJECTED", "TIMELINE_REORDER_REJECTED", "DELAY_REPORT_REJECTED", "EXTENSION_REJECTED", "DAILY_TASK_WORK_REJECTED", "PROJECT_CANCELLED"].includes(event)) {
        return { ...base, label: event === "PROJECT_CANCELLED" ? "Project cancelled" : `${base.label} / Rejected`, icon: XCircle, tone: "bg-[#FCE9E6] text-[#B42318]" };
    }
    if (["TASK_APPROVED", "TASK_EDIT_APPROVED", "TIMELINE_REORDER_APPROVED", "DELAY_REPORT_APPROVED", "EXTENSION_APPROVED", "DAILY_TASK_WORK_VERIFIED"].includes(event)) {
        return { ...base, label: `${base.label} / ${event.endsWith("VERIFIED") ? "Verified" : "Approved"}`, icon: CheckCircle2, tone: "bg-[#E7F2E8] text-[#166534]" };
    }
    if (event === "PROJECT_DATES_CHANGED") return { ...base, label: "Project dates changed", tone: "bg-[#E9F0FC] text-[#3565A5]" };
    return base;
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
            className={`group relative flex w-full items-start gap-3.5 px-4 py-4 text-left transition-colors duration-200 focus:outline-none focus-visible:bg-[#EDF3FC] disabled:cursor-wait disabled:opacity-70 sm:gap-4 sm:px-6 sm:py-5 ${unread
                    ? "bg-[#FAF6FD] hover:bg-[#F5EFFA]"
                    : "bg-[#FFFDFA] hover:bg-[#F8F4EE]"
                }`}
        >
            {unread && (
                <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-1 bg-[#3565A5]"
                />
            )}

            <span className="relative shrink-0">
                <span
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${configuration.tone}`}
                >
                    <Icon size={21} strokeWidth={1.8} />
                </span>

                {unread && (
                    <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#FAF6FD] bg-[#3565A5] group-hover:border-[#F5EFFA]" />
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
                                ? "font-semibold text-[#3565A5]"
                                : "text-[#716658]"
                            }`}
                    >
                        {formatRelative(notification.created_at)}
                    </time>
                </span>

                <span className="mt-1.5 block line-clamp-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#716658]">
                    {notification.message || "Open to view details."}
                </span>

                <span className="mt-2.5 inline-flex items-center rounded-full bg-[#F1EADF] px-2.5 py-1 text-xs font-semibold text-[#665E53]">
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
    const mounted = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(null);
    const [totalCount, setTotalCount] = useState(null);
    const [markingAll, setMarkingAll] = useState(false);
    const markAllRef = useRef(false);
    const [loading, setLoading] = useState(true);
    const [openingId, setOpeningId] = useState("");
    const openingRef = useRef(false);

    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(""), 8000);
        return () => clearTimeout(timer);
    }, [notice]);
    const [refreshKey, setRefreshKey] = useState(0);

    const [search, setSearch] = useState("");
    const [type, setType] = useState("");
    const [visibility, setVisibility] = useState("ALL");
    const [sort, setSort] = useState("NEWEST");
    const [page, setPage] = useState(1);

    const [openedNotification, setOpenedNotification] =
        useState(null);

    useEffect(() => {
        const controller = new AbortController();

        async function load() {
            setLoading(true);
            setError("");

            try {
                const data = await fetchNotifications(controller.signal);

                if (!controller.signal.aborted && data) {
                    setNotifications(data.items); setUnreadCount(data.unread_count); setTotalCount(data.total_count);
                    window.dispatchEvent(new CustomEvent("rare:notifications-updated", { detail: { unread_count: data.unread_count } }));
                }
            } catch (err) {
                if (!controller.signal.aborted) {
                    setError(
                        readError(
                            err,
                            "Unable to load notifications. Please retry."
                        )
                    );
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        load();

        return () => {
            controller.abort();
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
        if (openingRef.current || markAllRef.current) return;

        openingRef.current = true;
        setOpeningId(notification.id);
        setError("");
        setNotice("");

        try {
            if (!notification.is_read) {
                const read = await notificationApi.markRead(notification.id);
                if (!mounted.current) return;
                if (Number.isInteger(read.unread_count)) setUnreadCount(read.unread_count);
                if (Number.isInteger(read.total_count)) setTotalCount(read.total_count);

                setNotifications((previous) =>
                    previous.map((item) =>
                        item.id === notification.id
                            ? {
                                ...item,
                                is_read: true,
                                read_at: read.read_at,
                            }
                            : item
                    )
                );

                window.dispatchEvent(
                    new CustomEvent("rare:notifications-updated", { detail: { unread_count: read.unread_count } })
                );
            }

            let destination = null;

            try {
                destination = await resolveDestination(
                    notification,
                    role
                );
            } catch {
                if (!mounted.current) return;
                setNotice(
                    "Notification opened, but its related record is unavailable."
                );
            }

            if (!mounted.current) return;
            if (destination) {
                navigate(destination);
                return;
            }

            setOpenedNotification(notification);
        } catch (err) {
            if (!mounted.current) return;
            setError(
                readError(
                    err,
                    "Unable to open this notification. Please retry."
                )
            );
        } finally {
            openingRef.current = false;
            if (mounted.current) setOpeningId("");
        }
    }

    async function markAllRead() {
        if (markAllRef.current || openingRef.current) return;
        markAllRef.current = true; setMarkingAll(true); setError("");
        try {
            const data = await notificationApi.markAllRead();
            if (!mounted.current) return;
            setUnreadCount(data.unread_count); setTotalCount(data.total_count);
            setNotice("Notifications marked as read.");
            setRefreshKey((value) => value + 1);
            window.dispatchEvent(new CustomEvent("rare:notifications-updated", { detail: { unread_count: data.unread_count } }));
        } catch (failure) { if (mounted.current) setError(readError(failure, "Unable to mark notifications as read. Please retry.")); }
        finally { markAllRef.current = false; if (mounted.current) setMarkingAll(false); }
    }

    const hasFilters =
        Boolean(search || type) ||
        visibility !== "ALL" ||
        sort !== "NEWEST";

    const tabs = [
        { key: "ALL", label: "All", count: totalCount },
        { key: "UNREAD", label: "Unread", count: unreadCount },
        {
            key: "READ",
            label: "Read",
            count: unreadCount === null || totalCount === null ? null : totalCount - unreadCount,
        },
    ];

    const selectClass =
        "h-11 w-full appearance-none rounded-xl border border-[#E4DCCD] bg-white pl-4 pr-10 text-sm text-[#211E1A] outline-none transition-all hover:border-[#CFC3B1] focus:border-[#3565A5] focus:ring-4 focus:ring-[#3565A5]/15";

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

            {unreadCount > 0 && <div className="flex justify-end"><button type="button" onClick={markAllRead} disabled={markingAll || loading || Boolean(openingId)} className="rare-button rare-button-secondary">{markingAll ? "Marking as read..." : "Mark all as read"}</button></div>}
            {/* HEADER */}
            <header className="rare-page-header flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                    <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#211E1A] text-white shadow-lg shadow-[#211E1A]/20">
                        <BellRing size={25} strokeWidth={1.7} />

                        {unreadCount > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-[#FFFDFA] bg-[#3565A5] px-1.5 text-xs font-bold">
                                {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                        )}
                    </span>

                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                            Notifications
                        </h1>

                        <p className="mt-1 text-sm text-[#716658]">
                            {loading
                                ? "Checking for updates..."
                                : unreadCount > 0
                                    ? `You have ${unreadCount} unread ${unreadCount === 1 ? "update" : "updates"}`
                                    : unreadCount === null ? "Unread count unavailable" : "You're all caught up"}
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
                    <ProjectSearch query={search} delay={0} onSearch={(value) => { setSearch(value); setPage(1); }} label="Search notifications" placeholder="Title or message" />
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
                                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3565A5] sm:flex-none ${visibility === tab.key
                                        ? "bg-white text-[#211E1A] shadow-sm"
                                        : "text-[#716658] hover:text-[#211E1A]"
                                    }`}
                            >
                                {tab.label}
                                <span
                                    className={`ml-1.5 text-xs ${visibility === tab.key
                                            ? "text-[#3565A5]"
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
                                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#716658]"
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
                                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#716658]"
                            />
                        </div>
                    </div>
                </div>

                {hasFilters && (
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-[#3565A5] transition-colors hover:bg-[#EDF3FC]"
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
                                <h2 className="border-b border-[#EEE6DC] bg-[#F8F4EE] px-4 py-2.5 text-xs font-semibold text-[#716658] sm:px-6">
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
                            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EDF3FC] text-[#3565A5]">
                                <Inbox size={29} strokeWidth={1.6} />
                            </span>

                            <h3 className="mt-5 text-lg font-bold text-[#211E1A]">
                                {hasFilters
                                    ? "No matching notifications"
                                    : "Your inbox is empty"}
                            </h3>

                            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#716658]">
                                {hasFilters
                                    ? "Try a different search or clear your filters."
                                    : "Important project updates will appear here."}
                            </p>

                            {hasFilters && (
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="mt-6 rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3565A5]"
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

                            <span className="text-sm text-[#716658]">
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
                    <ApprovalModal compact label="Notification details" onClose={() => setOpenedNotification(null)}>
                        <section aria-labelledby="notification-detail-title" className="space-y-3 p-5 sm:p-6">
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

                            <p className="mt-5 text-xs font-semibold text-[#3565A5]">
                                {configuration.label}
                            </p>

                            <h2
                                id="notification-detail-title"
                                className="mt-1.5 wrap-break-word text-xl font-bold leading-snug text-[#211E1A]"
                            >
                                {openedNotification.title || "Notification"}
                            </h2>

                            <p className="mt-4 whitespace-pre-wrap wrap-break-word text-sm leading-7 text-[#665E53]">
                                {openedNotification.message}
                            </p>

                            <p className="mt-5 border-t border-[#EEE6DC] pt-4 text-xs text-[#716658]">
                                {formatDate(openedNotification.created_at)}
                            </p>

                            <button
                                type="button"
                                onClick={() => setOpenedNotification(null)}
                                className="mt-5 h-12 w-full rounded-xl bg-[#211E1A] text-sm font-semibold text-white transition-colors hover:bg-[#3565A5]"
                            >
                                Done
                            </button>
                        </section>
                    </ApprovalModal>
                );
            })()}
        </div>
    );
}
