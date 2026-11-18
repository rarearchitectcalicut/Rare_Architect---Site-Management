import { withoutRecordIds } from "../utils/recordPresentation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ContentCard, PageHeader, SectionHeader } from "../components/common/WorkspaceUI";
import ProjectCategories from "../components/dashboard/ProjectCategories";
import WorkSummary from "../components/dashboard/WorkSummary";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderKanban,
  ListTodo,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { dashboardApi } from "../api/dashboardApi";
import LoadingScreen from "../components/LoadingScreen";
import AdminQuickActions from "../components/dashboard/AdminQuickActions";
import SupervisorProjectSelector from "../components/daily-reports/SupervisorProjectSelector";
import { isTaskId, taskApi } from "../api/taskApi";
import { validationMessage } from "../hooks/useApprovalReview";
import DelayReportForm from "../modal/supervisor/DelayReportForm";

// =====================================================
// MOTION SYSTEM
// One orchestrated page-load sequence + hover feedback.
// Everything respects prefers-reduced-motion.
// =====================================================

const dashboardCss = `
  @keyframes rare-rise {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes rare-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* "backwards" (not "both") so hover transforms still work after the intro */
  .rare-rise {
    animation: rare-rise 640ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: var(--d, 0ms);
  }

  .rare-fade {
    animation: rare-fade 500ms ease-out backwards;
    animation-delay: var(--d, 0ms);
  }

  @media (min-width: 1024px) {
    .supervisor-summary-cards > a > div {
      padding: 16px;
      border-radius: 18px;
    }

    .supervisor-summary-cards > a > div > p {
      margin-top: 10px;
    }

    .supervisor-summary-cards > a > div > p:first-of-type {
      font-size: 28px;
    }

    .supervisor-summary-cards > a > div > div {
      gap: 8px;
    }

    .supervisor-summary-cards > a > div > div > div {
      padding: 6px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rare-rise,
    .rare-fade {
      animation: none !important;
    }
  }
`;

function DashboardStyles() {
  return <style>{dashboardCss}</style>;
}

// Staggered delay helper (capped so late items never feel slow)
const stagger = () => 0;

// Render server-owned totals immediately, without repeated animation renders.
function AnimatedNumber({ value }) {
  const display = value ?? 0;
  return <>{typeof display === "number" ? display.toLocaleString() : display}</>;
}

// =====================================================
// SHARED UI COMPONENTS
// =====================================================

const SectionHeading = SectionHeader;

function ActionLink({ to, children }) {
  return (
    <Link
      to={to}
      className="
        group inline-flex items-center gap-1 rounded-lg
        px-1 py-0.5 text-sm font-semibold text-ink
        transition-colors duration-200
        hover:underline
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-ink/30
      "
    >
      {children}
      <ArrowRight
        size={16}
        className="
          transition-transform duration-300 ease-out
          group-hover:translate-x-1
          motion-reduce:transition-none
          motion-reduce:group-hover:translate-x-0
        "
      />
    </Link>
  );
}

// Icon tile tones. Literal class strings so Tailwind can detect them.
const iconTones = {
  neutral:
    "bg-app text-ink group-hover:bg-ink group-hover:text-white",
  blue:
    "bg-pastel-sky text-info group-hover:bg-info group-hover:text-white",
  green:
    "bg-pastel-mint text-success group-hover:bg-success group-hover:text-white",
  orange:
    "bg-pastel-blush text-warning group-hover:bg-warning group-hover:text-white",
  red:
    "bg-pastel-blush text-danger group-hover:bg-danger group-hover:text-white",
  violet:
    "bg-pastel-lavender text-violet group-hover:bg-violet group-hover:text-white",
  slate:
    "bg-pastel-lavender text-muted group-hover:bg-muted group-hover:text-white",
};

function StatCard({
  to,
  label,
  value,
  icon: Icon,
  hint,
  delay = 0,
  tone = "neutral",
}) {
  const iconTone = Number(value) === 0 && ["orange", "red"].includes(tone) ? "green" : tone;
  return (
    <Link
      to={to}
      className="rare-rise block h-full min-w-0 rounded-[18px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-info sm:rounded-[22px]"
      style={{ "--d": `${delay}ms` }}
    >
      <div
        data-tone={tone}
        className="
          rare-dashboard-stat group h-full cursor-pointer
          rounded-[20px] border border-pastel-lavender
          bg-surface p-4
          shadow-[0_3px_14px_rgba(33,30,26,0.025)]
          transition-all duration-300 ease-out
          hover:border-border-strong
          hover:shadow-[0_14px_34px_rgba(33,30,26,0.08)]
          focus-within:border-border-strong
          motion-reduce:transition-none
          sm:rounded-[22px] sm:p-6
        "
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[13px] font-medium text-muted">
            {label}
          </p>

          <div
            className={`
              shrink-0 rounded-xl
              p-2
              transition-all duration-300 ease-out
              group-hover:scale-110 group-hover:-rotate-6
              motion-reduce:transition-none
              motion-reduce:group-hover:transform-none
              sm:p-2.5
              ${iconTones[iconTone] || iconTones.neutral}
            `}
          >
            <Icon size={19} strokeWidth={1.8} />
          </div>
        </div>

        <p className="mt-3 text-[32px] font-bold leading-none tracking-tight tabular-nums text-ink sm:mt-4 sm:text-[36px]">
          <AnimatedNumber value={value} />
        </p>

        {hint && (
          <p className="mt-2.5 text-xs font-medium text-muted sm:mt-3">
            {hint}
          </p>
        )}
      </div>
    </Link>
  );
}

function StatusPill({ status }) {
  const value = String(status || "PENDING").toUpperCase();

  const styles = {
    APPROVED: "bg-pastel-mint text-success",
    VERIFIED: "bg-pastel-mint text-success",
    COMPLETED: "bg-pastel-mint text-success",
    REJECTED: "bg-pastel-blush text-danger",
    PENDING: "bg-[#fff1cc] text-[#8d640f]",
    DELAYED: "bg-pastel-blush text-danger",
    DRAFT: "bg-pastel-lavender text-muted",
    SUBMITTED: "bg-[#e6ebfa] text-[#415eaa]",
  };

  return (
    <span
      className={`
        inline-flex shrink-0 items-center gap-1.5
        rounded-full px-2.5 py-1
        text-xs font-semibold
        tracking-wide
        transition-transform duration-200
        group-hover/row:scale-105
        ${styles[value] || "bg-pastel-lavender text-muted"}
      `}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {value.replaceAll("_", " ")}
    </span>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rare-fade flex items-center gap-3 rounded-xl bg-pastel-mint px-3 py-3 text-left text-success">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-mint text-success">
        <CheckCircle2 size={20} strokeWidth={1.6} />
      </div>
      <p className="text-sm">{message}</p>
    </div>
  );
}

function AllClearRow() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-pastel-mint bg-pastel-mint px-4 py-3 text-sm text-success">
      <CheckCircle2 size={20} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
      <p>All clear: no rejected tasks, corrections, change requests, delays or extensions.</p>
    </div>
  );
}

function dashboardGreeting(now) {
  const hour = now.getHours();
  const salutation = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const date = now.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
  return { salutation, date };
}

function draftAgeDays(draft, now) {
  const value = draft.updated_at || (draft.report_date ? `${draft.report_date}T00:00:00` : "");
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  const draftDate = new Date(timestamp);
  const today = new Date(now);
  const draftDay = Date.UTC(draftDate.getFullYear(), draftDate.getMonth(), draftDate.getDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.floor((todayDay - draftDay) / 86400000));
}

function formatAttentionDate(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}

function buildSupervisorAttentionItems(actionItems, now) {
  const rows = [];
  for (const draft of actionItems.draft_daily_reports?.items || []) {
    const age = draftAgeDays(draft, now);
    rows.push({
      key: `draft:${draft.id}`,
      title: `Daily report · ${formatAttentionDate(draft.report_date) || "Draft"}`,
      description: age >= 7 ? `Draft from ${age} days ago` : age === 0 ? "Draft updated today" : "Draft recently updated",
      status: "DRAFT",
      to: `/supervisor/projects/${encodeURIComponent(draft.project_id)}/daily-reports?report=${encodeURIComponent(draft.id)}`,
    });
  }
  for (const task of actionItems.pending_approval_tasks?.items || []) {
    rows.push({
      key: `pending-task:${task.id}`,
      title: task.title,
      description: `${task.project_name} · Waiting for approval`,
      status: "PENDING",
      to: `/supervisor/projects/${encodeURIComponent(task.project_id)}/tasks/${encodeURIComponent(task.id)}`,
    });
  }
  for (const task of actionItems.overdue_tasks?.items || []) {
    rows.push({
      key: `overdue-task:${task.id}`,
      title: task.title,
      description: `${task.project_name} · Due ${formatAttentionDate(task.end_date)}`,
      status: "DELAYED",
      to: `/supervisor/projects/${encodeURIComponent(task.project_id)}/tasks/${encodeURIComponent(task.id)}`,
      reportDelay: { projectId: task.project_id, taskId: task.id },
    });
  }
  for (const task of actionItems.rejected_tasks?.items || []) {
    rows.push({
      key: `rejected-task:${task.id}`,
      title: task.title,
      description: `${task.project_name} · Rejected task`,
      status: "REJECTED",
      to: `/supervisor/projects/${encodeURIComponent(task.project_id)}/tasks/${encodeURIComponent(task.id)}`,
    });
  }
  for (const work of actionItems.rejected_work_to_correct?.items || []) {
    rows.push({
      key: `correction:${work.id}`,
      title: work.task_title,
      description: work.verification_note || `${work.project_name} · Work needs correction`,
      status: "REJECTED",
      to: `/supervisor/projects/${encodeURIComponent(work.project_id)}/daily-reports?correct=${encodeURIComponent(work.daily_report_id)}`,
    });
  }
  for (const change of actionItems.pending_change_requests?.items || []) {
    rows.push({
      key: `change:${change.id}`,
      title: change.task_title,
      description: change.project_name ? `${change.project_name} · Change request pending` : "Change request pending",
      status: "PENDING",
      resolveTaskId: change.task_id,
      pendingChange: true,
    });
  }
  return rows;
}

function getSupervisorAttentionCount(actionItems) {
  const sections = [
    "draft_daily_reports",
    "pending_approval_tasks",
    "overdue_tasks",
    "rejected_tasks",
    "rejected_work_to_correct",
    "pending_change_requests",
  ];
  return sections.reduce((total, key) => total + Number(actionItems[key]?.count ?? actionItems[key]?.items?.length ?? 0), 0);
}

function PendingChangeTaskLink({ taskId, children }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);

  async function openTask() {
    if (request.current && !request.current.signal.aborted) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      if (typeof taskId !== "string" || !isTaskId(taskId)) throw new Error("This change request could not be linked to its task. Refresh the dashboard and try again.");
      const task = await taskApi.get(taskId, controller.signal);
      if (controller.signal.aborted) return;
      if (typeof task?.project !== "string" || !isTaskId(task.project) || String(task.id).toLowerCase() !== taskId.toLowerCase()) {
        throw new Error("The task's project could not be resolved. Refresh the dashboard or try again.");
      }
      navigate(`/supervisor/projects/${encodeURIComponent(task.project)}/tasks/${encodeURIComponent(taskId)}`);
    } catch (failure) {
      if (!controller.signal.aborted) setError(validationMessage(failure, failure.response ? "Unable to open this task. Please try again." : failure.message || "Unable to open this task. Please try again."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (request.current === controller) request.current = null;
    }
  }

  return <div className="min-w-0">
    <button type="button" onClick={openTask} disabled={loading} aria-busy={loading} className="group flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info">{children}</button>
    {loading && <p role="status" className="mt-2 text-xs text-muted">Opening task...</p>}
    {error && <div role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error} <button type="button" onClick={openTask} className="min-h-11 px-2 font-semibold underline">Try Again</button></div>}
  </div>;
}

function AttentionRow({ item, onReportDelay }) {
  const contents = <>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
      <span className="mt-0.5 block truncate text-xs font-medium text-muted">{item.description}</span>
    </span>
    <span className="flex shrink-0 items-center gap-2"><StatusPill status={item.status} /><ArrowRight size={16} aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-0.5" /></span>
  </>;
  if (item.pendingChange) return <PendingChangeTaskLink key={item.resolveTaskId} taskId={item.resolveTaskId}>{contents}</PendingChangeTaskLink>;
  if (!item.reportDelay) return <Link to={item.to} className="group flex min-h-14 items-center justify-between gap-4 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info">{contents}</Link>;
  return <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-border p-2.5">
    <Link to={item.to} className="group flex min-h-11 min-w-0 flex-1 items-center justify-between gap-4 rounded-lg px-1 transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info">{contents}</Link>
    <button type="button" onClick={() => onReportDelay(item.reportDelay)} aria-label={`Report delay for ${item.title || "task"}`} className="rare-button rare-button-secondary min-h-11 px-3 py-2 text-xs">Report delay</button>
  </div>;
}

function NeedsAttention({ items, noItemsMessage, onReportDelay }) {
  return <Panel title="Needs your attention">
    {items.length ? <div className="grid gap-2 sm:grid-cols-2">{items.map((item) => <AttentionRow key={item.key} item={item} onReportDelay={onReportDelay} />)}</div> : noItemsMessage ? <p className="rounded-xl border border-border px-4 py-3 text-sm text-muted">{noItemsMessage}</p> : <AllClearRow />}
  </Panel>;
}

function mergePendingDelayItems(actionItems) {
  const pendingById = new Map();
  for (const [type, group] of [["delay", actionItems.pending_delay_reports], ["extension", actionItems.pending_extensions]]) {
    for (const item of group?.items || []) {
      const key = String(item.id);
      const existing = pendingById.get(key);
      if (existing) {
        existing.pendingTypes.push(type);
        existing.status = "PENDING";
      }
      else pendingById.set(key, {
        ...item,
        status: "PENDING",
        pendingTypes: [type],
      });
    }
  }
  return [...pendingById.values()].map((item) => ({
    key: `delay:${item.id}`,
    title: item.task_title || "Delay report",
    description: `${item.project_name || "Project"} · ${item.pendingTypes.length > 1 ? "Delay and extension pending" : item.pendingTypes[0] === "extension" ? "Extension pending" : "Pending Admin review"}`,
    status: item.status,
    to: `/supervisor/delays?${/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(item.project_id || "") ? `project=${encodeURIComponent(item.project_id)}&` : ""}request=${encodeURIComponent(item.id)}${item.pendingTypes.includes("delay") ? "" : "&type=extension"}`,
  }));
}

function SupervisorGreeting({ name, count, now }) {
  const { salutation, date } = dashboardGreeting(now);
  return <header className="space-y-1">
    <p className="text-xl font-semibold tracking-tight text-ink">{salutation}, {name}. {count} things need attention.</p>
    <p className="text-xs font-medium text-muted">{date}</p>
  </header>;
}

function Panel({ title, subtitle, children, action, delay = 0 }) {
  return (
    <div
      className="rare-rise h-full min-w-0"
      style={{ "--d": `${delay}ms` }}
    >
      <ContentCard
        className="
          h-full min-w-0 rounded-[20px]
          border border-pastel-lavender
          bg-surface p-4
          shadow-[0_3px_14px_rgba(33,30,26,0.025)]
          transition-all duration-300 ease-out
          hover:border-border-strong
          hover:shadow-[0_10px_30px_rgba(33,30,26,0.05)]
          motion-reduce:transition-none
          sm:rounded-[22px] sm:p-6
        "
      >
        <SectionHeading
          title={title}
          subtitle={subtitle}
          action={action}
        />

        {children}
      </ContentCard>
    </div>
  );
}

function CountRow({ label, value, icon: Icon, tone = "neutral" }) {
  const zeroWarning = Number(value) === 0 && ["orange", "red"].includes(tone);
  const RowIcon = zeroWarning ? CheckCircle2 : Icon;
  const rowTone = zeroWarning ? "green" : tone;
  return (
    <div
      data-count-tone={tone}
      className="
        group -mx-2 flex items-center justify-between
        gap-3 rounded-xl border-b border-surface-soft
        px-2 py-3 last:border-b-0
        transition-colors duration-200
        hover:bg-surface-soft/60
        sm:py-3.5
      "
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`
            shrink-0 rounded-lg p-2
            transition-all duration-300 ease-out
            group-hover:scale-105
            motion-reduce:transition-none
            motion-reduce:group-hover:transform-none
            ${iconTones[rowTone] || iconTones.neutral}
          `}
        >
          <RowIcon size={17} strokeWidth={1.8} />
        </div>

        <span className="min-w-0 wrap-break-word text-sm text-muted transition-colors duration-200 group-hover:text-ink">
          {label}
        </span>
      </div>

      <span className="shrink-0 font-semibold tabular-nums text-ink">
        {value ?? 0}
      </span>
    </div>
  );
}

function ItemList({ items, getTitle, getSubtitle, getStatus }) {
  if (!items?.length) {
    return (
      <EmptyState message="Nothing pending in this section." />
    );
  }

  return (
    <div className="divide-y divide-surface-soft">
      {items.map((item, index) => (
        <div
          key={item.id || index}
          className="
            group/row -mx-2 flex items-start
            justify-between gap-3 rounded-xl
            px-2 py-3.5
            transition-all duration-200 ease-out
            hover:bg-surface-soft/60
            sm:py-4
          "
        >
          <div className="min-w-0">
            <p className="wrap-break-word text-sm font-semibold text-ink">
              {getTitle(item)}
            </p>

            <p className="mt-1 wrap-break-word text-xs text-muted">
              {getSubtitle(item)}
            </p>
          </div>

          <StatusPill status={getStatus(item)} />
        </div>
      ))}
    </div>
  );
}

// =====================================================
// ADMIN DASHBOARD
// =====================================================

function AdminDashboard({ summary, reviewQueue }) {
  const projects = summary.projects || {};
  const tasks = summary.tasks || {};
  const reports = summary.daily_reports || {};
  const delays = summary.delay_reports || {};
  const changes = summary.change_requests || {};
  const work = summary.daily_task_work || {};
  const notifications = summary.notifications || {};

  const pendingTasks =
    reviewQueue.pending_task_approvals || [];

  const pendingChanges =
    reviewQueue.pending_change_requests || [];

  const pendingWork =
    reviewQueue.pending_work_verifications || [];

  const pendingDelays =
    reviewQueue.pending_delay_reports || [];

  const pendingExtensions =
    reviewQueue.pending_extensions || [];

  const recentActivity =
    reviewQueue.recent_activity || [];

  return (
    <div className="admin-desktop-dashboard space-y-6 sm:space-y-8">
      <DashboardStyles />

      {/* ADMIN OVERVIEW */}
      <section className="admin-dashboard-overview">
        <SectionHeading
          title="Project Overview"
          subtitle="A live summary of RARE operations."
        />

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            delay={stagger(0)}
            label="Total Projects"
            to="/admin/projects"
            tone="blue"
            value={projects.total}
            icon={FolderKanban}
            hint={`${projects.active ?? 0} active projects`}
          />

          <StatCard
            delay={stagger(1)}
            label="Pending Tasks"
            to="/admin/approvals?tab=tasks"
            tone="orange"
            value={tasks.pending_approval}
            icon={ClipboardCheck}
            hint="Awaiting approval"
          />

          <StatCard
            delay={stagger(2)}
            label="Daily Reports"
            to="/admin/reports"
            tone="green"
            value={reports.total}
            icon={FileText}
            hint={`${reports.submitted ?? 0} submitted`}
          />

          <StatCard
            delay={stagger(3)}
            label="Pending Delays"
            to="/admin/approvals?tab=delays"
            tone="red"
            value={delays.pending_review}
            icon={AlertTriangle}
            hint="Awaiting review"
          />
        </div>
      </section>

      {/* Additional components */}
      <div className="admin-dashboard-actions"><AdminQuickActions /></div>

      {/* PROJECT AND TASK STATUS */}
      <WorkSummary isAdmin projects={projects} tasks={tasks} reports={reports} work={work} />

      <div className="admin-dashboard-categories"><ProjectCategories /></div>

      {/* REVIEW QUEUES */}
      <section className="admin-dashboard-approvals hidden lg:block">
        <SectionHeading
          title="Approval Center"
          subtitle="Recent items waiting for an Admin decision."
          action={
            <ActionLink to="/admin/approvals">
              Open Approvals
            </ActionLink>
          }
        />

        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          <Panel delay={stagger(6)} title="Task Approvals">
            <ItemList
              items={pendingTasks}
              getTitle={(item) => item.title || "Untitled Task"}
              getSubtitle={(item) =>
                item.project_name || "Awaiting task approval"
              }
              getStatus={(item) => item.approval_status}
            />
          </Panel>

          <Panel delay={stagger(7)} title="Change Requests">
            <ItemList
              items={pendingChanges}
              getTitle={(item) =>
                item.task_title ||
                item.change_type?.replaceAll("_", " ") ||
                "Change Request"
              }
              getSubtitle={(item) =>
                `Type: ${item.change_type || "Change"}`
              }
              getStatus={(item) => item.status}
            />
          </Panel>

          <Panel delay={stagger(8)} title="Work Verification">
            <ItemList
              items={pendingWork}
              getTitle={(item) =>
                item.task_title || "Daily Work Entry"
              }
              getSubtitle={(item) =>
                item.project_name || "Submitted task work"
              }
              getStatus={(item) => item.verification_status}
            />
          </Panel>

          <Panel delay={stagger(9)} title="Delay Reports">
            <ItemList
              items={pendingDelays}
              getTitle={(item) =>
                item.task_title || "Delay Report"
              }
              getSubtitle={(item) =>
                `Type: ${item.delay_type || "Not specified"}`
              }
              getStatus={(item) => item.status}
            />
          </Panel>

          <Panel delay={stagger(10)} title="Deadline Extensions">
            <ItemList
              items={pendingExtensions}
              getTitle={(item) =>
                item.task_title || "Extension Request"
              }
              getSubtitle={(item) =>
                item.requested_end_date
                  ? `Requested end: ${item.requested_end_date}`
                  : "End date not available"
              }
              getStatus={(item) => item.extension_status}
            />
          </Panel>

          <Panel delay={stagger(11)} title="Other Pending Reviews">
            <CountRow
              label="Pending change requests"
              tone="violet"
              value={changes.pending_total}
              icon={ShieldCheck}
            />
            <CountRow
              label="Work awaiting verification"
              tone="orange"
              value={work.pending_verification}
              icon={ClipboardCheck}
            />
            <CountRow
              label="Pending extensions"
              tone="blue"
              value={delays.pending_extensions}
              icon={Clock3}
            />
            <CountRow
              label="Unread notifications"
              tone="red"
              value={notifications.unread_count}
              icon={Bell}
            />
          </Panel>
        </div>
      </section>

      {/* RECENT ACTIVITY */}
      <div className="admin-dashboard-activity"><Panel
        delay={stagger(12)}
        title="Recent Activity"
        subtitle="Latest recorded system events."
        action={
          <ActionLink to="/admin/activity">
            View All
          </ActionLink>
        }
      >
        {recentActivity.length === 0 ? (
          <EmptyState message="No activity recorded yet." />
        ) : (
          <div className="divide-y divide-surface-soft">
            {recentActivity.slice(0, 5).map((entry) => (
              <div
                key={entry.id}
                className="
                  group -mx-2 flex items-start gap-3
                  rounded-xl px-2 py-3.5
                  transition-colors duration-200
                  hover:bg-surface-soft/60
                  sm:py-4
                "
              >
                <div
                  className={`
                    shrink-0 rounded-xl p-2.5
                    transition-all duration-300 ease-out
                    group-hover:scale-110
                    motion-reduce:transition-none
                    motion-reduce:group-hover:transform-none
                    ${iconTones.blue}
                  `}
                >
                  <Activity size={18} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-ink">
                    <span className="lg:hidden">{withoutRecordIds(entry.summary || entry.description || entry.action)}</span><span className="hidden lg:inline">{withoutRecordIds(entry.summary || entry.description || String(entry.action || "Activity recorded").replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase()))}</span>
                  </p>

                  <p className="mt-1 text-xs font-medium wrap-anywhere text-muted">
                    By {entry.actor_name || "System / unavailable user"}
                    {entry.actor_role && ` (${entry.actor_role === "ADMIN" ? "Admin" : "Supervisor"})`}
                  </p>

                  {entry.project_name && (
                    <p className="mt-1 text-xs wrap-anywhere text-muted">
                      Project: {entry.project_name}
                    </p>
                  )}

                  {Array.isArray(entry.metadata?.changed_fields) && entry.metadata.changed_fields.length > 0 && (
                    <p className="mt-1 text-xs wrap-anywhere text-muted">
                      Updated: {entry.metadata.changed_fields.map((field) => String(field).replaceAll("_", " ")).join(", ")}
                    </p>
                  )}

                  {entry.metadata?.new_status && (
                    <p className="mt-1 text-xs text-muted">
                      Status: {entry.metadata.old_status && `${entry.metadata.old_status.replaceAll("_", " ")} → `}
                      {entry.metadata.new_status.replaceAll("_", " ")}
                    </p>
                  )}

                  {!entry.metadata?.new_status && <p className="admin-activity-caption hidden text-xs text-muted lg:block">Latest recorded system event</p>}
                  <p className="admin-activity-record mt-1 break-words text-xs text-muted">
                    {entry.entity_type || "System"}
                    {entry.created_at
                      ? ` · ${new Date(
                        entry.created_at
                      ).toLocaleString()}`
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel></div>
    </div>
  );
}

// =====================================================
// SUPERVISOR DASHBOARD
// =====================================================

function SupervisorQuickActions() {
  const [action, setAction] = useState(null);
  const reportAction = {
    label: "Submit today's report",
    icon: FileText,
    tile: "bg-pastel-mint text-success group-hover:bg-success",
  };
  const secondaryActions = [
    { label: "Create daily report", action: "report", icon: FileText, tile: "bg-pastel-mint text-success group-hover:bg-success" },
    { label: "My Projects", path: "/supervisor/projects", icon: FolderKanban, tile: "bg-pastel-sky text-info group-hover:bg-info" },
    { label: "My Tasks", path: "/supervisor/tasks", icon: ListTodo, tile: "bg-[#EDE9FE] text-violet group-hover:bg-violet" },
    { label: "Create Task", action: "task", icon: Plus, tile: "bg-pastel-sky text-info group-hover:bg-info" },
  ];
  const primaryClass = "group flex min-h-24 w-full items-center gap-4 rounded-2xl border border-pastel-mint bg-[#F8FCF9] px-5 py-5 text-left transition-colors hover:bg-pastel-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success";
  const secondaryClass = "group flex min-h-14 min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-2 py-3 text-center text-xs font-medium text-muted transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:flex-row sm:px-3 sm:text-sm";
  const PrimaryIcon = reportAction.icon;
  return <>
    <section aria-label="Supervisor Quick Actions" className="supervisor-quick-actions rounded-[22px] border border-border bg-surface px-4 py-5 sm:px-6">
      <h2 className="mb-4 text-base font-bold text-ink sm:mb-5">Quick Actions</h2>
      <div className="supervisor-quick-actions-content space-y-3">
        <Link to="/supervisor/reports?status=DRAFT" className={primaryClass}>
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-colors group-hover:text-white sm:h-16 sm:w-16 ${reportAction.tile}`}><PrimaryIcon size={25} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block text-base font-bold text-ink sm:text-lg">{reportAction.label}</span><span className="mt-1 block text-sm text-muted">Choose from your saved daily report drafts</span></span>
        </Link>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">{secondaryActions.map((item) => {
        const Icon = item.icon;
        const content = <><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors group-hover:text-white ${item.tile}`}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span><span>{item.label}</span></>;
        return item.path ? <Link key={item.label} to={item.path} className={secondaryClass}>{content}</Link> : <button key={item.label} type="button" onClick={() => setAction(item.action)} className={secondaryClass}>{content}</button>;
      })}</div>
      </div>
    </section>
    {action && <SupervisorProjectSelector action={action} onClose={() => setAction(null)} />}
  </>;
}

function SupervisorDashboard({ summary, actionItems = {}, user, now }) {
  const [delayReport, setDelayReport] = useState(null);
  const [notice, setNotice] = useState("");
  const projects = summary.projects || {};
  const tasks = summary.my_tasks || {};
  const reports = summary.project_daily_reports || {};
  const pendingDelayItems = mergePendingDelayItems(actionItems);
  const attentionItems = buildSupervisorAttentionItems(actionItems, now);
  const hasOtherAttention = Boolean(
    actionItems.pending_change_requests?.count ||
    actionItems.pending_delay_reports?.count ||
    actionItems.pending_extensions?.count
  );
  const attentionCount = getSupervisorAttentionCount(actionItems);
  const displayName = user?.first_name || user?.name || "there";

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <DashboardStyles />
      <SupervisorGreeting name={displayName} count={attentionCount} now={now} />
      {notice && <p role="status" aria-live="polite" className="rounded-xl bg-pastel-mint p-4 text-sm text-success">{notice}</p>}
      <NeedsAttention
        items={attentionItems}
        noItemsMessage={hasOtherAttention ? "No immediate task items need attention." : ""}
        onReportDelay={setDelayReport}
      />
      <div className="supervisor-dashboard-summary grid gap-3 sm:gap-4">
      <section className="min-w-0">
        <div className="supervisor-summary-cards grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard
            delay={stagger(0)}
            label="Assigned Projects"
            to="/supervisor/projects"
            tone="blue"
            value={projects.total_assigned}
            icon={FolderKanban}
            hint={`${projects.active ?? 0} active`}
          />

          <StatCard
            delay={stagger(1)}
            label="My Tasks"
            to="/supervisor/tasks"
            tone="orange"
            value={tasks.total}
            icon={ListTodo}
            hint={`${tasks.pending_approval ?? 0} pending approval`}
          />

          <StatCard
            delay={stagger(2)}
            label="Project Reports"
            to="/supervisor/reports"
            tone="green"
            value={reports.total}
            icon={FileText}
            hint={`${reports.submitted ?? 0} submitted`}
          />
        </div>
      </section>

      <SupervisorQuickActions />
      </div>
      <WorkSummary tasks={tasks} reports={reports} work={summary.project_daily_task_work || {}} />
      {!!pendingDelayItems.length && <section aria-labelledby="my-action-center-heading" className="space-y-3">
        <div><h2 id="my-action-center-heading" className="text-lg font-semibold text-ink">My Action Center</h2><p className="text-xs font-medium text-muted">Delay reports awaiting Admin review.</p></div>
        <Panel title="Pending Delay Reports">
          <div className="space-y-2">{pendingDelayItems.map((item) => <AttentionRow key={item.key} item={item} />)}</div>
        </Panel>
      </section>}
      {delayReport && <DelayReportForm
        key={`${delayReport.projectId}:${delayReport.taskId}`}
        projectId={delayReport.projectId}
        taskId={delayReport.taskId}
        onClose={() => setDelayReport(null)}
        onSaved={(report) => {
          setDelayReport(null);
          setNotice(`Delay report submitted: ${report.status === "PENDING" ? "Pending Admin review" : report.status}.`);
        }}
      />}
    </div>
  );
}

// =====================================================
// MAIN DASHBOARD PAGE
// =====================================================

export default function Dashboard() {
  const { user } = useAuth();

  const [summary, setSummary] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(null);

  const isAdmin = user?.role === "ADMIN";

  // ---------------------------------------------
  // FETCH DASHBOARD DATA
  // ---------------------------------------------

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const requests = isAdmin
        ? [
          dashboardApi.getAdminSummary(),
          dashboardApi.getAdminReviewQueue(),
        ]
        : [
          dashboardApi.getSupervisorSummary(),
          dashboardApi.getSupervisorActionItems(),
        ];

      const [summaryData, detailsData] =
        await Promise.all(requests);

      setSummary(summaryData);
      setDetails(detailsData);
      setCurrentTime(new Date());
    } catch (err) {
      const status = err.response?.status;

      if (status === 403) {
        setError("You do not have permission to access this dashboard.");
      } else if (status === 404) {
        setError(
          "A dashboard API endpoint was not found. Check your Django dashboard routes."
        );
      } else if (!err.response) {
        setError(
          "Unable to connect to the RARE backend. Check your connection."
        );
      } else {
        setError(
          "Unable to load dashboard data. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // ---------------------------------------------
  // SHOW RARE LOADER DURING API REQUESTS
  // ---------------------------------------------

  if (loading) {
    return <LoadingScreen message="Loading dashboard..." />;
  }

  // ---------------------------------------------
  // ERROR VIEW
  // ---------------------------------------------

  if (error || !summary || !details) {
    return (
      <div
        className="
          rare-rise rounded-3xl border border-pastel-lavender
          bg-surface px-5 py-10 text-center
          sm:px-6 sm:py-12
        "
      >
        <DashboardStyles />

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pastel-blush text-danger">
          <AlertTriangle size={28} strokeWidth={1.6} />
        </div>

        <h2 className="mt-4 text-xl font-bold text-ink">
          Dashboard unavailable
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          {error || "Dashboard data is currently unavailable."}
        </p>

        <button
          type="button"
          onClick={fetchDashboard}
          className="
            group mx-auto mt-6 inline-flex items-center gap-2
            rounded-xl bg-ink px-5 py-3
            text-sm font-semibold text-white
            shadow-[0_6px_18px_rgba(33,30,26,0.18)]
            transition-all duration-200 ease-out
            hover:-translate-y-0.5 hover:bg-primary-hover
            hover:shadow-[0_10px_24px_rgba(33,30,26,0.24)]
            active:translate-y-0 active:scale-[0.98]
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-ink/40 focus-visible:ring-offset-2
            motion-reduce:transition-none
          "
        >
          <RefreshCw
            size={17}
            className="
              transition-transform duration-500 ease-out
              group-hover:rotate-180
              motion-reduce:transition-none
              motion-reduce:group-hover:rotate-0
            "
          />
          Try Again
        </button>
      </div>
    );
  }

  // ---------------------------------------------
  // ROLE-BASED DASHBOARD
  // ---------------------------------------------

  return <div className="space-y-5">{isAdmin ? <>
    <PageHeader eyebrow="Your workspace, connected" title="Dashboard" description="Project priorities and decisions at a glance." />
    <AdminDashboard summary={summary} reviewQueue={details} />
  </> : <SupervisorDashboard summary={summary} actionItems={details} user={user} now={currentTime} />}</div>;
}
