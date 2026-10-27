
import { useEffect, useRef, useState } from "react";
import {
    CalendarDays,
    FolderPen,
    ImagePlus,
    MapPin,
    Save,
    X,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { getMediaUrl } from "../../utils/mediaUrl";
import LoadingScreen from "../../components/LoadingScreen";

const inputClass = `
  w-full rounded-xl border border-[#E3D9CC]
  bg-[#FFFDFA] px-4 py-3 text-sm text-[#211E1A]
  outline-none transition-all duration-200
  placeholder:text-[#A99D8E]
  focus:border-[#B9A48C]
  focus:ring-4 focus:ring-[#E9DFD2]/60
  disabled:opacity-50
`;

const initialValues = {
    name: "",
    category: "",
    client_name: "",
    description: "",
    location: "",
    start_date: "",
    end_date: "",
    status: "ACTIVE",
};

const STATUS_OPTIONS = [
    { value: "ACTIVE", label: "Active" },
    { value: "COMPLETED", label: "Completed" },
    { value: "ON_HOLD", label: "On Hold" },
    { value: "CANCELLED", label: "Cancelled" },
];

// Add MAINTENANCE to STATUS_OPTIONS only if
// your current Django Project model allows it.

function listItems(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.results)) {
        return response.results;
    }
    throw new Error("Unexpected category response.");
}

function fieldError(value) {
    if (Array.isArray(value)) return value.join(" ");
    if (typeof value === "string") return value;
    return "";
}

function getCategoryId(project) {
    const category = project?.category;

    if (category && typeof category === "object") {
        return String(category.id || "");
    }

    return String(
        category || project?.category_id || ""
    );
}

function Field({
    label,
    id,
    error,
    required = false,
    children,
}) {
    return (
        <div className="min-w-0 space-y-2">
            <label
                htmlFor={id}
                className="block text-sm font-semibold text-[#665E53]"
            >
                {label}
                {required && (
                    <span className="ml-1 text-red-600">*</span>
                )}
            </label>

            {children}

            {error && (
                <p role="alert" className="text-xs text-red-700">
                    {error}
                </p>
            )}
        </div>
    );
}

export default function EditProject({
    open,
    project,
    onClose,
    onUpdated,
}) {
    const [form, setForm] = useState(initialValues);
    const [categories, setCategories] = useState([]);
    const [coverFile, setCoverFile] = useState(null);
    const [preview, setPreview] = useState("");

    const [errors, setErrors] = useState({});
    const [busyMessage, setBusyMessage] = useState("");

    const busyRef = useRef(false);
    const fileRef = useRef(null);
    const dialogRef = useRef(null);
    const closeRef = useRef(null);

    // --------------------------------------------
    // RESET AND LOAD CATEGORIES
    // --------------------------------------------

    useEffect(() => {
        if (!open || !project?.id) return;

        let cancelled = false;

        setForm({
            name: project.name || "",
            category: getCategoryId(project),
            client_name: project.client_name || "",
            description: project.description || "",
            location: project.location || "",
            start_date: project.start_date || "",
            end_date: project.end_date || "",
            status: project.status || "ACTIVE",
        });

        setCoverFile(null);
        setErrors({});
        setCategories([]);

        const oldOverflow = document.body.style.overflow;
        const oldFocus = document.activeElement;

        document.body.style.overflow = "hidden";
        closeRef.current?.focus();

        async function fetchCategories() {
            busyRef.current = true;
            setBusyMessage("Loading project categories...");

            try {
                let response = await projectApi.getCategories();
                const all = [...listItems(response)];
                let page = 1;

                // Follow backend pagination using the
                // existing authenticated projectApi.
                while (response?.next) {
                    page += 1;
                    if (page > 500) {
                        throw new Error("Category pagination limit reached.");
                    }

                    response = await projectApi.getCategories({
                        page,
                    });

                    all.push(...listItems(response));
                }

                if (!cancelled) setCategories(all);
            } catch {
                if (!cancelled) {
                    setErrors((previous) => ({
                        ...previous,
                        categories:
                            "Unable to load categories. Close and reopen to retry.",
                    }));
                }
            } finally {
                if (!cancelled) {
                    busyRef.current = false;
                    setBusyMessage("");
                }
            }
        }

        fetchCategories();

        return () => {
            cancelled = true;
            document.body.style.overflow = oldOverflow;
            oldFocus?.focus?.();
        };
    }, [open, project]);

    // --------------------------------------------
    // COVER IMAGE PREVIEW
    // --------------------------------------------

    useEffect(() => {
        if (!coverFile) {
            setPreview("");
            return;
        }

        const url = URL.createObjectURL(coverFile);
        setPreview(url);

        return () => URL.revokeObjectURL(url);
    }, [coverFile]);

    // --------------------------------------------
    // ACCESSIBLE KEYBOARD CONTROLS
    // --------------------------------------------

    useEffect(() => {
        if (!open) return;

        function onKeyDown(event) {
            if (
                event.key === "Escape" &&
                !busyRef.current
            ) {
                onClose();
                return;
            }

            if (
                event.key !== "Tab" ||
                !dialogRef.current
            ) {
                return;
            }

            const elements = Array.from(
                dialogRef.current.querySelectorAll(
                    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
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
        }

        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose]);

    if (!open || !project?.id) return null;

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

    const handleImage = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (
            ![
                "image/jpeg",
                "image/png",
                "image/webp",
            ].includes(file.type)
        ) {
            setErrors((previous) => ({
                ...previous,
                cover_image:
                    "Select a JPG, PNG or WEBP image.",
            }));
            event.target.value = "";
            return;
        }

        setCoverFile(file);
        setErrors((previous) => ({
            ...previous,
            cover_image: "",
        }));
    };

    const validate = () => {
        const nextErrors = {};

        if (!form.name.trim()) {
            nextErrors.name = "Project name is required.";
        }

        if (!form.category) {
            nextErrors.category = "Select a category.";
        }

        if (
            form.start_date &&
            form.end_date &&
            form.end_date < form.start_date
        ) {
            nextErrors.end_date =
                "End date cannot be before start date.";
        }

        setErrors(nextErrors);

        return Object.keys(nextErrors).length === 0;
    };

    // --------------------------------------------
    // UPDATE PROJECT
    // --------------------------------------------

    const submit = async (event) => {
        event.preventDefault();

        if (busyRef.current || !validate()) return;

        busyRef.current = true;
        setBusyMessage("Updating project...");
        setErrors({});

        const data = new FormData();

        for (const field of [
            "name",
            "client_name",
            "description",
            "location",
            "start_date",
            "end_date",
            "status",
        ]) {
            // Empty optional dates are omitted because
            // DRF DateField rejects blank strings.
            if (
                (field === "start_date" || field === "end_date") &&
                !form[field]
            ) {
                // Send null for a previously set date
                // when the admin explicitly clears it.
                if (project[field]) {
                    data.append(field, "");
                }
                continue;
            }

            data.append(field, form[field]);
        }

        // The existing project frontend uses "category".
        data.append("category", form.category);

        if (coverFile) {
            data.append("cover_image", coverFile);
        }

        try {
            const updated = await projectApi.updateProject(
                project.id,
                data
            );

            // Parent refreshes overview data.
            await onUpdated?.(updated);

            onClose();
        } catch (error) {
            const response = error.response?.data || {};

            const nextErrors = {};

            for (const field of [
                "name",
                "category",
                "client_name",
                "description",
                "location",
                "start_date",
                "end_date",
                "status",
                "cover_image",
            ]) {
                if (response[field]) {
                    nextErrors[field] = fieldError(
                        response[field]
                    );
                }
            }

            nextErrors.general =
                fieldError(response.detail) ||
                fieldError(response.non_field_errors) ||
                (
                    !Object.values(nextErrors).some(Boolean)
                        ? "Could not update this project. Please try again."
                        : ""
                );

            setErrors(nextErrors);
        } finally {
            busyRef.current = false;
            setBusyMessage("");
        }
    };

    const existingImage = getMediaUrl(
        project.cover_image || project.category_image
    );

    const displayImage = preview || existingImage;

    const statusOptions = STATUS_OPTIONS.some(
        (option) => option.value === form.status
    )
        ? STATUS_OPTIONS
        : [
            ...STATUS_OPTIONS,
            {
                value: form.status,
                label: form.status.replaceAll("_", " "),
            },
        ];

    return (
        <>
            {busyMessage && (
                <LoadingScreen message={busyMessage} />
            )}

            {/* BACKDROP */}
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-[#211E1A]/55 p-0 backdrop-blur-sm sm:p-6"
                onMouseDown={(event) => {
                    if (
                        event.target === event.currentTarget &&
                        !busyRef.current
                    ) {
                        onClose();
                    }
                }}
            >
                {/* MODAL */}
                <section
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="edit-project-title"
                    className="rare-mobile-sheet flex max-h-[94dvh] w-full max-w-190 flex-col overflow-hidden rounded-[26px] border border-[#E7DED2] bg-[#FFFDFA] shadow-[0_24px_70px_rgba(33,30,26,0.24)]"
                >
                    {/* HEADER */}
                    <header className="rare-page-header flex shrink-0 items-start justify-between gap-4 border-b border-[#EEE6DC] px-5 py-5 sm:px-7">
                        <div className="flex items-start gap-3">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E9F0FC] text-[#3565A5]">
                                <FolderPen
                                    size={23}
                                    strokeWidth={1.8}
                                />
                            </span>

                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#716658]">
                                    Admin / Project Management
                                </p>

                                <h2
                                    id="edit-project-title"
                                    className="mt-1 text-xl font-bold text-[#211E1A] sm:text-2xl"
                                >
                                    Edit Project
                                </h2>

                                <p className="mt-1 text-xs leading-5 text-[#716658]">
                                    Update project details, schedule and status.
                                </p>
                            </div>
                        </div>

                        <button
                            ref={closeRef}
                            type="button"
                            onClick={onClose}
                            disabled={Boolean(busyMessage)}
                            aria-label="Close Edit Project"
                            className="rounded-full bg-[#F1EADF] p-2.5 text-[#211E1A] transition-colors hover:bg-[#E7DDCE] disabled:opacity-50"
                        >
                            <X size={20} />
                        </button>
                    </header>

                    {/* FORM */}
                    <form
                        onSubmit={submit}
                        noValidate
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
                            {/* COVER IMAGE */}
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-[#665E53]">
                                    Project Cover Image
                                </label>

                                <input
                                    ref={fileRef}
                                    id="edit-project-image"
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={handleImage}
                                    disabled={Boolean(busyMessage)}
                                    className="sr-only"
                                />

                                <div className="relative overflow-hidden rounded-[20px] border border-dashed border-[#D7C8B7] bg-[#F3ECE3]">
                                    {displayImage ? (
                                        <div className="relative h-44 sm:h-56">
                                            <img
                                                src={displayImage}
                                                alt="Project cover preview"
                                                className="h-full w-full object-cover"
                                            />

                                            <label
                                                htmlFor="edit-project-image"
                                                className="absolute bottom-3 right-3 cursor-pointer rounded-xl bg-[#FFFDFA] px-4 py-2.5 text-xs font-semibold text-[#211E1A] shadow-sm transition-colors hover:bg-[#F1EADF]"
                                            >
                                                Change Cover
                                            </label>
                                        </div>
                                    ) : (
                                        <label
                                            htmlFor="edit-project-image"
                                            className="flex h-44 cursor-pointer flex-col items-center justify-center gap-2 sm:h-56"
                                        >
                                            <ImagePlus
                                                size={30}
                                                className="text-[#716658]"
                                            />
                                            <span className="text-sm font-semibold text-[#665E53]">
                                                Upload Project Cover
                                            </span>
                                            <span className="text-xs text-[#716658]">
                                                JPG, PNG or WEBP
                                            </span>
                                        </label>
                                    )}
                                </div>

                                {coverFile && (
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="truncate text-xs text-[#716658]">
                                            Selected: {coverFile.name}
                                        </p>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCoverFile(null);
                                                if (fileRef.current) {
                                                    fileRef.current.value = "";
                                                }
                                            }}
                                            className="text-xs font-semibold text-[#B5473E]"
                                        >
                                            Undo
                                        </button>
                                    </div>
                                )}

                                {errors.cover_image && (
                                    <p role="alert" className="text-xs text-red-700">
                                        {errors.cover_image}
                                    </p>
                                )}
                            </div>

                            {/* PROJECT NAME */}
                            <Field
                                id="edit-project-name"
                                label="Project Name"
                                required
                                error={errors.name}
                            >
                                <input
                                    id="edit-project-name"
                                    value={form.name}
                                    onChange={(e) =>
                                        updateField("name", e.target.value)
                                    }
                                    maxLength={200}
                                    disabled={Boolean(busyMessage)}
                                    placeholder="Enter project name"
                                    className={inputClass}
                                />
                            </Field>

                            {/* CATEGORY & STATUS */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field
                                    id="edit-project-category"
                                    label="Project Category"
                                    required
                                    error={errors.category || errors.categories}
                                >
                                    <select
                                        id="edit-project-category"
                                        value={form.category}
                                        onChange={(e) =>
                                            updateField("category", e.target.value)
                                        }
                                        disabled={
                                            Boolean(busyMessage) ||
                                            Boolean(errors.categories)
                                        }
                                        className={inputClass}
                                    >
                                        <option value="">Select category</option>

                                        {categories.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name}
                                            </option>
                                        ))}

                                        {form.category &&
                                            !categories.some(
                                                (item) =>
                                                    String(item.id) ===
                                                    String(form.category)
                                            ) && (
                                                <option value={form.category}>
                                                    {project.category_name ||
                                                        "Current category"}
                                                </option>
                                            )}
                                    </select>
                                </Field>

                                <Field
                                    id="edit-project-status"
                                    label="Project Status"
                                    required
                                    error={errors.status}
                                >
                                    <select
                                        id="edit-project-status"
                                        value={form.status}
                                        onChange={(e) =>
                                            updateField("status", e.target.value)
                                        }
                                        disabled={Boolean(busyMessage)}
                                        className={inputClass}
                                    >
                                        {statusOptions.map((item) => (
                                            <option key={item.value} value={item.value}>
                                                {item.label}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            </div>

                            {/* CLIENT & LOCATION */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field
                                    id="edit-project-client"
                                    label="Client Name"
                                    error={errors.client_name}
                                >
                                    <input
                                        id="edit-project-client"
                                        value={form.client_name}
                                        onChange={(e) =>
                                            updateField("client_name", e.target.value)
                                        }
                                        maxLength={200}
                                        disabled={Boolean(busyMessage)}
                                        placeholder="Client or company name"
                                        className={inputClass}
                                    />
                                </Field>

                                <Field
                                    id="edit-project-location"
                                    label="Project Location"
                                    error={errors.location}
                                >
                                    <div className="relative">
                                        <MapPin
                                            size={17}
                                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#716658]"
                                        />

                                        <input
                                            id="edit-project-location"
                                            value={form.location}
                                            onChange={(e) =>
                                                updateField("location", e.target.value)
                                            }
                                            maxLength={255}
                                            disabled={Boolean(busyMessage)}
                                            placeholder="City, site address..."
                                            className={`${inputClass} pl-11`}
                                        />
                                    </div>
                                </Field>
                            </div>

                            {/* PROJECT DATES */}
                            <div>
                                <div className="mb-3 flex items-center gap-2">
                                    <CalendarDays
                                        size={18}
                                        className="text-[#716658]"
                                    />
                                    <h3 className="text-sm font-bold text-[#211E1A]">
                                        Project Schedule
                                    </h3>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field
                                        id="edit-project-start"
                                        label="Start Date"
                                        error={errors.start_date}
                                    >
                                        <input
                                            id="edit-project-start"
                                            type="date"
                                            value={form.start_date}
                                            onChange={(e) =>
                                                updateField("start_date", e.target.value)
                                            }
                                            disabled={Boolean(busyMessage)}
                                            className={inputClass}
                                        />
                                    </Field>

                                    <Field
                                        id="edit-project-end"
                                        label="End Date"
                                        error={errors.end_date}
                                    >
                                        <input
                                            id="edit-project-end"
                                            type="date"
                                            value={form.end_date}
                                            min={form.start_date || undefined}
                                            onChange={(e) =>
                                                updateField("end_date", e.target.value)
                                            }
                                            disabled={Boolean(busyMessage)}
                                            className={inputClass}
                                        />
                                    </Field>
                                </div>
                            </div>

                            {/* DESCRIPTION */}
                            <Field
                                id="edit-project-description"
                                label="Project Description"
                                error={errors.description}
                            >
                                <textarea
                                    id="edit-project-description"
                                    rows={5}
                                    value={form.description}
                                    onChange={(e) =>
                                        updateField("description", e.target.value)
                                    }
                                    disabled={Boolean(busyMessage)}
                                    placeholder="Describe the project scope, objectives and relevant details..."
                                    className={`${inputClass} resize-y`}
                                />
                            </Field>

                            {errors.general && (
                                <div
                                    role="alert"
                                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                                >
                                    {errors.general}
                                </div>
                            )}
                        </div>

                        {/* FOOTER */}
                        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-[#EEE6DC] bg-[#FFFDFA] px-5 py-4 sm:px-7">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={Boolean(busyMessage)}
                                className="rounded-xl border border-[#E4DCCD] px-5 py-3 text-sm font-semibold text-[#211E1A] transition-colors hover:bg-[#F1EADF] disabled:opacity-50"
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={
                                    Boolean(busyMessage) ||
                                    Boolean(errors.categories)
                                }
                                className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#39332B] hover:shadow-lg disabled:opacity-50"
                            >
                                <Save size={18} />
                                Save Changes
                            </button>
                        </footer>
                    </form>
                </section>
            </div>
        </>
    );
}
