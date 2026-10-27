import { queueLabels } from "./queueData";

export default function ApprovalQueueTabs({ queues, counts = {}, tab, onChange, loading }) {
    return <nav aria-label="Request queues" className="grid grid-cols-2 gap-2 rounded-2xl border border-[#E5DDD1] bg-[#FFFDFA] p-2 sm:flex sm:flex-wrap">
        {Object.entries(queueLabels).map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => onChange(id)} className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3565A5] sm:flex-none ${tab === id ? "bg-[#252B2A] text-white" : "text-[#716658] hover:bg-[#F1EADF]"}`}>
            {label}{id !== "history" && <span className={`rounded-full px-2 py-0.5 text-xs ${tab === id ? "bg-white/15" : "bg-[#F1EADF]"}`}>{loading ? "..." : Object.hasOwn(counts, id) ? counts[id] ?? "Unavailable" : queues[id].length}</span>}
        </button>)}
    </nav>;
}
