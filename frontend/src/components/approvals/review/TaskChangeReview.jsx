import { recordDisplayText } from "../../../utils/recordPresentation";
import { formatText, getChanges } from "../approvalUtils";
import Meta from "../ReviewFields";

export default function TaskChangeReview({ record }) {
    const changes = getChanges(record);
    return (
        <>
            <div className="rounded-2xl bg-surface-soft p-4">
                <Meta
                    label="Change Type"
                    value={formatText(
                        record.change_type ||
                        record.request_type ||
                        "Task Edit"
                    )}
                />

                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">
                    Reason for Request
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
                    {record.reason ||
                        record.change_reason ||
                        "No reason provided."}
                </p>
            </div>

            <div>
                <h4 className="text-sm font-bold text-ink">
                    Requested Changes
                </h4>

                {changes.length ? (
                    <div className="mt-3 space-y-2">
                        {changes.map(([field, newValue]) => {
                            const oldValues =
                                record.old_values ||
                                record.current_values ||
                                record.previous_values ||
                                {};

                            const oldValue = oldValues[field];

                            return (
                                <div
                                    key={field}
                                    className="rounded-xl border border-border p-4"
                                >
                                    <p className="text-xs font-bold text-muted">
                                        {formatText(field)}
                                    </p>

                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-xl bg-surface-soft p-4">
                                            <p className="text-xs font-bold uppercase tracking-wider text-muted">
                                                Current
                                            </p>
                                            <p className="mt-1 wrap-anywhere text-xs text-ink">
                                                {oldValue == null
                                                    ? "See current task"
                                                    : recordDisplayText(oldValue)}
                                            </p>
                                        </div>

                                        <div className="rounded-xl border border-border-strong bg-pastel-sky p-4">
                                            <p className="text-xs font-bold uppercase tracking-wider text-info">
                                                Proposed
                                            </p>
                                            <p className="mt-1 wrap-anywhere text-xs text-ink">
                                                {newValue == null
                                                    ? "Empty"
                                                    : recordDisplayText(newValue)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="mt-3 text-xs leading-5 text-muted">
                        No requested changes are available for this request.
                    </p>
                )}
            </div>
        </>
    );
}
