import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import ApprovalRequestCard from "./ApprovalRequestCard";

export default function RequestList({ list, loading, onOpen }) {
    const count = list.count ?? list.rows.length;
    if (loading) return <div role="status" aria-label="Loading requests" className="grid gap-4 p-6 md:grid-cols-2">{[0, 1, 2, 3].map((key) => <div key={key} className="h-52 animate-pulse rounded-2xl bg-[#EFEAE2] motion-reduce:animate-none" />)}<span className="sr-only">Loading requests…</span></div>;
    return <>
        {list.pageRows.length ? <div className="grid gap-4 bg-[#F9F6F1] p-4 sm:p-6 md:grid-cols-2">{list.pageRows.map((item) => <ApprovalRequestCard key={item.queueKey} item={item} onOpen={onOpen} />)}</div> : <div className="p-12 text-center"><Inbox size={30} className="mx-auto text-[#716658]" /><h3 className="mt-4 font-bold">No requests to show</h3><p className="mt-2 text-sm text-[#716658]">Try different filters or check another queue.</p></div>}
        {!!count && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEE6DC] px-6 py-4 text-xs text-[#716658]">
            <p>Showing {(list.page - 1) * 8 + 1}–{Math.min(list.page * 8, count)} of {count} requests</p>
            {list.pageCount > 1 && <div className="flex items-center gap-3"><button type="button" aria-label="Previous page" disabled={list.page === 1} onClick={() => list.setPage(list.page - 1)} className="rounded-lg border p-2 disabled:opacity-40"><ChevronLeft size={16} /></button><span>{list.page} / {list.pageCount}</span><button type="button" aria-label="Next page" disabled={list.page === list.pageCount} onClick={() => list.setPage(list.page + 1)} className="rounded-lg border p-2 disabled:opacity-40"><ChevronRight size={16} /></button></div>}
        </footer>}
    </>;
}
