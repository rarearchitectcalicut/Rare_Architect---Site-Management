import { useEffect, useState } from "react";
import { ChevronDown, FileText, ShieldCheck } from "lucide-react";
import { taskApi } from "../../../api/taskApi";
import { getAllPages, formatText, formatDate, getTaskRecord } from "../approvalUtils";
import Meta from "../ReviewFields";

export default function TaskApprovalReview({ record, item }) {
    const task = getTaskRecord(record);
    const [documentsOpen, setDocumentsOpen] =
        useState(false);
    const [documents, setDocuments] = useState([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsError, setDocsError] = useState("");
    const taskId = item?.id;

    useEffect(() => {
        if (!documentsOpen || !taskId) {
            return;
        }

        let cancelled = false;

        async function fetchDocuments() {
            setDocsLoading(true);
            setDocsError("");

            try {
                const docs = await getAllPages((params) =>
                    taskApi.documents(taskId, params)
                );

                if (!cancelled) setDocuments(docs);
            } catch {
                if (!cancelled) {
                    setDocsError("Unable to load task documents.");
                }
            } finally {
                if (!cancelled) setDocsLoading(false);
            }
        }

        fetchDocuments();
        return () => {
            cancelled = true;
        };
    }, [documentsOpen, taskId]);

    async function downloadDocument(documentRecord) {
        setDocsError("");

        try {
            const blob = await taskApi.downloadDocument(
                documentRecord.id
            );

            const url = URL.createObjectURL(blob);
            const link = window.document.createElement("a");

            link.href = url;
            link.download =
                documentRecord.original_filename ||
                documentRecord.file_name ||
                documentRecord.title ||
                "task-document";

            window.document.body.appendChild(link);
            link.click();
            link.remove();

            window.setTimeout(
                () => URL.revokeObjectURL(url),
                1000
            );
        } catch {
            setDocsError("Unable to download the selected file.");
        }
    }

    return (
        <>
            <div className="grid gap-4 rounded-2xl border border-[#EEE6DC] p-4 sm:grid-cols-2">
                <Meta
                    label="Priority"
                    value={formatText(task.priority)}
                />
                <Meta
                    label="Worker / Team"
                    value={task.worker_name}
                />
                <Meta
                    label="Start Date"
                    value={formatDate(task.start_date)}
                />
                <Meta
                    label="End Date"
                    value={formatDate(task.end_date)}
                />
                <Meta
                    label="Measurement Method"
                    value={formatText(task.measurement_method)}
                />
                <Meta
                    label="Planned Quantity"
                    value={
                        task.planned_quantity != null
                            ? `${task.planned_quantity} ${task.measurement_unit || ""}`
                            : "Not applicable"
                    }
                />
                <Meta
                    label="Batch"
                    value={
                        item.batchId
                            ? `Bulk batch ${item.batchId.slice(0, 8)}`
                            : "Individual task"
                    }
                />
                <Meta
                    label="Work Status"
                    value={formatText(task.work_status)}
                />
            </div>

            <div>
                <h4 className="text-sm font-bold text-[#211E1A]">
                    Description
                </h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#716658]">
                    {task.description ||
                        "No description provided."}
                </p>
            </div>

            <div className="rounded-2xl border border-[#C9DFC9] bg-[#F2F8F2] p-4">
                <h4 className="flex items-center gap-2 text-sm font-bold text-[#296F40]">
                    <ShieldCheck size={18} />
                    Completion Criteria
                </h4>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#526A54]">
                    {task.completion_criteria ||
                        "No completion criteria provided."}
                </p>

                <p className="mt-3 text-xs leading-5 text-[#526A54]">
                    Review the measurement baseline carefully:
                    approving a task also approves its planned
                    quantity and measurement method.
                </p>
            </div>

            {/* DOCUMENTS */}
            <div>
                <button
                    type="button"
                    onClick={() =>
                        setDocumentsOpen((v) => !v)
                    }
                    aria-expanded={documentsOpen}
                    className="flex w-full items-center justify-between rounded-xl border border-[#E4DCCD] bg-[#F8F4EE] px-4 py-3 text-sm font-bold text-[#211E1A]"
                >
                    <span className="flex items-center gap-2">
                        <FileText size={18} />
                        Task Documents
                    </span>

                    <ChevronDown
                        size={17}
                        className={
                            documentsOpen ? "rotate-180" : ""
                        }
                    />
                </button>

                {documentsOpen && (
                    <div className="space-y-2 rounded-b-xl border border-t-0 border-[#E4DCCD] p-3">
                        {docsLoading && (
                            <p className="text-xs text-[#716658]">
                                Loading documents...
                            </p>
                        )}

                        {docsError && (
                            <p role="alert" className="text-xs text-red-700">
                                {docsError}
                            </p>
                        )}

                        {!docsLoading &&
                            !documents.length &&
                            !docsError && (
                                <p className="text-xs text-[#716658]">
                                    No documents attached.
                                </p>
                            )}

                        {documents.map((doc) => (
                            <button
                                key={doc.id}
                                type="button"
                                onClick={() => downloadDocument(doc)}
                                className="flex w-full items-center justify-between gap-2 rounded-lg bg-[#F8F4EE] p-3 text-left hover:bg-[#F1EADF]"
                            >
                                <span className="min-w-0 wrap-break-word text-xs font-semibold text-[#211E1A]">
                                    {doc.title || doc.file_name || "Document"}
                                </span>
                                <span className="shrink-0 text-xs font-bold text-[#3565A5]">
                                    Download
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
