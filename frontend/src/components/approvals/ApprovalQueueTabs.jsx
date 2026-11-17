import { queueLabels } from "./queueData";

const phoneLabels = { tasks: "Tasks", changes: "Edits", timeline: "Order", delays: "Delays", work: "Work", history: "History" };
const compactLabels = { tasks: "Tasks", changes: "Changes", timeline: "Timeline", delays: "Delays", work: "Daily work", history: "History" };

export default function ApprovalQueueTabs({ queues, counts = {}, tab, onChange, loading }) {
    return <div className="approval-queue-nav-dock">
        <nav aria-label="Request queues" className="approval-queue-nav">
            {Object.entries(queueLabels).map(([id, label]) => <button key={id} type="button" aria-label={label} aria-pressed={tab === id} onClick={(event) => {
                const dock = event?.currentTarget.closest(".approval-queue-nav-dock");
                const pinned = dock && dock.getBoundingClientRect().top <= parseFloat(getComputedStyle(dock).top) + 1;
                onChange(id);
                if (pinned) requestAnimationFrame(() => dock.scrollIntoView({ block: "start", behavior: "instant" }));
            }}>
                <span className="approval-tab-full-label">{label}</span><span className="approval-tab-compact-label" aria-hidden="true">{compactLabels[id]}</span><span className="approval-tab-phone-label" aria-hidden="true">{phoneLabels[id]}</span>
                {id !== "history" && <span className={`approval-tab-count rounded-full px-2 py-0.5 text-xs ${tab === id ? "bg-white/15" : "bg-app"}`}>{loading ? "..." : Object.hasOwn(counts, id) ? counts[id] ?? "Unavailable" : queues[id].length}</span>}
            </button>)}
        </nav>
    </div>;
}
