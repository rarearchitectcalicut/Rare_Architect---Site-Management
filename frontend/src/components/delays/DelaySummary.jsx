export default function DelaySummary({ reports, loading }) {
    const entries = [
        ["Delay reports", reports.length],
        ["Pending reports", reports.filter((report) => report.status === "PENDING").length],
        ["Pending extensions", reports.filter((report) => report.extension_status === "PENDING").length],
        ["Approved extensions", reports.filter((report) => report.extension_status === "APPROVED").length],
    ];
    return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{entries.map(([label, count]) => <div key={label} className="rounded-2xl border border-[#E5DDD1] bg-[#FFFDFA] p-5"><p className="text-xs text-[#817669]">{label}</p><p className="mt-3 text-2xl font-bold">{loading ? "—" : count}</p></div>)}</div>;
}
