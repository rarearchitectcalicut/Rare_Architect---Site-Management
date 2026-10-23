import { RefreshCw, ShieldCheck } from "lucide-react";

export default function ApprovalOverview({ loading, count, onRefresh, title = "Approval Center", description = "Review submissions, compare changes, and keep every project moving." }) {
    return <header className="relative overflow-hidden rounded-[28px] bg-[#252B2A] p-6 text-[#FFFDFA] sm:p-9">
        <div className="relative flex flex-wrap items-start justify-between gap-6"><div className="max-w-xl"><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#CBB99A]"><ShieldCheck size={15} />Admin workspace</p><h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1><p className="mt-3 text-sm leading-6 text-[#C3C9C5]">{description}</p></div>
            <button type="button" disabled={loading} onClick={onRefresh} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />{loading ? "Refreshing…" : "Refresh requests"}</button>
        </div>
        <p className="mt-7 border-t border-white/10 pt-5 text-xs text-[#DFE6E0]">{loading ? "Loading your queues" : `${count} pending ${count === 1 ? "decision" : "decisions"}`}</p>
    </header>;
}
