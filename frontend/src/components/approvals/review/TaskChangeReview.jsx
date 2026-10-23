import { formatText, getChanges } from "../approvalUtils";
import Meta from "../ReviewFields";

export default function TaskChangeReview({ record }) {
    const changes = getChanges(record);
    return (
        <>
            <div className="rounded-2xl bg-[#F8F4EE] p-4">
                <Meta
                    label="Change Type"
                    value={formatText(
                        record.change_type ||
                        record.request_type ||
                        "Task Edit"
                    )}
                />

                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#938778]">
                    Reason for Request
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#665E53]">
                    {record.reason ||
                        record.change_reason ||
                        "No reason provided."}
                </p>
            </div>

            <div>
                <h4 className="text-sm font-bold text-[#211E1A]">
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
                                    className="rounded-xl border border-[#E7DED2] p-4"
                                >
                                    <p className="text-xs font-bold text-[#665E53]">
                                        {formatText(field)}
                                    </p>

                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-xl bg-[#F3F0EB] p-4">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#74695D]">
                                                Current
                                            </p>
                                            <p className="mt-1 wrap-break-word text-xs text-[#211E1A]">
                                                {oldValue == null
                                                    ? "See current task"
                                                    : String(oldValue)}
                                            </p>
                                        </div>

                                        <div className="rounded-xl border border-[#D4E2F4] bg-[#EDF3FC] p-4">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#3565A5]">
                                                Proposed
                                            </p>
                                            <p className="mt-1 wrap-break-word text-xs text-[#211E1A]">
                                                {newValue == null
                                                    ? "Empty"
                                                    : String(newValue)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="mt-3 text-xs leading-5 text-[#817669]">
                        No requested changes are available for this request.
                    </p>
                )}
            </div>
        </>
    );
}
