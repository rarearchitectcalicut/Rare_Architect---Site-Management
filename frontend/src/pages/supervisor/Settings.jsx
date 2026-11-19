
import { useEffect, useRef, useState } from "react";
import {
    CheckCircle2,
    CalendarDays,
    Pencil,
    RefreshCw,
    Save,
    Settings2,
    ShieldCheck,
    UserRound,
    X,
} from "lucide-react";

import { settingsApi } from "../../api/settingsApi";
import { formatLastLogin } from "../../utils/lastLogin";
import { useAuth } from "../../hooks/useAuth";
import ChangePasswordForm from "../../components/settings/ChangePasswordForm";
import PushPreferences from "../../components/settings/PushPreferences";
import AppearancePreference from "../../components/settings/AppearancePreference";
import LoadingScreen from "../../components/LoadingScreen";

const fields = [
    { key: "first_name", label: "First Name", type: "text" },
    { key: "last_name", label: "Last Name", type: "text" },
    { key: "username", label: "Username", type: "text" },
    { key: "phone", label: "Mobile Number", type: "tel" },
    { key: "email", label: "Email Address", type: "email" },
];

function valuesFromProfile(profile) {
    return Object.fromEntries(
        fields.map(({ key }) => [
            key,
            profile?.[key] || "",
        ])
    );
}

function fullName(profile) {
    return [
        profile?.first_name,
        profile?.last_name,
    ].filter(Boolean).join(" ") ||
        profile?.username ||
        "Site Supervisor";
}

function validateProfile(form) {
    const errors = {};

    for (const field of fields) {
        if (!form[field.key]?.trim()) {
            errors[field.key] = `${field.label} is required.`;
        }
    }

    if (
        form.phone &&
        !/^\+?[0-9]{10,15}$/.test(form.phone.trim())
    ) {
        errors.phone = "Enter a valid phone number.";
    }

    if (
        form.email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
        errors.email = "Enter a valid email address.";
    }

    if (
        form.username &&
        !/^[a-zA-Z0-9_.@+-]+$/.test(form.username.trim())
    ) {
        errors.username =
            "Only letters, numbers and _.@+- are allowed.";
    }

    return errors;
}

function formatDate(value) {
    if (!value) return "Not available";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? "Not available"
        : date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
}

export default function SupervisorSettings() {
    const { reloadUser } = useAuth();

    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState({});
    const [editing, setEditing] = useState(false);
    const [errors, setErrors] = useState({});
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [busyMessage, setBusyMessage] =
        useState("Loading your account settings...");
    const [refreshKey, setRefreshKey] = useState(0);

    const busyRef = useRef(false);

    useEffect(() => {
        let cancelled = false;

        async function loadProfile() {
            setBusyMessage("Loading your account settings...");
            setError("");

            try {
                const data = await settingsApi.getProfile();

                if (cancelled) return;

                setProfile(data);
                setForm(valuesFromProfile(data));
                setEditing(false);
            } catch {
                if (!cancelled) {
                    setError(
                        "Unable to load your account information."
                    );
                }
            } finally {
                if (!cancelled) setBusyMessage("");
            }
        }

        loadProfile();

        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    const updateField = (key, value) => {
        setForm((previous) => ({
            ...previous,
            [key]: value,
        }));

        setErrors((previous) => ({
            ...previous,
            [key]: "",
            general: "",
        }));
    };

    const saveProfile = async (event) => {
        event.preventDefault();

        if (busyRef.current) return;

        const validation = validateProfile(form);

        if (Object.keys(validation).length) {
            setErrors(validation);
            return;
        }

        busyRef.current = true;
        setBusyMessage("Updating your profile...");
        setError("");
        setNotice("");
        setErrors({});

        try {
            const payload = Object.fromEntries(
                Object.entries(form).map(([key, value]) => [
                    key,
                    value.trim(),
                ])
            );

            await settingsApi.updateProfile(payload);

            const updated = await settingsApi.getProfile();

            if (typeof reloadUser === "function") {
                await reloadUser();
            }

            setProfile(updated);
            setForm(valuesFromProfile(updated));
            setEditing(false);
            setNotice("Your profile was updated successfully.");
        } catch (err) {
            const data = err.response?.data || {};
            const fieldErrors = {};

            for (const field of fields) {
                const value = data[field.key];

                if (value) {
                    fieldErrors[field.key] = Array.isArray(value)
                        ? value.join(" ")
                        : String(value);
                }
            }

            setErrors(fieldErrors);

            if (err.response?.status === 405) {
                setError(
                    "Profile editing is not enabled in Django yet. PATCH /api/v1/auth/me/ must be implemented."
                );
            } else {
                setError(
                    typeof data.detail === "string"
                        ? data.detail
                        : Object.keys(fieldErrors).length
                            ? "Please correct the highlighted fields."
                            : "Unable to update your profile. Please try again."
                );
            }
        } finally {
            busyRef.current = false;
            setBusyMessage("");
        }
    };

    const name = fullName(profile);

    return (
        <div className="settings-page space-y-7 pb-8">
            {busyMessage && (
                <LoadingScreen message={busyMessage} />
            )}

            <header className="settings-page-heading">
                <p className="text-xs font-bold uppercase tracking-[0.17em] text-muted">
                    Supervisor / My Account
                </p>

                <div className="mt-2 flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-app text-muted"><Settings2 size={23} aria-hidden="true" /></span>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Settings</h1>
                        <p className="mt-2 text-sm text-muted">Your account, preferences, and workspace. All in one place.</p>
                    </div>
                </div>
            </header>

            <div className="settings-nav-dock">
                <nav className="settings-section-nav" aria-label="Settings sections">
                    <a href="#settings-profile"><Pencil size={16} aria-hidden="true" />Personal details</a>
                    <a href="#settings-security"><ShieldCheck size={16} aria-hidden="true" />Security</a>
                    <a href="#settings-notifications">Notifications</a>
                </nav>
            </div>

            {error && (
                <div
                    role="alert"
                    className="rounded-xl border border-danger/30 bg-pastel-blush p-4 text-sm text-danger"
                >
                    {error}

                    {!profile && (
                        <button
                            type="button"
                            onClick={() =>
                                setRefreshKey((value) => value + 1)
                            }
                            className="ml-3 font-semibold underline"
                        >
                            <RefreshCw size={15} className="mr-1 inline" />
                            Retry
                        </button>
                    )}
                </div>
            )}

            {notice && (
                <div
                    role="status"
                    className="flex items-center gap-2 rounded-xl bg-pastel-mint p-4 text-sm text-success"
                >
                    <CheckCircle2 size={18} />
                    {notice}
                </div>
            )}

            {profile && (
                <>
                    {/* PROFILE HEADER */}
                    <section className="settings-profile-sidebar overflow-hidden rounded-[26px] border border-border bg-surface">
                        <div className="settings-profile-cover" aria-hidden="true" />

                        <div className="settings-profile-body p-5 sm:p-7">
                            <div className="settings-profile-identity flex flex-wrap items-start gap-4">
                                <div className="settings-profile-avatar flex h-17 w-17 shrink-0 items-center justify-center rounded-[22px] bg-linear-to-br from-border-strong to-app text-2xl font-bold text-ink shadow-sm">
                                    {name.charAt(0).toUpperCase()}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold uppercase tracking-[0.17em] text-muted">
                                        RARE / Site Supervisor
                                    </p>

                                    <h2 className="mt-2 wrap-break-word text-2xl font-bold text-ink">
                                        {name}
                                    </h2>

                                    <p className="mt-1 break-all text-sm text-muted">
                                        @{profile.username || "Not specified"}
                                    </p>

                                    <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-pastel-mint px-3 py-1.5 text-xs font-semibold text-success">
                                        <ShieldCheck size={14} />
                                        {profile.is_active === false
                                            ? "Inactive Account"
                                            : "Supervisor Account"}
                                    </span>
                                </div>
                            </div>

                            <div className="settings-profile-summary mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
                                {[
                                    {
                                        icon: CalendarDays,
                                        label: "Last Login",
                                        value: formatLastLogin(profile.last_login),
                                        tone: "bg-pastel-lavender text-violet",
                                    },
                                    {
                                        icon: CalendarDays,
                                        label: "Joined",
                                        value: formatDate(
                                            profile.date_joined || profile.created_at
                                        ),
                                        tone: "bg-pastel-lavender text-violet",
                                    },
                                ].map((item) => {
                                    const Icon = item.icon;

                                    return (
                                        <div
                                            key={item.label}
                                            className="settings-profile-detail group flex min-w-0 items-start gap-3"
                                        >
                                            <span
                                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:-rotate-3 ${item.tone}`}
                                            >
                                                <Icon size={19} />
                                            </span>

                                            <div className="min-w-0">
                                                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                                                    {item.label}
                                                </p>
                                                <p className="mt-1 wrap-break-word text-xs font-semibold text-ink sm:text-sm">
                                                    {item.value || "Not provided"}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {/* PERSONAL DETAILS */}
                    <section id="settings-profile" className="settings-personal-information rounded-3xl border border-border bg-surface p-5 sm:p-7">
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <span className="rounded-xl bg-pastel-sky p-3 text-info">
                                    <UserRound size={21} />
                                </span>

                                <div>
                                    <h2 className="text-lg font-bold text-ink">
                                        Personal Information
                                    </h2>
                                    <p className="mt-1 text-xs text-muted">
                                        Keep your contact and account details current.
                                    </p>
                                </div>
                            </div>

                            {!editing && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setErrors({});
                                        setEditing(true);
                                    }}
                                    className="inline-flex items-center gap-2 rounded-xl bg-action px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover"
                                >
                                    <Pencil size={16} />
                                    Edit Profile
                                </button>
                            )}
                        </div>

                        <form onSubmit={saveProfile}>
                            <div className="grid gap-5 sm:grid-cols-2">
                                {fields.map((field) => (
                                    <div key={field.key} className="min-w-0">
                                        <label
                                            htmlFor={`settings-${field.key}`}
                                            className="text-xs font-bold uppercase tracking-wide text-muted"
                                        >
                                            {field.label}
                                        </label>

                                        {editing ? (
                                            <>
                                                <input
                                                    id={`settings-${field.key}`}
                                                    type={field.type}
                                                    value={form[field.key] || ""}
                                                    onChange={(event) =>
                                                        updateField(
                                                            field.key,
                                                            event.target.value
                                                        )
                                                    }
                                                    disabled={Boolean(busyMessage)}
                                                    aria-invalid={Boolean(errors[field.key])}
                                                    className="mt-2 h-12 w-full rounded-xl border border-border bg-surface px-4 text-sm text-ink outline-none focus:border-ink"
                                                />

                                                {errors[field.key] && (
                                                    <p
                                                        role="alert"
                                                        className="mt-2 text-xs text-danger"
                                                    >
                                                        {errors[field.key]}
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <p className="mt-2 wrap-break-word text-sm font-semibold text-ink">
                                                {profile[field.key] || "Not provided"}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {editing && (
                                <div className="mt-6 flex justify-end gap-3 border-t border-border pt-5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setForm(valuesFromProfile(profile));
                                            setErrors({});
                                            setEditing(false);
                                        }}
                                        className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-ink"
                                    >
                                        <X size={16} />
                                        Cancel
                                    </button>

                                    <button
                                        type="submit"
                                        disabled={Boolean(busyMessage)}
                                        className="inline-flex items-center gap-2 rounded-xl bg-action px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                                    >
                                        <Save size={17} />
                                        Save Changes
                                    </button>
                                </div>
                            )}
                        </form>
                    </section>
                </>
            )}

            <AppearancePreference />
            <div className="settings-security-grid contents"><ChangePasswordForm /><PushPreferences /></div>
        </div>
    );
}
