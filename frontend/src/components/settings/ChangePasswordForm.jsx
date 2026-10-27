import { useMemo, useRef, useState } from "react";
import {
    AlertCircle,
    Check,
    CheckCircle2,
    Eye,
    EyeOff,
    KeyRound,
    LockKeyhole,
    ShieldCheck,
} from "lucide-react";

import { settingsApi } from "../../api/settingsApi";
import LoadingScreen from "../LoadingScreen";

const initialValues = {
    current_password: "",
    new_password: "",
    confirm_password: "",
};

const fields = [
    {
        key: "current_password",
        label: "Current password",
        placeholder: "Enter your current password",
    },
    {
        key: "new_password",
        label: "New password",
        placeholder: "Create a new password",
    },
    {
        key: "confirm_password",
        label: "Confirm new password",
        placeholder: "Re-enter the new password",
    },
];

const strengthLevels = [
    { label: "Too short", bar: "bg-[#E4DCCD]", text: "text-[#716658]" },
    { label: "Weak", bar: "bg-[#D9534F]", text: "text-[#B3342F]" },
    { label: "Fair", bar: "bg-[#E8A23A]", text: "text-[#9A6410]" },
    { label: "Good", bar: "bg-[#7855A0]", text: "text-[#7855A0]" },
    { label: "Strong", bar: "bg-[#2E8B57]", text: "text-[#296F40]" },
];

function passwordError(value) {
    if (Array.isArray(value)) return value.join(" ");
    return typeof value === "string" ? value : "";
}

function getChecks(password) {
    return [
        { label: "At least 8 characters", met: password.length >= 8 },
        {
            label: "Upper and lowercase letters",
            met: /[a-z]/.test(password) && /[A-Z]/.test(password),
        },
        { label: "At least one number", met: /\d/.test(password) },
        {
            label: "At least one symbol",
            met: /[^A-Za-z0-9]/.test(password),
        },
    ];
}

export default function ChangePasswordForm() {
    const [values, setValues] = useState(initialValues);
    const [visible, setVisible] = useState({});
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [success, setSuccess] = useState("");

    const busyRef = useRef(false);

    const checks = useMemo(
        () => getChecks(values.new_password),
        [values.new_password]
    );

    const score = checks.filter((check) => check.met).length;
    const level =
        values.new_password.length === 0
            ? null
            : values.new_password.length < 8
                ? strengthLevels[0]
                : strengthLevels[Math.max(score, 1)];

    const passwordsMatch =
        values.confirm_password.length > 0 &&
        values.new_password === values.confirm_password;

    const updateField = (name, value) => {
        setValues((previous) => ({
            ...previous,
            [name]: value,
        }));

        setErrors((previous) => ({
            ...previous,
            [name]: "",
            general: "",
        }));

        setSuccess("");
    };

    const submit = async (event) => {
        event.preventDefault();

        if (busyRef.current) return;

        const nextErrors = {};

        if (!values.current_password) {
            nextErrors.current_password =
                "Enter your current password.";
        }

        if (!values.new_password) {
            nextErrors.new_password = "Enter a new password.";
        } else if (values.new_password.length < 8) {
            nextErrors.new_password =
                "Use at least 8 characters.";
        } else if (
            values.new_password === values.current_password
        ) {
            nextErrors.new_password =
                "Choose a password you haven't used here before.";
        }

        if (!values.confirm_password) {
            nextErrors.confirm_password =
                "Re-enter your new password.";
        } else if (
            values.new_password !== values.confirm_password
        ) {
            nextErrors.confirm_password =
                "Passwords don't match.";
        }

        if (Object.keys(nextErrors).length) {
            setErrors(nextErrors);
            return;
        }

        busyRef.current = true;
        setBusy(true);
        setErrors({});
        setSuccess("");

        try {
            await settingsApi.changePassword(values);

            setValues(initialValues);
            setVisible({});
            setSuccess("Password updated. Use your new password next time you sign in.");
        } catch (error) {
            const data = error.response?.data || {};

            setErrors({
                current_password: passwordError(
                    data.current_password
                ),
                new_password: passwordError(data.new_password),
                confirm_password: passwordError(
                    data.confirm_password
                ),
                general:
                    passwordError(data.detail) ||
                    passwordError(data.non_field_errors) ||
                    (
                        !data.current_password &&
                            !data.new_password &&
                            !data.confirm_password
                            ? "We couldn't update your password. Check your connection and try again."
                            : ""
                    ),
            });
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    return (
        <section className="overflow-hidden rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] shadow-[0_24px_60px_-30px_rgba(33,30,26,0.25)]">
            {busy && (
                <LoadingScreen message="Updating your password..." />
            )}

            <div className="grid lg:grid-cols-[1fr_340px]">
                {/* Form side */}
                <div className="p-6 sm:p-10">
                    <div className="flex items-center gap-4">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#7855A0] text-white shadow-lg shadow-[#7855A0]/30">
                            <KeyRound size={26} strokeWidth={1.8} />
                        </span>

                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-[#211E1A]">
                                Change password
                            </h2>

                            <p className="mt-1 text-sm leading-6 text-[#716658]">
                                Choose a strong password to keep your account safe.
                            </p>
                        </div>
                    </div>

                    <form
                        onSubmit={submit}
                        noValidate
                        className="mt-8 space-y-6"
                    >
                        {fields.map((field) => {
                            const isConfirm = field.key === "confirm_password";
                            const hasError = Boolean(errors[field.key]);

                            return (
                                <div key={field.key} className="space-y-2">
                                    <label
                                        htmlFor={field.key}
                                        className="text-sm font-semibold text-[#4A443B]"
                                    >
                                        {field.label}
                                    </label>

                                    <div className="relative">
                                        <LockKeyhole
                                            size={18}
                                            className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${hasError
                                                    ? "text-red-500"
                                                    : "text-[#A19383]"
                                                }`}
                                        />

                                        <input
                                            id={field.key}
                                            type={visible[field.key] ? "text" : "password"}
                                            value={values[field.key]}
                                            onChange={(event) =>
                                                updateField(field.key, event.target.value)
                                            }
                                            autoComplete={
                                                field.key === "current_password"
                                                    ? "current-password"
                                                    : "new-password"
                                            }
                                            disabled={busy}
                                            placeholder={field.placeholder}
                                            aria-invalid={hasError}
                                            className={`h-13 w-full rounded-xl border bg-white py-4 pl-12 text-sm text-[#211E1A] outline-none transition-all placeholder:text-[#B7AC9C] disabled:bg-[#F7F3EC] ${isConfirm && passwordsMatch ? "pr-20" : "pr-12"
                                                } ${hasError
                                                    ? "border-red-300 focus:border-red-400 focus:ring-4 focus:ring-red-100"
                                                    : "border-[#E4DCCD] hover:border-[#CFC3B1] focus:border-[#7855A0] focus:ring-4 focus:ring-[#7855A0]/15"
                                                }`}
                                        />

                                        {isConfirm && passwordsMatch && (
                                            <Check
                                                size={18}
                                                strokeWidth={2.5}
                                                aria-label="Passwords match"
                                                className="absolute right-12 top-1/2 -translate-y-1/2 text-[#2E8B57]"
                                            />
                                        )}

                                        <button
                                            type="button"
                                            disabled={busy}
                                            aria-label={
                                                visible[field.key]
                                                    ? `Hide ${field.label.toLowerCase()}`
                                                    : `Show ${field.label.toLowerCase()}`
                                            }
                                            onClick={() =>
                                                setVisible((previous) => ({
                                                    ...previous,
                                                    [field.key]: !previous[field.key],
                                                }))
                                            }
                                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#716658] transition-colors hover:bg-[#F1EADF] hover:text-[#211E1A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7855A0]"
                                        >
                                            {visible[field.key]
                                                ? <EyeOff size={18} />
                                                : <Eye size={18} />}
                                        </button>
                                    </div>

                                    {/* Strength meter lives under the new password field */}
                                    {field.key === "new_password" && level && (
                                        <div className="pt-1" aria-live="polite">
                                            <div className="flex gap-1.5">
                                                {[1, 2, 3, 4].map((segment) => (
                                                    <span
                                                        key={segment}
                                                        className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${segment <= score &&
                                                                values.new_password.length >= 8
                                                                ? level.bar
                                                                : "bg-[#EEE6DC]"
                                                            }`}
                                                    />
                                                ))}
                                            </div>

                                            <p className={`mt-1.5 text-xs font-semibold ${level.text}`}>
                                                {level.label}
                                            </p>
                                        </div>
                                    )}

                                    {hasError && (
                                        <p
                                            role="alert"
                                            className="flex items-center gap-1.5 text-xs font-medium text-red-700"
                                        >
                                            <AlertCircle size={14} className="shrink-0" />
                                            {errors[field.key]}
                                        </p>
                                    )}
                                </div>
                            );
                        })}

                        {errors.general && (
                            <p
                                role="alert"
                                className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700"
                            >
                                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                                {errors.general}
                            </p>
                        )}

                        {success && (
                            <p
                                role="status"
                                className="flex items-start gap-2 rounded-xl border border-[#CFE6D3] bg-[#E7F2E8] p-3.5 text-sm font-medium text-[#296F40]"
                            >
                                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                                {success}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className="h-12 w-full rounded-xl bg-[#211E1A] px-6 text-sm font-semibold text-white shadow-lg shadow-[#211E1A]/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#7855A0] hover:shadow-[#7855A0]/30 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#7855A0]/30 disabled:translate-y-0 disabled:opacity-50 sm:w-auto sm:min-w-52"
                        >
                            Update password
                        </button>
                    </form>
                </div>

                {/* Guidance side */}
                <aside className="border-t border-[#EEE6DC] bg-[#F5EFE7] p-6 sm:p-10 lg:border-l lg:border-t-0">
                    <div className="flex items-center gap-2.5 text-[#211E1A]">
                        <ShieldCheck size={20} className="text-[#7855A0]" />
                        <h3 className="text-sm font-bold">
                            Your password should have
                        </h3>
                    </div>

                    <ul className="mt-5 space-y-3.5">
                        {checks.map((check) => (
                            <li
                                key={check.label}
                                className={`flex items-center gap-3 text-sm transition-colors ${check.met
                                        ? "font-medium text-[#211E1A]"
                                        : "text-[#716658]"
                                    }`}
                            >
                                <span
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${check.met
                                            ? "scale-110 border-[#2E8B57] bg-[#2E8B57] text-white"
                                            : "border-[#CFC3B1] bg-transparent text-transparent"
                                        }`}
                                >
                                    <Check size={12} strokeWidth={3} />
                                </span>

                                {check.label}
                            </li>
                        ))}
                    </ul>

                    <p className="mt-8 border-t border-[#E4DCCD] pt-5 text-xs leading-6 text-[#716658]">
                        Avoid names, birthdays and passwords you use on other sites.
                        A longer phrase is harder to guess than a short, complex one.
                    </p>
                </aside>
            </div>
        </section>
    );
}