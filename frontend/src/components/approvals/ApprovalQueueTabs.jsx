import { queueLabels } from "./queueData";

export default function ApprovalQueueTabs({ queues, tab, onChange, loading }) {
    return <nav aria-label="Request queues" className="flex flex-wrap gap-2 rounded-2xl border border-[#E5DDD1] bg-[#FFFDFA] p-2">
        {Object.entries(queueLabels).map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => onChange(id)} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3565A5] sm:flex-none ${tab === id ? "bg-[#252B2A] text-white" : "text-[#817669] hover:bg-[#F1EADF]"}`}>
            {label}<span className={`rounded-full px-2 py-0.5 text-[10px] ${tab === id ? "bg-white/15" : "bg-[#F1EADF]"}`}>{loading ? "—" : queues[id].length}</span>
        </button>)}
    </nav>;
}
