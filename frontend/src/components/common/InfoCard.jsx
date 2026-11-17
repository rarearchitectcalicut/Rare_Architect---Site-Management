/** Read-only information primitives: no permissions, requests or workflow state. */
export function InfoField({ label, value, icon: Icon, className = "" }) {
    return <div className={`rare-info-field ${className}`}>
        <dt>{Icon && <Icon size={15} aria-hidden="true" />}{label}</dt>
        <dd>{value == null || value === "" ? "Not specified" : value}</dd>
    </div>;
}

export default function InfoCard({ title, eyebrow, icon: Icon, children, aside, className = "", ...props }) {
    return <section className={`rare-info-card ${className}`} {...props}>
        <header className="rare-info-card-heading">
            <div className="rare-info-card-heading-copy">
                {Icon && <span className="rare-info-card-icon"><Icon size={19} strokeWidth={1.7} aria-hidden="true" /></span>}
                <div>{eyebrow && <p className="rare-info-eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>
            </div>
            {aside}
        </header>
        {children}
    </section>;
}
