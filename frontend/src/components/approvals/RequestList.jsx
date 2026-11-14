import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import ApprovalRequestCard from "./ApprovalRequestCard";

export default function RequestList({ list, loading, onOpen, compactCards = false }) {
    const count = list.count ?? list.rows.length;
    if (loading) return <div role="status" aria-label="Loading requests" className={`grid gap-4 p-6 ${compactCards ? "sm:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2"}`}>{[0, 1, 2, 3].map((key) => <div key={key} className={`${compactCards ? "aspect-square" : "h-52"} animate-pulse rounded-2xl bg-[#EFEAE2] motion-reduce:animate-none`} />)}<span className="sr-only">Loading requests…</span></div>;
    return <>
        {list.pageRows.length ? <div className={`grid gap-4 bg-[#F9F6F1] p-4 sm:p-6 ${compactCards ? "sm:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2"}`}>{list.pageRows.map((item) => <ApprovalRequestCard key={item.queueKey} item={item} onOpen={onOpen} compact={compactCards} />)}</div> : <div className="p-12 text-center"><Inbox size={30} className="mx-auto text-[#716658]" /><h3 className="mt-4 font-bold">No requests to show</h3><p className="mt-2 text-sm text-[#716658]">Try different filters or check another queue.</p></div>}
        {!!count && <footer className="flex flex-col gap-3 border-t border-[#EEE6DC] px-4 py-4 text-xs text-[#716658] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
            <p>Showing {(list.page - 1) * 8 + 1}–{Math.min(list.page * 8, count)} of {count} requests</p>
            {list.pageCount > 1 && <nav aria-label="Request pages" className="rare-pagination w-full sm:w-auto sm:flex-1 sm:basis-80"><button type="button" disabled={list.page === 1} onClick={() => list.setPage(list.page - 1)} className="rare-button rare-button-secondary"><ChevronLeft size={16} aria-hidden="true" />Previous</button><span aria-live="polite" aria-atomic="true">Page {list.page} of {list.pageCount}</span><button type="button" disabled={list.page === list.pageCount} onClick={() => list.setPage(list.page + 1)} className="rare-button rare-button-secondary">Next<ChevronRight size={16} aria-hidden="true" /></button></nav>}
        </footer>}
    </>;
}
