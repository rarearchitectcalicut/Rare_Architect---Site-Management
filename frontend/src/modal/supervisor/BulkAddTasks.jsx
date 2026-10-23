
import { useEffect, useRef, useState } from "react";
import {
    AlertCircle,
    ClipboardList,
    CopyPlus,
    Plus,
    Send,
    Trash2,
    X,
} from "lucide-react";

import { taskApi } from "../../api/taskApi";
import LoadingScreen from "../../components/LoadingScreen";

const makeRow = (key) => ({
    key,
    title: "",
    description: "",
    worker_name: "",
    priority: "MEDIUM",
    start_date: "",
    end_date: "",
    measurement_method: "COMPLETION_ONLY",
    planned_quantity: "",
    measurement_unit: "",
    completion_criteria: "",
});

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const UNITS = [
    "SQM",
    "METER",
    "CUM",
    "COUNT",
    "KG",
    "LITRE",
];

const inputClass = `
  w-full rounded-xl border border-[#E4DCCD]
  bg-[#FFFDFA] px-3.5 py-3 text-sm
  text-[#211E1A] outline-none
  transition-all duration-200
  placeholder:text-[#A99D8E]
  focus:border-[#B7A58E]
  focus:ring-4 focus:ring-[#E8DDD0]/50
`;

function errorText(value) {
    if (Array.isArray(value)) {
        return value.map(errorText).filter(Boolean).join(" ");
    }

    if (typeof value === "string") return value;

    if (value && typeof value === "object") {
        return Object.entries(value)
            .map(([key, message]) => `${key}: ${errorText(message)}`)
            .join(" · ");
    }

    return "";
}

function validateRow(row) {
    const errors = {};

    if (!row.title.trim()) {
        errors.title = "Task title is required.";
    }

    if (
        row.start_date &&
        row.end_date &&
        row.end_date < row.start_date
    ) {
        errors.end_date = "End date must be after start date.";
    }

    if (row.measurement_method === "QUANTITY") {
        if (!(Number(row.planned_quantity) > 0)) {
            errors.planned_quantity =
                "Quantity must be greater than zero.";
        }

        if (!row.measurement_unit) {
            errors.measurement_unit = "Choose a unit.";
        }
    }

    return errors;
}

function serializeRow(row) {
    return {
        title: row.title.trim(),
        description: row.description.trim(),
        worker_name: row.worker_name.trim(),
        priority: row.priority,
        start_date: row.start_date || null,
        end_date: row.end_date || null,
        measurement_method: row.measurement_method,
        planned_quantity:
            row.measurement_method === "QUANTITY"
                ? row.planned_quantity
                : null,
        measurement_unit:
            row.measurement_method === "QUANTITY"
                ? row.measurement_unit
                : null,
        completion_criteria: row.completion_criteria.trim(),
    };
}

function FormField({ label, error, children }) {
    return (
        <div className="min-w-0">
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[#817669]">
                {label}
            </label>

            {children}

            {error && (
                <p role="alert" className="mt-2 text-xs text-red-700">
                    {error}
                </p>
            )}
        </div>
    );
}

export default function BulkAddTasks({
    open,
    projectId,
    onClose,
    onSaved,
}) {
    const nextKey = useRef(1);
    const savingRef = useRef(false);

    const [rows, setRows] = useState([makeRow(0)]);
    const [rowErrors, setRowErrors] = useState({});
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;

        nextKey.current = 1;
        setRows([makeRow(0)]);
        setRowErrors({});
        setError("");

        const oldOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = oldOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        function handleEscape(event) {
            if (
                event.key === "Escape" &&
                !savingRef.current
            ) {
                onClose();
            }
        }

        document.addEventListener("keydown", handleEscape);

        return () =>
            document.removeEventListener("keydown", handleEscape);
    }, [open, onClose]);

    if (!open) return null;

    function updateRow(key, field, value) {
        setRows((current) =>
            current.map((row) =>
                row.key === key ? { ...row, [field]: value } : row
            )
        );

        setRowErrors((current) => ({
            ...current,
            [key]: {
                ...current[key],
                [field]: "",
            },
        }));

        setError("");
    }

    function addRow() {
        const key = nextKey.current++;
        setRows((current) => [...current, makeRow(key)]);
    }

    function duplicateRow(row) {
        const key = nextKey.current++;

        setRows((current) => {
            const index = current.findIndex(
                (item) => item.key === row.key
            );

            const next = [...current];
            next.splice(index + 1, 0, { ...row, key });
            return next;
        });
    }

    function removeRow(key) {
        if (rows.length <= 1) return;

        setRows((current) =>
            current.filter((row) => row.key !== key)
        );

        setRowErrors((current) => {
            const next = { ...current };
            delete next[key];
            return next;
        });
    }

    async function submit(event) {
        event.preventDefault();

        if (savingRef.current) return;

        const validation = {};

        rows.forEach((row) => {
            const errors = validateRow(row);

            if (Object.keys(errors).length) {
                validation[row.key] = errors;
            }
        });

        if (Object.keys(validation).length) {
            setRowErrors(validation);
            setError("Please correct the highlighted task rows.");
            return;
        }

        savingRef.current = true;
        setSaving(true);
        setError("");
        setRowErrors({});

        try {
            const payload = rows.map(serializeRow);

            await taskApi.bulkCreate(projectId, payload);

            onSaved?.();
            onClose();
        } catch (err) {
            const data = err.response?.data;

            setError(
                errorText(data?.detail) ||
                errorText(data?.non_field_errors) ||
                errorText(data?.tasks) ||
                (
                    typeof data === "object"
                        ? errorText(data)
                        : ""
                ) ||
                "Unable to create this task batch. No tasks should be saved if Django rejected the request."
            );
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }

    return (
        <>
            {saving && (
                <LoadingScreen message="Submitting task batch..." />
            )}

            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-[#211E1A]/55 p-3 backdrop-blur-sm sm:p-6"
                onMouseDown={(event) => {
                    if (
                        event.target === event.currentTarget &&
                        !savingRef.current
                    ) {
                        onClose();
                    }
                }}
            >
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="bulk-task-title"
                    className="flex max-h-[94dvh] w-full max-w-[900px] flex-col overflow-hidden rounded-[26px] border border-[#E7DED2] bg-[#FFFDFA] shadow-2xl"
                >
                    {/* HEADER */}
                    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EEE6DC] p-5 sm:p-7">
                        <div className="flex items-start gap-3">
                            <span className="rounded-2xl bg-[#E9F0FC] p-3 text-[#3565A5]">
                                <ClipboardList size={24} />
                            </span>

                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#948778]">
                                    Supervisor / Task Management
                                </p>

                                <h2
                                    id="bulk-task-title"
                                    className="mt-1 text-xl font-bold text-[#211E1A] sm:text-2xl"
                                >
                                    Bulk Add Tasks
                                </h2>

                                <p className="mt-2 text-xs leading-5 text-[#817669]">
                                    Prepare multiple tasks and submit them together
                                    for Admin review.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            aria-label="Close bulk tasks"
                            className="rounded-full bg-[#F1EADF] p-2.5 text-[#211E1A] disabled:opacity-50"
                        >
                            <X size={19} />
                        </button>
                    </header>

                    {/* ROWS */}
                    <form
                        onSubmit={submit}
                        noValidate
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#F8F4EE] p-4 sm:p-6">
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#E9F0FC] px-4 py-3">
                                <p className="text-xs font-bold text-[#3565A5]">
                                    {rows.length}{" "}
                                    {rows.length === 1 ? "task" : "tasks"} in batch
                                </p>

                                <p className="text-xs text-[#3565A5]">
                                    All tasks begin Pending Approval
                                </p>
                            </div>

                            {rows.map((row, index) => {
                                const errors = rowErrors[row.key] || {};

                                return (
                                    <article
                                        key={row.key}
                                        className="overflow-hidden rounded-[21px] border border-[#E7DED2] bg-[#FFFDFA]"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEE6DC] bg-[#F7F0E7] p-4">
                                            <h3 className="text-sm font-bold text-[#211E1A]">
                                                Task {index + 1}
                                            </h3>

                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => duplicateRow(row)}
                                                    disabled={saving}
                                                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#E9F0FC] px-3 py-2 text-xs font-bold text-[#3565A5]"
                                                >
                                                    <CopyPlus size={15} />
                                                    Duplicate
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => removeRow(row.key)}
                                                    disabled={saving || rows.length === 1}
                                                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#FCE9E6] px-3 py-2 text-xs font-bold text-[#B5473E] disabled:opacity-40"
                                                >
                                                    <Trash2 size={15} />
                                                    Remove
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
                                            <div className="sm:col-span-2">
                                                <FormField
                                                    label="Task Title *"
                                                    error={errors.title}
                                                >
                                                    <input
                                                        aria-label={`Task ${index + 1} title`}
                                                        value={row.title}
                                                        onChange={(e) =>
                                                            updateRow(row.key, "title", e.target.value)
                                                        }
                                                        maxLength={200}
                                                        placeholder="e.g. Foundation Reinforcement"
                                                        className={inputClass}
                                                    />
                                                </FormField>
                                            </div>

                                            <FormField label="Worker / Team">
                                                <input
                                                    aria-label={`Task ${index + 1} worker`}
                                                    value={row.worker_name}
                                                    onChange={(e) =>
                                                        updateRow(
                                                            row.key,
                                                            "worker_name",
                                                            e.target.value
                                                        )
                                                    }
                                                    maxLength={200}
                                                    placeholder="Worker or team name"
                                                    className={inputClass}
                                                />
                                            </FormField>

                                            <FormField label="Priority">
                                                <select
                                                    aria-label={`Task ${index + 1} priority`}
                                                    value={row.priority}
                                                    onChange={(e) =>
                                                        updateRow(
                                                            row.key,
                                                            "priority",
                                                            e.target.value
                                                        )
                                                    }
                                                    className={inputClass}
                                                >
                                                    {PRIORITIES.map((value) => (
                                                        <option key={value} value={value}>
                                                            {value}
                                                        </option>
                                                    ))}
                                                </select>
                                            </FormField>

                                            <FormField label="Start Date">
                                                <input
                                                    type="date"
                                                    aria-label={`Task ${index + 1} start date`}
                                                    value={row.start_date}
                                                    onChange={(e) =>
                                                        updateRow(
                                                            row.key,
                                                            "start_date",
                                                            e.target.value
                                                        )
                                                    }
                                                    className={inputClass}
                                                />
                                            </FormField>

                                            <FormField
                                                label="End Date"
                                                error={errors.end_date}
                                            >
                                                <input
                                                    type="date"
                                                    aria-label={`Task ${index + 1} end date`}
                                                    value={row.end_date}
                                                    min={row.start_date || undefined}
                                                    onChange={(e) =>
                                                        updateRow(
                                                            row.key,
                                                            "end_date",
                                                            e.target.value
                                                        )
                                                    }
                                                    className={inputClass}
                                                />
                                            </FormField>

                                            <div className="sm:col-span-2">
                                                <FormField label="Description">
                                                    <textarea
                                                        rows={2}
                                                        aria-label={`Task ${index + 1} description`}
                                                        value={row.description}
                                                        onChange={(e) =>
                                                            updateRow(
                                                                row.key,
                                                                "description",
                                                                e.target.value
                                                            )
                                                        }
                                                        placeholder="Scope of work..."
                                                        className={`${inputClass} resize-y`}
                                                    />
                                                </FormField>
                                            </div>

                                            <div className="sm:col-span-2 rounded-2xl bg-[#F8F4EE] p-4">
                                                <p className="mb-4 text-xs font-bold uppercase tracking-wider text-[#817669]">
                                                    Measurement & Completion
                                                </p>

                                                <div className="grid gap-4 sm:grid-cols-2">
                                                    <FormField label="Measurement Method">
                                                        <select
                                                            aria-label={`Task ${index + 1} measurement method`}
                                                            value={row.measurement_method}
                                                            onChange={(e) =>
                                                                updateRow(
                                                                    row.key,
                                                                    "measurement_method",
                                                                    e.target.value
                                                                )
                                                            }
                                                            className={inputClass}
                                                        >
                                                            <option value="COMPLETION_ONLY">
                                                                Completion Only
                                                            </option>

                                                            <option value="QUANTITY">
                                                                Measured Quantity
                                                            </option>
                                                        </select>
                                                    </FormField>

                                                    {row.measurement_method === "QUANTITY" && (
                                                        <>
                                                            <FormField
                                                                label="Planned Quantity *"
                                                                error={errors.planned_quantity}
                                                            >
                                                                <input
                                                                    type="number"
                                                                    min="0.001"
                                                                    step="0.001"
                                                                    aria-label={`Task ${index + 1} planned quantity`}
                                                                    value={row.planned_quantity}
                                                                    onChange={(e) =>
                                                                        updateRow(
                                                                            row.key,
                                                                            "planned_quantity",
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                    className={inputClass}
                                                                />
                                                            </FormField>

                                                            <FormField
                                                                label="Measurement Unit *"
                                                                error={errors.measurement_unit}
                                                            >
                                                                <select
                                                                    aria-label={`Task ${index + 1} measurement unit`}
                                                                    value={row.measurement_unit}
                                                                    onChange={(e) =>
                                                                        updateRow(
                                                                            row.key,
                                                                            "measurement_unit",
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                    className={inputClass}
                                                                >
                                                                    <option value="">Select unit</option>
                                                                    {UNITS.map((unit) => (
                                                                        <option key={unit} value={unit}>
                                                                            {unit}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </FormField>
                                                        </>
                                                    )}
                                                </div>

                                                <div className="mt-4">
                                                    <FormField label="Completion Criteria">
                                                        <textarea
                                                            rows={2}
                                                            aria-label={`Task ${index + 1} completion criteria`}
                                                            value={row.completion_criteria}
                                                            onChange={(e) =>
                                                                updateRow(
                                                                    row.key,
                                                                    "completion_criteria",
                                                                    e.target.value
                                                                )
                                                            }
                                                            className={inputClass}
                                                            placeholder="Conditions for accepted completion"
                                                        />
                                                    </FormField>
                                                </div>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}

                            <button
                                type="button"
                                onClick={addRow}
                                disabled={saving}
                                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#D7C7B4] bg-[#FFFDFA] px-5 py-5 text-sm font-bold text-[#665E53] transition-colors hover:border-[#AB987F] hover:bg-[#F1EADF]"
                            >
                                <Plus size={19} />
                                Add Another Task
                            </button>

                            {error && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                                >
                                    <AlertCircle size={18} className="shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>

                        {/* FOOTER */}
                        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#EEE6DC] bg-[#FFFDFA] p-5 sm:px-7">
                            <p className="text-xs text-[#817669]">
                                {rows.length} tasks · One atomic submission
                            </p>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={onClose}
                                    className="rounded-xl border border-[#E4DCCD] px-4 py-3 text-sm font-semibold text-[#211E1A]"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#39332B] disabled:opacity-50"
                                >
                                    <Send size={17} />
                                    Submit All ({rows.length})
                                </button>
                            </div>
                        </footer>
                    </form>
                </section>
            </div>
        </>
    );
}
