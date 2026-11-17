/** Layout primitives deliberately own no requests, permissions, or workflow state. */
export function PageHeader({ eyebrow, title, description, actions, children, className = "" }) {
    return <header className={`rare-page-header rare-workspace-header ${className}`}>
        <div className="min-w-0 flex-1">
            {eyebrow && <p className="rare-eyebrow">{eyebrow}</p>}
            <h1>{title}</h1>
            {description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}
            {children}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>;
}

export function ContentCard({ as: Element = "section", children, className = "", ...props }) {
    return <Element className={`rare-content-card ${className}`} {...props}>{children}</Element>;
}

export function SectionHeader({ title, subtitle, action }) {
    return <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 sm:mb-5">
        <div className="min-w-0"><h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>
        {action}
    </div>;
}

export function PillNavigation({ children, label, className = "" }) {
    return <nav aria-label={label} className={`rare-pill-navigation ${className}`}>{children}</nav>;
}
