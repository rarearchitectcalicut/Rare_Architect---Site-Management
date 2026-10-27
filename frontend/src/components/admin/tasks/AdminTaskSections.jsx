import { Link } from "react-router-dom";
import { CalendarRange, ClipboardList, FileText, GitPullRequest, History, Ruler } from "lucide-react";
import AdminTaskOverview from "./AdminTaskOverview";
import { formatDate, formatText } from "../../approvals/approvalUtils";

const taskTabs = [["overview", "Overview"], ["timeline", "Timeline"], ["documents", "Documents"], ["work", "Work & Reports"], ["changes", "Changes & Delays"], ["history", "History"]];
const tabIcons = { overview: ClipboardList, timeline: CalendarRange, documents: FileText, work: Ruler, changes: GitPullRequest, history: History };
const button = "task-secondary px-3 py-2.5 text-xs font-semibold text-[#74614D] disabled:opacity-50";

function Resource({ name, resources, onRetry, children }) {
    const resource = resources[name];
    if (!resource || resource.loading) return <div role="status" className="space-y-4 py-4"><span className="text-xs text-[#716658]">Loading section…</span><div aria-hidden="true" className="grid gap-4 motion-safe:animate-pulse sm:grid-cols-2">{[0, 1].map((item) => <div key={item} className="space-y-3 rounded-2xl border border-[#E7DED2] bg-[#F8F5F0] p-5"><div className="h-2.5 w-1/3 rounded-full bg-[#E7DED2]" /><div className="h-3 w-2/3 rounded-full bg-[#EDE4D7]" /></div>)}</div></div>;
    if (resource.error) return <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700"><p>{resource.error}</p><button type="button" className={`${button} mt-3`} onClick={() => onRetry(name)}>Retry</button></div>;
    return children(resource.data);
}

function Fields({ rows }) {
    return <dl className="grid gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-[#F8F5F0] px-4 py-3"><dt className="text-xs font-medium text-[#716658]">{label}</dt><dd className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-[#3E352B]">{value == null || value === "" ? "Not available" : value}</dd></div>)}</dl>;
}

function ReadableValue({ value }) {
    if (value == null || value === "") return <span>Not specified</span>;
    if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
    if (Array.isArray(value)) return value.length ? <ul className="space-y-2">{value.map((item, i) => <li key={i}><ReadableValue value={item} /></li>)}</ul> : <span>None</span>;
    if (typeof value === "object") return <dl className="space-y-2">{Object.entries(value).map(([key, item]) => <div key={key} className="border-l-2 border-[#E7DED2] pl-3"><dt className="text-xs text-[#716658]">{formatText(key)}</dt><dd className="mt-1"><ReadableValue value={item} /></dd></div>)}</dl>;
    return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
}

function Timeline({ task, data }) {
    const index = data.tasks.findIndex((item) => item.id === task.id);
    const overlaps = data.tasks.filter((item) => item.id !== task.id && task.start_date && task.end_date && item.start_date && item.end_date && item.start_date <= task.end_date && item.end_date >= task.start_date);
    function taskLink(item) {
        return item ? <Link className="text-[#3565A5] hover:underline" to={`/admin/projects/${task.project}/tasks/${item.id}`}>{item.title}</Link> : "None";
    }
    return <div className="space-y-6"><Fields rows={[
        ["Current display order", task.display_order], ["Position in approved timeline", index < 0 ? "Outside the approved timeline" : `${index + 1} of ${data.tasks.length}`],
        ["Planned start", formatDate(task.start_date)], ["Planned end", formatDate(task.end_date)],
        ["Timeline status", index < 0 ? "Only approved, non-cancelled tasks appear in the timeline." : formatText(data.tasks[index].work_status)],
        ["Previous task", index < 0 ? "Not applicable" : taskLink(data.tasks[index - 1])], ["Next task", index < 0 ? "Not applicable" : taskLink(data.tasks[index + 1])],
    ]} /><div><h3 className="text-sm font-bold">Overlapping approved tasks</h3>{!task.start_date || !task.end_date ? <p className="mt-2 text-sm text-[#716658]">Both task dates are needed to check overlaps.</p> : <ul className="mt-2 space-y-2 text-sm">{overlaps.map((item) => <li key={item.id}>{taskLink(item)} · {formatDate(item.start_date)} – {formatDate(item.end_date)}</li>)}{!overlaps.length && <li>No date overlaps found.</li>}</ul>}</div></div>;
}

function Documents({ documents, resources, onRetry, onVersions, onDownload, downloading, downloadError }) {
    return <div className="space-y-4">
        {downloadError && <p role="alert" className="text-sm text-red-700">{downloadError}</p>}
        {!documents.length && <p className="text-sm text-[#716658]">No task documents.</p>}
        {documents.map((doc) => <article key={doc.id} className="space-y-4 rounded-2xl border border-[#E7DED2] p-4">
            <h3 className="break-words font-bold">{doc.title}</h3><Fields rows={[["Type", formatText(doc.document_type)], ["Description", doc.description], ["Uploaded", formatDate(doc.created_at)], ["Uploader reference", doc.uploaded_by], ["Current version", doc.current_version?.version_number], ["Original filename", doc.current_version?.original_filename]]} />
            <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={Boolean(downloading) || !doc.current_version} onClick={() => onDownload(doc.current_version)}>{downloading === doc.current_version?.id ? "Downloading…" : "Download current version"}</button><button type="button" className={button} disabled={resources[`versions:${doc.id}`]?.loading} onClick={() => onVersions(doc.id)}>View version history</button></div>
            {resources[`versions:${doc.id}`] && <Resource name={`versions:${doc.id}`} resources={resources} onRetry={onRetry}>{(versions) => <div className="space-y-3 border-t border-[#E7DED2] pt-4">{!versions.length && <p className="text-sm text-[#716658]">No stored versions.</p>}{versions.map((version) => <div key={version.id} className="space-y-2 rounded-xl bg-[#F8F4EE] p-3"><p className="text-sm font-semibold">Version {version.version_number}{version.is_current && " · Current"}</p><Fields rows={[["Filename", version.original_filename], ["Uploaded", formatDate(version.created_at)], ["Uploader reference", version.uploaded_by]]} /><button type="button" className={button} disabled={Boolean(downloading)} onClick={() => onDownload(version)}>{downloading === version.id ? "Downloading…" : "Download version"}</button></div>)}</div>}</Resource>}
        </article>)}
    </div>;
}

function ChangeRecords({ records, task, timeline = false }) {
    return <div className="space-y-4">{!records.length && <p className="text-sm text-[#716658]">No related {timeline ? "timeline order requests" : "task change requests"}.</p>}{records.map((record) => {
        const oldOrder = record.old_values?.timeline?.find((item) => item.task_id === task.id)?.display_order;
        const newOrder = record.new_values?.timeline?.find((item) => item.task_id === task.id)?.display_order;
        return <article key={record.id} className="space-y-4 rounded-2xl border border-[#E7DED2] p-4"><Fields rows={[["Status", formatText(record.status)], ["Requested by", record.requested_by_name], ["Reason", record.reason], ["Requested", formatDate(record.created_at)], ["Admin comment", record.admin_comment], ["Reviewed by", record.reviewed_by_name], ["Reviewed", formatDate(record.reviewed_at)]]} />
            {timeline ? <Fields rows={[["Previous task order", oldOrder], ["Proposed task order", newOrder], ["Current task order", task.display_order]]} /> : <div className="grid gap-4 sm:grid-cols-2"><div><h4 className="mb-2 text-xs font-bold">Previous values</h4><div className="text-sm"><ReadableValue value={record.old_values} /></div></div><div><h4 className="mb-2 text-xs font-bold">Proposed values</h4><div className="text-sm"><ReadableValue value={record.new_values} /></div></div></div>}
            {record.status === "PENDING" && <Link className="inline-block text-sm font-semibold text-[#3565A5] hover:underline" to={`/admin/approvals?tab=${timeline ? "timeline" : "changes"}&request=${record.id}&type=${timeline ? "timeline" : "changes"}`}>Open in Approval Center</Link>}
        </article>;
    })}</div>;
}

function WorkEntries({ entries }) {
    if (!entries.length) return <p className="text-sm text-[#716658]">No submitted work entries for this task.</p>;
    return <div className="space-y-4">{entries.map((entry) => (
        <article key={entry.id} className="rounded-2xl border border-[#E7DED2] p-4">
            <Fields rows={[
                ["Report date", formatDate(entry.report_date)], ["Reported by", entry.reported_by_name],
                ["Work", entry.work_description], ["Location", entry.location_detail],
                ["Submitted quantity", entry.quantity_completed_today], ["Completion claimed", entry.completion_claimed ? "Yes" : "No"],
                ["Verification", formatText(entry.verification_status)], ["Verification note", entry.verification_note],
                ["Verified by", entry.verified_by_name], ["Verified date", formatDate(entry.verified_at)],
            ]} />
        </article>
    ))}</div>;
}

function VerifiedProgress({ data }) {
    let completion = "Not available";
    if (data.is_fully_verified != null) completion = data.is_fully_verified ? "Yes" : "No";
    return <div className="space-y-4">
        <Fields rows={[
            ["Measurement method", formatText(data.measurement_method)], ["Planned quantity", data.planned_quantity],
            ["Unit", formatText(data.measurement_unit)], ["Verified cumulative quantity", data.verified_quantity],
            ["Verified completion", completion],
            ["Progress", data.progress_percentage == null ? "Verified progress unavailable" : `${data.progress_percentage}%`],
        ]} />
        <p className="text-xs text-[#716658]">Calculated by the server from verified daily work. Work status is tracked separately.</p>
    </div>;
}

function DelayRecords({ records }) {
    if (!records.length) return <p className="text-sm text-[#716658]">No delay reports.</p>;
    return <div className="space-y-4">{records.map((record) => (
        <article key={record.id} className="rounded-2xl border border-[#E7DED2] p-4">
            <Fields rows={[
                ["Type", formatText(record.delay_type)], ["Reason", record.reason], ["Description", record.description],
                ["Status", formatText(record.status)], ["Reported by", record.reported_by_name], ["Reported", formatDate(record.reported_at)],
                ["Original deadline", "Not exposed by the delay API; recorded changes may appear in History."],
                ["Current deadline", formatDate(record.current_end_date)], ["Expected completion", formatDate(record.expected_completion_date)],
                ["Extension requested", record.extension_requested ? "Yes" : "No"], ["Requested end date", formatDate(record.requested_end_date)],
                ["Extension decision", formatText(record.extension_status)], ["Admin feedback", record.admin_comment],
                ["Extension feedback", record.extension_admin_comment], ["Reviewed", formatDate(record.reviewed_at)],
                ["Extension reviewed", formatDate(record.extension_reviewed_at)],
            ]} />
        </article>
    ))}</div>;
}

function TaskHistory({ events }) {
    if (!events.length) return <p className="text-sm text-[#716658]">No history events.</p>;
    return <ol className="space-y-5">{events.map((event) => (
        <li key={event.id} className="relative ml-2 space-y-3 rounded-r-2xl border-l border-[#D7C8B4] bg-[#F8F5F0] p-5 pl-6">
            <span aria-hidden="true" className="absolute -left-1.5 top-6 h-3 w-3 rounded-full border-[3px] border-[#FFFDFA] bg-[#A38D72] ring-1 ring-[#D7C8B4]" />
            <h3 className="text-sm font-semibold">{event.action_display || formatText(event.action)}</h3>
            <p className="text-xs text-[#716658]">
                {event.actor_name || "Actor unavailable"} · {event.created_at ? new Date(event.created_at).toLocaleString("en-IN") : "Date unavailable"}
            </p>
            <div className="text-sm"><ReadableValue value={event.details} /></div>
        </li>
    ))}</ol>;
}

export default function AdminTaskSections({ task, tab, onTabChange, resources, onRetry, onVersions, onDownload, downloading, downloadError }) {
    const resourceProps = { resources, onRetry };
    return <section className="task-panel task-enter min-w-0 overflow-hidden" style={{ "--task-delay": "100ms" }}>
        <nav aria-label="Task detail sections" className="flex gap-1 overflow-x-auto border-b border-[#E7DED2] bg-[#F8F5F0] p-3 sm:px-5">{taskTabs.map(([id, label]) => {
            const Icon = tabIcons[id];
            return <button key={id} type="button" aria-pressed={tab === id} aria-controls="task-section" onClick={() => onTabChange(id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold ${tab === id ? "bg-[#211E1A] text-[#FFFDFA] shadow-[0_4px_10px_#211E1A15]" : "text-[#716658] hover:bg-[#EDE5D9] hover:text-[#211E1A]"}`}>
                <Icon size={16} aria-hidden="true" />{label}
            </button>;
        })}</nav>
        <div id="task-section" key={tab} className="task-enter space-y-6 p-4 sm:p-7" style={{ "--task-delay": "0ms" }} aria-label={taskTabs.find(([id]) => id === tab)?.[1]}>
            {tab === "overview" && <AdminTaskOverview task={task} />}
            {tab === "timeline" && <Resource name="timeline" {...resourceProps}>{(data) => <Timeline task={task} data={data} />}</Resource>}
            {tab === "documents" && <Resource name="documents" {...resourceProps}>{(documents) => <Documents documents={documents} {...resourceProps} onVersions={onVersions} onDownload={onDownload} downloading={downloading} downloadError={downloadError} />}</Resource>}
            {tab === "work" && <>
                <div>
                    <h3 className="mb-4 font-bold">Verified progress</h3>
                    <Resource name="progress" {...resourceProps}>{(data) => <VerifiedProgress data={data} />}</Resource>
                </div>
                <div>
                    <h3 className="mb-4 font-bold">Submitted work entries</h3>
                    <Resource name="entries" {...resourceProps}>{(entries) => <WorkEntries entries={entries} />}</Resource>
                </div>
            </>}
            {tab === "changes" && <>
                <div><h3 className="mb-4 font-bold">Task change requests</h3><Resource name="changes" {...resourceProps}>{(records) => <ChangeRecords records={records} task={task} />}</Resource></div>
                <div><h3 className="mb-4 font-bold">Pending timeline order requests</h3><Resource name="orders" {...resourceProps}>{(records) => <ChangeRecords records={records} task={task} timeline />}</Resource></div>
                <div>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-bold">Delay reports</h3>
                        <Link to="/admin/delays" className="text-sm text-[#3565A5] hover:underline">Open Admin Delays</Link>
                    </div>
                    <Resource name="delays" {...resourceProps}>{(records) => <DelayRecords records={records} />}</Resource>
                </div>
            </>}
            {tab === "history" && <Resource name="history" {...resourceProps}>{(events) => <TaskHistory events={events} />}</Resource>}
        </div>
    </section>;
}

