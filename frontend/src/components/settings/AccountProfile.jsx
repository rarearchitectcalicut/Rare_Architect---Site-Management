
import { useEffect, useRef, useState } from "react";
import {
    AtSign,
    CalendarDays,
    CheckCircle2,
    Mail,
    Pencil,
    Phone,
    RefreshCw,
    Save,
    ShieldCheck,
    UserRound,
    X,
} from "lucide-react";

import { settingsApi } from "../../api/settingsApi";
import { formatLastLogin } from "../../utils/lastLogin";
import { useAuth } from "../../hooks/useAuth";
import LoadingScreen from "../LoadingScreen";

const fields = [
    {
        key: "first_name",
        label: "First Name",
        type: "text",
        autoComplete: "given-name",
        icon: UserRound,
    },
    {
        key: "last_name",
        label: "Last Name",
        type: "text",
        autoComplete: "family-name",
        icon: UserRound,
    },
    {
        key: "username",
        label: "Username",
        type: "text",
        autoComplete: "username",
        icon: AtSign,
    },
    {
        key: "phone",
        label: "Phone Number",
        type: "tel",
        autoComplete: "tel",
        icon: Phone,
    },
    {
        key: "email",
        label: "Email Address",
        type: "email",
        autoComplete: "email",
        icon: Mail,
    },
];

const inputClass = `
  h-12 w-full rounded-xl
  border border-border
  bg-surface px-4
  text-sm text-ink
  outline-none
  transition-all duration-200
  focus:border-border-strong
  focus:ring-4 focus:ring-pastel-lavender/60
  disabled:opacity-50
`;

function formValues(profile) {
    return Object.fromEntries(
        fields.map(({ key }) => [
            key,
            profile?.[key] || "",
        ])
    );
}

function fullName(profile) {
    return (
        [profile?.first_name, profile?.last_name]
            .filter(Boolean)
            .join(" ")
            .trim() ||
        profile?.username ||
        "RARE User"
    );
}

function formatDate(value) {
    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Not available";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function validate(values) {
    const errors = {};

    for (const field of fields) {
        if (!values[field.key]?.trim()) {
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
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            values.email.trim()
        )
    ) {
        errors.email = "Enter a valid email address.";
    }

    if (
        values.username &&
        !/^[a-zA-Z0-9_.@+-]+$/.test(
            values.username.trim()
        )
    ) {
        errors.username =
            "Use letters, numbers and _.@+- only.";
    }

    return errors;
}

function readError(value) {
    if (Array.isArray(value)) {
        return value.join(" ");
    }

    return typeof value === "string" ? value : "";
}

function ProfileInfo({ icon: Icon, label, value, tone }) {
    return (
        <div className="settings-profile-detail group flex min-w-0 items-start gap-3">
            <span
                className={`
          flex h-11 w-11 shrink-0 items-center
          justify-center rounded-2xl
          transition-all duration-300
          group-hover:-translate-y-0.5
          group-hover:-rotate-3
          group-hover:shadow-sm
          motion-reduce:transform-none
          ${tone}
        `}
            >
                <Icon size={20} strokeWidth={1.8} />
            </span>

            <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
                    {label}
                </p>
                <p className="mt-1 wrap-break-word text-sm font-semibold text-ink">
                    {value || "Not provided"}
                </p>
            </div>
        </div>
    );
}

export default function AccountProfile({ role = "ADMIN" }) {
    const { reloadUser } = useAuth();

    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState({});
    const [editing, setEditing] = useState(false);

    const [errors, setErrors] = useState({});
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const [busyMessage, setBusyMessage] = useState(
        "Loading your profile..."
    );

    const [retryKey, setRetryKey] = useState(0);
    const busyRef = useRef(false);

    // ================================================
    // LOAD PROFILE
    // ================================================

    useEffect(() => {
        let cancelled = false;

        async function loadProfile() {
            setBusyMessage("Loading your profile...");
            setError("");

            try {
                const data = await settingsApi.getProfile();

                if (cancelled) return;

                setProfile(data);
                setForm(formValues(data));
                setEditing(false);
            } catch {
                if (!cancelled) {
                    setError("Unable to load your profile.");
                }
            } finally {
                if (!cancelled) {
                    setBusyMessage("");
                }
            }
        }

        loadProfile();

        return () => {
            cancelled = true;
        };
    }, [retryKey]);

    // ================================================
    // FORM
    // ================================================

    const updateField = (key, value) => {
        setForm((previous) => ({
            ...previous,
            [key]: value,
        }));

        setErrors((previous) => ({
            ...previous,
            [key]: "",
        }));

        setNotice("");
    };

    const saveProfile = async (event) => {
        event.preventDefault();

        if (busyRef.current || !profile) return;

        const validation = validate(form);

        if (Object.keys(validation).length) {
            setErrors(validation);
            return;
        }

        busyRef.current = true;
        setBusyMessage("Saving your profile...");
        setErrors({});
        setError("");
        setNotice("");

        try {
            const payload = Object.fromEntries(
                Object.entries(form).map(([key, value]) => [
                    key,
                    String(value).trim(),
                ])
            );

            await settingsApi.updateProfile(payload);

            const updated = await settingsApi.getProfile();

            if (typeof reloadUser === "function") {
                await reloadUser();
            }

            setProfile(updated);
            setForm(formValues(updated));
            setEditing(false);

            setNotice("Profile updated successfully.");
        } catch (err) {
            const data = err.response?.data || {};
            const nextErrors = {};

            for (const field of fields) {
                if (data[field.key]) {
                    nextErrors[field.key] =
                        readError(data[field.key]);
                }
            }

            setErrors(nextErrors);

            if (err.response?.status === 405) {
                setError(
                    "Django does not yet support profile editing through PATCH /api/v1/auth/me/."
                );
            } else {
                setError(
                    readError(data.detail) ||
                    readError(data.non_field_errors) ||
                    (Object.keys(nextErrors).length
                        ? "Please correct the highlighted fields."
                        : "Unable to save your profile.")
                );
            }
        } finally {
            busyRef.current = false;
            setBusyMessage("");
        }
    };

    const name = fullName(profile);
    const roleLabel =
        role === "ADMIN"
            ? "Administrator"
            : "Site Supervisor";

    return (
        <div className="settings-account-profile space-y-5">
            {busyMessage && (
                <LoadingScreen message={busyMessage} />
            )}

            {error && (
                <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    {error}

                    {!profile && (
                        <button
                            type="button"
                            onClick={() =>
                                setRetryKey((value) => value + 1)
                            }
                            className="ml-3 inline-flex items-center gap-1 font-semibold underline"
                        >
                            <RefreshCw size={15} />
                            Retry
                        </button>
                    )}
                </div>
            )}

            {notice && (
                <div
                    role="status"
                    className="flex items-center gap-2 rounded-xl bg-pastel-mint p-4 text-sm font-medium text-success"
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
                                <div className="settings-profile-avatar flex h-18 w-18 shrink-0 items-center justify-center rounded-[23px] bg-linear-to-br from-border-strong to-app text-3xl font-bold text-ink shadow-[0_8px_22px_rgba(33,30,26,0.08)]">
                                    {name.charAt(0).toUpperCase()}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                                        RARE / {roleLabel}
                                    </p>

                                    <h2 className="mt-2 wrap-break-word text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                                        {name}
                                    </h2>

                                    <p className="mt-1 break-all text-sm text-muted">
                                        @{profile.username || "Not specified"}
                                    </p>

                                    <span
                                        className={`
                      mt-3 inline-flex items-center gap-2
                      rounded-full px-3 py-1.5
                      text-xs font-semibold
                      ${profile.is_active === false
                                                ? "bg-surface-soft text-muted"
                                                : "bg-pastel-mint text-success"
                                            }
                    `}
                                    >
                                        <ShieldCheck size={15} />
                                        {profile.is_active === false
                                            ? "Inactive"
                                            : "Active Account"}
                                    </span>
                                </div>
                            </div>

                            {/* QUICK INFORMATION */}
                            <div className="settings-profile-summary mt-6 grid gap-5 border-t border-border pt-6 sm:grid-cols-2 xl:grid-cols-3">
                                <ProfileInfo
                                    icon={CalendarDays}
                                    label="Last Login"
                                    value={formatLastLogin(profile.last_login)}
                                    tone="bg-pastel-lavender text-violet"
                                />
                                <ProfileInfo
                                    icon={CalendarDays}
                                    label="Member Since"
                                    value={formatDate(
                                        profile.date_joined || profile.created_at
                                    )}
                                    tone="bg-pastel-lavender text-violet"
                                />
                            </div>
                        </div>
                    </section>

                    {/* EDIT ACCOUNT INFORMATION */}
                    <section id="settings-profile" className="settings-personal-information rounded-3xl border border-border bg-surface p-5 sm:p-7">
                        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <span className="rounded-2xl bg-pastel-sky p-3 text-info">
                                    <UserRound size={22} />
                                </span>

                                <div>
                                    <h2 className="text-lg font-bold text-ink">
                                        Personal Information
                                    </h2>

                                    <p className="mt-1 text-xs leading-5 text-muted">
                                        Manage your contact and account details.
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
                                    className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-[0_8px_20px_rgba(33,30,26,0.12)]"
                                >
                                    <Pencil size={17} />
                                    Edit Profile
                                </button>
                            )}
                        </div>

                        <form onSubmit={saveProfile}>
                            <div className="grid gap-5 sm:grid-cols-2">
                                {fields.map((field) => {
                                    const Icon = field.icon;

                                    return (
                                        <div key={field.key} className="min-w-0">
                                            <label
                                                htmlFor={`profile-${field.key}`}
                                                className="text-xs font-bold uppercase tracking-widest text-muted"
                                            >
                                                {field.label}
                                            </label>

                                            {editing ? (
                                                <>
                                                    <div className="relative mt-2">
                                                        <Icon
                                                            size={17}
                                                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                                                        />

                                                        <input
                                                            id={`profile-${field.key}`}
                                                            type={field.type}
                                                            autoComplete={field.autoComplete}
                                                            value={form[field.key] || ""}
                                                            onChange={(event) =>
                                                                updateField(
                                                                    field.key,
                                                                    event.target.value
                                                                )
                                                            }
                                                            disabled={Boolean(busyMessage)}
                                                            aria-invalid={Boolean(errors[field.key])}
                                                            className={`${inputClass} pl-11`}
                                                        />
                                                    </div>

                                                    {errors[field.key] && (
                                                        <p
                                                            role="alert"
                                                            className="mt-2 text-xs text-red-700"
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
                                    );
                                })}
                            </div>

                            {editing && (
                                <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-border pt-5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setForm(formValues(profile));
                                            setErrors({});
                                            setEditing(false);
                                        }}
                                        className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-ink transition-colors hover:bg-app"
                                    >
                                        <X size={16} />
                                        Cancel
                                    </button>

                                    <button
                                        type="submit"
                                        disabled={Boolean(busyMessage)}
                                        className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-primary-hover hover:shadow-md disabled:opacity-50"
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
        </div>
    );
}
