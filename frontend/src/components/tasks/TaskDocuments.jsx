
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ChevronDown,
    Clock3,
    Download,
    FilePlus2,
    FileText,
    History,
    RefreshCw,
    UploadCloud,
    X,
} from "lucide-react";

import { taskApi } from "../../api/taskApi";
import LoadingScreen from "../../components/LoadingScreen";
import { useConfirmation } from "../../hooks/useConfirmation";

const DOCUMENT_TYPES = [
    "DESIGN",
    "DRAWING",
    "REFERENCE",
    "INSTRUCTION",
    "SPECIFICATION",
    "PHOTO",
    "OTHER",
];

const inputClass =
    "w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-4 py-3 text-sm text-[#211E1A] outline-none focus:border-[#B7A58E] focus:ring-4 focus:ring-[#E8DDD0]/50";

function getItems(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    throw new Error("Unexpected documents response.");
}

function getError(error) {
    const data = error.response?.data;

    if (typeof data?.detail === "string") return data.detail;

    if (data && typeof data === "object") {
        const messages = Object.entries(data)
            .map(([key, value]) => {
                const message = Array.isArray(value)
                    ? value.join(" ")
                    : typeof value === "string"
                        ? value
                        : "";

                return message ? `${key}: ${message}` : "";
            })
            .filter(Boolean);

        if (messages.length) return messages.join(" · ");
    }

    return "The operation failed. Please try again.";
}

function getFilename(documentRecord) {
    const name =
        documentRecord.original_filename ||
        documentRecord.file_name ||
        documentRecord.title ||
        "task-document";

    return name.replace(/[\\/]/g, "_");
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =====================================================
// DOCUMENT UPLOAD FORM
// =====================================================

function DocumentUploadForm({
    taskId,
    documentId = null,
    onSaved,
    onCancel,
    onBusyChange,
}) {
    const versionMode = Boolean(documentId);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [documentType, setDocumentType] = useState("DRAWING");
    const [file, setFile] = useState(null);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const fileRef = useRef(null);
    const savingRef = useRef(false);
    const { confirm, cancelConfirmation, confirmationModal } = useConfirmation();

    useEffect(() => {
        setTitle("");
        setDescription("");
        setDocumentType("DRAWING");
        setFile(null);
        setError("");
        return cancelConfirmation;
    }, [taskId, documentId, cancelConfirmation]);

    async function submit(event) {
        event.preventDefault();

        if (savingRef.current) return;

        if (!file) {
            setError("Choose a file to upload.");
            return;
        }

        if (!versionMode && !title.trim()) {
            setError("Document title is required.");
            return;
        }

        if (!await confirm({
            title: versionMode ? "Upload a new version?" : "Upload this document?",
            message: versionMode
                ? `Upload "${file.name}" as the latest version of this task document?`
                : `Upload "${file.name}" as "${title.trim()}" to this task?`,
            confirmLabel: versionMode ? "Upload Version" : "Upload Document",
        })) return;

        savingRef.current = true;
        setSaving(true);
        onBusyChange?.(true);
        setError("");

        try {
            const data = new FormData();

            // The implementation plan confirms multipart uploads.
            // Confirm the serializer uses "file" for the binary field.
            data.append("file", file);

            if (!versionMode) {
                data.append("title", title.trim());
                data.append("description", description.trim());
                data.append("document_type", documentType);
            }

            if (versionMode) {
                await taskApi.newDocumentVersion(documentId, data);
            } else {
                await taskApi.uploadDocument(taskId, data);
            }

            onSaved?.();
        } catch (err) {
            setError(getError(err));
        } finally {
            savingRef.current = false;
            setSaving(false);
            onBusyChange?.(false);
        }
    }

    return (
        <form
            onSubmit={submit}
            className="space-y-4 rounded-2xl border border-[#D8C7B2] bg-[#FFFDFA] p-4 sm:p-5"
        >
            {confirmationModal}
            <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-[#211E1A]">
                    {versionMode
                        ? "Upload New Document Version"
                        : "Upload Task Document"}
                </h4>

                <button
                    type="button"
                    disabled={saving}
                    onClick={onCancel}
                    aria-label="Close upload form"
                    className="rounded-lg bg-[#F1EADF] p-2 text-[#665E53]"
                >
                    <X size={16} />
                </button>
            </div>

            {!versionMode && (
                <>
                    <div>
                        <label className="mb-2 block text-xs font-semibold text-[#665E53]">
                            Document Title *
                        </label>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className={inputClass}
                            maxLength={200}
                            placeholder="e.g. Floor Slab Reinforcement Drawing"
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-xs font-semibold text-[#665E53]">
                                Document Type
                            </label>
                            <select
                                value={documentType}
                                onChange={(e) => setDocumentType(e.target.value)}
                                className={inputClass}
                            >
                                {DOCUMENT_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                        {type.replaceAll("_", " ")}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-xs font-semibold text-[#665E53]">
                            Description
                        </label>
                        <textarea
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className={`${inputClass} resize-y`}
                            placeholder="Optional description or instructions..."
                        />
                    </div>
                </>
            )}

            <div>
                <label className="mb-2 block text-xs font-semibold text-[#665E53]">
                    Attachment *
                </label>

                <input
                    ref={fileRef}
                    type="file"
                    className="sr-only"
                    id={`document-upload-${taskId}-${documentId || "new"}`}
                    onChange={(e) => {
                        setFile(e.target.files?.[0] || null);
                        setError("");
                    }}
                />

                <label
                    htmlFor={`document-upload-${taskId}-${documentId || "new"}`}
                    className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#D9CBBB] bg-[#F8F4EE] px-4 py-5 text-center transition-colors hover:bg-[#F1EADF]"
                >
                    <UploadCloud size={27} className="text-[#716658]" />

                    <span className="break-all text-sm font-semibold text-[#211E1A]">
                        {file ? file.name : "Choose a file"}
                    </span>

                    <span className="text-xs text-[#716658]">
                        {file
                            ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
                            : "Supported file types and size are enforced by Django"}
                    </span>
                </label>
            </div>

            {error && (
                <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                >
                    {error}
                </p>
            )}

            <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#39332B] disabled:opacity-50"
            >
                <UploadCloud size={17} />
                {saving ? "Uploading..." : versionMode
                    ? "Upload New Version"
                    : "Upload Document"}
            </button>
        </form>
    );
}

// =====================================================
// DOCUMENT ROW
// =====================================================

function DocumentRow({
    record,
    taskId,
    onRefresh,
    onBusyChange,
}) {
    const [showVersions, setShowVersions] = useState(false);
    const [versions, setVersions] = useState([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [versionsError, setVersionsError] = useState("");
    const [showVersionUpload, setShowVersionUpload] = useState(false);

    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState("");

    async function download() {
        if (downloading) return;

        setDownloading(true);
        onBusyChange?.(true);
        setError("");

        try {
            const blob = await taskApi.downloadDocument(record.id);
            triggerDownload(blob, getFilename(record));
        } catch (err) {
            setError(getError(err));
        } finally {
            setDownloading(false);
            onBusyChange?.(false);
        }
    }

    async function loadVersions() {
        setShowVersions(true);
        setVersionsLoading(true);
        onBusyChange?.(true);
        setVersionsError("");

        try {
            const response = await taskApi.documentVersions(record.id);
            setVersions(getItems(response));

            if (response?.next) {
                setVersionsError(
                    "Additional version pages are available; pagination support is required to display all versions."
                );
            }
        } catch (err) {
            setVersionsError(getError(err));
        } finally {
            setVersionsLoading(false);
            onBusyChange?.(false);
        }
    }

    return (
        <article className="overflow-hidden rounded-[17px] border border-[#E7DED2] bg-[#FFFDFA]">
            <div className="flex flex-wrap items-center gap-3 p-4">
                <span className="rounded-xl bg-[#F0EAF8] p-3 text-[#7C5BA4]">
                    <FileText size={20} />
                </span>

                <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-bold text-[#211E1A]">
                        {record.title || "Task Document"}
                    </p>

                    <p className="mt-1 text-xs text-[#716658]">
                        {(record.document_type || "OTHER").replaceAll("_", " ")}
                    </p>

                    {record.description && (
                        <p className="mt-1 text-xs leading-5 text-[#716658]">
                            {record.description}
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={download}
                    disabled={downloading}
                    title="Download current version"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E9F0FC] text-[#3565A5] hover:bg-[#D8E7FA] disabled:opacity-50"
                >
                    <Download size={18} />
                </button>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-[#EEE6DC] px-4 py-3">
                <button
                    type="button"
                    onClick={() => {
                        if (showVersions) {
                            setShowVersions(false);
                        } else {
                            loadVersions();
                        }
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#F1EADF] px-3 py-2 text-xs font-semibold text-[#665E53]"
                >
                    <History size={15} />
                    Version History
                    <ChevronDown
                        size={14}
                        className={showVersions ? "rotate-180" : ""}
                    />
                </button>

                <button
                    type="button"
                    onClick={() => setShowVersionUpload((value) => !value)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#E7F2E8] px-3 py-2 text-xs font-semibold text-[#296F40]"
                >
                    <FilePlus2 size={15} />
                    New Version
                </button>
            </div>

            {error && (
                <p role="alert" className="px-4 pb-3 text-xs text-red-700">
                    {error}
                </p>
            )}

            {showVersions && (
                <div className="space-y-2 border-t border-[#EEE6DC] bg-[#F8F4EE] p-4">
                    <p className="flex items-center gap-2 text-xs font-bold text-[#665E53]">
                        <Clock3 size={15} />
                        Stored Versions
                    </p>

                    {versionsLoading ? (
                        <p className="text-xs text-[#716658]">
                            Loading versions...
                        </p>
                    ) : versions.length ? (
                        versions.map((version, index) => (
                            <div
                                key={version.id || index}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FFFDFA] p-3"
                            >
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-[#211E1A]">
                                        Version {version.version_number || index + 1}
                                        {version.is_current ? " · Current" : ""}
                                    </p>

                                    <p className="mt-1 break-all text-xs text-[#716658]">
                                        {version.original_filename ||
                                            "Filename unavailable"}
                                    </p>
                                </div>

                                <p className="text-xs text-[#716658]">
                                    {version.created_at
                                        ? String(version.created_at).slice(0, 10)
                                        : ""}
                                </p>
                            </div>
                        ))
                    ) : (
                        <p className="text-xs text-[#716658]">
                            No version records returned.
                        </p>
                    )}

                    {versionsError && (
                        <p role="alert" className="text-xs text-red-700">
                            {versionsError}
                        </p>
                    )}
                </div>
            )}

            {showVersionUpload && (
                <div className="border-t border-[#EEE6DC] p-4">
                    <DocumentUploadForm
                        taskId={taskId}
                        documentId={record.id}
                        onBusyChange={onBusyChange}
                        onCancel={() => setShowVersionUpload(false)}
                        onSaved={() => {
                            setShowVersionUpload(false);
                            onRefresh?.();

                            if (showVersions) loadVersions();
                        }}
                    />
                </div>
            )}
        </article>
    );
}

// =====================================================
// TASK DOCUMENTS SECTION
// =====================================================

export default function TaskDocuments({ taskId }) {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [showUpload, setShowUpload] = useState(false);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    const load = useCallback(() => {
        setRefreshKey((value) => value + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function fetchDocuments() {
            setLoading(true);
            setError("");

            try {
                const all = [];
                let page = 1;
                let more = true;

                while (more) {
                    if (page > 500) {
                        throw new Error("Document pagination limit reached.");
                    }

                    // Extend documents(taskId, params) to accept page.
                    const response = await taskApi.documents(taskId, {
                        page,
                    });

                    all.push(...getItems(response));

                    more =
                        !Array.isArray(response) &&
                        Boolean(response.next);

                    page += 1;
                }

                if (!cancelled) setDocuments(all);
            } catch (err) {
                if (!cancelled) {
                    setError(getError(err));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchDocuments();

        return () => {
            cancelled = true;
        };
    }, [taskId, refreshKey]);

    return (
        <section className="mt-4 rounded-[20px] border border-[#E7DED2] bg-[#F8F4EE] p-4 sm:p-5">
            {(loading || busy) && (
                <LoadingScreen
                    message={
                        busy
                            ? "Processing task document..."
                            : "Loading task documents..."
                    }
                />
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-base font-bold text-[#211E1A]">
                        Task Documents
                    </h3>

                    <p className="mt-1 text-xs text-[#716658]">
                        Drawings, instructions and supporting files
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={load}
                        aria-label="Refresh task documents"
                        className="rounded-xl bg-[#FFFDFA] p-3 text-[#665E53]"
                    >
                        <RefreshCw size={17} />
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowUpload((value) => !value)}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-4 py-3 text-xs font-semibold text-white"
                    >
                        <FilePlus2 size={17} />
                        Upload Document
                    </button>
                </div>
            </div>

            {showUpload && (
                <div className="mt-5">
                    <DocumentUploadForm
                        taskId={taskId}
                        onBusyChange={setBusy}
                        onCancel={() => setShowUpload(false)}
                        onSaved={() => {
                            setShowUpload(false);
                            load();
                        }}
                    />
                </div>
            )}

            {error && (
                <p
                    role="alert"
                    className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                    {error}
                </p>
            )}

            {!loading && (
                <div className="mt-4 space-y-3">
                    {documents.map((record) => (
                        <DocumentRow
                            key={record.id}
                            record={record}
                            taskId={taskId}
                            onRefresh={load}
                            onBusyChange={setBusy}
                        />
                    ))}

                    {!documents.length && !error && (
                        <div className="rounded-xl bg-[#FFFDFA] px-5 py-10 text-center">
                            <FileText
                                size={27}
                                className="mx-auto text-[#716658]"
                            />

                            <p className="mt-3 text-sm font-semibold text-[#211E1A]">
                                No documents uploaded yet
                            </p>

                            <p className="mt-2 text-xs text-[#716658]">
                                Upload drawings, instructions or supporting files
                                related to this task.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
