
import { useCallback, useEffect, useRef, useState } from "react";
import {
    CheckCircle2,
    FolderOpen,
    ImagePlus,
    Layers3,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Settings2,
    ShieldCheck,
    X,
} from "lucide-react";

import AccountProfile from "../../components/settings/AccountProfile";
import ChangePasswordForm from "../../components/settings/ChangePasswordForm";
import LoadingScreen from "../../components/LoadingScreen";

import { settingsApi } from "../../api/settingsApi";
import { getMediaUrl } from "../../utils/mediaUrl";

// =====================================================
// STYLES
// =====================================================

const inputClass = `
  w-full rounded-xl border border-[#E4DCCD]
  bg-[#FFFDFA] px-4 py-3
  text-sm text-[#211E1A]
  outline-none transition-all duration-200
  placeholder:text-[#A99D8E]
  focus:border-[#B7A58E]
  focus:ring-4 focus:ring-[#E8DDD0]/60
  disabled:cursor-not-allowed disabled:opacity-50
`;

const primaryButton = `
  inline-flex items-center justify-center gap-2
  rounded-xl bg-[#211E1A] px-5 py-3
  text-sm font-semibold text-white
  transition-all duration-200
  hover:-translate-y-0.5
  hover:bg-[#39332B]
  hover:shadow-[0_8px_20px_rgba(33,30,26,0.14)]
  active:translate-y-0
  disabled:pointer-events-none disabled:opacity-50
  motion-reduce:transform-none
`;

const secondaryButton = `
  inline-flex items-center justify-center gap-2
  rounded-xl border border-[#E4DCCD]
  bg-[#FFFDFA] px-5 py-3
  text-sm font-semibold text-[#211E1A]
  transition-colors duration-200
  hover:bg-[#F1EADF]
  disabled:pointer-events-none disabled:opacity-50
`;

// =====================================================
// HELPERS
// =====================================================

function extractCategories(response) {
    if (Array.isArray(response)) {
        return {
            items: response,
            next: null,
        };
    }

    if (Array.isArray(response?.results)) {
        return {
            items: response.results,
            next: response.next,
        };
    }

    throw new Error("Unexpected category API response.");
}

function readApiError(value) {
    if (Array.isArray(value)) {
        return value.map(String).join(" ");
    }

    if (typeof value === "string") {
        return value;
    }

    return "";
}

// Loads all pages for category management.
// settingsApi.getCategories must support params (see below).
async function fetchAllCategories() {
    let page = 1;
    const all = [];
    let hasMore = true;

    while (hasMore) {
        const response = await settingsApi.getCategories({
            page,
        });

        const result = extractCategories(response);

        all.push(...result.items);
        hasMore = Boolean(result.next);
        page += 1;

        // Prevent an accidental infinite loop caused
        // by a misconfigured pagination response.
        if (page > 500 && hasMore) {
            throw new Error(
                "Unable to finish loading project categories."
            );
        }
    }

    return all;
}

// =====================================================
// CATEGORY IMAGE
// =====================================================

function CategoryImage({ category }) {
    const [failed, setFailed] = useState(false);

    const imageUrl = getMediaUrl(category.image);

    return (
        <div className="relative h-full min-h-[185px] w-full overflow-hidden bg-[#E9DFD1]">
            {imageUrl && !failed ? (
                <img
                    src={imageUrl}
                    alt={`${category.name} cover`}
                    loading="lazy"
                    onError={() => setFailed(true)}
                    className="
            absolute inset-0 h-full w-full
            object-cover transition-transform duration-500
            group-hover:scale-105
          "
                />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Layers3
                        size={32}
                        strokeWidth={1.4}
                        className="text-[#948778]"
                    />
                </div>
            )}
        </div>
    );
}

// =====================================================
// ADD / EDIT CATEGORY MODAL
// =====================================================

function CategoryModal({
    open,
    category,
    onClose,
    onSaved,
}) {
    const isEditing = Boolean(category?.id);

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isActive, setIsActive] = useState(true);

    const [imageFile, setImageFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState("");

    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const fileInputRef = useRef(null);
    const dialogRef = useRef(null);
    const closeButtonRef = useRef(null);
    const submittingRef = useRef(false);

    // ---------------------------------------------
    // RESET WHEN OPENING
    // ---------------------------------------------

    useEffect(() => {
        if (!open) return;

        setName(category?.name || "");
        setDescription(category?.description || "");
        setIsActive(category?.is_active !== false);

        setImageFile(null);
        setPreviewUrl("");
        setErrors({});

        const previousOverflow =
            document.body.style.overflow;
        const previousFocus = document.activeElement;

        document.body.style.overflow = "hidden";
        closeButtonRef.current?.focus();

        return () => {
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus?.();
        };
    }, [open, category]);

    // ---------------------------------------------
    // IMAGE PREVIEW
    // ---------------------------------------------

    useEffect(() => {
        if (!imageFile) {
            setPreviewUrl("");
            return;
        }

        const url = URL.createObjectURL(imageFile);
        setPreviewUrl(url);

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [imageFile]);

    // ---------------------------------------------
    // KEYBOARD
    // ---------------------------------------------

    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event) => {
            if (
                event.key === "Escape" &&
                !submittingRef.current
            ) {
                onClose();
            }

            if (
                event.key !== "Tab" ||
                !dialogRef.current
            ) {
                return;
            }

            const elements = Array.from(
                dialogRef.current.querySelectorAll(
                    "button:not([disabled]), input:not([disabled]), textarea:not([disabled])"
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

        document.addEventListener(
            "keydown",
            handleKeyDown
        );

        return () => {
            document.removeEventListener(
                "keydown",
                handleKeyDown
            );
        };
    }, [open, onClose]);

    if (!open) return null;

    // ---------------------------------------------
    // SELECT IMAGE
    // ---------------------------------------------

    const handleImageChange = (event) => {
        const file = event.target.files?.[0];

        if (!file) return;

        const allowed = [
            "image/jpeg",
            "image/png",
            "image/webp",
        ];

        if (!allowed.includes(file.type)) {
            setErrors((previous) => ({
                ...previous,
                image:
                    "Select a JPG, PNG or WEBP image.",
            }));

            event.target.value = "";
            return;
        }

        setImageFile(file);

        setErrors((previous) => ({
            ...previous,
            image: "",
        }));
    };

    const removeSelectedImage = () => {
        setImageFile(null);

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    // ---------------------------------------------
    // CREATE / UPDATE
    // ---------------------------------------------

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (submittingRef.current) return;

        const validation = {};

        if (!name.trim()) {
            validation.name =
                "Category name is required.";
        }

        if (Object.keys(validation).length) {
            setErrors(validation);
            return;
        }

        submittingRef.current = true;
        setSubmitting(true);
        setErrors({});

        const formData = new FormData();

        formData.append("name", name.trim());
        formData.append(
            "description",
            description.trim()
        );

        formData.append(
            "is_active",
            String(isActive)
        );

        if (imageFile) {
            formData.append("image", imageFile);
        }

        try {
            if (isEditing) {
                await settingsApi.updateCategory(
                    category.id,
                    formData
                );
            } else {
                await settingsApi.createCategory(
                    formData
                );
            }

            onClose();

            // The parent refreshes the category directory.
            onSaved(
                isEditing
                    ? "Category updated successfully."
                    : "Category created successfully."
            );
        } catch (error) {
            const data = error.response?.data || {};

            const nextErrors = {
                name: readApiError(data.name),
                description: readApiError(
                    data.description
                ),
                image: readApiError(data.image),
                is_active: readApiError(
                    data.is_active
                ),
            };

            nextErrors.general =
                readApiError(data.detail) ||
                readApiError(data.non_field_errors) ||
                (
                    !Object.values(nextErrors).some(Boolean)
                        ? "Unable to save category. Please try again."
                        : ""
                );

            setErrors(nextErrors);
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    };

    const savedImageUrl = getMediaUrl(
        category?.image
    );

    const displayImage =
        previewUrl || savedImageUrl;

    return (
        <>
            {submitting && (
                <LoadingScreen
                    message={
                        isEditing
                            ? "Updating project category..."
                            : "Creating project category..."
                    }
                />
            )}

            <div
                className="
          fixed inset-0 z-50
          flex items-center justify-center
          bg-[#211E1A]/55 p-3
          backdrop-blur-sm sm:p-6
        "
                onMouseDown={(event) => {
                    if (
                        event.target === event.currentTarget &&
                        !submittingRef.current
                    ) {
                        onClose();
                    }
                }}
            >
                <section
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="category-modal-title"
                    className="
            flex max-h-[92dvh] w-full
            max-w-[650px] flex-col
            overflow-hidden rounded-[26px]
            border border-[#E7DED2]
            bg-[#FFFDFA]
            shadow-[0_24px_70px_rgba(33,30,26,0.25)]
          "
                >
                    {/* MODAL HEADER */}
                    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EEE6DC] p-5 sm:p-6">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#948778]">
                                Admin / Project Categories
                            </p>

                            <h2
                                id="category-modal-title"
                                className="mt-2 text-xl font-bold text-[#211E1A]"
                            >
                                {isEditing
                                    ? "Edit Project Category"
                                    : "Create Project Category"}
                            </h2>

                            <p className="mt-2 text-xs text-[#817669]">
                                Manage category details,
                                imagery and visibility.
                            </p>
                        </div>

                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            aria-label="Close category modal"
                            className="rounded-full bg-[#F1EADF] p-2.5 text-[#211E1A] transition-colors hover:bg-[#E5D9CA] disabled:opacity-50"
                        >
                            <X size={19} />
                        </button>
                    </header>

                    {/* CATEGORY FORM */}
                    <form
                        onSubmit={handleSubmit}
                        noValidate
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
                            {/* IMAGE */}
                            <div>
                                <p className="mb-2 text-sm font-semibold text-[#665E53]">
                                    Category Cover Image
                                </p>

                                <input
                                    ref={fileInputRef}
                                    id="settings-category-image"
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.webp"
                                    className="sr-only"
                                    disabled={submitting}
                                    onChange={handleImageChange}
                                />

                                <div className="relative overflow-hidden rounded-2xl border border-dashed border-[#D9CBBB] bg-[#F5EFE7]">
                                    {displayImage ? (
                                        <div className="relative h-44 sm:h-52">
                                            <img
                                                src={displayImage}
                                                alt="Category cover preview"
                                                className="h-full w-full object-cover"
                                            />

                                            <div className="absolute bottom-3 left-3 flex gap-2">
                                                <label
                                                    htmlFor="settings-category-image"
                                                    className="cursor-pointer rounded-lg bg-[#FFFDFA] px-3 py-2 text-xs font-semibold text-[#211E1A]"
                                                >
                                                    Change Image
                                                </label>

                                                {imageFile && (
                                                    <button
                                                        type="button"
                                                        onClick={removeSelectedImage}
                                                        className="rounded-lg bg-[#FFFDFA] px-3 py-2 text-xs font-semibold text-[#211E1A]"
                                                    >
                                                        Undo
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <label
                                            htmlFor="settings-category-image"
                                            className="flex h-44 cursor-pointer flex-col items-center justify-center gap-3 text-[#817669] sm:h-52"
                                        >
                                            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8DFD3]">
                                                <ImagePlus size={26} />
                                            </span>

                                            <span className="text-sm font-semibold text-[#211E1A]">
                                                Upload a category image
                                            </span>

                                            <span className="text-xs">
                                                JPG, PNG or WEBP
                                            </span>
                                        </label>
                                    )}
                                </div>

                                {errors.image && (
                                    <p
                                        role="alert"
                                        className="mt-2 text-xs text-red-700"
                                    >
                                        {errors.image}
                                    </p>
                                )}
                            </div>

                            {/* NAME */}
                            <div>
                                <label
                                    htmlFor="settings-category-name"
                                    className="text-sm font-semibold text-[#665E53]"
                                >
                                    Category Name
                                    <span className="ml-1 text-red-600">
                                        *
                                    </span>
                                </label>

                                <input
                                    id="settings-category-name"
                                    type="text"
                                    value={name}
                                    onChange={(event) =>
                                        setName(event.target.value)
                                    }
                                    disabled={submitting}
                                    placeholder="e.g. Residential"
                                    aria-invalid={Boolean(errors.name)}
                                    className={`${inputClass} mt-2`}
                                />

                                {errors.name && (
                                    <p
                                        role="alert"
                                        className="mt-2 text-xs text-red-700"
                                    >
                                        {errors.name}
                                    </p>
                                )}
                            </div>

                            {/* DESCRIPTION */}
                            <div>
                                <label
                                    htmlFor="settings-category-description"
                                    className="text-sm font-semibold text-[#665E53]"
                                >
                                    Description
                                </label>

                                <textarea
                                    id="settings-category-description"
                                    rows={4}
                                    value={description}
                                    onChange={(event) =>
                                        setDescription(event.target.value)
                                    }
                                    disabled={submitting}
                                    placeholder="Describe the types of projects in this category..."
                                    className={`${inputClass} mt-2 resize-y`}
                                />

                                {errors.description && (
                                    <p
                                        role="alert"
                                        className="mt-2 text-xs text-red-700"
                                    >
                                        {errors.description}
                                    </p>
                                )}
                            </div>

                            {/* ACTIVE STATUS */}
                            <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#ECE3D9] bg-[#F8F4EE] p-4">
                                <span>
                                    <span className="block text-sm font-bold text-[#211E1A]">
                                        Active Category
                                    </span>

                                    <span className="mt-1 block text-xs leading-5 text-[#817669]">
                                        Control category availability
                                        without deleting existing records.
                                    </span>
                                </span>

                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={(event) =>
                                        setIsActive(event.target.checked)
                                    }
                                    disabled={submitting}
                                    className="h-5 w-5 shrink-0 accent-[#211E1A]"
                                />
                            </label>

                            {errors.is_active && (
                                <p className="text-xs text-red-700">
                                    {errors.is_active}
                                </p>
                            )}

                            {errors.general && (
                                <div
                                    role="alert"
                                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                                >
                                    {errors.general}
                                </div>
                            )}
                        </div>

                        {/* MODAL FOOTER */}
                        <footer className="flex shrink-0 justify-end gap-3 border-t border-[#EEE6DC] p-5 sm:p-6">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={submitting}
                                className={secondaryButton}
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={submitting}
                                className={primaryButton}
                            >
                                {isEditing
                                    ? "Save Changes"
                                    : "Create Category"}
                            </button>
                        </footer>
                    </form>
                </section>
            </div>
        </>
    );
}

// =====================================================
// ADMIN SETTINGS PAGE
// =====================================================

export default function AdminSettings() {
    const [categories, setCategories] = useState([]);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] =
        useState("ALL");

    const [modalOpen, setModalOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] =
        useState(null);

    const [loading, setLoading] = useState(true);
    const [busyMessage, setBusyMessage] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const [refreshKey, setRefreshKey] = useState(0);

    // ---------------------------------------------
    // LOAD CATEGORY DIRECTORY
    // ---------------------------------------------

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError("");

            try {
                const result = await fetchAllCategories();

                if (!cancelled) {
                    setCategories(result);
                }
            } catch {
                if (!cancelled) {
                    setError(
                        "Unable to load project categories. Please try again."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    // ---------------------------------------------
    // OPEN MODALS
    // ---------------------------------------------

    const openCreate = () => {
        setSelectedCategory(null);
        setModalOpen(true);
    };

    const openEdit = async (categoryId) => {
        setBusyMessage("Loading category details...");
        setError("");

        try {
            const details =
                await settingsApi.getCategory(categoryId);

            setSelectedCategory(details);
            setModalOpen(true);
        } catch {
            setError(
                "Unable to retrieve this category for editing."
            );
        } finally {
            setBusyMessage("");
        }
    };

    const closeModal = () => {
        setModalOpen(false);
        setSelectedCategory(null);
    };

    const handleSaved = (message) => {
        setNotice(message);
        setRefreshKey((value) => value + 1);
    };

    // ---------------------------------------------
    // FILTER CATEGORIES
    // ---------------------------------------------

    const visibleCategories = categories.filter(
        (category) => {
            const query = search.trim().toLowerCase();

            const text = [
                category.name,
                category.description,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const matchesSearch = text.includes(query);

            // List responses may not include is_active.
            // Only apply exact status filtering when
            // the field is returned by the backend.
            const matchesStatus =
                statusFilter === "ALL" ||
                (
                    statusFilter === "ACTIVE" &&
                    category.is_active === true
                ) ||
                (
                    statusFilter === "INACTIVE" &&
                    category.is_active === false
                );

            return matchesSearch && matchesStatus;
        }
    );

    const hasStatusData = categories.every(
        (category) =>
            typeof category.is_active === "boolean"
    );

    return (
        <div className="space-y-7 pb-8">
            {(loading || busyMessage) && (
                <LoadingScreen
                    message={
                        busyMessage || "Loading Admin settings..."
                    }
                />
            )}

            {/* =====================================
          PAGE HEADER
          ===================================== */}

            <header>
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#948778]">
                    Admin / Account & Configuration
                </p>

                <div className="mt-2 flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#74614D]">
                        <Settings2 size={23} />
                    </span>

                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                            Settings
                        </h1>

                        <p className="mt-2 text-sm text-[#817669]">
                            Manage your profile, account security,
                            and project categories.
                        </p>
                    </div>
                </div>
            </header>

            {/* =====================================
          1. ADMIN PROFILE
          ===================================== */}

            <AccountProfile role="ADMIN" />

            {/* =====================================
          2. CHANGE PASSWORD
          ===================================== */}

            <ChangePasswordForm />

            {/* =====================================
          3. PROJECT CATEGORY MANAGEMENT
          ===================================== */}

            <section
                className="
          rounded-[24px]
          border border-[#E7DED2]
          bg-[#FFFDFA] p-5 sm:p-7
        "
            >
                {/* SECTION HEADER */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E9F0FC] text-[#3565A5]">
                            <Layers3
                                size={23}
                                strokeWidth={1.8}
                            />
                        </span>

                        <div>
                            <h2 className="text-lg font-bold text-[#211E1A]">
                                Project Categories
                            </h2>

                            <p className="mt-1 max-w-xl text-xs leading-6 text-[#817669]">
                                Organize projects by category.
                                Manage names, descriptions,
                                images and availability.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={openCreate}
                        className={primaryButton}
                    >
                        <Plus size={18} />
                        Add Category
                    </button>
                </div>

                {/* FILTER BAR */}
                <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
                    <div className="relative">
                        <Search
                            size={18}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#938778]"
                        />

                        <input
                            type="search"
                            value={search}
                            onChange={(event) =>
                                setSearch(event.target.value)
                            }
                            placeholder="Search categories..."
                            aria-label="Search project categories"
                            className={`${inputClass} pl-11`}
                        />
                    </div>

                    <select
                        value={statusFilter}
                        onChange={(event) =>
                            setStatusFilter(event.target.value)
                        }
                        disabled={!hasStatusData}
                        aria-label="Filter category status"
                        className={inputClass}
                        title={
                            hasStatusData
                                ? "Filter category status"
                                : "Category list API does not expose is_active"
                        }
                    >
                        <option value="ALL">
                            All Categories
                        </option>

                        <option value="ACTIVE">
                            Active
                        </option>

                        <option value="INACTIVE">
                            Inactive
                        </option>
                    </select>

                    <button
                        type="button"
                        onClick={() =>
                            setRefreshKey((value) => value + 1)
                        }
                        aria-label="Refresh project categories"
                        className={secondaryButton}
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>

                {/* COUNTS */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-[#817669]">
                        {visibleCategories.length}{" "}
                        {visibleCategories.length === 1
                            ? "category"
                            : "categories"}{" "}
                        shown
                    </p>

                    {!hasStatusData && (
                        <p className="text-xs text-[#948778]">
                            Status filters require
                            is_active in the category list response.
                        </p>
                    )}
                </div>

                {/* ERROR */}
                {error && (
                    <div
                        role="alert"
                        className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                    >
                        {error}
                    </div>
                )}

                {/* SUCCESS */}
                {notice && (
                    <div
                        role="status"
                        className="mt-5 flex items-center gap-2 rounded-xl bg-[#E7F2E8] p-4 text-sm text-[#296F40]"
                    >
                        <CheckCircle2 size={18} />
                        {notice}
                    </div>
                )}

                {/* CATEGORY CARDS */}
                {!loading && !error && (
                    <div className="mt-6 grid gap-4 xl:grid-cols-2">
                        {visibleCategories.map((category) => (
                            <article
                                key={category.id}
                                className="
                  group overflow-hidden
                  rounded-[20px]
                  border border-[#E7DED2]
                  bg-[#FFFDFA]
                  transition-all duration-300
                  hover:-translate-y-0.5
                  hover:border-[#CBB9A3]
                  hover:shadow-[0_12px_28px_rgba(33,30,26,0.07)]
                  motion-reduce:transform-none
                "
                            >
                                <div className="flex min-h-[185px]">
                                    <div className="w-[37%] shrink-0">
                                        <CategoryImage
                                            key={`${category.id}-${category.image || ""}`}
                                            category={category}
                                        />
                                    </div>

                                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
                                        <div>
                                            {typeof category.is_active === "boolean" && (
                                                <span
                                                    className={`
                            inline-flex rounded-full px-2.5 py-1
                            text-[10px] font-bold
                            ${category.is_active
                                                            ? "bg-[#E7F2E8] text-[#296F40]"
                                                            : "bg-[#EEE8E0] text-[#75695C]"
                                                        }
                          `}
                                                >
                                                    {category.is_active
                                                        ? "Active"
                                                        : "Inactive"}
                                                </span>
                                            )}

                                            <h3 className="mt-2 break-words text-base font-bold text-[#211E1A] sm:text-lg">
                                                {category.name}
                                            </h3>

                                            <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#817669]">
                                                {category.description ||
                                                    "No description provided."}
                                            </p>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                openEdit(category.id)
                                            }
                                            className="
                        inline-flex items-center gap-2
                        self-start text-xs font-bold
                        text-[#211E1A]
                        transition-colors
                        hover:text-[#8C6A46]
                      "
                                        >
                                            <Pencil size={15} />
                                            Edit Category
                                        </button>
                                    </div>
                                </div>
                            </article>
                        ))}

                        {visibleCategories.length === 0 && (
                            <div className="rounded-[20px] bg-[#F8F4EE] px-6 py-12 text-center xl:col-span-2">
                                <FolderOpen
                                    size={34}
                                    className="mx-auto text-[#948778]"
                                />

                                <h3 className="mt-4 font-bold text-[#211E1A]">
                                    No categories found
                                </h3>

                                <p className="mt-2 text-sm text-[#817669]">
                                    Try a different search,
                                    or create a new category.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </section>

            {/* =====================================
          CATEGORY CREATE / EDIT MODAL
          ===================================== */}

            <CategoryModal
                open={modalOpen}
                category={selectedCategory}
                onClose={closeModal}
                onSaved={handleSaved}
            />
        </div>
    );
}
