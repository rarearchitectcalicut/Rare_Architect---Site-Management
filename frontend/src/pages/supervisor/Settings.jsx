
import { useEffect, useRef, useState } from "react";
import {
    CheckCircle2,
    CalendarDays,
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
import { useAuth } from "../../hooks/useAuth";
import ChangePasswordForm from "../../components/settings/ChangePasswordForm";
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
        <div className="space-y-7 pb-8">
            {busyMessage && (
                <LoadingScreen message={busyMessage} />
            )}

            <header>
                <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#716658]">
                    Supervisor / My Account
                </p>

                <h1 className="mt-2 text-2xl font-bold text-[#211E1A] sm:text-3xl">
                    Settings
                </h1>

                <p className="mt-2 text-sm text-[#716658]">
                    Manage your personal information and account security.
                </p>
            </header>

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
                    className="flex items-center gap-2 rounded-xl bg-[#E7F2E8] p-4 text-sm text-[#296F40]"
                >
                    <CheckCircle2 size={18} />
                    {notice}
                </div>
            )}

            {profile && (
                <>
                    {/* PROFILE HEADER */}
                    <section className="overflow-hidden rounded-[26px] border border-[#E7DED2] bg-[#FFFDFA]">
                        <div className="h-2 bg-linear-to-r from-[#D5C0A4] via-[#F0E6D9] to-[#DDE8E1]" />

                        <div className="p-5 sm:p-7">
                            <div className="flex flex-wrap items-start gap-4">
                                <div className="flex h-17 w-17 shrink-0 items-center justify-center rounded-[22px] bg-linear-to-br from-[#D6C1A8] to-[#F1EADF] text-2xl font-bold text-[#514232] shadow-sm">
                                    {name.charAt(0).toUpperCase()}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#716658]">
                                        RARE / Site Supervisor
                                    </p>

                                    <h2 className="mt-2 wrap-break-word text-2xl font-bold text-[#211E1A]">
                                        {name}
                                    </h2>

                                    <p className="mt-1 break-all text-sm text-[#716658]">
                                        @{profile.username || "Not specified"}
                                    </p>

                                    <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#E7F2E8] px-3 py-1.5 text-xs font-semibold text-[#296F40]">
                                        <ShieldCheck size={14} />
                                        {profile.is_active === false
                                            ? "Inactive Account"
                                            : "Supervisor Account"}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-6 grid gap-4 border-t border-[#EEE6DC] pt-5 sm:grid-cols-3">
                                {[
                                    {
                                        icon: Phone,
                                        label: "Mobile",
                                        value: profile.phone,
                                        tone: "bg-[#E7F2E8] text-[#368250]",
                                    },
                                    {
                                        icon: Mail,
                                        label: "Email",
                                        value: profile.email,
                                        tone: "bg-[#E9F0FC] text-[#3565A5]",
                                    },
                                    {
                                        icon: CalendarDays,
                                        label: "Joined",
                                        value: formatDate(
                                            profile.date_joined || profile.created_at
                                        ),
                                        tone: "bg-[#F0EAF8] text-[#7C5BA4]",
                                    },
                                ].map((item) => {
                                    const Icon = item.icon;

                                    return (
                                        <div
                                            key={item.label}
                                            className="group flex min-w-0 items-start gap-3"
                                        >
                                            <span
                                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:-rotate-3 ${item.tone}`}
                                            >
                                                <Icon size={19} />
                                            </span>

                                            <div className="min-w-0">
                                                <p className="text-xs font-bold uppercase tracking-wide text-[#716658]">
                                                    {item.label}
                                                </p>
                                                <p className="mt-1 wrap-break-word text-xs font-semibold text-[#211E1A] sm:text-sm">
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
                    <section className="rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7">
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <span className="rounded-xl bg-[#E9F0FC] p-3 text-[#3565A5]">
                                    <UserRound size={21} />
                                </span>

                                <div>
                                    <h2 className="text-lg font-bold text-[#211E1A]">
                                        Personal Information
                                    </h2>
                                    <p className="mt-1 text-xs text-[#716658]">
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
                                    className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-4 py-3 text-sm font-semibold text-white hover:bg-[#39332B]"
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
                                            className="text-xs font-bold uppercase tracking-wide text-[#716658]"
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
                                                    className="mt-2 h-12 w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-4 text-sm text-[#211E1A] outline-none focus:border-[#211E1A]"
                                                />

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
                                            <p className="mt-2 wrap-break-word text-sm font-semibold text-[#211E1A]">
                                                {profile[field.key] || "Not provided"}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {editing && (
                                <div className="mt-6 flex justify-end gap-3 border-t border-[#EEE6DC] pt-5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setForm(valuesFromProfile(profile));
                                            setErrors({});
                                            setEditing(false);
                                        }}
                                        className="inline-flex items-center gap-2 rounded-xl border border-[#E4DCCD] px-4 py-3 text-sm font-semibold text-[#211E1A]"
                                    >
                                        <X size={16} />
                                        Cancel
                                    </button>

                                    <button
                                        type="submit"
                                        disabled={Boolean(busyMessage)}
                                        className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-4 py-3 text-sm font-semibold text-white hover:bg-[#39332B] disabled:opacity-50"
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

            <ChangePasswordForm />
        </div>
    );
}
