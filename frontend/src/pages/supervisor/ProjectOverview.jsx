
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    ArrowLeft,
    Building2,
    CalendarDays,
    ChevronDown,
    ChevronUp,
    ClipboardList,
    Clock3,
    FileText,
    FolderKanban,
    MapPin,
    Phone,
    RefreshCw,
    ScrollText,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { getMediaUrl } from "../../utils/mediaUrl";
import LoadingScreen from "../../components/LoadingScreen";

// =====================================================
// HELPERS
// =====================================================

function formatDate(value) {
    if (!value) return "Not specified";

    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function daysLeft(endDate) {
    if (!endDate) return "";
    const end = new Date(`${String(endDate).slice(0, 10)}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((end - today) / 86400000);
    if (diff < 0) return `${Math.abs(diff)} days ago`;
    if (diff === 0) return "Today";
    return `${diff} days left`;
}

function statusLabel(value) {
    return String(value || "UNKNOWN").replaceAll("_", " ");
}

function statusClasses(value) {
    switch (value) {
        case "ACTIVE":
            return "bg-[#E7F2E8] text-[#296F40]";
        case "COMPLETED":
            return "bg-[#E9F0FC] text-[#3565A5]";
        case "MAINTENANCE":
        case "ON_HOLD":
            return "bg-[#FFF1D5] text-[#94651D]";
        case "CANCELLED":
            return "bg-[#FCE9E6] text-[#B5473E]";
        default:
            return "bg-[#F1EADF] text-[#665E53]";
    }
}

function getSupervisorName(item) {
    return (
        item.supervisor_name ||
        item.name ||
        item.supervisor?.name ||
        [
            item.supervisor?.first_name,
            item.supervisor?.last_name,
        ].filter(Boolean).join(" ") ||
        "Site Supervisor"
    );
}

function getSupervisorPhone(item) {
    return (
        item.supervisor_phone ||
        item.phone ||
        item.supervisor?.phone ||
        ""
    );
}

// =====================================================
// WORKSPACE ITEMS
// =====================================================

const workspaceItems = [
    {
        key: "tasks",
        title: "Project Tasks",
        icon: ClipboardList,
        tone: "bg-[#E9F0FC] text-[#3565A5]",
        hover: "hover:border-[#C7D8EF]",
    },
    {
        key: "timeline",
        title: "Timeline",
        icon: CalendarDays,
        tone: "bg-[#FFF2D8] text-[#9A6D20]",
        hover: "hover:border-[#EBD5A7]",
    },
    {
        key: "daily-reports",
        title: "Daily Reports",
        icon: ScrollText,
        tone: "bg-[#E7F2E8] text-[#368250]",
        hover: "hover:border-[#C5DFC9]",
    },
    {
        key: "delays",
        title: "Delay Reports",
        icon: Clock3,
        tone: "bg-[#FCE9E6] text-[#B45E52]",
        hover: "hover:border-[#EFCAC5]",
    },
    {
        key: "documents",
        title: "Documents",
        icon: FileText,
        tone: "bg-[#F0EAF8] text-[#7C5BA4]",
        hover: "hover:border-[#D9C9EB]",
    },
];

// =====================================================
// SUB-COMPONENTS
// =====================================================

function WorkspaceTile({ item, projectId }) {
    const Icon = item.icon;
    return (
        <Link
            to={`/supervisor/projects/${projectId}/${item.key}`}
            className={`group flex flex-col items-center gap-1.5 rounded-[18px] border border-[#E7DED2] bg-[#FFFDFA] p-3 text-center transition-colors hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A] ${item.hover}`}
        >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                <Icon size={20} strokeWidth={1.7} />
            </span>
            <span className="text-[14px] font-semibold leading-4 text-[#211E1A] [overflow-wrap:anywhere]">
                {item.title}
            </span>
        </Link>
    );
}

function InfoRow({ label, value, hint }) {
    return (
        <div className="min-w-0">
            <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#716658]">
                {label}
            </dt>
            <dd className="mt-0.5 break-words text-sm font-medium text-[#211E1A]">
                {value || "Not specified"}
                {hint && (
                    <span className="ml-1.5 text-xs text-[#716658]">({hint})</span>
                )}
            </dd>
        </div>
    );
}

// =====================================================
// SUPERVISOR PROJECT OVERVIEW
// =====================================================

export default function SupervisorProjectOverview() {
    const { projectId } = useParams();

    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [imageFailed, setImageFailed] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [descriptionExpanded, setDescriptionExpanded] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setProject(null);
            setError("");
            setImageFailed(false);

            try {
                const data = await projectApi.getProjectOverview(projectId);
                if (!cancelled) setProject(data);
            } catch (err) {
                if (!cancelled) {
                    const status = err.response?.status;
                    setError(
                        status === 403 || status === 404
                            ? "This project is unavailable or is no longer assigned to you."
                            : "Unable to load the project overview. Please try again."
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
    }, [projectId, refreshKey]);

    const coverUrl = project
        ? getMediaUrl(project.cover_image || project.category_image)
        : "";

    const supervisors = Array.isArray(project?.supervisors)
        ? project.supervisors
        : [];

    const endDateHint = project?.end_date ? daysLeft(project.end_date) : "";

    return (
        <div className="min-h-dvh w-full min-w-0 bg-[#F7F3EE] pb-10">
            {loading && <LoadingScreen message="Loading project overview..." />}

            {/* BACK LINK */}
            <div className="px-4 pt-4">
                <Link
                    to="/supervisor/projects"
                    className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[#716658] hover:text-[#211E1A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                >
                    <ArrowLeft size={15} aria-hidden="true" />
                    My Projects
                </Link>
            </div>

            {/* ERROR STATE */}
            {!loading && error && (
                <div className="mx-auto mt-4 max-w-[1200px] px-4">
                    <section className="rounded-[18px] border border-[#E7DED2] bg-[#FFFDFA] p-6 text-center">
                        <FolderKanban size={38} className="mx-auto text-[#716658]" />
                        <p role="alert" className="mt-4 text-sm text-[#716658]">
                            {error}
                        </p>
                        <div className="mt-5 flex flex-wrap justify-center gap-3">
                            <Link
                                to="/supervisor/projects"
                                className="rounded-xl border border-[#E4DCCD] px-4 py-3 text-sm font-semibold text-[#211E1A]"
                            >
                                Back to Projects
                            </Link>
                            <button
                                type="button"
                                onClick={() => setRefreshKey((n) => n + 1)}
                                className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-4 py-3 text-sm font-semibold text-white"
                            >
                                <RefreshCw size={17} />
                                Retry
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {!loading && project && (
                <>
                    {/* BANNER */}
                    <div className="relative h-[120px] overflow-hidden bg-gradient-to-br from-[#D9C8B1] to-[#F1EADF] lg:h-[160px]">
                        {coverUrl && !imageFailed ? (
                            <img
                                src={coverUrl}
                                alt={`${project.name} project cover`}
                                onError={() => setImageFailed(true)}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center">
                                <Building2
                                    size={72}
                                    strokeWidth={1.1}
                                    className="text-[#8E7E69]"
                                />
                            </div>
                        )}

                        {/* Category chip on image */}
                        <div className="absolute bottom-3 left-3 rounded-xl bg-[#FFFDFA]/95 px-3 py-1.5 text-xs font-bold text-[#514232] shadow-sm backdrop-blur">
                            {project.category_name || "Project"}
                        </div>
                    </div>

                    {/* PROJECT NAME + STATUS + LOCATION */}
                    <div className="px-4 pb-3 pt-3">
                        <h1 className="line-clamp-2 break-words text-xl font-bold leading-tight text-[#211E1A]">
                            {project.name}
                        </h1>
                        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-xs font-bold ${statusClasses(project.status)}`}
                            >
                                {statusLabel(project.status)}
                            </span>
                            {project.location && (
                                <p className="flex min-w-0 items-center gap-1 text-xs text-[#716658]">
                                    <MapPin size={13} className="shrink-0" />
                                    <span className="break-words">{project.location}</span>
                                </p>
                            )}
                        </div>
                    </div>

                    {/* CANCELLED NOTICE */}
                    {project.status === "CANCELLED" && (
                        <div className="px-4 pb-3">
                            <p
                                role="status"
                                className="rounded-xl border border-[#E7DED2] bg-[#FFFDFA] px-4 py-3 text-xs text-[#716658]"
                            >
                                This project has been cancelled. Existing records remain available for reference.
                            </p>
                        </div>
                    )}

                    {/* MAIN CONTENT: 1-col mobile/tablet → 2-col laptop (65% / 35%) */}
                    <div className="mx-auto max-w-[1200px] px-4 lg:grid lg:grid-cols-[65fr_35fr] lg:items-start lg:gap-3">

                        {/* ── LEFT COLUMN ── */}
                        <div className="mt-3 space-y-3 lg:mt-0">

                            {/* PROJECT WORKSPACE TILES */}
                            <section
                                className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] p-4"
                                aria-labelledby="workspace-heading"
                            >
                                <h2
                                    id="workspace-heading"
                                    className="text-sm font-bold text-[#211E1A]"
                                >
                                    Project Workspace
                                </h2>
                                {/* 2 cols phone, 3 tablet, 5 laptop */}
                                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                                    {workspaceItems.map((item) => (
                                        <WorkspaceTile
                                            key={item.key}
                                            item={item}
                                            projectId={projectId}
                                        />
                                    ))}
                                </div>
                            </section>

                            {/* PROJECT DESCRIPTION */}
                            <section
                                className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] p-4"
                                aria-labelledby="description-heading"
                            >
                                <h2
                                    id="description-heading"
                                    className="text-sm font-bold text-[#211E1A]"
                                >
                                    Project Description
                                </h2>
                                <p
                                    className={`mt-2 whitespace-pre-wrap text-sm leading-6 text-[#665E53] [overflow-wrap:anywhere] ${
                                        descriptionExpanded ? "" : "line-clamp-3"
                                    }`}
                                >
                                    {project.description || "No project description has been added."}
                                </p>
                                {project.description && (
                                    <button
                                        type="button"
                                        aria-expanded={descriptionExpanded}
                                        onClick={() =>
                                            setDescriptionExpanded((v) => !v)
                                        }
                                        className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[#716658] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                                    >
                                        {descriptionExpanded ? (
                                            <>
                                                <ChevronUp size={14} aria-hidden="true" />
                                                Show less
                                            </>
                                        ) : (
                                            <>
                                                <ChevronDown size={14} aria-hidden="true" />
                                                Read more
                                            </>
                                        )}
                                    </button>
                                )}
                            </section>
                        </div>

                        {/* ── RIGHT COLUMN ── */}
                        <div className="mt-3 space-y-3">

                            {/* PROJECT INFORMATION */}
                            <section
                                className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] p-4"
                                aria-labelledby="info-heading"
                            >
                                <h2
                                    id="info-heading"
                                    className="text-sm font-bold text-[#211E1A]"
                                >
                                    Project Information
                                </h2>
                                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                                    <InfoRow
                                        label="Client"
                                        value={project.client_name}
                                    />
                                    <InfoRow
                                        label="Category"
                                        value={`${project.category_name || "Not specified"}${
                                            project.category_is_active === false
                                                ? " (inactive)"
                                                : ""
                                        }`}
                                    />
                                    <InfoRow
                                        label="Start date"
                                        value={formatDate(project.start_date)}
                                    />
                                    <InfoRow
                                        label="End date"
                                        value={formatDate(project.end_date)}
                                        hint={endDateHint}
                                    />
                                </dl>
                            </section>

                            {/* SUPERVISION TEAM */}
                            <section
                                className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] p-4"
                                aria-labelledby="team-heading"
                            >
                                <h2
                                    id="team-heading"
                                    className="text-sm font-bold text-[#211E1A]"
                                >
                                    Supervision Team
                                </h2>

                                {supervisors.length === 0 ? (
                                    <p className="mt-3 text-xs text-[#716658]">
                                        No supervision team details are available.
                                    </p>
                                ) : (
                                    <ul className="mt-3 space-y-2">
                                        {supervisors.map((item, index) => {
                                            const name = getSupervisorName(item);
                                            const phone = getSupervisorPhone(item);

                                            return (
                                                <li
                                                    key={item.id || item.supervisor || index}
                                                    className="flex min-w-0 items-center gap-3 rounded-xl border border-[#EEE6DC] bg-[#FFFDFA] p-3"
                                                >
                                                    {/* Avatar */}
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E9DFD1] text-sm font-bold text-[#665E53]">
                                                        {name.charAt(0).toUpperCase()}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-bold text-[#211E1A] [overflow-wrap:anywhere]">
                                                            {name}
                                                        </p>
                                                        <p className="mt-0.5 text-xs text-[#716658] [overflow-wrap:anywhere]">
                                                            {phone || "Site Supervisor"}
                                                        </p>
                                                    </div>

                                                    {phone && (
                                                        <a
                                                            href={`tel:${phone}`}
                                                            aria-label={`Call ${name}`}
                                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E7F2E8] text-[#296F40] transition-colors hover:bg-[#D5EAD9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                                                        >
                                                            <Phone size={18} />
                                                        </a>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </section>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
