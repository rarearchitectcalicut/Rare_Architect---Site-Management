
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

function InfoItem({ icon: Icon, label, value }) {
    return (
        <div className="flex items-start gap-3">
            <span className="rounded-xl bg-[#F1EADF] p-3 text-[#665E53]">
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#211E1A]/45 p-4 backdrop-blur-sm"
            role="presentation"
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-supervisor-title"
                className="flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-[26px] bg-[#FFFDFA] shadow-2xl"
            >
                <div className="flex items-start justify-between border-b border-[#EEE6DC] p-5 sm:p-6">
                    <div>
                        <h2
                            id="add-supervisor-title"
                            className="text-xl font-bold text-[#211E1A]"
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
                        className="rounded-full bg-[#F1EADF] p-2 text-[#211E1A]"
                    >
                        <X size={19} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
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
                            className="h-12 w-full rounded-xl border border-[#E4DCCD] bg-white pl-10 pr-4 text-sm outline-none focus:border-[#211E1A]"
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
                                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${checked
                                            ? "border-[#211E1A] bg-[#F1EADF]"
                                            : "border-[#E9E1D7] bg-white"
                                        }`}
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E7DED2] text-sm font-bold text-[#211E1A]">
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

                                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked
                                            ? "border-[#211E1A] bg-[#211E1A] text-white"
                                            : "border-[#CFC4B5]"
                                        }`}>
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

                <div className="flex items-center justify-end gap-3 border-t border-[#EEE6DC] p-5">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-[#E4DCCD] px-5 py-3 text-sm font-medium text-[#211E1A]"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={handleAssign}
                        disabled={!selected.length}
                        className="rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
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
        <div className="space-y-7 pb-6">
            {loadingMessage && (
                <LoadingScreen message={loadingMessage} />
            )}

            {error && (
                <div
                    role="alert"
                    className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    {error}
                    <button
                        type="button"
                        onClick={() => setRetryKey((n) => n + 1)}
                        className="ml-4 font-semibold underline"
                    >
                        Retry
                    </button>
                </div>
            )}

            {!project ? null : (
                <>
                    {/* BREADCRUMB */}
                    <nav className="flex flex-wrap items-center gap-2 text-xs text-[#817669]">
                        <Link to="/admin/dashboard">Dashboard</Link>
                        <span>/</span>
                        <Link to={`/admin/categories/${project.category}`}>
                            {project.category_name}
                        </Link>
                        <span>/</span>
                        <span className="font-semibold text-[#211E1A]">
                            {project.name}
                        </span>
                    </nav>

                    {/* COVER */}
                    <section className="overflow-hidden rounded-[26px] border border-[#E7DED2] bg-[#FFFDFA]">
                        <div className="relative h-60 bg-[#E9E0D4] sm:h-88 lg:h-107.5">
                            {coverUrl ? (
                                <img
                                    src={coverUrl}
                                    alt={project.name}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center gap-2 text-[#817669]">
                                    <ImageOff size={36} />
                                    No project cover image
                                </div>
                            )}
                        </div>

                        <div className="p-5 sm:p-8">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#928577]">
                                        {project.category_name}
                                    </p>
                                    <h2 className="mt-2 text-2xl font-bold text-[#211E1A] sm:text-3xl">
                                        {project.name}
                                    </h2>
                                    <p className="mt-3 flex items-center gap-2 text-sm text-[#817669]">
                                        <MapPin size={17} />
                                        {project.location || "Location not specified"}
                                    </p>
                                </div>

                                <span className="rounded-full bg-[#E7F2E8] px-4 py-2 text-xs font-bold text-[#296F40]">
                                    {(project.status || "").replaceAll("_", " ")}
                                </span>
                            </div>

                            {project.description && (
                                <p className="mt-6 border-t border-[#EFE8DE] pt-5 text-sm leading-7 text-[#665E53]">
                                    {project.description}
                                </p>
                            )}
                        </div>
                    </section>

                    {/* INFORMATION */}
                    <section className="rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7">
                        <h2 className="mb-6 text-lg font-bold text-[#211E1A]">
                            Project Information
                        </h2>

                        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                            <InfoItem
                                icon={UserRound}
                                label="Client"
                                value={project.client_name}
                            />
                            <InfoItem
                                icon={FolderKanban}
                                label="Category"
                                value={project.category_name}
                            />
                            <InfoItem
                                icon={CalendarDays}
                                label="Start Date"
                                value={formatDate(project.start_date)}
                            />
                            <InfoItem
                                icon={CalendarDays}
                                label="Expected Completion"
                                value={formatDate(project.end_date)}
                            />
                            <InfoItem
                                icon={UsersRound}
                                label="Supervisors"
                                value={String(supervisors.length)}
                            />
                            <InfoItem
                                icon={Clock3}
                                label="Status"
                                value={(project.status || "").replaceAll("_", " ")}
                            />
                        </div>
                    </section>

                    {/* PROJECT WORKSPACE */}
                    <section>
                        <h2 className="mb-4 text-xl font-bold text-[#211E1A]">
                            Project Workspace
                        </h2>

                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            {[
                                { name: "Tasks", icon: ListTodo, path: "tasks" },
                                { name: "Daily Reports", icon: FileText, path: "reports" },
                                { name: "Documents", icon: Files, path: "documents" },
                                { name: "Delays", icon: Clock3, path: "delays" },
                            ].map((section) => {
                                const Icon = section.icon;

                                return (
                                    <Link
                                        key={section.path}
                                        to={`/admin/${section.path}?project=${projectId}`}
                                        className="group rounded-[20px] border border-[#E7DED2] bg-[#FFFDFA] p-5 hover:shadow-lg"
                                    >
                                        <Icon size={23} className="text-[#211E1A]" />
                                        <div className="mt-5 flex items-center justify-between">
                                            <span className="text-sm font-bold text-[#211E1A]">
                                                {section.name}
                                            </span>
                                            <ArrowUpRight size={17} />
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>

                    {/* ASSIGNED SUPERVISORS */}
                    <section className="rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7">
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-bold text-[#211E1A]">
                                    Assigned Supervisors
                                </h2>
                                <p className="mt-1 text-sm text-[#817669]">
                                    {supervisors.length} assigned to this project
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowAssign(true)}
                                className="flex items-center gap-2 rounded-xl bg-[#211E1A] px-4 py-3 text-sm font-semibold text-white hover:bg-[#39342D]"
                            >
                                <Plus size={18} />
                                Add Supervisor
                            </button>
                        </div>

                        {!supervisors.length ? (
                            <div className="rounded-xl bg-[#F6F0E8] px-5 py-12 text-center">
                                <UsersRound
                                    size={32}
                                    className="mx-auto text-[#817669]"
                                />
                                <p className="mt-3 text-sm text-[#817669]">
                                    No supervisors assigned yet.
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-3 xl:grid-cols-2">
                                {supervisors.map((item) => {
                                    const name = getName(item);

                                    return (
                                        <article
                                            key={item.id}
                                            className="rounded-[20px] border border-[#EAE1D7] bg-[#FFFDFA] p-4"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#E9DFD1] text-lg font-bold text-[#211E1A]">
                                                    {name.charAt(0).toUpperCase()}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <p className="font-bold text-[#211E1A]">
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
                                                            className="mt-1 block break-all text-xs text-[#817669] hover:underline"
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
                                                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#E7F2E8] px-3 py-3 text-sm font-semibold text-[#296F40] hover:bg-[#D6EAD9]"
                                                    >
                                                        <Phone size={17} />
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
                                                    className="flex items-center justify-center rounded-xl border border-red-200 p-3 text-red-600 hover:bg-red-50"
                                                >
                                                    <Trash2 size={18} />
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#211E1A]/45 p-4 backdrop-blur-sm">
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="remove-supervisor-title"
                        className="w-full max-w-md rounded-3xl bg-[#FFFDFA] p-6 shadow-2xl"
                    >
                        <h2
                            id="remove-supervisor-title"
                            className="text-xl font-bold text-[#211E1A]"
                        >
                            Remove Supervisor?
                        </h2>

                        <p className="mt-3 text-sm leading-6 text-[#817669]">
                            Remove {getName(removeTarget)} from this project?
                            They will lose access to this project's records.
                        </p>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setRemoveTarget(null)}
                                className="rounded-xl border border-[#E4DCCD] px-4 py-3 text-sm font-semibold"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={removeSupervisor}
                                className="rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white"
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
