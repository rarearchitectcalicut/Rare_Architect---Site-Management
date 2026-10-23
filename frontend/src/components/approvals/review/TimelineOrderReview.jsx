import Meta from "../ReviewFields";

export default function TimelineOrderReview({ record }) {
    const current = record.old_values?.timeline || [];
    const proposed = record.new_values?.timeline || [];
    const positions = new Map(current.map((task, index) => [String(task.task_id), index + 1]));
    return <div className="space-y-5">
        <Meta label="Supervisor's reason" value={record.reason} />
        <div className="grid gap-4 sm:grid-cols-2">
            {[["Current approved sequence", current], ["Proposed sequence", proposed]].map(([label, sequence], column) => (
                <section key={label} className="rounded-2xl border border-[#E7DED2] p-4">
                    <h3 className="mb-4 text-sm font-bold">{label}</h3>
                    <ol className="space-y-2">{sequence.map((task, index) => {
                        const previous = positions.get(String(task.task_id));
                        const moved = column === 1 && previous !== index + 1;
                        return <li key={task.task_id} className={`rounded-xl p-3 text-sm ${moved ? "bg-[#EDF3FC] text-[#284F83]" : "bg-[#F5F1EA]"}`}>
                            <span className="mr-2 font-bold">{index + 1}.</span>{record.taskNames?.[task.task_id] || "Task unavailable"}
                            {moved && <span className="mt-1 block text-xs">Position {previous} → {index + 1}</span>}
                        </li>;
                    })}</ol>
                </section>
            ))}
        </div>
        <p className="text-xs text-[#817669]">This request compares the approved sequence at submission with the proposal. Approval checks for later timeline changes before applying it.</p>
    </div>;
}
