
import { useRef, useState } from "react";
import {
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

function passwordError(value) {
    if (Array.isArray(value)) return value.join(" ");
    return typeof value === "string" ? value : "";
}

export default function ChangePasswordForm() {
    const [values, setValues] = useState(initialValues);
    const [visible, setVisible] = useState({});
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [success, setSuccess] = useState("");

    const busyRef = useRef(false);

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
                "Current password is required.";
        }

        if (!values.new_password) {
            nextErrors.new_password =
                "New password is required.";
        } else if (values.new_password.length < 8) {
            nextErrors.new_password =
                "Use at least 8 characters.";
        } else if (
            values.new_password === values.current_password
        ) {
            nextErrors.new_password =
                "The new password must be different.";
        }

        if (!values.confirm_password) {
            nextErrors.confirm_password =
                "Please confirm your new password.";
        } else if (
            values.new_password !== values.confirm_password
        ) {
            nextErrors.confirm_password =
                "Passwords do not match.";
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
            setSuccess("Your password was changed successfully.");
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
                            ? "Unable to change password. Please try again."
                            : ""
                    ),
            });
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const fields = [
        {
            key: "current_password",
            label: "Current Password",
            placeholder: "Enter your current password",
        },
        {
            key: "new_password",
            label: "New Password",
            placeholder: "Enter your new password",
        },
        {
            key: "confirm_password",
            label: "Confirm New Password",
            placeholder: "Re-enter the new password",
        },
    ];

    return (
        <section className="overflow-hidden rounded-3xl border border-[#E7DED2] bg-[#FFFDFA]">
            {busy && (
                <LoadingScreen message="Updating your password..." />
            )}

            <div className="flex items-start gap-3 border-b border-[#EEE6DC] p-5 sm:p-7">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F0EAF8] text-[#7855A0]">
                    <KeyRound size={23} strokeWidth={1.8} />
                </span>

                <div>
                    <h2 className="text-lg font-bold text-[#211E1A]">
                        Change Password
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-[#817669]">
                        Keep your account secure with a strong password.
                    </p>
                </div>
            </div>

            <form
                onSubmit={submit}
                noValidate
                className="space-y-5 p-5 sm:p-7"
            >
                {fields.map((field) => (
                    <div key={field.key} className="space-y-2">
                        <label
                            htmlFor={field.key}
                            className="text-sm font-semibold text-[#665E53]"
                        >
                            {field.label}
                        </label>

                        <div className="relative">
                            <LockKeyhole
                                size={17}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A19383]"
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
                                aria-invalid={Boolean(errors[field.key])}
                                className="h-12 w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] pl-11 pr-12 text-sm text-[#211E1A] outline-none transition-all focus:border-[#B5A48F] focus:ring-4 focus:ring-[#E8DDD0]/50"
                            />

                            <button
                                type="button"
                                disabled={busy}
                                aria-label={
                                    visible[field.key]
                                        ? `Hide ${field.label}`
                                        : `Show ${field.label}`
                                }
                                onClick={() =>
                                    setVisible((previous) => ({
                                        ...previous,
                                        [field.key]: !previous[field.key],
                                    }))
                                }
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#817669] hover:bg-[#F1EADF]"
                            >
                                {visible[field.key]
                                    ? <EyeOff size={18} />
                                    : <Eye size={18} />}
                            </button>
                        </div>

                        {errors[field.key] && (
                            <p role="alert" className="text-xs text-red-700">
                                {errors[field.key]}
                            </p>
                        )}
                    </div>
                ))}

                <div className="flex items-start gap-3 rounded-xl bg-[#F5EFE7] p-4">
                    <ShieldCheck
                        size={19}
                        className="mt-0.5 shrink-0 text-[#817669]"
                    />

                    <p className="text-xs leading-6 text-[#817669]">
                        Use a unique password containing a mix of
                        letters, numbers and symbols. Django applies
                        the final password validation rules.
                    </p>
                </div>

                {errors.general && (
                    <p
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                    >
                        {errors.general}
                    </p>
                )}

                {success && (
                    <p
                        role="status"
                        className="flex items-center gap-2 rounded-xl bg-[#E7F2E8] p-3 text-sm font-medium text-[#296F40]"
                    >
                        <CheckCircle2 size={18} />
                        {success}
                    </p>
                )}

                <div className="flex justify-end border-t border-[#EEE6DC] pt-5">
                    <button
                        type="submit"
                        disabled={busy}
                        className="rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#39332B] hover:shadow-lg disabled:opacity-50"
                    >
                        Update Password
                    </button>
                </div>
            </form>
        </section>
    );
}
