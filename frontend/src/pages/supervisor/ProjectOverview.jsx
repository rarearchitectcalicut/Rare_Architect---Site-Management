
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    ArrowUpRight,
    Building2,
    CalendarDays,
    ClipboardList,
    Clock3,
    FileText,
    FolderKanban,
    HardHat,
    MapPin,
    Phone,
    RefreshCw,
    ScrollText,
    ShieldCheck,
    UsersRound,
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

function DetailCard({ icon: Icon, label, value, tone }) {
    return (
        <div className="group flex min-w-0 items-start gap-3 rounded-[18px] border border-[#EEE6DC] bg-[#FFFDFA] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D5C6B5] hover:shadow-[0_8px_20px_rgba(33,30,26,0.05)] motion-reduce:transform-none">
            <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:rotate-[-5deg] group-hover:scale-105 motion-reduce:transform-none ${tone}`}
            >
                <Icon size={21} strokeWidth={1.8} />
            </span>

            <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#948778]">
                    {label}
                </p>
                <p className="mt-2 break-words text-sm font-semibold text-[#211E1A]">
                    {value || "Not provided"}
                </p>
            </div>
        </div>
    );
}

const workspaceItems = [
    {
        key: "tasks",
        title: "Project Tasks",
        description: "View assigned project tasks and their progress.",
        icon: ClipboardList,
        tone: "bg-[#E9F0FC] text-[#3565A5]",
        hover: "hover:border-[#C7D8EF]",
    },
    {
        key: "timeline",
        title: "Project Timeline",
        description: "Review task order and the project work schedule.",
        icon: CalendarDays,
        tone: "bg-[#FFF2D8] text-[#9A6D20]",
        hover: "hover:border-[#EBD5A7]",
    },
    {
        key: "daily-reports",
        title: "Daily Reports",
        description: "Review site reports, work and daily observations.",
        icon: ScrollText,
        tone: "bg-[#E7F2E8] text-[#368250]",
        hover: "hover:border-[#C5DFC9]",
    },
    {
        key: "delays",
        title: "Delay Reports",
        description: "Review reported delays and extension requests.",
        icon: Clock3,
        tone: "bg-[#FCE9E6] text-[#B45E52]",
        hover: "hover:border-[#EFCAC5]",
    },
    {
        key: "documents",
        title: "Project Documents",
        description: "Browse authorized project files and drawings.",
        icon: FileText,
        tone: "bg-[#F0EAF8] text-[#7C5BA4]",
        hover: "hover:border-[#D9C9EB]",
    },
];

function WorkspaceCard({ item, projectId }) {
    const Icon = item.icon;

    return (
        <Link
            to={`/supervisor/projects/${projectId}/${item.key}`}
            className={`group flex min-h-[155px] flex-col justify-between rounded-[21px] border border-[#E7DED2] bg-[#FFFDFA] p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_32px_rgba(33,30,26,0.08)] motion-reduce:transform-none ${item.hover}`}
        >
            <div className="flex items-start justify-between gap-3">
                <span
                    className={`flex h-13 w-13 items-center justify-center rounded-2xl p-3 transition-all duration-300 group-hover:rotate-[-5deg] group-hover:scale-105 motion-reduce:transform-none ${item.tone}`}
                >
                    <Icon size={24} strokeWidth={1.7} />
                </span>

                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F6F0E8] text-[#665E53] transition-colors group-hover:bg-[#211E1A] group-hover:text-white">
                    <ArrowUpRight size={18} />
                </span>
            </div>

            <div className="mt-5">
                <h3 className="text-base font-bold text-[#211E1A]">
                    {item.title}
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-[#817669]">
                    {item.description}
                </p>
            </div>
        </Link>
    );
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
// SUPERVISOR PROJECT OVERVIEW
// =====================================================

export default function SupervisorProjectOverview() {
    const { projectId } = useParams();

    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [imageFailed, setImageFailed] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setProject(null);
            setError("");
            setImageFailed(false);

            try {
                const data =
                    await projectApi.getProjectOverview(projectId);

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
        ? getMediaUrl(
            project.cover_image || project.category_image
        )
        : "";

    const supervisors = Array.isArray(project?.supervisors)
        ? project.supervisors
        : [];

    return (
        <div className="space-y-6 pb-8">
            {loading && (
                <LoadingScreen message="Loading project overview..." />
            )}

            {/* BREADCRUMB */}
            <nav className="flex flex-wrap items-center gap-2 text-xs text-[#817669]">
                <Link
                    to="/supervisor/dashboard"
                    className="hover:text-[#211E1A]"
                >
                    Dashboard
                </Link>
                <span>/</span>
                <Link
                    to="/supervisor/projects"
                    className="hover:text-[#211E1A]"
                >
                    My Projects
                </Link>
                <span>/</span>
                <span className="font-semibold text-[#211E1A]">
                    {project?.name || "Project Overview"}
                </span>
            </nav>

            {!loading && error && (
                <section className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] p-8 text-center">
                    <FolderKanban
                        size={38}
                        className="mx-auto text-[#938778]"
                    />

                    <p role="alert" className="mt-4 text-sm text-[#817669]">
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
            )}

            {!loading && project && (
                <>
                    {/* =====================================
              PROJECT HERO - ADMIN DESIGN LANGUAGE
              ===================================== */}

                    <section className="overflow-hidden rounded-[26px] border border-[#E7DED2] bg-[#FFFDFA]">
                        <div className="relative h-60 overflow-hidden bg-gradient-to-br from-[#D9C8B1] to-[#F1EADF] sm:h-80 lg:h-[390px]">
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

                            <div className="absolute bottom-4 left-4 rounded-xl bg-[#FFFDFA]/95 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#514232] shadow-sm backdrop-blur sm:bottom-6 sm:left-6">
                                {project.category_name || "Project"}
                            </div>
                        </div>

                        <div className="p-5 sm:p-7">
                            <Link
                                to="/supervisor/projects"
                                className="inline-flex items-center gap-2 text-xs font-semibold text-[#817669] transition-colors hover:text-[#211E1A]"
                            >
                                <ArrowLeft size={16} />
                                Back to My Projects
                            </Link>

                            <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#938778]">
                                        RARE / Project Overview
                                    </p>

                                    <h1 className="mt-2 break-words text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                                        {project.name}
                                    </h1>

                                    <p className="mt-3 flex items-start gap-2 text-sm text-[#817669]">
                                        <MapPin
                                            size={18}
                                            className="mt-0.5 shrink-0"
                                        />
                                        {project.location || "Location not provided"}
                                    </p>
                                </div>

                                <span
                                    className={`inline-flex shrink-0 items-center rounded-full px-4 py-2 text-xs font-bold ${statusClasses(project.status)}`}
                                >
                                    {statusLabel(project.status)}
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* =====================================
              PROJECT INFORMATION
              ===================================== */}

                    <section className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7">
                        <div>
                            <h2 className="text-lg font-bold text-[#211E1A]">
                                Project Information
                            </h2>
                            <p className="mt-1 text-xs text-[#817669]">
                                Client, location and project schedule
                            </p>
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <DetailCard
                                icon={Building2}
                                label="Client Name"
                                value={project.client_name}
                                tone="bg-[#E9F0FC] text-[#3565A5]"
                            />

                            <DetailCard
                                icon={MapPin}
                                label="Location"
                                value={project.location}
                                tone="bg-[#F1EADF] text-[#74614D]"
                            />

                            <DetailCard
                                icon={FolderKanban}
                                label="Category"
                                value={project.category_name}
                                tone="bg-[#F0EAF8] text-[#7C5BA4]"
                            />

                            <DetailCard
                                icon={CalendarDays}
                                label="Start Date"
                                value={formatDate(project.start_date)}
                                tone="bg-[#E7F2E8] text-[#368250]"
                            />

                            <DetailCard
                                icon={CalendarDays}
                                label="End Date"
                                value={formatDate(project.end_date)}
                                tone="bg-[#FFF2D8] text-[#9A6D20]"
                            />

                            <DetailCard
                                icon={ShieldCheck}
                                label="Status"
                                value={statusLabel(project.status)}
                                tone="bg-[#E9F0FC] text-[#3565A5]"
                            />
                        </div>
                    </section>

                    {/* =====================================
              PROJECT DESCRIPTION
              ===================================== */}

                    <section className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7">
                        <h2 className="text-lg font-bold text-[#211E1A]">
                            Project Description
                        </h2>

                        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#665E53]">
                            {project.description ||
                                "No project description has been added."}
                        </p>
                    </section>

                    {/* =====================================
              PROJECT WORKSPACE - CLICKABLE
              ===================================== */}

                    <section className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-bold text-[#211E1A]">
                                    Project Workspace
                                </h2>

                                <p className="mt-1 text-xs leading-6 text-[#817669]">
                                    Open project tasks, site reports, timelines,
                                    delays and documents.
                                </p>
                            </div>

                            <span className="rounded-full bg-[#F1EADF] px-3 py-2 text-xs font-bold text-[#665E53]">
                                Supervisor Access
                            </span>
                        </div>

                        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {workspaceItems.map((item) => (
                                <WorkspaceCard
                                    key={item.key}
                                    item={item}
                                    projectId={projectId}
                                />
                            ))}
                        </div>

                        <p className="mt-5 text-xs leading-6 text-[#938778]">
                            Manpower, material observations and site work
                            entries are recorded within Daily Reports.
                        </p>
                    </section>

                    {/* =====================================
              SUPERVISOR TEAM - READ ONLY
              ===================================== */}

                    <section className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7">
                        <div className="flex items-start gap-3">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F0EAF8] text-[#7C5BA4]">
                                <UsersRound size={23} />
                            </span>

                            <div>
                                <h2 className="text-lg font-bold text-[#211E1A]">
                                    Supervision Team
                                </h2>

                                <p className="mt-1 text-xs text-[#817669]">
                                    Supervisors assigned to this project
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-3 md:grid-cols-2">
                            {supervisors.map((item, index) => {
                                const name = getSupervisorName(item);
                                const phone = getSupervisorPhone(item);

                                return (
                                    <article
                                        key={item.id || item.supervisor || index}
                                        className="flex min-w-0 items-center gap-3 rounded-[18px] border border-[#EEE6DC] bg-[#FFFDFA] p-4"
                                    >
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#E9DFD1] text-lg font-bold text-[#665E53]">
                                            {name.charAt(0).toUpperCase()}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-bold text-[#211E1A]">
                                                {name}
                                            </p>

                                            <p className="mt-1 text-xs text-[#817669]">
                                                {phone || "Site Supervisor"}
                                            </p>
                                        </div>

                                        {phone && (
                                            <a
                                                href={`tel:${phone}`}
                                                aria-label={`Call ${name}`}
                                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F2E8] text-[#296F40] transition-colors hover:bg-[#D5EAD9]"
                                            >
                                                <Phone size={18} />
                                            </a>
                                        )}
                                    </article>
                                );
                            })}

                            {supervisors.length === 0 && (
                                <p className="rounded-xl bg-[#F8F4EE] p-5 text-sm text-[#817669] md:col-span-2">
                                    No supervision team details are available.
                                </p>
                            )}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
