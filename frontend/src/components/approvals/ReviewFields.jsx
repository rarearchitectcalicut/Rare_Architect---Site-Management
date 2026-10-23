export default function Meta({ label, value }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#938778]">
                {label}
            </p>
            <p className="mt-1.5 wrap-break-word text-sm font-semibold text-[#211E1A]">
                {value || "Not specified"}
            </p>
        </div>
    );
}

