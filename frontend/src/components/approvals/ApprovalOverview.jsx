import { RefreshCw, ShieldCheck } from "lucide-react";

export default function ApprovalOverview({ loading, count, onRefresh, title = "Approval Center", description = "Review submissions, compare changes, and keep every project moving." }) {
    return <header className="rare-page-header relative overflow-hidden rounded-[28px] bg-[#FFFDFA] p-6 text-[#211E1A] sm:p-9">
        <div className="relative flex flex-wrap items-start justify-between gap-6"><div className="max-w-xl"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#716658]"><ShieldCheck size={15} />Admin workspace</p><h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1><p className="mt-3 text-sm leading-6 text-[#716658]">{description}</p></div>
            <button type="button" disabled={loading} onClick={onRefresh} className="inline-flex items-center gap-2 rounded-xl border border-[#E7DED2] bg-[#F1EADF] px-4 py-2.5 text-xs font-semibold hover:bg-[#E7DED2] disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />{loading ? "Refreshing…" : "Refresh requests"}</button>
        </div>
        <p className="mt-4 border-t border-[#E7DED2] pt-3 text-xs text-[#716658]">{loading ? "Loading your queues" : count == null ? "Pending decision count unavailable" : `${count} pending ${count === 1 ? "decision" : "decisions"}`}</p>
    </header>;
}
