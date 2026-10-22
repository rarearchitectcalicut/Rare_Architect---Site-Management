import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    ArrowLeft,
    ArrowUpRight,
    CalendarDays,
    Check,
    Clock3,
    FileText,
    Files,
    FolderKanban,
    ImageOff,
    ListTodo,
    Mail,
    MapPin,
    Phone,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    UserRound,
    UsersRound,
    X,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { supervisorApi } from "../../api/supervisorApi";
import { getMediaUrl } from "../../utils/mediaUrl";
import LoadingScreen from "../../components/LoadingScreen";

// =====================================================
// MOTION SYSTEM
// One orchestrated page-load sequence + hover feedback.
// Everything respects prefers-reduced-motion.
// =====================================================

const overviewCss = `
  @keyframes rare-rise {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes rare-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes rare-pop {
    from { opacity: 0; transform: translateY(10px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* "backwards" (not "both") so hover transforms still work after the intro */
  .rare-rise {
    animation: rare-rise 640ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: var(--d, 0ms);
  }

  .rare-fade {
    animation: rare-fade 250ms ease-out backwards;
    animation-delay: var(--d, 0ms);
  }

  .rare-pop {
    animation: rare-pop 320ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
  }

  @media (prefers-reduced-motion: reduce) {
    .rare-rise,
    .rare-fade,
    .rare-pop {
      animation: none !important;
    }
  }
`;

function OverviewStyles() {
    return <style>{overviewCss}</style>;
}

// Staggered delay helper (capped so late items never feel slow)
const stagger = (index, step = 70, max = 700) =>
    Math.min(index * step, max);

// Icon tile tones. Literal class strings so Tailwind can detect them.
const iconTones = {
    neutral:
        "bg-[#F1EADF] text-[#665E53] group-hover:bg-[#211E1A] group-hover:text-white",
    blue:
        "bg-[#E8F0FE] text-[#2563EB] group-hover:bg-[#2563EB] group-hover:text-white",
    green:
        "bg-[#E6F4EA] text-[#16A34A] group-hover:bg-[#16A34A] group-hover:text-white",
    orange:
        "bg-[#FFF3E0] text-[#EA8A12] group-hover:bg-[#EA8A12] group-hover:text-white",
    red:
        "bg-[#fde8e6] text-[#9e3535] group-hover:bg-[#9e3535] group-hover:text-white",
    violet:
        "bg-[#F1ECFE] text-[#7C3AED] group-hover:bg-[#7C3AED] group-hover:text-white",
    slate:
        "bg-[#ece8e2] text-[#72675b] group-hover:bg-[#72675b] group-hover:text-white",
};

// =====================================================
// HELPERS
// =====================================================

function formatDate(value) {
    if (!value) return "Not specified";

    const date = new Date(`${value}T00:00:00`);

    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
}

function getName(person) {
    return (
        person.supervisor_name ||
        [person.first_name, person.last_name]
            .filter(Boolean)
            .join(" ") ||
        person.username ||
        "Supervisor"
    );
}

function getListItems(response) {
    if (Array.isArray(response)) return response;

    if (Array.isArray(response?.results)) {
        return response.results;
    }

    throw new Error("Unexpected Supervisor API response.");
}

function InfoItem({ icon: Icon, label, value, tone = "neutral" }) {
    return (
        <div
            className="
                group -m-2 flex items-start gap-3 rounded-2xl p-2
                transition-colors duration-200
                hover:bg-[#F6F0E8]/70
            "
        >
            <span
                className={`
                    shrink-0 rounded-xl p-2.5 sm:p-3
                    transition-all duration-300 ease-out
                    group-hover:scale-105 group-hover:-rotate-3
                    motion-reduce:transition-none
                    motion-reduce:group-hover:transform-none
                    ${iconTones[tone] || iconTones.neutral}
                `}
            >
                <Icon size={19} strokeWidth={1.8} />
            </span>

            <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#938778]">
                    {label}
                </p>
                <p className="mt-1 wrap-break-word text-sm font-semibold text-[#211E1A]">
                    {value || "Not specified"}
                </p>
            </div>
        </div>
    );
}

// =====================================================
// ADD SUPERVISOR DIALOG
// =====================================================

function AddSupervisorDialog({
    open,
    onClose,
    assignedIds,
    onAssign,
    setBusyMessage,
}) {
    const [supervisors, setSupervisors] = useState([]);
    const [selected, setSelected] = useState([]);
    const [search, setSearch] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;

        let cancelled = false;

        async function loadSupervisors() {
            setError("");
            setSelected([]);
            setSearch("");
            setSupervisors([]);
            setBusyMessage("Loading supervisors...");

            try {
                const response = await supervisorApi.list();

                if (!cancelled) {
                    setSupervisors(getListItems(response));
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err.response?.status === 404
                            ? "Supervisor list endpoint was not found."
                            : "Unable to load supervisors. Please try again."
                    );
                }
            } finally {
                if (!cancelled) setBusyMessage("");
            }
        }

        loadSupervisors();

        return () => {
            cancelled = true;
        };
    }, [open, setBusyMessage]);

    if (!open) return null;

    const available = supervisors.filter(
        (person) =>
            !assignedIds.has(String(person.id)) &&
            person.is_active !== false
    );

    const filtered = available.filter((person) => {
        const text = [
            getName(person),
            person.phone,
            person.email,
            person.username,
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return text.includes(search.toLowerCase());
    });

    const toggle = (id) => {
        const key = String(id);

        setSelected((current) =>
            current.includes(key)
                ? current.filter((value) => value !== key)
                : [...current, key]
        );
    };

    const handleAssign = async () => {
        if (!selected.length) return;

        setError("");

        try {
            await onAssign(selected);
            onClose();
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(
                typeof detail === "string"
                    ? detail
                    : "Unable to assign supervisors."
            );
        }
    };

    return (
        <div
            className="rare-fade fixed inset-0 z-50 flex items-center justify-center bg-[#211E1A]/45 p-3 backdrop-blur-sm sm:p-4"
            role="presentation"
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-supervisor-title"
                className="rare-pop flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-[22px] bg-[#FFFDFA] shadow-2xl sm:rounded-[26px]"
            >
                <div className="flex items-start justify-between gap-3 border-b border-[#EEE6DC] p-4 sm:p-6">
                    <div className="min-w-0">
                        <h2
                            id="add-supervisor-title"
                            className="text-lg font-bold text-[#211E1A] sm:text-xl"
                        >
                            Assign Supervisors
                        </h2>
                        <p className="mt-1 text-sm text-[#817669]">
                            Select existing RARE Supervisor accounts.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="
                            group shrink-0 rounded-full bg-[#F1EADF] p-2 text-[#211E1A]
                            transition-all duration-200 ease-out
                            hover:bg-[#E7DED2]
                            active:scale-95
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-[#211E1A]/30
                        "
                    >
                        <X
                            size={19}
                            className="
                                transition-transform duration-300 ease-out
                                group-hover:rotate-90
                                motion-reduce:transition-none
                                motion-reduce:group-hover:rotate-0
                            "
                        />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    <div className="relative mb-4">
                        <Search
                            size={18}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#817669]"
                        />
                        <input
                            autoFocus
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search supervisor..."
                            className="
                                h-12 w-full rounded-xl border border-[#E4DCCD] bg-white
                                pl-10 pr-4 text-sm outline-none
                                transition-all duration-200
                                hover:border-[#CFC4B5]
                                focus:border-[#211E1A]
                                focus:shadow-[0_0_0_3px_rgba(33,30,26,0.08)]
                            "
                        />
                    </div>

                    {error && (
                        <p role="alert" className="mb-4 text-sm text-red-700">
                            {error}
                        </p>
                    )}

                    <div className="space-y-2">
                        {filtered.map((person) => {
                            const checked = selected.includes(String(person.id));

                            return (
                                <button
                                    key={person.id}
                                    type="button"
                                    aria-pressed={checked}
                                    onClick={() => toggle(person.id)}
                                    className={`
                                        group flex w-full items-center gap-3 rounded-xl border p-3 text-left
                                        transition-all duration-200 ease-out
                                        active:scale-[0.99]
                                        focus-visible:outline-none focus-visible:ring-2
                                        focus-visible:ring-[#211E1A]/30
                                        motion-reduce:transition-none
                                        ${checked
                                            ? "border-[#211E1A] bg-[#F1EADF]"
                                            : "border-[#E9E1D7] bg-white hover:border-[#CFC4B5] hover:bg-[#F6F0E8]/60"
                                        }
                                    `}
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E7DED2] text-sm font-bold text-[#211E1A] transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none">
                                        {getName(person).charAt(0).toUpperCase()}
                                    </span>

                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-[#211E1A]">
                                            {getName(person)}
                                        </span>
                                        <span className="block truncate text-xs text-[#817669]">
                                            {person.phone || person.email || ""}
                                        </span>
                                    </span>

                                    <span
                                        className={`
                                            flex h-5 w-5 shrink-0 items-center justify-center rounded-md border
                                            transition-all duration-200
                                            ${checked
                                                ? "scale-110 border-[#211E1A] bg-[#211E1A] text-white"
                                                : "border-[#CFC4B5] group-hover:border-[#211E1A]"
                                            }
                                        `}
                                    >
                                        {checked && <Check size={14} />}
                                    </span>
                                </button>
                            );
                        })}

                        {!filtered.length && (
                            <p className="py-8 text-center text-sm text-[#817669]">
                                No available supervisors found.
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-[#EEE6DC] p-4 sm:gap-3 sm:p-5">
                    <button
                        type="button"
                        onClick={onClose}
                        className="
                            flex-1 rounded-xl border border-[#E4DCCD] px-5 py-3
                            text-sm font-medium text-[#211E1A]
                            transition-all duration-200 ease-out
                            hover:border-[#CFC4B5] hover:bg-[#F6F0E8]
                            active:scale-[0.98]
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-[#211E1A]/30
                            sm:flex-none
                        "
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={handleAssign}
                        disabled={!selected.length}
                        className="
                            flex-1 rounded-xl bg-[#211E1A] px-5 py-3
                            text-sm font-semibold text-white
                            transition-all duration-200 ease-out
                            hover:-translate-y-0.5 hover:bg-[#39342D]
                            hover:shadow-[0_10px_24px_rgba(33,30,26,0.22)]
                            active:translate-y-0 active:scale-[0.98]
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-[#211E1A]/40 focus-visible:ring-offset-2
                            disabled:pointer-events-none disabled:opacity-40
                            motion-reduce:hover:translate-y-0
                            sm:flex-none
                        "
                    >
                        Assign ({selected.length})
                    </button>
                </div>
            </section>
        </div>
    );
}

// =====================================================
// ADMIN PROJECT OVERVIEW
// =====================================================

export default function ProjectOverview() {
    const { projectId } = useParams();

    const [project, setProject] = useState(null);
    const [loadingMessage, setLoadingMessage] = useState(
        "Loading project overview..."
    );
    const [error, setError] = useState("");
    const [retryKey, setRetryKey] = useState(0);

    const [showAssign, setShowAssign] = useState(false);
    const [removeTarget, setRemoveTarget] = useState(null);

    const loadProject = useCallback(async () => {
        setLoadingMessage("Loading project overview...");
        setError("");

        try {
            const data = await projectApi.getProjectOverview(projectId);
            setProject(data);
        } catch (err) {
            setError(
                err.response?.status === 404
                    ? "This project was not found."
                    : "Unable to load project details."
            );
        } finally {
            setLoadingMessage("");
        }
    }, [projectId]);

    useEffect(() => {
        loadProject();
    }, [loadProject, retryKey]);

    const assignSupervisors = async (ids) => {
        setLoadingMessage("Assigning supervisors...");

        try {
            await supervisorApi.assignToProject(projectId, ids);

            const updated = await projectApi.getProjectOverview(projectId);
            setProject(updated);
        } finally {
            setLoadingMessage("");
        }
    };

    const removeSupervisor = async () => {
        if (!removeTarget) return;

        setLoadingMessage("Removing supervisor...");

        try {
            await supervisorApi.removeFromProject(
                projectId,
                removeTarget.supervisor
            );

            const updated = await projectApi.getProjectOverview(projectId);

            setProject(updated);
            setRemoveTarget(null);
        } catch (err) {
            setError(
                err.response?.data?.detail ||
                "Unable to remove supervisor."
            );
            setRemoveTarget(null);
        } finally {
            setLoadingMessage("");
        }
    };

    const supervisors = project?.supervisors || [];

    const assignedIds = new Set(
        supervisors.map((item) => String(item.supervisor))
    );

    const coverUrl = getMediaUrl(project?.cover_image);

    return (
        <div className="space-y-6 pb-6 sm:space-y-7">
            <OverviewStyles />

            {loadingMessage && (
                <LoadingScreen message={loadingMessage} />
            )}

            {error && (
                <div
                    role="alert"
                    className="rare-rise rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    {error}
                    <button
                        type="button"
                        onClick={() => setRetryKey((n) => n + 1)}
                        className="
                            ml-4 rounded font-semibold underline
                            transition-opacity duration-200
                            hover:opacity-70
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-red-700/40
                        "
                    >
                        Retry
                    </button>
                </div>
            )}

            {!project ? null : (
                <>
                    {/* BREADCRUMB */}
                    <nav
                        className="rare-fade flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#817669]"
                    >
                        <Link
                            to="/admin/dashboard"
                            className="rounded transition-colors duration-200 hover:text-[#211E1A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#211E1A]/30"
                        >
                            Dashboard
                        </Link>
                        <span>/</span>
                        <Link
                            to={`/admin/categories/${project.category}`}
                            className="rounded transition-colors duration-200 hover:text-[#211E1A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#211E1A]/30"
                        >
                            {project.category_name}
                        </Link>
                        <span>/</span>
                        <span className="font-semibold text-[#211E1A]">
                            {project.name}
                        </span>
                    </nav>

                    {/* COVER */}
                    <section
                        className="rare-rise group/cover overflow-hidden rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] transition-shadow duration-300 hover:shadow-[0_14px_36px_rgba(33,30,26,0.08)] sm:rounded-[26px]"
                        style={{ "--d": `${stagger(1)}ms` }}
                    >
                        <div className="relative h-52 overflow-hidden bg-[#E9E0D4] sm:h-88 lg:h-107.5">
                            {coverUrl ? (
                                <img
                                    src={coverUrl}
                                    alt={project.name}
                                    className="
                                        h-full w-full object-cover
                                        transition-transform duration-700 ease-out
                                        group-hover/cover:scale-[1.03]
                                        motion-reduce:transition-none
                                        motion-reduce:group-hover/cover:scale-100
                                    "
                                />
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center gap-2 text-[#817669]">
                                    <ImageOff size={36} />
                                    No project cover image
                                </div>
                            )}
                        </div>

                        <div className="p-4 sm:p-8">
                            <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
                                <div className="min-w-0">
                                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#928577]">
                                        {project.category_name}
                                    </p>
                                    <h2 className="mt-2 wrap-break-word text-xl font-bold text-[#211E1A] sm:text-3xl">
                                        {project.name}
                                    </h2>
                                    <p className="mt-3 flex items-start gap-2 text-sm text-[#817669]">
                                        <MapPin size={17} className="mt-0.5 shrink-0" />
                                        <span className="min-w-0 wrap-break-word">
                                            {project.location || "Location not specified"}
                                        </span>
                                    </p>
                                </div>

                                <span className="shrink-0 rounded-full bg-[#E7F2E8] px-4 py-2 text-xs font-bold text-[#296F40]">
                                    {(project.status || "").replaceAll("_", " ")}
                                </span>
                            </div>

                            {project.description && (
                                <p className="mt-5 border-t border-[#EFE8DE] pt-5 text-sm leading-7 text-[#665E53] sm:mt-6">
                                    {project.description}
                                </p>
                            )}
                        </div>
                    </section>

                    {/* INFORMATION */}
                    <section
                        className="rare-rise rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] p-4 transition-shadow duration-300 hover:shadow-[0_10px_30px_rgba(33,30,26,0.05)] sm:rounded-3xl sm:p-7"
                        style={{ "--d": `${stagger(2)}ms` }}
                    >
                        <h2 className="mb-5 text-lg font-bold text-[#211E1A] sm:mb-6">
                            Project Information
                        </h2>

                        <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
                            <InfoItem
                                icon={UserRound}
                                tone="blue"
                                label="Client"
                                value={project.client_name}
                            />
                            <InfoItem
                                icon={FolderKanban}
                                tone="violet"
                                label="Category"
                                value={project.category_name}
                            />
                            <InfoItem
                                icon={CalendarDays}
                                tone="green"
                                label="Start Date"
                                value={formatDate(project.start_date)}
                            />
                            <InfoItem
                                icon={CalendarDays}
                                tone="orange"
                                label="Expected Completion"
                                value={formatDate(project.end_date)}
                            />
                            <InfoItem
                                icon={UsersRound}
                                tone="blue"
                                label="Supervisors"
                                value={String(supervisors.length)}
                            />
                            <InfoItem
                                icon={Clock3}
                                tone="slate"
                                label="Status"
                                value={(project.status || "").replaceAll("_", " ")}
                            />
                        </div>
                    </section>

                    {/* PROJECT WORKSPACE */}
                    <section>
                        <h2 className="mb-4 text-lg font-bold text-[#211E1A] sm:text-xl">
                            Project Workspace
                        </h2>

                        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                            {[
                                { name: "Tasks", icon: ListTodo, path: "tasks", tone: "blue" },
                                { name: "Daily Reports", icon: FileText, path: "reports", tone: "green" },
                                { name: "Documents", icon: Files, path: "documents", tone: "violet" },
                                { name: "Delays", icon: Clock3, path: "delays", tone: "orange" },
                            ].map((section, index) => {
                                const Icon = section.icon;

                                return (
                                    <div
                                        key={section.path}
                                        className="rare-rise h-full min-w-0"
                                        style={{ "--d": `${stagger(3 + index)}ms` }}
                                    >
                                        <Link
                                            to={`/admin/${section.path}?project=${projectId}`}
                                            className="
                                                group block h-full rounded-[18px] border border-[#E7DED2]
                                                bg-[#FFFDFA] p-4
                                                transition-all duration-300 ease-out
                                                hover:-translate-y-1 hover:border-[#D9CCBA]
                                                hover:shadow-[0_14px_34px_rgba(33,30,26,0.08)]
                                                active:translate-y-0 active:scale-[0.99]
                                                focus-visible:outline-none focus-visible:ring-2
                                                focus-visible:ring-[#211E1A]/30
                                                motion-reduce:transition-none
                                                motion-reduce:hover:translate-y-0
                                                sm:rounded-[20px] sm:p-5
                                            "
                                        >
                                            <span
                                                className={`
                                                    inline-flex rounded-xl p-2.5
                                                    transition-all duration-300 ease-out
                                                    group-hover:scale-110 group-hover:-rotate-6
                                                    motion-reduce:transition-none
                                                    motion-reduce:group-hover:transform-none
                                                    ${iconTones[section.tone]}
                                                `}
                                            >
                                                <Icon size={22} strokeWidth={1.8} />
                                            </span>

                                            <div className="mt-4 flex items-center justify-between gap-2 sm:mt-5">
                                                <span className="min-w-0 text-sm font-bold text-[#211E1A]">
                                                    {section.name}
                                                </span>
                                                <ArrowUpRight
                                                    size={17}
                                                    className="
                                                        shrink-0 text-[#665E53]
                                                        transition-all duration-300 ease-out
                                                        group-hover:-translate-y-0.5 group-hover:translate-x-0.5
                                                        group-hover:text-[#211E1A]
                                                        motion-reduce:transition-none
                                                        motion-reduce:group-hover:transform-none
                                                    "
                                                />
                                            </div>
                                        </Link>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* ASSIGNED SUPERVISORS */}
                    <section
                        className="rare-rise rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:rounded-3xl sm:p-7"
                        style={{ "--d": `${stagger(7)}ms` }}
                    >
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
                            <div className="min-w-0">
                                <h2 className="text-lg font-bold text-[#211E1A] sm:text-xl">
                                    Assigned Supervisors
                                </h2>
                                <p className="mt-1 text-sm text-[#817669]">
                                    {supervisors.length} assigned to this project
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowAssign(true)}
                                className="
                                    group flex items-center gap-2 rounded-xl bg-[#211E1A]
                                    px-4 py-3 text-sm font-semibold text-white
                                    transition-all duration-200 ease-out
                                    hover:-translate-y-0.5 hover:bg-[#39342D]
                                    hover:shadow-[0_10px_24px_rgba(33,30,26,0.22)]
                                    active:translate-y-0 active:scale-[0.98]
                                    focus-visible:outline-none focus-visible:ring-2
                                    focus-visible:ring-[#211E1A]/40 focus-visible:ring-offset-2
                                    motion-reduce:transition-none
                                    motion-reduce:hover:translate-y-0
                                "
                            >
                                <Plus
                                    size={18}
                                    className="
                                        transition-transform duration-300 ease-out
                                        group-hover:rotate-90
                                        motion-reduce:transition-none
                                        motion-reduce:group-hover:rotate-0
                                    "
                                />
                                Add Supervisor
                            </button>
                        </div>

                        {!supervisors.length ? (
                            <div className="rare-fade rounded-xl bg-[#F6F0E8] px-5 py-10 text-center sm:py-12">
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0FE] text-[#2563EB]">
                                    <UsersRound size={28} strokeWidth={1.7} />
                                </div>
                                <p className="mt-3 text-sm text-[#817669]">
                                    No supervisors assigned yet.
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-3 xl:grid-cols-2">
                                {supervisors.map((item, index) => {
                                    const name = getName(item);

                                    return (
                                        <article
                                            key={item.id}
                                            className="
                                                rare-rise group min-w-0 rounded-[18px]
                                                border border-[#EAE1D7] bg-[#FFFDFA] p-4
                                                transition-all duration-300 ease-out
                                                hover:-translate-y-0.5 hover:border-[#D9CCBA]
                                                hover:shadow-[0_12px_30px_rgba(33,30,26,0.07)]
                                                motion-reduce:transition-none
                                                motion-reduce:hover:translate-y-0
                                                sm:rounded-[20px]
                                            "
                                            style={{ "--d": `${stagger(8 + index)}ms` }}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div
                                                    className="
                                                        flex h-12 w-12 shrink-0 items-center justify-center
                                                        rounded-full bg-[#E9DFD1] text-lg font-bold text-[#211E1A]
                                                        transition-transform duration-300 ease-out
                                                        group-hover:scale-105
                                                        motion-reduce:transition-none
                                                        motion-reduce:group-hover:scale-100
                                                    "
                                                >
                                                    {name.charAt(0).toUpperCase()}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <p className="wrap-break-word font-bold text-[#211E1A]">
                                                        {name}
                                                    </p>
                                                    <p className="mt-1 text-xs text-[#817669]">
                                                        Site Supervisor
                                                    </p>
                                                    <p className="mt-2 text-sm text-[#665E53]">
                                                        {item.supervisor_phone || "No phone number"}
                                                    </p>
                                                    {item.supervisor_email && (
                                                        <a
                                                            href={`mailto:${item.supervisor_email}`}
                                                            className="mt-1 block break-all text-xs text-[#817669] transition-colors duration-200 hover:text-[#2563EB] hover:underline"
                                                        >
                                                            <Mail size={13} className="mr-1 inline" />
                                                            {item.supervisor_email}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mt-4 flex items-center gap-2 border-t border-[#F0E9DF] pt-4">
                                                {item.supervisor_phone ? (
                                                    <a
                                                        href={`tel:${item.supervisor_phone}`}
                                                        className="
                                                            group/call flex flex-1 items-center justify-center gap-2
                                                            rounded-xl bg-[#E7F2E8] px-3 py-3
                                                            text-sm font-semibold text-[#296F40]
                                                            transition-all duration-200 ease-out
                                                            hover:bg-[#D6EAD9]
                                                            hover:shadow-[0_6px_16px_rgba(41,111,64,0.15)]
                                                            active:scale-[0.98]
                                                            focus-visible:outline-none focus-visible:ring-2
                                                            focus-visible:ring-[#296F40]/40
                                                        "
                                                    >
                                                        <Phone
                                                            size={17}
                                                            className="
                                                                transition-transform duration-300 ease-out
                                                                group-hover/call:-rotate-12 group-hover/call:scale-110
                                                                motion-reduce:transition-none
                                                                motion-reduce:group-hover/call:transform-none
                                                            "
                                                        />
                                                        Call
                                                    </a>
                                                ) : (
                                                    <span className="flex-1 text-center text-xs text-[#817669]">
                                                        No number
                                                    </span>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => setRemoveTarget(item)}
                                                    aria-label={`Remove ${name}`}
                                                    className="
                                                        group/del flex items-center justify-center rounded-xl
                                                        border border-red-200 p-3 text-red-600
                                                        transition-all duration-200 ease-out
                                                        hover:border-red-300 hover:bg-red-50
                                                        active:scale-95
                                                        focus-visible:outline-none focus-visible:ring-2
                                                        focus-visible:ring-red-600/40
                                                    "
                                                >
                                                    <Trash2
                                                        size={18}
                                                        className="
                                                            transition-transform duration-200 ease-out
                                                            group-hover/del:scale-110
                                                            motion-reduce:transition-none
                                                            motion-reduce:group-hover/del:scale-100
                                                        "
                                                    />
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </>
            )}

            {/* ADD SUPERVISOR */}
            <AddSupervisorDialog
                open={showAssign}
                onClose={() => setShowAssign(false)}
                assignedIds={assignedIds}
                onAssign={assignSupervisors}
                setBusyMessage={setLoadingMessage}
            />

            {/* REMOVE CONFIRMATION */}
            {removeTarget && (
                <div className="rare-fade fixed inset-0 z-50 flex items-center justify-center bg-[#211E1A]/45 p-3 backdrop-blur-sm sm:p-4">
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="remove-supervisor-title"
                        className="rare-pop w-full max-w-md rounded-[22px] bg-[#FFFDFA] p-5 shadow-2xl sm:rounded-3xl sm:p-6"
                    >
                        <div className="flex items-start gap-3">
                            <span className="shrink-0 rounded-xl bg-[#fde8e6] p-2.5 text-[#9e3535]">
                                <Trash2 size={20} strokeWidth={1.8} />
                            </span>

                            <div className="min-w-0">
                                <h2
                                    id="remove-supervisor-title"
                                    className="text-lg font-bold text-[#211E1A] sm:text-xl"
                                >
                                    Remove Supervisor?
                                </h2>

                                <p className="mt-2 text-sm leading-6 text-[#817669]">
                                    Remove {getName(removeTarget)} from this project?
                                    They will lose access to this project's records.
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2 sm:gap-3">
                            <button
                                type="button"
                                onClick={() => setRemoveTarget(null)}
                                className="
                                    flex-1 rounded-xl border border-[#E4DCCD] px-4 py-3
                                    text-sm font-semibold
                                    transition-all duration-200 ease-out
                                    hover:border-[#CFC4B5] hover:bg-[#F6F0E8]
                                    active:scale-[0.98]
                                    focus-visible:outline-none focus-visible:ring-2
                                    focus-visible:ring-[#211E1A]/30
                                    sm:flex-none
                                "
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={removeSupervisor}
                                className="
                                    flex-1 rounded-xl bg-red-700 px-4 py-3
                                    text-sm font-semibold text-white
                                    transition-all duration-200 ease-out
                                    hover:-translate-y-0.5 hover:bg-red-800
                                    hover:shadow-[0_10px_24px_rgba(185,28,28,0.28)]
                                    active:translate-y-0 active:scale-[0.98]
                                    focus-visible:outline-none focus-visible:ring-2
                                    focus-visible:ring-red-700/40 focus-visible:ring-offset-2
                                    motion-reduce:hover:translate-y-0
                                    sm:flex-none
                                "
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}