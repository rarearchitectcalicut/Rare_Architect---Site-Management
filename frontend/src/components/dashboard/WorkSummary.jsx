import { Link } from "react-router-dom";
import { ArrowUpRight, ChartNoAxesCombined, CircleCheck } from "lucide-react";

import { metricCount, approvalSeries } from "./workSummaryData";

const number = (value) => value === null ? "\u2014" : value.toLocaleString();

function Metric({ label, value, to, noun }) {
  const content = <><span>{label}</span><strong>{number(metricCount(value))}</strong></>;
  return to ? <Link className="rare-work-metric" to={to} aria-label={`${label} ${noun || ""}, ${number(metricCount(value))}`.replace(" ,", ",")}>{content}</Link> : <div className="rare-work-metric">{content}</div>;
}

function ApprovalChart({ tasks, isAdmin }) {
  const series = approvalSeries(tasks);
  const available = series.every((item) => item.value !== null);
  const total = series.reduce((sum, item) => sum + (item.value ?? 0), 0);
  let offset = 0;
  const description = series.map((item) => `${item.label}: ${number(item.value)}`).join(". ");
  return <article className="rare-work-chart rare-work-chart--approvals">
    <header><h3>Task approvals</h3><span className="rare-work-chart-icon"><ChartNoAxesCombined size={18} aria-hidden="true" /></span></header>
    <div className="rare-work-donut-layout">
      <div className="rare-work-donut" role="img" aria-label={`Task approval distribution. ${description}.${!available ? " Distribution unavailable until all counts are available." : !total ? " No tasks yet." : ""}`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="35" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1" />
          <circle className="rare-work-ring-track" cx="60" cy="60" r="48" fill="none" strokeWidth="18" />
          {available && total > 0 && series.map((item) => {
            const portion = item.value / total * 100;
            const start = offset;
            offset += portion;
            return item.value > 0 && <circle key={item.status} className={`rare-chart-${item.tone}`} cx="60" cy="60" r="48" fill="none" strokeWidth="18" pathLength="100" strokeDasharray={`${portion} ${100 - portion}`} strokeDashoffset={-start} transform="rotate(-90 60 60)" />;
          })}
        </svg>
        <div aria-hidden="true"><strong>{available ? total.toLocaleString(undefined, { notation: total >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }) : "\u2014"}</strong><span>{!available ? "Unavailable" : total ? "tasks" : "No tasks yet"}</span></div>
      </div>
      <ul className="rare-work-legend" aria-label="Task approval counts">
        {series.map((item) => <li key={item.status}><Link to={isAdmin ? (item.status === "PENDING" ? "/admin/approvals?tab=tasks" : `/admin/approvals?tab=history&status=${item.status}`) : `/supervisor/tasks?approval_status=${item.status}`} aria-label={`${item.label} tasks, ${number(item.value)}`}>
          <span className={`rare-work-dot rare-chart-${item.tone}`} aria-hidden="true" /><span>{item.label}</span><strong>{number(item.value)}</strong><ArrowUpRight size={13} aria-hidden="true" />
        </Link></li>)}
      </ul>
    </div>
    <div className="rare-work-chart-footer"><Metric label="Completed" value={tasks.completed} noun="tasks" to={isAdmin ? undefined : "/supervisor/tasks?work_status=COMPLETED"} /><p>Work status · separate from approval</p></div>
  </article>;
}

function VerificationChart({ work, reports, isAdmin }) {
  const series = [
    { label: "Awaiting verification", value: metricCount(work.pending_verification), tone: "butter" },
    { label: "Verified", value: metricCount(work.verified), tone: "mint" },
    { label: "Rejected", value: metricCount(work.rejected), tone: "blush" },
  ];
  const max = Math.max(1, ...series.map((item) => item.value ?? 0));
  const available = series.every((item) => item.value !== null);
  const empty = available && series.every((item) => item.value === 0);
  return <article className="rare-work-chart rare-work-chart--verification">
    <header><h3>Work verification</h3><span className="rare-work-chart-icon"><CircleCheck size={18} aria-hidden="true" /></span></header>
    <div className="rare-work-columns" role="group" aria-label="Work entry verification counts. Vertical bars start at zero and share the same scale.">
      {series.map((item) => <Link key={item.label} className={`rare-work-column rare-chart-${item.tone}`} to={isAdmin ? (item.label === "Awaiting verification" ? "/admin/approvals?tab=work" : "/admin/reports") : "/supervisor/reports"} aria-label={`${item.label} work, ${number(item.value)}`}>
        <strong className="rare-work-column-value">{number(item.value)}</strong>
        <span className="rare-work-column-plot" aria-hidden="true"><span style={{ height: `${(item.value ?? 0) / max * 100}%` }} /></span>
        <span className="rare-work-column-label">{item.label}</span>
      </Link>)}
    </div>
    <p className="rare-work-scale">{empty ? "No work entries to display yet" : !available ? "Some counts are unavailable" : `Scale: 0–${number(max)} entries · counts, not measured progress`}</p>
    <div className="rare-work-report-totals"><Metric label="Submitted" noun="daily reports" value={reports.submitted} to={isAdmin ? "/admin/reports" : "/supervisor/reports"} /><Metric label="Drafts" noun="daily reports" value={reports.draft} to={isAdmin ? undefined : "/supervisor/reports"} /></div>
  </article>;
}

export default function WorkSummary({ tasks = {}, reports = {}, work = {}, projects = {}, isAdmin = false }) {
  return <section aria-labelledby="work-summary-heading" className={`rare-work-summary ${isAdmin ? "admin-dashboard-work-layout" : ""}`}>
    <header className="rare-work-summary-heading"><div><h2 id="work-summary-heading">Work summary</h2><p>{isAdmin ? "Across all projects" : "Your task approvals · work across assigned projects"}</p></div><span className="rare-work-snapshot">Current snapshot</span></header>
    <div className="rare-work-chart-grid"><ApprovalChart tasks={tasks} isAdmin={isAdmin} /><VerificationChart reports={reports} work={work} isAdmin={isAdmin} /></div>
    {isAdmin && <div className="rare-work-project-totals" aria-label="Project status counts"><Metric label="Total projects" value={projects.total} to="/admin/projects" /><Metric label="Active projects" value={projects.active} to="/admin/projects?status=ACTIVE" /><Metric label="Maintenance" value={projects.maintenance} to="/admin/projects?status=MAINTENANCE" /><Metric label="Total tasks" value={tasks.total} /></div>}
  </section>;
}
