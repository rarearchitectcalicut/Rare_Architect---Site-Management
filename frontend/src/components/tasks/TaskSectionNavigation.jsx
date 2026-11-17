export default function TaskSectionNavigation({ tabs, activeTab, onChange, panelId }) {
    return <div className="rare-task-tab-dock">
        <nav aria-label="Task detail sections" className="rare-task-tabs">
            {tabs.map(([id, label, accessibleLabel]) => <button key={id} type="button" aria-label={accessibleLabel || undefined}
                aria-pressed={activeTab === id} aria-controls={panelId} onClick={(event) => {
                    const dock = event?.currentTarget.closest(".rare-task-tab-dock");
                    const style = dock && getComputedStyle(dock);
                    const pinned = style?.position === "sticky" && dock.getBoundingClientRect().top <= parseFloat(style.top) + 1;
                    onChange(id);
                    if (pinned) requestAnimationFrame(() => dock.scrollIntoView({ block: "start", behavior: "instant" }));
                }}>{label}</button>)}
        </nav>
    </div>;
}
