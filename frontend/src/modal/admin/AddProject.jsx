import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    AlertCircle,
    Building2,
    CalendarDays,
    Check,
    ChevronDown,
    FolderPlus,
    ImagePlus,
    Info,
    MapPin,
    Upload,
    X,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import LoadingScreen from "../../components/LoadingScreen";

// =====================================================
// FORM VALIDATION
// =====================================================

const projectSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1, "Project name is required.")
            .max(200, "Project name cannot exceed 200 characters."),

        category: z
            .string()
            .min(1, "Please select a project category."),

        client_name: z.string(),
        location: z.string(),
        description: z.string(),
        start_date: z.string(),
        end_date: z.string(),
        status: z.string(),
    })
    .superRefine((values, ctx) => {
        if (
            values.start_date &&
            values.end_date &&
            values.end_date < values.start_date
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["end_date"],
                message:
                    "Expected end date cannot be earlier than start date.",
            });
        }
    });

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

  .rare-backdrop {
    animation: rare-fade 220ms ease-out;
  }

  .rare-modal {
    animation: rare-pop 340ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* On phones the modal becomes a bottom sheet */
  @media (max-width: 639px) {
    .rare-modal {
      animation: rare-sheet 380ms cubic-bezier(0.22, 1, 0.36, 1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rare-backdrop,
    .rare-modal {
      animation: none !important;
    }
  }
`;

// Icon tile tones (literal class strings so Tailwind can detect them)
const tones = {
    blue: "bg-[#E8F0FE] text-[#2563EB]",
    orange: "bg-[#FFF3E0] text-[#EA8A12]",
    green: "bg-[#E6F4EA] text-[#16A34A]",
};

const inputStyle = `
  h-12 w-full rounded-xl
  border border-[#E4DCCD]
  bg-[#FFFDFA] px-4
  text-sm text-[#211E1A]
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

function Field({
    label,
    htmlFor,
    error,
    required = false,
    children,
}) {
    return (
        <div className="min-w-0 space-y-2">
            <label
                htmlFor={htmlFor}
                className="block text-[13px] font-semibold text-[#665E53]"
            >
                {label}
                {required && (
                    <span className="ml-1 text-red-600">*</span>
                )}
            </label>

            {children}

            {error && (
                <p
                    role="alert"
                    className="flex items-start gap-1.5 text-xs text-red-700"
                >
                    <AlertCircle
                        size={14}
                        className="mt-px shrink-0"
                    />
                    <span>{error.message}</span>
                </p>
            )}
        </div>
    );
}

function SectionTitle({ icon: Icon, tone, title, description }) {
    return (
        <div className="flex items-center gap-3">
            <span
                className={`shrink-0 rounded-xl p-2.5 ${tones[tone]}`}
            >
                <Icon size={18} strokeWidth={1.8} />
            </span>

            <div className="min-w-0">
                <h3 className="text-[15px] font-bold leading-tight text-[#211E1A]">
                    {title}
                </h3>

                {description && (
                    <p className="mt-0.5 text-xs text-[#716658]">
                        {description}
                    </p>
                )}
            </div>
        </div>
    );
}

function getItems(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.results)) {
        return response.results;
    }

    throw new Error("Unexpected category API response.");
}

function readError(value) {
    if (Array.isArray(value)) {
        return value.map(readError).join(" ");
    }

    if (typeof value === "string") {
        return value;
    }

    return "Please check this field.";
}

// =====================================================
// ADD PROJECT MODAL
// =====================================================

export default function AddProject({
    open,
    onClose,
    onCreated,
    initialCategoryId = "",
}) {
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] =
        useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [serverError, setServerError] = useState("");
    const [coverFile, setCoverFile] = useState(null);
    const [coverPreview, setCoverPreview] = useState(null);
    const [dragging, setDragging] = useState(false);

    const fileInputRef = useRef(null);
    const modalRef = useRef(null);
    const closeRef = useRef(null);

    const {
        register,
        handleSubmit,
        reset,
        setError,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(projectSchema),
        defaultValues: {
            name: "",
            category: initialCategoryId,
            client_name: "",
            location: "",
            description: "",
            start_date: "",
            end_date: "",
            status: "ACTIVE",
        },
        mode: "onBlur",
    });

    const isBusy = loadingCategories || submitting;

    // ---------------------------------------------
    // LOAD CATEGORY OPTIONS
    // ---------------------------------------------

    useEffect(() => {
        if (!open) return;

        let cancelled = false;

        reset({
            name: "",
            category: initialCategoryId,
            client_name: "",
            location: "",
            description: "",
            start_date: "",
            end_date: "",
            status: "ACTIVE",
        });

        setCoverFile(null);
        setServerError("");
        setCategories([]);
        setLoadingCategories(true);

        async function loadCategories() {
            try {
                const response = await projectApi.getCategories();

                if (!cancelled) {
                    setCategories(getItems(response));
                }
            } catch (error) {
                if (!cancelled) {
                    setServerError(
                        error.response?.status === 403
                            ? "You do not have permission to load categories."
                            : "Unable to load project categories. Close and reopen the form to retry."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoadingCategories(false);
                }
            }
        }

        loadCategories();

        return () => {
            cancelled = true;
        };
    }, [open, initialCategoryId, reset]);

    // ---------------------------------------------
    // COVER IMAGE PREVIEW
    // ---------------------------------------------

    useEffect(() => {
        if (!coverFile) {
            setCoverPreview(null);
            return;
        }

        const previewUrl = URL.createObjectURL(coverFile);
        setCoverPreview(previewUrl);

        return () => URL.revokeObjectURL(previewUrl);
    }, [coverFile]);

    // Returns true when the file was accepted
    const acceptCoverFile = (file) => {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
        ];

        const allowedExtensions =
            /\.(jpe?g|png|webp)$/i;

        if (
            !allowedTypes.includes(file.type) ||
            !allowedExtensions.test(file.name)
        ) {
            setServerError(
                "Please upload a JPG, JPEG, PNG, or WEBP image."
            );

            return false;
        }

        setServerError("");
        setCoverFile(file);

        return true;
    };

    const handleImageChange = (event) => {
        const file = event.target.files?.[0];

        if (!file) return;

        if (!acceptCoverFile(file)) {
            event.target.value = "";
        }
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setDragging(false);

        if (isBusy) return;

        const file = event.dataTransfer?.files?.[0];

        if (file) acceptCoverFile(file);
    };

    const removeCover = () => {
        setCoverFile(null);

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    // ---------------------------------------------
    // MODAL BEHAVIOR
    // ---------------------------------------------

    useEffect(() => {
        if (!open) return;

        const previousOverflow = document.body.style.overflow;
        const previousFocus = document.activeElement;

        document.body.style.overflow = "hidden";
        closeRef.current?.focus();

        const handleKeyDown = (event) => {
            if (event.key === "Escape" && !isBusy) {
                onClose();
            }

            if (event.key === "Tab" && modalRef.current) {
                const elements = Array.from(
                    modalRef.current.querySelectorAll(
                        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
                    )
                );

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
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
            previousFocus?.focus?.();
        };
    }, [open, isBusy, onClose]);

    // ---------------------------------------------
    // SUBMIT PROJECT
    // ---------------------------------------------

    const onSubmit = async (values) => {
        if (isBusy) return;

        setSubmitting(true);
        setServerError("");

        try {
            const formData = new FormData();

            formData.append("name", values.name.trim());
            formData.append("category", values.category);

            if (values.client_name.trim()) {
                formData.append(
                    "client_name",
                    values.client_name.trim()
                );
            }

            if (values.location.trim()) {
                formData.append(
                    "location",
                    values.location.trim()
                );
            }

            if (values.description.trim()) {
                formData.append(
                    "description",
                    values.description.trim()
                );
            }

            if (values.start_date) {
                formData.append("start_date", values.start_date);
            }

            if (values.end_date) {
                formData.append("end_date", values.end_date);
            }

            if (values.status) {
                formData.append("status", values.status);
            }

            if (coverFile) {
                formData.append("cover_image", coverFile);
            }

            const createdProject =
                await projectApi.createProject(formData);

            if (!createdProject?.id) {
                throw new Error(
                    "Project created, but the response did not include its ID."
                );
            }

            onCreated(createdProject);
        } catch (error) {
            const data = error.response?.data;

            const fields = [
                "name",
                "category",
                "client_name",
                "location",
                "description",
                "start_date",
                "end_date",
                "status",
            ];

            let handledFieldError = false;

            if (data && typeof data === "object") {
                for (const field of fields) {
                    if (data[field]) {
                        handledFieldError = true;

                        setError(field, {
                            type: "server",
                            message: readError(data[field]),
                        });
                    }
                }
            }

            if (data?.cover_image) {
                setServerError(
                    `Cover image: ${readError(data.cover_image)}`
                );
            } else if (!handledFieldError) {
                if (typeof data?.detail === "string") {
                    setServerError(data.detail);
                } else if (!error.response) {
                    setServerError(
                        "Unable to reach the RARE backend. Check your connection."
                    );
                } else {
                    setServerError(
                        "Project could not be created. Please review the information and try again."
                    );
                }
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    // Rendered in a portal so no parent transform, overflow or
    // stacking context can clip or offset the overlay.
    return createPortal(
        <>
            <style>{modalCss}</style>

            {submitting && (
                <LoadingScreen message="Creating project..." />
            )}

            <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">

                {/* BACKDROP */}
                <div
                    aria-hidden="true"
                    onClick={() => {
                        if (!isBusy) onClose();
                    }}
                    className="rare-backdrop absolute inset-0 bg-[#211E1A]/50 backdrop-blur-sm"
                />

                {/* MODAL */}
                <section
                    ref={modalRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="add-project-title"
                    className="
                        rare-mobile-sheet rare-modal relative flex max-h-[94dvh]
                        w-full max-w-190 flex-col overflow-hidden
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
                            <span className="hidden shrink-0 rounded-2xl bg-[#E8F0FE] p-3 text-[#2563EB] min-[400px]:block">
                                <FolderPlus size={24} strokeWidth={1.7} />
                            </span>

                            <div className="min-w-0">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#716658]">
                                    Project Management
                                </p>

                                <h2
                                    id="add-project-title"
                                    className="mt-1 text-xl font-bold tracking-tight text-[#211E1A] sm:text-2xl"
                                >
                                    Create New Project
                                </h2>

                                <p className="mt-1 text-xs text-[#716658] sm:text-sm">
                                    Enter the details to create a new RARE project.
                                </p>
                            </div>
                        </div>

                        <button
                            ref={closeRef}
                            type="button"
                            onClick={onClose}
                            disabled={isBusy}
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

                    {/* FORM */}
                    <form
                        id="add-project-form"
                        onSubmit={handleSubmit(onSubmit)}
                        noValidate
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-7">

                            {/* COVER IMAGE */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-[15px] font-bold text-[#211E1A]">
                                        Project Cover
                                    </h3>

                                    <span className="rounded-full bg-[#F1EADF] px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#716658]">
                                        Optional
                                    </span>
                                </div>

                                <div
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        if (!isBusy) setDragging(true);
                                    }}
                                    onDragLeave={() => setDragging(false)}
                                    onDrop={handleDrop}
                                    className={`
                                        relative overflow-hidden rounded-2xl border border-dashed
                                        transition-all duration-200
                                        focus-within:ring-4 focus-within:ring-[#211E1A]/10
                                        ${dragging
                                            ? "border-[#2563EB] bg-[#E8F0FE]/60"
                                            : "border-[#D7CBBC] bg-[#F5EFE7]"
                                        }
                                    `}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".jpg,.jpeg,.png,.webp"
                                        disabled={isBusy}
                                        onChange={handleImageChange}
                                        className="sr-only"
                                        id="project-cover-upload"
                                    />

                                    {coverPreview ? (
                                        <div className="group relative h-44 sm:h-56">
                                            <img
                                                src={coverPreview}
                                                alt="Selected project cover preview"
                                                className="h-full w-full object-cover"
                                            />

                                            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-4 pb-4 pt-12">
                                                <p className="truncate text-xs font-medium text-white">
                                                    {coverFile?.name}
                                                </p>
                                            </div>

                                            <div className="absolute right-3 top-3 flex items-center gap-2">
                                                <label
                                                    htmlFor="project-cover-upload"
                                                    className="
                                                        cursor-pointer rounded-full bg-[#FFFDFA] px-3.5 py-2
                                                        text-xs font-semibold text-[#211E1A] shadow
                                                        transition-all duration-200
                                                        hover:bg-white hover:shadow-md
                                                        active:scale-95
                                                    "
                                                >
                                                    Change
                                                </label>

                                                <button
                                                    type="button"
                                                    aria-label="Remove selected image"
                                                    onClick={removeCover}
                                                    disabled={isBusy}
                                                    className="
                                                        rounded-full bg-[#FFFDFA] p-2 text-[#211E1A] shadow
                                                        transition-all duration-200
                                                        hover:bg-white hover:text-red-700 hover:shadow-md
                                                        active:scale-95
                                                        focus-visible:outline-none focus-visible:ring-2
                                                        focus-visible:ring-[#211E1A]/40
                                                    "
                                                >
                                                    <X size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <label
                                            htmlFor="project-cover-upload"
                                            className="group flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2.5 p-5 text-center sm:min-h-52"
                                        >
                                            <span
                                                className="
                                                    rounded-2xl bg-[#E8F0FE] p-3.5 text-[#2563EB]
                                                    transition-all duration-300 ease-out
                                                    group-hover:scale-110 group-hover:bg-[#2563EB] group-hover:text-white
                                                    motion-reduce:transition-none
                                                    motion-reduce:group-hover:transform-none
                                                "
                                            >
                                                <ImagePlus size={27} strokeWidth={1.6} />
                                            </span>

                                            <span className="text-sm font-semibold text-[#211E1A]">
                                                {dragging
                                                    ? "Drop the image here"
                                                    : "Select a project cover image"}
                                            </span>

                                            <span className="text-xs text-[#716658]">
                                                JPG, JPEG, PNG or WEBP
                                            </span>

                                            <span className="mt-1 inline-flex items-center gap-2 rounded-full bg-[#FFFDFA] px-4 py-2 text-xs font-semibold text-[#211E1A] shadow-sm ring-1 ring-[#E4DCCD] transition-all duration-200 group-hover:ring-[#211E1A]">
                                                <Upload size={15} />
                                                Browse files
                                            </span>
                                        </label>
                                    )}
                                </div>
                            </div>

                            <hr className="border-[#F0E9DF]" />

                            {/* BASIC INFORMATION */}
                            <section className="space-y-5">
                                <SectionTitle
                                    icon={Building2}
                                    tone="blue"
                                    title="Project Information"
                                    description="Core details about this project"
                                />

                                <Field
                                    label="Project Name"
                                    htmlFor="project-name"
                                    required
                                    error={errors.name}
                                >
                                    <input
                                        {...register("name")}
                                        id="project-name"
                                        aria-invalid={Boolean(errors.name)}
                                        disabled={isBusy}
                                        placeholder="Enter project name"
                                        maxLength={200}
                                        className={inputStyle}
                                    />
                                </Field>

                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field
                                        label="Project Category"
                                        htmlFor="project-category"
                                        required
                                        error={errors.category}
                                    >
                                        <div className="relative">
                                            <select
                                                {...register("category")}
                                                id="project-category"
                                                aria-invalid={Boolean(errors.category)}
                                                disabled={isBusy}
                                                className={`${inputStyle} appearance-none pr-10`}
                                            >
                                                <option value="">
                                                    {loadingCategories
                                                        ? "Loading categories..."
                                                        : "Select category"}
                                                </option>

                                                {categories.map((category) => (
                                                    <option
                                                        key={category.id}
                                                        value={category.id}
                                                    >
                                                        {category.name}
                                                    </option>
                                                ))}
                                            </select>

                                            <ChevronDown
                                                size={17}
                                                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#716658]"
                                            />
                                        </div>
                                    </Field>

                                    {/* STATUS (segmented control) */}
                                    <fieldset className="min-w-0 space-y-2">
                                        <legend className="mb-2 block text-[13px] font-semibold text-[#665E53]">
                                            Project Status
                                        </legend>

                                        <div className="grid h-12 grid-cols-2 gap-1 rounded-xl border border-[#E4DCCD] bg-[#F5EFE7] p-1">
                                            {[
                                                {
                                                    value: "ACTIVE",
                                                    label: "Active",
                                                    dot: "bg-[#16A34A]",
                                                },
                                                {
                                                    value: "MAINTENANCE",
                                                    label: "Maintenance",
                                                    dot: "bg-[#EA8A12]",
                                                },
                                            ].map((option) => (
                                                <label
                                                    key={option.value}
                                                    className="relative min-w-0 cursor-pointer"
                                                >
                                                    <input
                                                        type="radio"
                                                        value={option.value}
                                                        disabled={isBusy}
                                                        {...register("status")}
                                                        className="peer sr-only"
                                                    />

                                                    <span
                                                        className="
                                                            flex h-full items-center justify-center gap-2 rounded-lg
                                                            px-2 text-sm font-semibold text-[#716658]
                                                            transition-all duration-200
                                                            hover:text-[#211E1A]
                                                            peer-checked:bg-[#FFFDFA] peer-checked:text-[#211E1A]
                                                            peer-checked:shadow-[0_2px_8px_rgba(33,30,26,0.10)]
                                                            peer-focus-visible:ring-2 peer-focus-visible:ring-[#211E1A]/40
                                                            peer-disabled:cursor-not-allowed peer-disabled:opacity-50
                                                        "
                                                    >
                                                        <span
                                                            className={`h-2 w-2 shrink-0 rounded-full ${option.dot}`}
                                                        />
                                                        <span className="truncate">
                                                            {option.label}
                                                        </span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>

                                        {errors.status && (
                                            <p
                                                role="alert"
                                                className="flex items-start gap-1.5 text-xs text-red-700"
                                            >
                                                <AlertCircle
                                                    size={14}
                                                    className="mt-px shrink-0"
                                                />
                                                <span>{errors.status.message}</span>
                                            </p>
                                        )}
                                    </fieldset>
                                </div>

                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field
                                        label="Client Name"
                                        htmlFor="project-client"
                                        error={errors.client_name}
                                    >
                                        <input
                                            {...register("client_name")}
                                            id="project-client"
                                            disabled={isBusy}
                                            placeholder="Client name"
                                            className={inputStyle}
                                        />
                                    </Field>

                                    <Field
                                        label="Location"
                                        htmlFor="project-location"
                                        error={errors.location}
                                    >
                                        <div className="relative">
                                            <MapPin
                                                size={17}
                                                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#716658]"
                                            />

                                            <input
                                                {...register("location")}
                                                id="project-location"
                                                disabled={isBusy}
                                                placeholder="City or site location"
                                                className={`${inputStyle} pl-10`}
                                            />
                                        </div>
                                    </Field>
                                </div>

                                <Field
                                    label="Project Description"
                                    htmlFor="project-description"
                                    error={errors.description}
                                >
                                    <textarea
                                        {...register("description")}
                                        id="project-description"
                                        rows={3}
                                        disabled={isBusy}
                                        placeholder="Describe the project scope and key details..."
                                        className="
                                            w-full resize-y rounded-xl
                                            border border-[#E4DCCD]
                                            bg-[#FFFDFA] px-4 py-3
                                            text-sm text-[#211E1A]
                                            outline-none transition-all duration-200
                                            placeholder:text-[#AAA196]
                                            hover:border-[#CFC4B5]
                                            focus:border-[#211E1A]
                                            focus:ring-4 focus:ring-[#211E1A]/10
                                            disabled:cursor-not-allowed disabled:opacity-50
                                        "
                                    />
                                </Field>
                            </section>

                            <hr className="border-[#F0E9DF]" />

                            {/* SCHEDULE */}
                            <section className="space-y-5">
                                <SectionTitle
                                    icon={CalendarDays}
                                    tone="orange"
                                    title="Project Schedule"
                                    description="Planned start and completion"
                                />

                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field
                                        label="Start Date"
                                        htmlFor="project-start"
                                        error={errors.start_date}
                                    >
                                        <input
                                            type="date"
                                            {...register("start_date")}
                                            id="project-start"
                                            disabled={isBusy}
                                            className={inputStyle}
                                        />
                                    </Field>

                                    <Field
                                        label="Expected End Date"
                                        htmlFor="project-end"
                                        error={errors.end_date}
                                    >
                                        <input
                                            type="date"
                                            {...register("end_date")}
                                            id="project-end"
                                            aria-invalid={Boolean(errors.end_date)}
                                            disabled={isBusy}
                                            className={inputStyle}
                                        />
                                    </Field>
                                </div>

                                <div className="flex items-start gap-3 rounded-xl bg-[#E8F0FE]/60 p-3.5">
                                    <Info
                                        size={17}
                                        className="mt-0.5 shrink-0 text-[#2563EB]"
                                    />

                                    <p className="text-xs leading-5 text-[#665E53]">
                                        Both dates are optional. If provided, the
                                        expected end date must not be earlier than
                                        the start date.
                                    </p>
                                </div>
                            </section>

                            {/* ERROR */}
                            {serverError && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                                >
                                    <AlertCircle
                                        size={18}
                                        className="mt-0.5 shrink-0"
                                    />
                                    <span className="min-w-0 wrap-break-word">
                                        {serverError}
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
                                disabled={isBusy}
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
                                disabled={isBusy || !categories.length}
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
                                <Check
                                    size={17}
                                    className="
                                        transition-transform duration-300 ease-out
                                        group-hover:scale-125
                                        motion-reduce:transition-none
                                        motion-reduce:group-hover:scale-100
                                    "
                                />
                                Create Project
                            </button>
                        </footer>
                    </form>
                </section>
            </div>
        </>,
        document.body
    );
}