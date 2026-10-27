import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    AlertCircle,
    AtSign,
    CheckCircle2,
    Info,
    LockKeyhole,
    Mail,
    Phone,
    UserRound,
    UserRoundPlus,
    X,
} from "lucide-react";

import { supervisorApi } from "../../api/supervisorApi";
import LoadingScreen from "../../components/LoadingScreen";

// =====================================================
// MOTION + STYLES
// =====================================================

const modalCss = `
  @keyframes rare-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes rare-pop {
    from { opacity: 0; transform: translateY(14px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes rare-sheet {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }

  @keyframes rare-rise {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes rare-badge {
    0%   { opacity: 0; transform: scale(0.6); }
    60%  { opacity: 1; transform: scale(1.08); }
    100% { transform: scale(1); }
  }

  .rare-backdrop {
    animation: rare-fade 220ms ease-out;
  }

  .rare-modal {
    animation: rare-pop 340ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .rare-rise {
    animation: rare-rise 560ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: var(--d, 0ms);
  }

  .rare-badge {
    animation: rare-badge 520ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
  }

  /* On phones the modal becomes a bottom sheet */
  @media (max-width: 639px) {
    .rare-modal {
      animation: rare-sheet 380ms cubic-bezier(0.22, 1, 0.36, 1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rare-backdrop,
    .rare-modal,
    .rare-rise,
    .rare-badge {
      animation: none !important;
    }
  }
`;

// Icon tile tones (literal class strings so Tailwind can detect them)
const tones = {
    blue: "bg-[#E8F0FE] text-[#2563EB]",
    green: "bg-[#E6F4EA] text-[#16A34A]",
    orange: "bg-[#FFF3E0] text-[#EA8A12]",
    violet: "bg-[#F1ECFE] text-[#7C3AED]",
};

const initialForm = {
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    username: "",
};

const inputClass = `
  h-12 w-full rounded-xl
  border border-[#E4DCCD] bg-[#FFFDFA]
  px-4 text-sm text-[#211E1A]
  outline-none transition-all duration-200
  placeholder:text-[#AAA196]
  hover:border-[#CFC4B5]
  focus:border-[#211E1A]
  focus:ring-4 focus:ring-[#211E1A]/10
  disabled:cursor-not-allowed
  disabled:opacity-50
  disabled:hover:border-[#E4DCCD]
  aria-invalid:border-red-600
  aria-invalid:ring-4 aria-invalid:ring-red-600/10
`;

function getError(value) {
    if (Array.isArray(value)) {
        return value.map(String).join(" ");
    }

    return typeof value === "string"
        ? value
        : "Please check this field.";
}

function FormField({
    id,
    label,
    icon: Icon,
    error,
    ...inputProps
}) {
    return (
        <div className="min-w-0 space-y-2">
            <label
                htmlFor={id}
                className="block text-[13px] font-semibold text-[#665E53]"
            >
                {label} <span className="text-red-600">*</span>
            </label>

            <div className="group relative">
                <Icon
                    size={17}
                    className="
                        pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2
                        text-[#716658] transition-colors duration-200
                        group-focus-within:text-[#211E1A]
                    "
                />

                <input
                    id={id}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-error` : undefined}
                    className={`${inputClass} pl-11`}
                    {...inputProps}
                />
            </div>

            {error && (
                <p
                    id={`${id}-error`}
                    role="alert"
                    className="flex items-start gap-1.5 text-xs text-red-700"
                >
                    <AlertCircle
                        size={14}
                        className="mt-px shrink-0"
                    />
                    <span>{error}</span>
                </p>
            )}
        </div>
    );
}

// =====================================================
// ADD SUPERVISOR MODAL
// =====================================================

export default function AddSupervisor({
    open,
    onClose,
    onCreated,
}) {
    const [form, setForm] = useState(initialForm);
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [createdSupervisor, setCreatedSupervisor] =
        useState(null);

    const submittingRef = useRef(false);
    const dialogRef = useRef(null);
    const closeRef = useRef(null);

    useEffect(() => {
        if (!open) return;

        setForm(initialForm);
        setErrors({});
        setCreatedSupervisor(null);

        const previousOverflow = document.body.style.overflow;
        const previousFocus = document.activeElement;

        document.body.style.overflow = "hidden";
        closeRef.current?.focus();

        return () => {
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus?.();
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                if (!submittingRef.current) onClose();
                return;
            }

            if (event.key !== "Tab" || !dialogRef.current) {
                return;
            }

            const elements = [
                ...dialogRef.current.querySelectorAll(
                    "button:not([disabled]), input:not([disabled]), a[href]"
                ),
            ];

            if (!elements.length) return;

            const first = elements[0];
            const last = elements[elements.length - 1];

            if (event.shiftKey && document.activeElement === first) {
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

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    const updateField = (field, value) => {
        setForm((previous) => ({
            ...previous,
            [field]: value,
        }));

        setErrors((previous) => ({
            ...previous,
            [field]: "",
            general: "",
        }));
    };

    const validate = () => {
        const nextErrors = {};

        if (!form.first_name.trim()) {
            nextErrors.first_name = "First name is required.";
        }

        if (!form.last_name.trim()) {
            nextErrors.last_name = "Last name is required.";
        }

        if (!form.phone.trim()) {
            nextErrors.phone = "Phone number is required.";
        } else if (!/^\+?[0-9]{10,15}$/.test(form.phone.trim())) {
            nextErrors.phone = "Enter a valid phone number.";
        }

        if (!form.email.trim()) {
            nextErrors.email = "Email is required.";
        } else if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
        ) {
            nextErrors.email = "Enter a valid email address.";
        }

        if (!form.username.trim()) {
            nextErrors.username = "Username is required.";
        } else if (
            !/^[a-zA-Z0-9_.@+-]+$/.test(form.username.trim())
        ) {
            nextErrors.username =
                "Use letters, numbers, and _.@+- only.";
        }

        setErrors(nextErrors);

        return Object.keys(nextErrors).length === 0;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (submittingRef.current || createdSupervisor) return;
        if (!validate()) return;

        submittingRef.current = true;
        setSubmitting(true);
        setErrors({});

        const payload = {
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            username: form.username.trim(),
        };

        try {
            const response =
                await supervisorApi.createSupervisor(payload);

            setCreatedSupervisor({
                ...payload,
                ...response,
            });

            onCreated?.(response);
        } catch (error) {
            const data = error.response?.data;

            if (data && typeof data === "object") {
                const nextErrors = {};

                for (const field of [
                    "first_name",
                    "last_name",
                    "phone",
                    "email",
                    "username",
                ]) {
                    if (data[field]) {
                        nextErrors[field] = getError(data[field]);
                    }
                }

                nextErrors.general = data.detail
                    ? getError(data.detail)
                    : data.non_field_errors
                        ? getError(data.non_field_errors)
                        : Object.keys(nextErrors).length
                            ? ""
                            : "Unable to create supervisor. Check the details.";

                setErrors(nextErrors);
            } else {
                setErrors({
                    general: error.response
                        ? "Unable to create supervisor. Please try again."
                        : "Unable to connect to RARE. Check your connection.",
                });
            }
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    };

    const fullName = createdSupervisor
        ? [
            createdSupervisor.first_name,
            createdSupervisor.last_name,
        ]
            .filter(Boolean)
            .join(" ")
        : "";

    // Rendered in a portal so no parent transform, overflow or
    // stacking context can clip or offset the overlay.
    return createPortal(
        <>
            <style>{modalCss}</style>

            {submitting && (
                <LoadingScreen message="Creating supervisor..." />
            )}

            <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">

                {/* BACKDROP */}
                <div
                    aria-hidden="true"
                    onMouseDown={() => {
                        if (!submittingRef.current) onClose();
                    }}
                    className="rare-backdrop absolute inset-0 bg-[#211E1A]/50 backdrop-blur-sm"
                />

                {/* MODAL */}
                <section
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="add-supervisor-title"
                    className="
                        rare-mobile-sheet rare-modal relative flex max-h-[94dvh]
                        w-full max-w-162.5 flex-col overflow-hidden
                        rounded-t-[28px] bg-[#FFFDFA]
                        shadow-[0_-12px_50px_rgba(33,30,26,0.22)]
                        sm:max-h-[90dvh] sm:rounded-[28px]
                        sm:border sm:border-[#E9E1D7]
                        sm:shadow-[0_28px_80px_rgba(33,30,26,0.28)]
                    "
                >
                    {/* Mobile sheet handle */}
                    <div
                        aria-hidden="true"
                        className="flex shrink-0 justify-center pt-2.5 sm:hidden"
                    >
                        <span className="h-1 w-10 rounded-full bg-[#E4DCCD]" />
                    </div>

                    {/* HEADER */}
                    <header className="rare-page-header flex shrink-0 items-start justify-between gap-4 border-b border-[#EEE6DC] bg-linear-to-b from-[#FFFDFA] to-[#FAF5ED] px-5 pb-4 pt-3 sm:px-8 sm:py-6">
                        <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
                            <span
                                className={`hidden shrink-0 rounded-2xl p-3 min-[400px]:block ${createdSupervisor ? tones.green : tones.violet
                                    }`}
                            >
                                {createdSupervisor ? (
                                    <CheckCircle2 size={24} strokeWidth={1.7} />
                                ) : (
                                    <UserRoundPlus size={24} strokeWidth={1.7} />
                                )}
                            </span>

                            <div className="min-w-0">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#716658]">
                                    RARE Team Management
                                </p>

                                <h2
                                    id="add-supervisor-title"
                                    className="mt-1 text-xl font-bold tracking-tight text-[#211E1A] sm:text-2xl"
                                >
                                    {createdSupervisor
                                        ? "Supervisor Created"
                                        : "Add New Supervisor"}
                                </h2>

                                <p className="mt-1 text-xs text-[#716658] sm:text-sm">
                                    {createdSupervisor
                                        ? "The account has been created successfully."
                                        : "Enter the new supervisor's account details."}
                                </p>
                            </div>
                        </div>

                        <button
                            ref={closeRef}
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            aria-label="Close modal"
                            className="
                                group shrink-0 rounded-full bg-[#F1EADF] p-2.5 text-[#211E1A]
                                transition-all duration-200 ease-out
                                hover:bg-[#E7DDCE]
                                active:scale-95
                                focus-visible:outline-none focus-visible:ring-2
                                focus-visible:ring-[#211E1A]/30
                                disabled:opacity-50
                            "
                        >
                            <X
                                size={20}
                                className="
                                    transition-transform duration-300 ease-out
                                    group-hover:rotate-90
                                    motion-reduce:transition-none
                                    motion-reduce:group-hover:rotate-0
                                "
                            />
                        </button>
                    </header>

                    {createdSupervisor ? (
                        /* SUCCESS VIEW */
                        <div className="overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-8">
                            <div className="text-center">
                                <span className="rare-badge mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E6F4EA] text-[#16A34A] shadow-[0_8px_24px_rgba(22,163,74,0.18)]">
                                    <CheckCircle2 size={34} />
                                </span>

                                <h3 className="rare-rise mt-4 text-lg font-bold text-[#211E1A]" style={{ "--d": "120ms" }}>
                                    Supervisor added successfully
                                </h3>

                                <p className="rare-rise mt-2 text-sm text-[#716658]" style={{ "--d": "180ms" }}>
                                    This account can now be assigned to projects.
                                </p>
                            </div>

                            <div
                                className="rare-rise mt-6 grid gap-x-4 gap-y-5 rounded-2xl bg-[#F8F4EE] p-4 sm:grid-cols-2 sm:p-5"
                                style={{ "--d": "240ms" }}
                            >
                                {[
                                    ["Full Name", fullName, UserRound, "blue"],
                                    ["Username", createdSupervisor.username, AtSign, "violet"],
                                    ["Phone Number", createdSupervisor.phone, Phone, "green"],
                                    ["Email", createdSupervisor.email, Mail, "orange"],
                                ].map(([label, value, Icon, tone]) => (
                                    <div key={label} className="flex min-w-0 items-start gap-3">
                                        <span className={`shrink-0 rounded-xl p-2.5 ${tones[tone]}`}>
                                            <Icon size={17} strokeWidth={1.8} />
                                        </span>

                                        <div className="min-w-0">
                                            <p className="text-xs font-bold uppercase tracking-widest text-[#716658]">
                                                {label}
                                            </p>

                                            <p className="mt-1 break-all text-sm font-semibold text-[#211E1A]">
                                                {value || "Not provided"}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div
                                className="rare-rise mt-5 flex gap-3 rounded-xl bg-[#FFF3E0]/60 p-4"
                                style={{ "--d": "300ms" }}
                            >
                                <span className={`h-fit shrink-0 rounded-lg p-2 ${tones.orange}`}>
                                    <LockKeyhole size={17} />
                                </span>

                                <p className="text-xs leading-6 text-[#665E53]">
                                    The Password Will Generate Automatically
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={onClose}
                                className="
                                    mt-6 w-full rounded-xl bg-[#211E1A] px-5 py-3.5
                                    text-sm font-semibold text-white
                                    transition-all duration-200 ease-out
                                    hover:-translate-y-0.5 hover:bg-[#38332C]
                                    hover:shadow-[0_10px_24px_rgba(33,30,26,0.24)]
                                    active:translate-y-0 active:scale-[0.98]
                                    focus-visible:outline-none focus-visible:ring-2
                                    focus-visible:ring-[#211E1A]/40 focus-visible:ring-offset-2
                                    motion-reduce:hover:translate-y-0
                                "
                            >
                                Done
                            </button>
                        </div>
                    ) : (
                        /* CREATION FORM */
                        <form
                            onSubmit={handleSubmit}
                            noValidate
                            className="flex min-h-0 flex-1 flex-col"
                        >
                            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-7">
                                <div className="flex items-start gap-3.5 rounded-2xl bg-[#E8F0FE]/60 p-4">
                                    <span className={`shrink-0 rounded-xl p-2.5 ${tones.blue}`}>
                                        <Info size={20} strokeWidth={1.8} />
                                    </span>

                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-[#211E1A]">
                                            Supervisor Information
                                        </p>

                                        <p className="mt-1 text-xs leading-5 text-[#665E53]">
                                            All five fields are required. Django
                                            will configure the password automatically.
                                        </p>
                                    </div>
                                </div>

                                {/* NAME */}
                                <div className="grid gap-5 sm:grid-cols-2">
                                    <FormField
                                        id="supervisor-first-name"
                                        label="First Name"
                                        icon={UserRound}
                                        type="text"
                                        autoComplete="given-name"
                                        placeholder="First name"
                                        maxLength={150}
                                        required
                                        disabled={submitting}
                                        value={form.first_name}
                                        error={errors.first_name}
                                        onChange={(e) =>
                                            updateField("first_name", e.target.value)
                                        }
                                    />

                                    <FormField
                                        id="supervisor-last-name"
                                        label="Last Name"
                                        icon={UserRound}
                                        type="text"
                                        autoComplete="family-name"
                                        placeholder="Last name"
                                        maxLength={150}
                                        required
                                        disabled={submitting}
                                        value={form.last_name}
                                        error={errors.last_name}
                                        onChange={(e) =>
                                            updateField("last_name", e.target.value)
                                        }
                                    />
                                </div>

                                {/* PHONE */}
                                <FormField
                                    id="supervisor-phone"
                                    label="Phone Number"
                                    icon={Phone}
                                    type="tel"
                                    inputMode="tel"
                                    autoComplete="tel"
                                    placeholder="Enter login phone number"
                                    required
                                    disabled={submitting}
                                    value={form.phone}
                                    error={errors.phone}
                                    onChange={(e) =>
                                        updateField("phone", e.target.value)
                                    }
                                />

                                {/* EMAIL */}
                                <FormField
                                    id="supervisor-email"
                                    label="Email Address"
                                    icon={Mail}
                                    type="email"
                                    autoComplete="email"
                                    placeholder="supervisor@example.com"
                                    required
                                    disabled={submitting}
                                    value={form.email}
                                    error={errors.email}
                                    onChange={(e) =>
                                        updateField("email", e.target.value)
                                    }
                                />

                                {/* USERNAME */}
                                <FormField
                                    id="supervisor-username"
                                    label="Username"
                                    icon={AtSign}
                                    type="text"
                                    autoComplete="off"
                                    placeholder="Enter unique username"
                                    maxLength={150}
                                    required
                                    disabled={submitting}
                                    value={form.username}
                                    error={errors.username}
                                    onChange={(e) =>
                                        updateField("username", e.target.value)
                                    }
                                />

                                <div className="flex items-start gap-3 rounded-xl border border-[#E7DED2] p-4">
                                    <span className={`shrink-0 rounded-lg p-2 ${tones.orange}`}>
                                        <LockKeyhole size={17} />
                                    </span>

                                    <p className="text-xs leading-6 text-[#716658]">
                                        No password entry is needed.
                                        The existing Django account-creation
                                        logic handles the initial password.
                                    </p>
                                </div>

                                {errors.general && (
                                    <div
                                        role="alert"
                                        className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                                    >
                                        <AlertCircle
                                            size={18}
                                            className="mt-0.5 shrink-0"
                                        />
                                        <span className="min-w-0 wrap-break-word">
                                            {errors.general}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* FOOTER */}
                            <footer
                                className="
                                    flex shrink-0 flex-col-reverse items-stretch gap-2.5
                                    border-t border-[#EEE6DC] bg-[#FFFDFA]
                                    px-5 pt-4
                                    pb-[max(1rem,env(safe-area-inset-bottom))]
                                    sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8
                                "
                            >
                                <p className="hidden text-xs text-[#716658] sm:mr-auto sm:block">
                                    <span className="text-red-600">*</span> Required fields
                                </p>

                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={submitting}
                                    className="
                                        rounded-xl border border-[#E4DCCD] px-5 py-3
                                        text-sm font-semibold text-[#211E1A]
                                        transition-all duration-200 ease-out
                                        hover:border-[#CFC4B5] hover:bg-[#F1EADF]
                                        active:scale-[0.98]
                                        focus-visible:outline-none focus-visible:ring-2
                                        focus-visible:ring-[#211E1A]/30
                                        disabled:opacity-50
                                    "
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="
                                        group inline-flex items-center justify-center gap-2
                                        rounded-xl bg-[#211E1A] px-6 py-3
                                        text-sm font-semibold text-white
                                        transition-all duration-200 ease-out
                                        hover:-translate-y-0.5 hover:bg-[#38332C]
                                        hover:shadow-[0_10px_24px_rgba(33,30,26,0.24)]
                                        active:translate-y-0 active:scale-[0.98]
                                        focus-visible:outline-none focus-visible:ring-2
                                        focus-visible:ring-[#211E1A]/40 focus-visible:ring-offset-2
                                        disabled:pointer-events-none disabled:opacity-50
                                        motion-reduce:hover:translate-y-0
                                    "
                                >
                                    <UserRoundPlus
                                        size={18}
                                        className="
                                            transition-transform duration-300 ease-out
                                            group-hover:scale-110
                                            motion-reduce:transition-none
                                            motion-reduce:group-hover:scale-100
                                        "
                                    />
                                    Create Supervisor
                                </button>
                            </footer>
                        </form>
                    )}
                </section>
            </div>
        </>,
        document.body
    );
}