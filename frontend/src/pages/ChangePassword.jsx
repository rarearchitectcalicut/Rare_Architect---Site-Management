
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";

import rareLogo from "../assets/images/rare-logo.png";
import { authApi } from "../api/authApi";
import { useAuth } from "../hooks/useAuth";
import LoadingScreen from "../components/LoadingScreen";

// =====================================================
// PASSWORD VALIDATION
// =====================================================

const passwordSchema = z
    .object({
        current_password: z
            .string()
            .min(1, "Current password is required"),

        new_password: z
            .string()
            .min(1, "New password is required"),

        confirm_password: z
            .string()
            .min(1, "Please confirm your new password"),
    })
    .superRefine((values, ctx) => {
        if (
            values.new_password &&
            values.current_password === values.new_password
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["new_password"],
                message:
                    "New password must differ from current password.",
            });
        }

        if (
            values.confirm_password &&
            values.new_password !== values.confirm_password
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["confirm_password"],
                message: "Passwords do not match.",
            });
        }
    });

// =====================================================
// PASSWORD INPUT COMPONENT
// =====================================================

function PasswordInput({
    label,
    field,
    register,
    error,
    autoComplete,
    disabled,
}) {
    const [visible, setVisible] = useState(false);

    return (
        <div className="space-y-2">
            <label
                htmlFor={field}
                className="block text-sm font-medium text-[#665e53]"
            >
                {label}
            </label>

            <div className="relative">
                <input
                    id={field}
                    type={visible ? "text" : "password"}
                    autoComplete={autoComplete}
                    placeholder={`Enter ${label.toLowerCase()}`}
                    disabled={disabled}
                    aria-invalid={Boolean(error)}
                    aria-describedby={
                        error ? `${field}-error` : undefined
                    }
                    {...register(field)}
                    className="
            h-12 w-full rounded-xl
            border border-[#e4dccd]
            bg-[#fffdfa]
            px-4 pr-12
            text-[15px] text-[#29251f]
            outline-none
            transition-colors
            placeholder:text-[#b0a99f]
            focus:border-[#292620]
            focus:ring-2 focus:ring-[#292620]/15
            aria-invalid:border-red-600
            disabled:cursor-not-allowed
            disabled:opacity-60
          "
                />

                <button
                    type="button"
                    onClick={() => setVisible((previous) => !previous)}
                    disabled={disabled}
                    aria-label={
                        visible ? `Hide ${label}` : `Show ${label}`
                    }
                    aria-pressed={visible}
                    className="
            absolute right-3 top-1/2
            -translate-y-1/2
            rounded-md p-1
            text-[#716658]
            transition-colors
            hover:text-[#292620]
            focus-visible:outline-2
            focus-visible:outline-offset-2
            focus-visible:outline-[#292620]
            disabled:opacity-50
          "
                >
                    {visible ? (
                        <EyeOff size={20} />
                    ) : (
                        <Eye size={20} />
                    )}
                </button>
            </div>

            {error && (
                <p
                    id={`${field}-error`}
                    role="alert"
                    className="text-xs text-red-700"
                >
                    {error.message}
                </p>
            )}
        </div>
    );
}

// =====================================================
// DJANGO ERROR MESSAGE HELPER
// =====================================================

function getServerErrorMessage(error) {
    const status = error.response?.status;

    if (!error.response) {
        return "Unable to reach the server. Check your connection.";
    }

    if (status === 401) {
        return "Your session has expired. Please sign in again.";
    }

    if (status === 403) {
        return "You do not have permission to perform this action.";
    }

    if (status === 429) {
        return "Too many attempts. Please try again later.";
    }

    if (status >= 500) {
        return "Server error. Please try again later.";
    }

    const data = error.response?.data;

    if (typeof data?.detail === "string") {
        return data.detail;
    }

    if (Array.isArray(data?.non_field_errors)) {
        return data.non_field_errors.join(" ");
    }

    if (typeof data?.non_field_errors === "string") {
        return data.non_field_errors;
    }

    return "Unable to change your password. Please try again.";
}

// =====================================================
// CHANGE PASSWORD PAGE
// =====================================================

export default function ChangePassword() {
    const navigate = useNavigate();

    const { user, reloadUser, logout } = useAuth();

    // ---------------------------------------------
    // LOADING STATES
    // ---------------------------------------------

    const [submitting, setSubmitting] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    // ---------------------------------------------
    // ERROR STATE
    // ---------------------------------------------

    const [serverError, setServerError] = useState("");

    const isProcessing = submitting || loggingOut;

    // ---------------------------------------------
    // FORM
    // ---------------------------------------------

    const {
        register,
        handleSubmit,
        setError,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(passwordSchema),

        defaultValues: {
            current_password: "",
            new_password: "",
            confirm_password: "",
        },

        mode: "onBlur",
    });

    // =====================================================
    // LOGOUT HANDLER
    // =====================================================

    const handleLogout = async () => {
        if (isProcessing) return;

        setLoggingOut(true);
        setServerError("");

        try {
            await logout();
        } finally {
            navigate("/login", { replace: true });
        }
    };

    // =====================================================
    // CHANGE PASSWORD SUBMIT HANDLER
    // =====================================================

    const onSubmit = async (values) => {
        if (isProcessing) return;

        setSubmitting(true);
        setServerError("");

        try {
            // ---------------------------------------------
            // 1. UPDATE PASSWORD IN DJANGO
            // ---------------------------------------------

            await authApi.changePassword(values);

            // ---------------------------------------------
            // 2. RELOAD AUTHENTICATED USER
            // ---------------------------------------------

            const updatedUser = await reloadUser();

            // ---------------------------------------------
            // 3. VERIFY PASSWORD CHANGE FLAG
            // ---------------------------------------------

            if (updatedUser.must_change_password) {
                setServerError(
                    "Password updated, but your account still requires a password change."
                );
                return;
            }

            // ---------------------------------------------
            // 4. ROLE-BASED REDIRECT
            // ---------------------------------------------

            if (updatedUser.role === "ADMIN") {
                navigate("/admin/dashboard", {
                    replace: true,
                });
            } else if (updatedUser.role === "SUPERVISOR") {
                navigate("/supervisor/dashboard", {
                    replace: true,
                });
            } else {
                navigate("/unauthorized", {
                    replace: true,
                });
            }
        } catch (error) {
            const data = error.response?.data;

            if (data && typeof data === "object") {
                let hasFieldErrors = false;

                // ---------------------------------------------
                // DJANGO FIELD VALIDATION ERRORS
                // ---------------------------------------------

                const fields = [
                    "current_password",
                    "new_password",
                    "confirm_password",
                ];

                for (const field of fields) {
                    const message = data[field];

                    if (message) {
                        hasFieldErrors = true;

                        setError(field, {
                            type: "server",

                            message: Array.isArray(message)
                                ? message.join(" ")
                                : String(message),
                        });
                    }
                }

                // ---------------------------------------------
                // GENERAL BACKEND ERRORS
                // ---------------------------------------------

                if (!hasFieldErrors) {
                    setServerError(
                        getServerErrorMessage(error)
                    );
                }
            } else {
                setServerError(
                    getServerErrorMessage(error)
                );
            }
        } finally {
            setSubmitting(false);
        }
    };

    // =====================================================
    // PAGE UI
    // =====================================================

    return (
        <>
            {/* ==========================================
          LOADING SCREEN
          ========================================== */}

            {isProcessing && (
                <LoadingScreen
                    message={
                        loggingOut
                            ? "Signing you out..."
                            : "Updating your password..."
                    }
                />
            )}

            {/* ==========================================
          MAIN PAGE
          ========================================== */}

            <main
                className="
          flex min-h-dvh
          items-center justify-center
          bg-[#f1eadf]
          px-5 py-12
          sm:px-8
        "
            >
                <div className="w-full max-w-105">

                    {/* ======================================
              LOGO AND HEADING
              ====================================== */}

                    <div className="mb-8 flex flex-col items-center text-center">

                        {/* RARE LOGO */}

                        <img
                            src={rareLogo}
                            alt="RARE - Rifath Associates LLP"
                            className="
                mb-5 h-auto
                w-44 object-contain
                sm:w-48
              "
                        />

                        {/* LOCK ICON */}

                        <div
                            className="
                mb-4 flex h-14 w-14
                items-center justify-center
                rounded-2xl
                bg-[#e4dccd]
                text-[#211e1a]
              "
                        >
                            <LockKeyhole
                                size={26}
                                strokeWidth={1.7}
                            />
                        </div>

                        {/* HEADING */}

                        <h1
                            className="
                text-[28px] font-bold
                tracking-tight
                text-[#211e1a]
                sm:text-[30px]
              "
                        >
                            Change Your Password
                        </h1>

                        {/* SUBTITLE */}

                        <p
                            className="
                mt-2 max-w-sm
                text-sm leading-6
                text-[#716658]
              "
                        >
                            {user?.must_change_password
                                ? "Please set a new password before accessing your RARE dashboard."
                                : "Update your account password."}
                        </p>
                    </div>

                    {/* ======================================
              PASSWORD FORM
              ====================================== */}

                    <form
                        onSubmit={handleSubmit(onSubmit)}
                        noValidate
                        className="flex flex-col gap-5"
                    >
                        {/* CURRENT PASSWORD */}

                        <PasswordInput
                            label="Current Password"
                            field="current_password"
                            register={register}
                            error={errors.current_password}
                            autoComplete="current-password"
                            disabled={isProcessing}
                        />

                        {/* NEW PASSWORD */}

                        <PasswordInput
                            label="New Password"
                            field="new_password"
                            register={register}
                            error={errors.new_password}
                            autoComplete="new-password"
                            disabled={isProcessing}
                        />

                        {/* CONFIRM PASSWORD */}

                        <PasswordInput
                            label="Confirm New Password"
                            field="confirm_password"
                            register={register}
                            error={errors.confirm_password}
                            autoComplete="new-password"
                            disabled={isProcessing}
                        />

                        {/* PASSWORD REQUIREMENTS */}

                        <p
                            className="
                text-xs leading-5
                text-[#716658]
              "
                        >
                            Choose a strong password. Your new password
                            must satisfy your organization's password
                            requirements.
                        </p>

                        {/* ==================================
                SERVER ERROR
                ================================== */}

                        {serverError && (
                            <div
                                role="alert"
                                className="
                  rounded-xl
                  border border-red-200
                  bg-red-50
                  px-4 py-3
                  text-sm text-red-700
                "
                            >
                                {serverError}
                            </div>
                        )}

                        {/* ==================================
                UPDATE PASSWORD BUTTON
                ================================== */}

                        <button
                            type="submit"
                            disabled={isProcessing}
                            className="
                mt-2 flex h-12
                items-center justify-center
                rounded-xl
                bg-[#211e1a]
                px-4
                text-[15px] font-semibold
                text-white
                transition-colors
                hover:bg-[#38332c]
                focus-visible:outline-2
                focus-visible:outline-offset-2
                focus-visible:outline-[#211e1a]
                disabled:cursor-not-allowed
                disabled:opacity-60
              "
                        >
                            {submitting
                                ? "Updating Password..."
                                : "Update Password"}
                        </button>
                    </form>

                    {/* ======================================
              LOGOUT BUTTON
              ====================================== */}

                    <button
                        type="button"
                        onClick={handleLogout}
                        disabled={isProcessing}
                        className="
              mt-6 w-full
              text-center text-sm
              font-medium
              text-[#665e53]
              transition-colors
              hover:text-[#211e1a]
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
                    >
                        {loggingOut
                            ? "Signing out..."
                            : "Sign out and return to login"}
                    </button>

                    {/* ======================================
              FOOTER
              ====================================== */}

                    <p
                        className="
              mt-10 text-center
              text-xs text-[#9b9287]
            "
                    >
                        RARE Project &amp; Site Management
                    </p>

                </div>
            </main>
        </>
    );
}
