
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    ArrowLeft,
    ArrowUpRight,
    CalendarDays,
    Check,
    CheckCircle2,
    Eye,
    EyeOff,
    FolderKanban,
    ImageOff,
    KeyRound,
    LockKeyhole,
    Mail,
    MapPin,
    Pencil,
    Phone,
    RefreshCw,
    Save,
    ShieldCheck,
    ShieldOff,
    UserRound,
    UsersRound,
    X,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { supervisorApi } from "../../api/supervisorApi";
import { getMediaUrl } from "../../utils/mediaUrl";
import LoadingScreen from "../../components/LoadingScreen";

import {
    formatAccountDate,
    getApiError,
    getFieldErrors,
    getItems,
    supervisorName,
} from "../../utils/supervisorHelpers";

// =====================================================
// STYLES
// =====================================================

const inputClass = `
  h-12 w-full rounded-xl
  border border-[#E4DCCD]
  bg-[#FFFDFA] px-4
  text-sm text-[#211E1A]
  outline-none
  transition-all duration-200
  placeholder:text-[#A99D8E]
  focus:border-[#B7A58E]
  focus:ring-4 focus:ring-[#E8DDD0]/60
  disabled:opacity-50
`;

const darkButton = `
  inline-flex items-center justify-center gap-2
  rounded-xl bg-[#211E1A] px-4 py-3
  text-sm font-semibold text-white
  transition-all duration-200
  hover:-translate-y-0.5
  hover:bg-[#39332B]
  hover:shadow-[0_8px_20px_rgba(33,30,26,0.15)]
  active:translate-y-0
  disabled:pointer-events-none disabled:opacity-50
  motion-reduce:transform-none
`;

const outlineButton = `
  inline-flex items-center justify-center gap-2
  rounded-xl border border-[#E3D8CB]
  bg-[#FFFDFA] px-4 py-3
  text-sm font-semibold text-[#211E1A]
  transition-all duration-200
  hover:border-[#C8B8A6]
  hover:bg-[#F7F1E9]
  disabled:pointer-events-none disabled:opacity-50
`;

const editableFields = [
    {
        key: "first_name",
        label: "First Name",
        type: "text",
        autoComplete: "given-name",
    },
    {
        key: "last_name",
        label: "Last Name",
        type: "text",
        autoComplete: "family-name",
    },
    {
        key: "username",
        label: "Username",
        type: "text",
        autoComplete: "off",
    },
    {
        key: "phone",
        label: "Phone Number",
        type: "tel",
        autoComplete: "tel",
    },
    {
        key: "email",
        label: "Email Address",
        type: "email",
        autoComplete: "email",
    },
];

// =====================================================
// HELPERS
// =====================================================

function editableValues(data) {
    return {
        first_name: data?.first_name || "",
        last_name: data?.last_name || "",
        username: data?.username || "",
        phone: data?.phone || "",
        email: data?.email || "",
    };
}

function validateProfile(values) {
    const errors = {};

    for (const field of editableFields) {
        if (!String(values[field.key] || "").trim()) {
            errors[field.key] = `${field.label} is required.`;
        }
    }

    if (
        values.phone &&
        !/^\+?[0-9]{10,15}$/.test(values.phone.trim())
    ) {
        errors.phone = "Enter a valid phone number.";
    }

    if (
        values.email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())
    ) {
        errors.email = "Enter a valid email address.";
    }

    if (
        values.username &&
        !/^[a-zA-Z0-9_.@+-]+$/.test(values.username.trim())
    ) {
        errors.username =
            "Only letters, numbers and _.@+- are allowed.";
    }

    return errors;
}

function getAssignmentSupervisorId(assignment) {
    const candidate =
        assignment?.supervisor ??
        assignment?.supervisor_id;

    if (candidate && typeof candidate === "object") {
        return candidate.id;
    }

    return candidate;
}

function statusLabel(status) {
    return String(status || "UNKNOWN")
        .replaceAll("_", " ");
}

// =====================================================
// FETCH SUPERVISOR'S ASSIGNED PROJECTS
// =====================================================

async function loadAssignedProjects(supervisorId) {
    const allProjects = [];
    let page = 1;
    let next = true;

    // ProjectPagination is used by the backend.
    // A cap prevents accidental infinite pagination.
    while (next && page <= 500) {
        const response = await projectApi.getProjects({ page });

        allProjects.push(...getItems(response));

        next = Array.isArray(response)
            ? false
            : Boolean(response?.next);

        page += 1;
    }

    if (next) {
        throw new Error("Project pagination did not finish.");
    }

    const assigned = [];

    // Check assignment endpoints in small batches to
    // avoid flooding the Django backend.
    for (let index = 0; index < allProjects.length; index += 5) {
        const batch = allProjects.slice(index, index + 5);

        const results = await Promise.all(
            batch.map(async (project) => {
                const response =
                    await supervisorApi.getProjectSupervisors(project.id);

                const assignments = getItems(response);

                const matches = assignments.some(
                    (assignment) =>
                        String(getAssignmentSupervisorId(assignment)) ===
                        String(supervisorId)
                );

                return matches ? project : null;
            })
        );

        assigned.push(...results.filter(Boolean));
    }

    return assigned;
}

// =====================================================
// PREMIUM ICON TILE
// =====================================================

function IconTile({ icon: Icon, tone = "sand" }) {
    const tones = {
        sand: "bg-[#F1EADF] text-[#74614D] group-hover:bg-[#E5D7C4]",
        blue: "bg-[#E9F0FC] text-[#3565A5] group-hover:bg-[#D9E7FA]",
        green: "bg-[#E8F3E9] text-[#368250] group-hover:bg-[#D8EBDC]",
        violet: "bg-[#F0EAF8] text-[#7C5BA4] group-hover:bg-[#E7DCF5]",
        rose: "bg-[#FAEBE8] text-[#B45E52] group-hover:bg-[#F5DED9]",
    };

    return (
        <span
            className={`
        flex h-12 w-12 shrink-0 items-center
        justify-center rounded-2xl
        transition-all duration-300
        group-hover:-translate-y-0.5
        group-hover:-rotate-3
        group-hover:shadow-sm
        motion-reduce:transform-none
        ${tones[tone]}
      `}
        >
            <Icon size={22} strokeWidth={1.8} />
        </span>
    );
}

// =====================================================
// CONFIRMATION MODAL
// =====================================================

function ConfirmModal({
    title,
    description,
    confirmLabel,
    danger = false,
    onConfirm,
    onClose,
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#211E1A]/55 p-4 backdrop-blur-sm">
            <section
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby="confirm-description"
                className="w-full max-w-md rounded-[26px] bg-[#FFFDFA] p-6 shadow-2xl"
            >
                <h2
                    id="confirm-title"
                    className="text-xl font-bold text-[#211E1A]"
                >
                    {title}
                </h2>

                <p
                    id="confirm-description"
                    className="mt-3 text-sm leading-6 text-[#716658]"
                >
                    {description}
                </p>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className={outlineButton}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={onConfirm}
                        className={
                            danger
                                ? "rounded-xl bg-[#B5473E] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#97382F]"
                                : darkButton
                        }
                    >
                        {confirmLabel}
                    </button>
                </div>
            </section>
        </div>
    );
}

// =====================================================
// CHANGE PASSWORD MODAL
// =====================================================

function ChangePasswordModal({
    open,
    supervisorName: name,
    onClose,
    onSave,
}) {
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const savingRef = useRef(false);
    const dialogRef = useRef(null);

    useEffect(() => {
        if (!open) return;

        setNewPassword("");
        setConfirmPassword("");
        setShowNew(false);
        setShowConfirm(false);
        setErrors({});

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (event) => {
            if (event.key === "Escape" && !savingRef.current) {
                onClose();
            }

            if (event.key !== "Tab" || !dialogRef.current) return;

            const elements = Array.from(
                dialogRef.current.querySelectorAll(
                    "button:not([disabled]), input:not([disabled])"
                )
            );

            if (!elements.length) return;

            const first = elements[0];
            const last = elements[elements.length - 1];

            if (
                event.shiftKey &&
                document.activeElement === first
            ) {
                event.preventDefault();
                last.focus();
            } else if (
                !event.shiftKey &&
                document.activeElement === last
            ) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", onKeyDown);

        return () =>
            document.removeEventListener("keydown", onKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (savingRef.current) return;

        const nextErrors = {};

        if (!newPassword) {
            nextErrors.new_password = "New password is required.";
        } else if (newPassword.length < 8) {
            nextErrors.new_password =
                "Password must contain at least 8 characters.";
        }

        if (!confirmPassword) {
            nextErrors.confirm_password =
                "Confirm the new password.";
        } else if (newPassword !== confirmPassword) {
            nextErrors.confirm_password =
                "Passwords do not match.";
        }

        if (Object.keys(nextErrors).length) {
            setErrors(nextErrors);
            return;
        }

        savingRef.current = true;
        setSaving(true);
        setErrors({});

        try {
            await onSave({
                new_password: newPassword,
                confirm_password: confirmPassword,
            });

            setNewPassword("");
            setConfirmPassword("");
            onClose();
        } catch (error) {
            const data = error.response?.data || {};

            const fieldError = (value) =>
                Array.isArray(value)
                    ? value.join(" ")
                    : typeof value === "string"
                        ? value
                        : "";

            setErrors({
                new_password: fieldError(data.new_password),
                confirm_password: fieldError(data.confirm_password),
                general:
                    fieldError(data.detail) ||
                    fieldError(data.non_field_errors) ||
                    (
                        !data.new_password && !data.confirm_password
                            ? "Unable to update the password. Please try again."
                            : ""
                    ),
            });
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    return (
        <>
            {saving && (
                <LoadingScreen message="Updating supervisor password..." />
            )}

            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-[#211E1A]/55 p-3 backdrop-blur-sm sm:p-6"
                onMouseDown={(event) => {
                    if (
                        event.target === event.currentTarget &&
                        !savingRef.current
                    ) {
                        onClose();
                    }
                }}
            >
                <section
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="password-modal-title"
                    className="w-full max-w-127.5 overflow-hidden rounded-[26px] border border-[#E7DED2] bg-[#FFFDFA] shadow-[0_24px_70px_rgba(33,30,26,0.25)]"
                >
                    <div className="flex items-start justify-between gap-4 border-b border-[#EEE6DC] p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F0EAF8] text-[#7C5BA4]">
                                <KeyRound size={23} />
                            </span>

                            <div>
                                <h2
                                    id="password-modal-title"
                                    className="text-xl font-bold text-[#211E1A]"
                                >
                                    Change Password
                                </h2>

                                <p className="mt-1 text-xs leading-5 text-[#716658]">
                                    Set a new password for {name}.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            aria-label="Close password modal"
                            className="rounded-full bg-[#F1EADF] p-2 text-[#211E1A] hover:bg-[#E6DBCC] disabled:opacity-50"
                        >
                            <X size={19} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} noValidate>
                        <div className="space-y-5 p-5 sm:p-6">
                            <div className="flex items-start gap-3 rounded-xl bg-[#F5EFE7] p-4">
                                <LockKeyhole
                                    size={19}
                                    className="mt-0.5 shrink-0 text-[#716658]"
                                />
                                <p className="text-xs leading-6 text-[#665E53]">
                                    As an Admin, you can set a new Supervisor
                                    password without entering their current password.
                                </p>
                            </div>

                            <div>
                                <label
                                    htmlFor="supervisor-new-password"
                                    className="text-sm font-semibold text-[#665E53]"
                                >
                                    New Password
                                    <span className="ml-1 text-red-600">*</span>
                                </label>

                                <div className="relative mt-2">
                                    <input
                                        id="supervisor-new-password"
                                        type={showNew ? "text" : "password"}
                                        autoComplete="new-password"
                                        value={newPassword}
                                        onChange={(event) => {
                                            setNewPassword(event.target.value);
                                            setErrors((previous) => ({
                                                ...previous,
                                                new_password: "",
                                            }));
                                        }}
                                        disabled={saving}
                                        aria-invalid={Boolean(errors.new_password)}
                                        placeholder="Enter new password"
                                        className={`${inputClass} pr-12`}
                                    />

                                    <button
                                        type="button"
                                        aria-label={
                                            showNew ? "Hide new password" : "Show new password"
                                        }
                                        onClick={() => setShowNew((value) => !value)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#716658] hover:bg-[#F1EADF]"
                                    >
                                        {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>

                                {errors.new_password && (
                                    <p role="alert" className="mt-2 text-xs text-red-700">
                                        {errors.new_password}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label
                                    htmlFor="supervisor-confirm-password"
                                    className="text-sm font-semibold text-[#665E53]"
                                >
                                    Confirm New Password
                                    <span className="ml-1 text-red-600">*</span>
                                </label>

                                <div className="relative mt-2">
                                    <input
                                        id="supervisor-confirm-password"
                                        type={showConfirm ? "text" : "password"}
                                        autoComplete="new-password"
                                        value={confirmPassword}
                                        onChange={(event) => {
                                            setConfirmPassword(event.target.value);
                                            setErrors((previous) => ({
                                                ...previous,
                                                confirm_password: "",
                                            }));
                                        }}
                                        disabled={saving}
                                        aria-invalid={Boolean(errors.confirm_password)}
                                        placeholder="Re-enter new password"
                                        className={`${inputClass} pr-12`}
                                    />

                                    <button
                                        type="button"
                                        aria-label={
                                            showConfirm
                                                ? "Hide confirmation password"
                                                : "Show confirmation password"
                                        }
                                        onClick={() => setShowConfirm((value) => !value)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#716658] hover:bg-[#F1EADF]"
                                    >
                                        {showConfirm
                                            ? <EyeOff size={18} />
                                            : <Eye size={18} />}
                                    </button>
                                </div>

                                {errors.confirm_password && (
                                    <p role="alert" className="mt-2 text-xs text-red-700">
                                        {errors.confirm_password}
                                    </p>
                                )}
                            </div>

                            {errors.general && (
                                <p
                                    role="alert"
                                    className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                                >
                                    {errors.general}
                                </p>
                            )}
                        </div>

                        <footer className="flex justify-end gap-3 border-t border-[#EEE6DC] p-5 sm:p-6">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={saving}
                                className={outlineButton}
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={saving}
                                className={darkButton}
                            >
                                <Check size={17} />
                                Update Password
                            </button>
                        </footer>
                    </form>
                </section>
            </div>
        </>
    );
}

// =====================================================
// PREMIUM ASSIGNED PROJECT CARD
// =====================================================

function AssignedProjectCard({ project }) {
    const [imageFailed, setImageFailed] = useState(false);
    const imageUrl = getMediaUrl(project.cover_image);

    return (
        <Link
            to={`/admin/projects/${project.id}`}
            className="
        group flex min-h-40 overflow-hidden
        rounded-[20px] border border-[#E7DED2]
        bg-[#FFFDFA]
        transition-all duration-300
        hover:-translate-y-0.5
        hover:border-[#C9B9A6]
        hover:shadow-[0_12px_28px_rgba(33,30,26,0.09)]
        motion-reduce:transform-none
      "
        >
            <div className="relative w-[37%] shrink-0 bg-[#E9DFD1]">
                {imageUrl && !imageFailed ? (
                    <img
                        src={imageUrl}
                        alt={project.name}
                        onError={() => setImageFailed(true)}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <ImageOff size={30} className="text-[#9A8A76]" />
                    </div>
                )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#716658]">
                        {project.category_name || "Project"}
                    </p>

                    <h3 className="mt-2 wrap-break-word text-base font-bold text-[#211E1A]">
                        {project.name}
                    </h3>

                    <p className="mt-2 flex items-start gap-1.5 text-xs text-[#716658]">
                        <MapPin size={15} className="shrink-0" />
                        {project.location || "Location not provided"}
                    </p>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-[#716658]">
                        {statusLabel(project.status)}
                    </span>

                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F1EADF] text-[#211E1A] transition-colors group-hover:bg-[#211E1A] group-hover:text-white">
                        <ArrowUpRight size={18} />
                    </span>
                </div>
            </div>
        </Link>
    );
}

// =====================================================
// SUPERVISOR DETAILS PAGE
// =====================================================

export default function SupervisorDetails() {
    const { supervisorId } = useParams();

    const [supervisor, setSupervisor] = useState(null);
    const [form, setForm] = useState({});
    const [editing, setEditing] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});

    const [projects, setProjects] = useState([]);
    const [projectsError, setProjectsError] = useState("");

    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [busyMessage, setBusyMessage] = useState("");

    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const [showPasswordModal, setShowPasswordModal] =
        useState(false);
    const [confirmAction, setConfirmAction] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const actionRef = useRef(false);

    // -------------------------------------------------
    // FETCH PROFILE AND ASSIGNED PROJECTS
    // -------------------------------------------------

    useEffect(() => {
        let cancelled = false;

        setSupervisor(null);
        setProjects([]);
        setError("");
        setProjectsError("");
        setLoadingProfile(true);
        setLoadingProjects(true);
        setEditing(false);

        async function loadProfile() {
            try {
                const data =
                    await supervisorApi.getSupervisor(supervisorId);

                if (cancelled) return;

                setSupervisor(data);
                setForm(editableValues(data));
            } catch (err) {
                if (!cancelled) {
                    setError(
                        getApiError(err, "Unable to load supervisor details.")
                    );
                }
            } finally {
                if (!cancelled) setLoadingProfile(false);
            }
        }

        async function loadProjects() {
            try {
                const assigned =
                    await loadAssignedProjects(supervisorId);

                if (!cancelled) setProjects(assigned);
            } catch {
                if (!cancelled) {
                    setProjectsError(
                        "Unable to load assigned projects. Please retry."
                    );
                }
            } finally {
                if (!cancelled) setLoadingProjects(false);
            }
        }

        // Parallel initial requests, but each has its
        // own loading and error state.
        loadProfile();
        loadProjects();

        return () => {
            cancelled = true;
        };
    }, [supervisorId, refreshKey]);

    const refresh = () => {
        setRefreshKey((value) => value + 1);
    };

    // -------------------------------------------------
    // PROFILE EDITING
    // -------------------------------------------------

    const updateField = (key, value) => {
        setForm((current) => ({
            ...current,
            [key]: value,
        }));

        setFieldErrors((current) => ({
            ...current,
            [key]: "",
        }));
    };

    const saveProfile = async (event) => {
        event.preventDefault();

        if (!supervisor || actionRef.current) return;

        const validation = validateProfile(form);

        if (Object.keys(validation).length) {
            setFieldErrors(validation);
            return;
        }

        actionRef.current = true;
        setBusyMessage("Saving supervisor details...");
        setError("");
        setNotice("");
        setFieldErrors({});

        try {
            const payload = Object.fromEntries(
                Object.entries(form).map(([key, value]) => [
                    key,
                    String(value || "").trim(),
                ])
            );

            await supervisorApi.updateSupervisor(
                supervisorId,
                payload
            );

            const updated =
                await supervisorApi.getSupervisor(supervisorId);

            setSupervisor(updated);
            setForm(editableValues(updated));
            setEditing(false);
            setNotice("Supervisor details updated successfully.");
        } catch (err) {
            setFieldErrors(getFieldErrors(err));
            setError(
                getApiError(err, "Unable to update supervisor details.")
            );
        } finally {
            actionRef.current = false;
            setBusyMessage("");
        }
    };

    // -------------------------------------------------
    // CHANGE PASSWORD
    // -------------------------------------------------

    const changePassword = async (payload) => {
        if (actionRef.current) {
            throw new Error("Another request is in progress.");
        }

        actionRef.current = true;

        try {
            await supervisorApi.resetPassword(
                supervisorId,
                payload
            );

            setNotice("Supervisor password updated successfully.");
            setError("");
        } finally {
            actionRef.current = false;
        }
    };

    // -------------------------------------------------
    // ACTIVATE / DEACTIVATE
    // -------------------------------------------------

    const updateStatus = async () => {
        if (!confirmAction || actionRef.current) return;

        const activate = confirmAction === "activate";

        actionRef.current = true;
        setConfirmAction(null);
        setBusyMessage(
            activate
                ? "Activating supervisor..."
                : "Deactivating supervisor..."
        );
        setError("");
        setNotice("");

        try {
            await supervisorApi.updateSupervisor(supervisorId, {
                is_active: activate,
            });

            const updated =
                await supervisorApi.getSupervisor(supervisorId);

            setSupervisor(updated);
            setForm(editableValues(updated));
            setNotice(
                activate
                    ? "Supervisor activated successfully."
                    : "Supervisor deactivated successfully."
            );
        } catch (err) {
            setError(
                getApiError(err, "Unable to change supervisor status.")
            );
        } finally {
            actionRef.current = false;
            setBusyMessage("");
        }
    };

    const name = supervisorName(supervisor || {});

    const loadingMessage =
        busyMessage ||
        (loadingProfile
            ? "Loading supervisor details..."
            : loadingProjects
                ? "Loading assigned projects..."
                : "");

    return (
        <div className="space-y-6 pb-8">
            {/* GLOBAL LOADER */}
            {loadingMessage && (
                <LoadingScreen message={loadingMessage} />
            )}

            {/* BREADCRUMB */}
            <nav className="flex flex-wrap items-center gap-2 text-xs text-[#716658]">
                <Link to="/admin/dashboard">Dashboard</Link>
                <span>/</span>
                <Link to="/admin/supervisors">Supervisors</Link>
                <span>/</span>
                <span className="font-semibold text-[#211E1A]">
                    {name}
                </span>
            </nav>

            {/* NOTICES */}
            {error && (
                <div
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    <span>{error}</span>

                    {!supervisor && (
                        <button
                            type="button"
                            onClick={refresh}
                            className="font-semibold underline"
                        >
                            Retry
                        </button>
                    )}
                </div>
            )}

            {notice && (
                <div
                    role="status"
                    className="flex items-center gap-2 rounded-xl border border-[#D4E7D8] bg-[#EBF5ED] p-4 text-sm font-medium text-[#286F43]"
                >
                    <CheckCircle2 size={19} />
                    {notice}
                </div>
            )}

            {supervisor && (
                <>
                    {/* ======================================
              PROFILE HERO
              ====================================== */}

                    <section className="overflow-hidden rounded-[26px] border border-[#E7DED2] bg-[#FFFDFA]">
                        <div className="h-2 bg-linear-to-r from-[#D7C4AA] via-[#EEE5D8] to-[#E3E8EE]" />

                        <div className="p-5 sm:p-7">
                            <Link
                                to="/admin/supervisors"
                                className="inline-flex items-center gap-2 text-xs font-semibold text-[#716658] transition-colors hover:text-[#211E1A]"
                            >
                                <ArrowLeft size={16} />
                                Back to Supervisors
                            </Link>

                            <div className="mt-6 flex flex-wrap items-start gap-4">
                                <div className="flex h-17 w-17 shrink-0 items-center justify-center rounded-[22px] bg-linear-to-br from-[#D3C0A8] to-[#F1EADF] text-2xl font-bold text-[#514232] shadow-[0_8px_20px_rgba(33,30,26,0.08)]">
                                    {name.charAt(0).toUpperCase()}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#716658]">
                                        RARE / Site Supervisor
                                    </p>

                                    <h1 className="mt-2 wrap-break-word text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                                        {name}
                                    </h1>

                                    <p className="mt-1 text-sm text-[#716658]">
                                        @{supervisor.username || "Not provided"}
                                    </p>

                                    <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${supervisor.is_active
                                            ? "bg-[#E7F2E8] text-[#296F40]"
                                            : "bg-[#F0E9E1] text-[#756B60]"
                                        }`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${supervisor.is_active
                                                ? "bg-[#3F9960]"
                                                : "bg-[#9E9387]"
                                            }`} />
                                        {supervisor.is_active ? "Active" : "Inactive"}
                                    </span>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {supervisor.phone && (
                                        <a
                                            href={`tel:${supervisor.phone}`}
                                            className="inline-flex items-center gap-2 rounded-xl bg-[#E7F2E8] px-4 py-3 text-sm font-semibold text-[#296F40] transition-all hover:-translate-y-0.5 hover:bg-[#D5EAD9] hover:shadow-sm"
                                        >
                                            <Phone size={17} />
                                            Call
                                        </a>
                                    )}

                                    {supervisor.email && (
                                        <a
                                            href={`mailto:${supervisor.email}`}
                                            className={outlineButton}
                                        >
                                            <Mail size={17} />
                                            Email
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ======================================
              ACCOUNT DETAILS
              ====================================== */}

                    <section className="rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7">
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-bold text-[#211E1A]">
                                    Account Details
                                </h2>
                                <p className="mt-1 text-xs text-[#716658]">
                                    Personal information and account identity
                                </p>
                            </div>

                            {!editing && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFieldErrors({});
                                        setEditing(true);
                                    }}
                                    className={darkButton}
                                >
                                    <Pencil size={16} />
                                    Edit Details
                                </button>
                            )}
                        </div>

                        <form onSubmit={saveProfile}>
                            <div className="grid gap-5 sm:grid-cols-2">
                                {editableFields.map((field) => (
                                    <div key={field.key} className="min-w-0">
                                        <label
                                            htmlFor={`supervisor-${field.key}`}
                                            className="text-xs font-bold uppercase tracking-[0.09em] text-[#716658]"
                                        >
                                            {field.label}
                                        </label>

                                        {editing ? (
                                            <>
                                                <input
                                                    id={`supervisor-${field.key}`}
                                                    type={field.type}
                                                    autoComplete={field.autoComplete}
                                                    value={form[field.key] || ""}
                                                    onChange={(event) =>
                                                        updateField(
                                                            field.key,
                                                            event.target.value
                                                        )
                                                    }
                                                    disabled={Boolean(loadingMessage)}
                                                    aria-invalid={Boolean(fieldErrors[field.key])}
                                                    className={`${inputClass} mt-2`}
                                                />

                                                {fieldErrors[field.key] && (
                                                    <p
                                                        role="alert"
                                                        className="mt-2 text-xs text-red-700"
                                                    >
                                                        {fieldErrors[field.key]}
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <p className="mt-2 wrap-break-word text-sm font-semibold text-[#211E1A]">
                                                {supervisor[field.key] || "Not provided"}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {!editing && (
                                <div className="mt-6 grid gap-5 border-t border-[#F0E9DF] pt-5 sm:grid-cols-2">
                                    <div className="group flex items-start gap-3">
                                        <IconTile icon={CalendarDays} tone="blue" />
                                        <div>
                                            <p className="text-xs font-bold uppercase text-[#716658]">
                                                Account Created
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-[#211E1A]">
                                                {formatAccountDate(
                                                    supervisor.created_at || supervisor.date_joined
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="group flex items-start gap-3">
                                        <IconTile icon={UserRound} tone="violet" />
                                        <div>
                                            <p className="text-xs font-bold uppercase text-[#716658]">
                                                Last Login
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-[#211E1A]">
                                                {formatAccountDate(supervisor.last_login)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {editing && (
                                <div className="mt-6 flex justify-end gap-3 border-t border-[#F0E9DF] pt-5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setForm(editableValues(supervisor));
                                            setFieldErrors({});
                                            setEditing(false);
                                        }}
                                        className={outlineButton}
                                    >
                                        <X size={16} />
                                        Cancel
                                    </button>

                                    <button
                                        type="submit"
                                        disabled={Boolean(loadingMessage)}
                                        className={darkButton}
                                    >
                                        <Save size={17} />
                                        Save Changes
                                    </button>
                                </div>
                            )}
                        </form>
                    </section>

                    {/* ======================================
              SECURITY & ACCESS
              ====================================== */}

                    <section className="rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7">
                        <h2 className="text-lg font-bold text-[#211E1A]">
                            Security & Access
                        </h2>

                        <p className="mt-1 text-xs text-[#716658]">
                            Manage the Supervisor's login password and account status.
                        </p>

                        <div className="mt-6 grid gap-4 lg:grid-cols-2">
                            {/* PASSWORD */}
                            <article className="group flex flex-col justify-between gap-5 rounded-[20px] border border-[#ECE3D9] bg-[#FFFDFA] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D8C8E7] hover:shadow-[0_12px_26px_rgba(33,30,26,0.06)]">
                                <div className="flex items-start gap-3">
                                    <IconTile icon={KeyRound} tone="violet" />

                                    <div className="min-w-0">
                                        <h3 className="font-bold text-[#211E1A]">
                                            Change Password
                                        </h3>

                                        <p className="mt-2 text-xs leading-6 text-[#716658]">
                                            Set a new password without needing
                                            the Supervisor's current password.
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setShowPasswordModal(true)}
                                    className={outlineButton}
                                >
                                    <KeyRound size={16} />
                                    Change Password
                                </button>
                            </article>

                            {/* STATUS */}
                            <article className="group flex flex-col justify-between gap-5 rounded-[20px] border border-[#ECE3D9] bg-[#FFFDFA] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C7DCCB] hover:shadow-[0_12px_26px_rgba(33,30,26,0.06)]">
                                <div className="flex items-start gap-3">
                                    <IconTile
                                        icon={
                                            supervisor.is_active
                                                ? ShieldCheck
                                                : ShieldOff
                                        }
                                        tone={supervisor.is_active ? "green" : "rose"}
                                    />

                                    <div className="min-w-0">
                                        <h3 className="font-bold text-[#211E1A]">
                                            Account Status
                                        </h3>

                                        <p className="mt-2 text-xs leading-6 text-[#716658]">
                                            {supervisor.is_active
                                                ? "The account is active. Deactivate it to restrict login access."
                                                : "The account is inactive. Activate it to restore access."}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setConfirmAction(
                                            supervisor.is_active
                                                ? "deactivate"
                                                : "activate"
                                        )
                                    }
                                    className={
                                        supervisor.is_active
                                            ? "inline-flex items-center justify-center gap-2 rounded-xl border border-[#EDC9C4] bg-[#FFF8F7] px-4 py-3 text-sm font-semibold text-[#B5473E] transition-colors hover:bg-[#FBE9E6]"
                                            : darkButton
                                    }
                                >
                                    {supervisor.is_active
                                        ? <ShieldOff size={17} />
                                        : <ShieldCheck size={17} />}

                                    {supervisor.is_active
                                        ? "Deactivate Account"
                                        : "Activate Account"}
                                </button>
                            </article>
                        </div>
                    </section>

                    {/* ======================================
              ASSIGNED PROJECTS
              ====================================== */}

                    <section className="rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-bold text-[#211E1A]">
                                    Assigned Projects
                                </h2>
                                <p className="mt-1 text-xs text-[#716658]">
                                    Open and manage projects assigned to this Supervisor.
                                </p>
                            </div>

                            {!loadingProjects && !projectsError && (
                                <span className="rounded-full bg-[#F1EADF] px-3 py-1.5 text-xs font-bold text-[#514232]">
                                    {projects.length}{" "}
                                    {projects.length === 1 ? "Project" : "Projects"}
                                </span>
                            )}
                        </div>

                        {projectsError && (
                            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
                                <p role="alert" className="text-sm text-red-700">
                                    {projectsError}
                                </p>

                                <button
                                    type="button"
                                    onClick={refresh}
                                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-red-700 underline"
                                >
                                    <RefreshCw size={16} />
                                    Retry
                                </button>
                            </div>
                        )}

                        {!loadingProjects &&
                            !projectsError &&
                            projects.length === 0 && (
                                <div className="mt-6 rounded-[18px] bg-[#F8F4EE] px-5 py-12 text-center">
                                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEE3D5] text-[#716658]">
                                        <FolderKanban size={27} />
                                    </span>

                                    <h3 className="mt-4 text-sm font-bold text-[#211E1A]">
                                        No assigned projects
                                    </h3>

                                    <p className="mt-2 text-xs text-[#716658]">
                                        Assign this Supervisor from a project's Admin Overview.
                                    </p>
                                </div>
                            )}

                        {!loadingProjects &&
                            !projectsError &&
                            projects.length > 0 && (
                                <div className="mt-6 grid gap-4 xl:grid-cols-2">
                                    {projects.map((project) => (
                                        <AssignedProjectCard
                                            key={project.id}
                                            project={project}
                                        />
                                    ))}
                                </div>
                            )}
                    </section>
                </>
            )}

            {/* ========================================
          PASSWORD MODAL
          ======================================== */}

            <ChangePasswordModal
                open={showPasswordModal}
                supervisorName={name}
                onClose={() => setShowPasswordModal(false)}
                onSave={changePassword}
            />

            {/* ========================================
          STATUS CONFIRMATION
          ======================================== */}

            {confirmAction && (
                <ConfirmModal
                    title={
                        confirmAction === "activate"
                            ? "Activate Supervisor?"
                            : "Deactivate Supervisor?"
                    }
                    description={
                        confirmAction === "activate"
                            ? `Restore access for ${name}?`
                            : `Deactivate ${name}? They will no longer be able to log in while this account is inactive.`
                    }
                    confirmLabel={
                        confirmAction === "activate"
                            ? "Activate"
                            : "Deactivate"
                    }
                    danger={confirmAction === "deactivate"}
                    onConfirm={updateStatus}
                    onClose={() => setConfirmAction(null)}
                />
            )}
        </div>
    );
}
