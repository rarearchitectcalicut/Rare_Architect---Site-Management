export default function DelaySummary({ summary, loading }) {
    const entries = [["Delay reports", "total"], ["Pending reports", "pending"], ["Approved reports", "approved"], ["Rejected reports", "rejected"], ["Pending extensions", "pending_extensions"]];
    return <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{entries.map(([label, key]) => <div key={key} className="rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-5"><p className="text-xs text-[#817669]">{label}</p><p className={`mt-3 font-bold ${loading || !Number.isInteger(summary?.[key]) ? "text-sm" : "text-2xl"}`}>{loading || !Number.isInteger(summary?.[key]) ? "Unavailable" : summary[key]}</p></div>)}</div>;
}
