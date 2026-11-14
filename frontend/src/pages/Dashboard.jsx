import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ProjectCategories from "../components/dashboard/ProjectCategories";

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
  X,
} from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { dashboardApi } from "../api/dashboardApi";
import LoadingScreen from "../components/LoadingScreen";
import AdminQuickActions from "../components/dashboard/AdminQuickActions";
import ApprovalModal from "../components/approvals/ApprovalModal";
import { ProjectSearch } from "../components/daily-reports/ReportProjectPicker";
import { projectApi } from "../api/projectApi";
import { validationMessage } from "../hooks/useApprovalReview";

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

function SectionHeading({ title, subtitle, action }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 sm:mb-5">
      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight text-[#211e1a] sm:text-lg">
          {title}
        </h2>

        {subtitle && (
          <p className="mt-1 text-[13px] text-[#716658] sm:text-sm">
            {subtitle}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

function ActionLink({ to, children }) {
  return (
    <Link
      to={to}
      className="
        group inline-flex items-center gap-1 rounded-lg
        px-1 py-0.5 text-sm font-semibold text-[#211e1a]
        transition-colors duration-200
        hover:underline
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[#211e1a]/30
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
    "bg-[#f1eadf] text-[#211e1a] group-hover:bg-[#211e1a] group-hover:text-white",
  blue:
    "bg-[#E8F0FE] text-[#2563EB] group-hover:bg-[#2563EB] group-hover:text-white",
  green:
    "bg-[#E6F4EA] text-[#16A34A] group-hover:bg-[#16A34A] group-hover:text-white",
  orange:
    "bg-[#FFF3E0] text-[#EA8A12] group-hover:bg-[#EA8A12] group-hover:text-white",
  red:
    "bg-[#fde8e6] text-[#9e3535] group-hover:bg-[#9e3535] group-hover:text-white",
  violet:
    "bg-[#F1ECFE] text-[#7C3AED] group-hover:bg-[#7C3AED] group-hover:text-white",
  slate:
    "bg-[#ece8e2] text-[#72675b] group-hover:bg-[#72675b] group-hover:text-white",
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
      className="rare-rise block h-full min-w-0 rounded-[18px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#244F87] sm:rounded-[22px]"
      style={{ "--d": `${delay}ms` }}
    >
      <div
        className="
          group h-full cursor-pointer
          rounded-[20px] border border-[#e8dfd3]
          bg-[#fffdfa] p-4
          shadow-[0_3px_14px_rgba(33,30,26,0.025)]
          transition-all duration-300 ease-out
          hover:border-[#d9ccba]
          hover:shadow-[0_14px_34px_rgba(33,30,26,0.08)]
          focus-within:border-[#d9ccba]
          motion-reduce:transition-none
          sm:rounded-[22px] sm:p-6
        "
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[13px] font-medium text-[#776f63]">
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

        <p className="mt-3 text-[32px] font-bold leading-none tracking-tight tabular-nums text-[#211e1a] sm:mt-4 sm:text-[36px]">
          <AnimatedNumber value={value} />
        </p>

        {hint && (
          <p className="mt-2.5 text-xs font-medium text-[#716658] sm:mt-3">
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
    APPROVED: "bg-[#e6f3e8] text-[#246b3b]",
    VERIFIED: "bg-[#e6f3e8] text-[#246b3b]",
    COMPLETED: "bg-[#e6f3e8] text-[#246b3b]",
    REJECTED: "bg-[#fde8e6] text-[#9e3535]",
    PENDING: "bg-[#fff1cc] text-[#8d640f]",
    DELAYED: "bg-[#fde8e6] text-[#9e3535]",
    DRAFT: "bg-[#ece8e2] text-[#72675b]",
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
        ${styles[value] || "bg-[#ece8e2] text-[#72675b]"}
      `}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {value.replaceAll("_", " ")}
    </span>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rare-fade flex items-center gap-3 rounded-xl bg-[#E9F6EF] px-3 py-3 text-left text-[#176647]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E6F4EA] text-[#16A34A]">
        <CheckCircle2 size={20} strokeWidth={1.6} />
      </div>
      <p className="text-sm">{message}</p>
    </div>
  );
}

function AllClearRow() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#B5DCCB] bg-[#E9F6EF] px-4 py-3 text-sm text-[#176647]">
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
      to: `/supervisor/projects/${encodeURIComponent(task.project_id)}/tasks?task=${encodeURIComponent(task.id)}`,
    });
  }
  for (const task of actionItems.overdue_tasks?.items || []) {
    rows.push({
      key: `overdue-task:${task.id}`,
      title: task.title,
      description: `${task.project_name} · Due ${formatAttentionDate(task.end_date)}`,
      status: "DELAYED",
      to: `/supervisor/projects/${encodeURIComponent(task.project_id)}/tasks?task=${encodeURIComponent(task.id)}`,
    });
  }
  for (const task of actionItems.rejected_tasks?.items || []) {
    rows.push({
      key: `rejected-task:${task.id}`,
      title: task.title,
      description: `${task.project_name} · Rejected task`,
      status: "REJECTED",
      to: `/supervisor/projects/${encodeURIComponent(task.project_id)}/tasks?task=${encodeURIComponent(task.id)}`,
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
      description: `${change.project_name} · Change request pending`,
      status: "PENDING",
      to: `/supervisor/projects/${encodeURIComponent(change.project_id)}/tasks?task=${encodeURIComponent(change.task_id)}`,
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

function AttentionRow({ item }) {
  return <Link to={item.to} className="group flex min-h-14 items-center justify-between gap-4 rounded-xl border border-[#E7DED2] px-3 py-2.5 transition-colors hover:bg-[#F8F4EE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#244F87]">
    <span className="min-w-0">
      <span className="block truncate text-sm font-semibold text-[#211E1A]">{item.title}</span>
      <span className="mt-0.5 block truncate text-xs font-medium text-[#716658]">{item.description}</span>
    </span>
    <span className="flex shrink-0 items-center gap-2"><StatusPill status={item.status} /><ArrowRight size={16} aria-hidden="true" className="text-[#716658] transition-transform group-hover:translate-x-0.5" /></span>
  </Link>;
}

function NeedsAttention({ items, noItemsMessage }) {
  return <Panel title="Needs your attention">
    {items.length ? <div className="grid gap-2 sm:grid-cols-2">{items.map((item) => <AttentionRow key={item.key} item={item} />)}</div> : noItemsMessage ? <p className="rounded-xl border border-[#E7DED2] px-4 py-3 text-sm text-[#716658]">{noItemsMessage}</p> : <AllClearRow />}
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
    to: `/supervisor/delays?project=${encodeURIComponent(item.project_id)}&request=${encodeURIComponent(item.id)}${item.pendingTypes.includes("delay") ? "" : "&type=extension"}`,
  }));
}

function SupervisorGreeting({ name, count, now }) {
  const { salutation, date } = dashboardGreeting(now);
  return <header className="space-y-1">
    <p className="text-xl font-semibold tracking-tight text-[#211E1A]">{salutation}, {name}. {count} things need attention.</p>
    <p className="text-xs font-medium text-[#716658]">{date}</p>
  </header>;
}

function Panel({ title, subtitle, children, action, delay = 0 }) {
  return (
    <div
      className="rare-rise h-full min-w-0"
      style={{ "--d": `${delay}ms` }}
    >
      <section
        className="
          h-full min-w-0 rounded-[20px]
          border border-[#e8dfd3]
          bg-[#fffdfa] p-4
          shadow-[0_3px_14px_rgba(33,30,26,0.025)]
          transition-all duration-300 ease-out
          hover:border-[#C9B9A4]
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
      </section>
    </div>
  );
}

function CountRow({ label, value, icon: Icon, tone = "neutral" }) {
  const zeroWarning = Number(value) === 0 && ["orange", "red"].includes(tone);
  const RowIcon = zeroWarning ? CheckCircle2 : Icon;
  const rowTone = zeroWarning ? "green" : tone;
  return (
    <div
      className="
        group -mx-2 flex items-center justify-between
        gap-3 rounded-xl border-b border-[#f0e9df]
        px-2 py-3 last:border-b-0
        transition-colors duration-200
        hover:bg-[#f5efe7]/60
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

        <span className="min-w-0 wrap-break-word text-sm text-[#665e53] transition-colors duration-200 group-hover:text-[#211e1a]">
          {label}
        </span>
      </div>

      <span className="shrink-0 font-semibold tabular-nums text-[#211e1a]">
        {value ?? 0}
      </span>
    </div>
  );
}

function WorkSummary({ tasks, reports, work }) {
  const taskItems = [
    { label: "Pending approval", count: tasks.pending_approval, to: "/supervisor/tasks?approval_status=PENDING", noun: "tasks", icon: Clock3, tone: "orange" },
    { label: "Approved", count: tasks.approved, to: "/supervisor/tasks?approval_status=APPROVED", noun: "tasks", icon: CheckCircle2, tone: "green" },
    { label: "Completed", count: tasks.completed, to: "/supervisor/tasks?work_status=COMPLETED", noun: "tasks", icon: ClipboardCheck, tone: "violet" },
    ...(Number(tasks.rejected) > 0 ? [{ label: "Rejected", count: tasks.rejected, to: "/supervisor/tasks?approval_status=REJECTED", noun: "tasks", icon: AlertTriangle, tone: "red" }] : []),
  ];
  const reportItems = [
    { label: "Submitted", count: reports.submitted, noun: "daily reports", icon: FileText, tone: "blue" },
    { label: "Drafts", count: reports.draft, noun: "daily reports", icon: FileText, tone: "slate" },
    { label: "Awaiting verification", count: work.pending_verification, noun: "work", icon: Clock3, tone: "orange" },
    { label: "Verified", count: work.verified, noun: "work", icon: CheckCircle2, tone: "green" },
  ];
  const SummaryLink = ({ item }) => {
    const count = Number(item.count) || 0;
    const Icon = item.icon;
    const tone = count === 0 && item.tone === "orange" ? "green" : item.tone;
    return <Link
      to={item.to || "/supervisor/reports"}
      aria-label={`${item.label} ${item.noun}, ${count}`}
      className="flex min-h-14 min-w-0 items-center gap-2 rounded-lg border border-[#E7DED2] px-2 py-2 transition-colors hover:bg-[#F8F4EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#211E1A] focus-visible:ring-offset-1"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconTones[tone] || iconTones.neutral}`}>
        <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-none tabular-nums text-[#211E1A]">{count}</span>
        <span className="mt-1 block break-words text-[12px] font-medium leading-4 text-[#716658]">{item.label}</span>
      </span>
    </Link>;
  };
  return <section aria-labelledby="work-summary-heading" className="rounded-[20px] border border-[#e8dfd3] bg-[#fffdfa] p-4 shadow-[0_3px_14px_rgba(33,30,26,0.025)]">
    <h2 id="work-summary-heading" className="mb-3 text-base font-bold tracking-tight text-[#211e1a]">Work summary</h2>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section aria-labelledby="work-summary-tasks-heading" className="min-w-0">
        <h3 id="work-summary-tasks-heading" className="mb-2 text-sm font-semibold text-[#211e1a]">Tasks</h3>
        <div className="grid grid-cols-2 gap-2">
          {taskItems.map((item) => <SummaryLink key={item.label} item={item} />)}
        </div>
      </section>
      <section aria-labelledby="work-summary-reports-heading" className="min-w-0">
        <h3 id="work-summary-reports-heading" className="mb-2 text-sm font-semibold text-[#211e1a]">Daily reports &amp; work</h3>
        <div className="grid grid-cols-2 gap-2">
          {reportItems.map((item) => <SummaryLink key={item.label} item={item} />)}
        </div>
      </section>
    </div>
  </section>;
}

function ItemList({ items, getTitle, getSubtitle, getStatus }) {
  if (!items?.length) {
    return (
      <EmptyState message="Nothing pending in this section." />
    );
  }

  return (
    <div className="divide-y divide-[#f0e9df]">
      {items.map((item, index) => (
        <div
          key={item.id || index}
          className="
            group/row -mx-2 flex items-start
            justify-between gap-3 rounded-xl
            px-2 py-3.5
            transition-all duration-200 ease-out
            hover:bg-[#f5efe7]/60
            sm:py-4
          "
        >
          <div className="min-w-0">
            <p className="wrap-break-word text-sm font-semibold text-[#211e1a]">
              {getTitle(item)}
            </p>

            <p className="mt-1 wrap-break-word text-xs text-[#716658]">
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
    <div className="space-y-6 sm:space-y-8">
      <DashboardStyles />

      {/* ADMIN OVERVIEW */}
      <section>
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
      <AdminQuickActions />
      <ProjectCategories />

      {/* PROJECT AND TASK STATUS */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Panel
          delay={stagger(4)}
          title="Projects"
          subtitle="Current project statuses"
        >
          <CountRow
            label="Total projects"
            tone="blue"
            value={projects.total}
            icon={FolderKanban}
          />
          <CountRow
            label="Active projects"
            tone="green"
            value={projects.active}
            icon={CheckCircle2}
          />
          <CountRow
            label="Maintenance"
            tone="orange"
            value={projects.maintenance}
            icon={Clock3}
          />
        </Panel>

        <Panel
          delay={stagger(5)}
          title="Tasks"
          subtitle="Approval and execution status"
        >
          <CountRow
            label="Total tasks"
            tone="blue"
            value={tasks.total}
            icon={ListTodo}
          />
          <CountRow
            label="Approved"
            tone="green"
            value={tasks.approved}
            icon={CheckCircle2}
          />
          <CountRow
            label="Rejected"
            tone="red"
            value={tasks.rejected}
            icon={AlertTriangle}
          />
          <CountRow
            label="Completed work"
            tone="violet"
            value={tasks.completed}
            icon={ClipboardCheck}
          />
        </Panel>
      </div>

      {/* REVIEW QUEUES */}
      <section>
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
                `Task ID: ${item.id}`
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
                `Report ID: ${item.daily_report_id}`
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
      <Panel
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
          <div className="divide-y divide-[#f0e9df]">
            {recentActivity.map((entry) => (
              <div
                key={entry.id}
                className="
                  group -mx-2 flex items-start gap-3
                  rounded-xl px-2 py-3.5
                  transition-colors duration-200
                  hover:bg-[#f5efe7]/60
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
                  <p className="break-words text-sm font-medium text-[#211e1a]">
                    {entry.summary || entry.description || entry.action}
                  </p>

                  <p className="mt-1 text-xs font-medium wrap-anywhere text-[#665e53]">
                    By {entry.actor_name || "System / unavailable user"}
                    {entry.actor_role && ` (${entry.actor_role === "ADMIN" ? "Admin" : "Supervisor"})`}
                  </p>

                  {entry.project_name && (
                    <p className="mt-1 text-xs wrap-anywhere text-[#665e53]">
                      Project: {entry.project_name}
                    </p>
                  )}

                  {Array.isArray(entry.metadata?.changed_fields) && entry.metadata.changed_fields.length > 0 && (
                    <p className="mt-1 text-xs wrap-anywhere text-[#665e53]">
                      Updated: {entry.metadata.changed_fields.map((field) => String(field).replaceAll("_", " ")).join(", ")}
                    </p>
                  )}

                  {entry.metadata?.new_status && (
                    <p className="mt-1 text-xs text-[#665e53]">
                      Status: {entry.metadata.old_status && `${entry.metadata.old_status.replaceAll("_", " ")} → `}
                      {entry.metadata.new_status.replaceAll("_", " ")}
                    </p>
                  )}

                  <p className="mt-1 break-words text-xs text-[#716658]">
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
      </Panel>
    </div>
  );
}

// =====================================================
// SUPERVISOR DASHBOARD
// =====================================================

function SupervisorProjectSelector({ action, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const navigating = useRef(false);
  const key = JSON.stringify([query, page, revision]);
  const current = result?.key === key ? result : null;
  const title = action === "report" ? "Create Daily Report" : "Create Task";
  useEffect(() => {
    const controller = new AbortController();
    projectApi.getProjects({ search: query, page, page_size: 20 }, controller.signal).then((data) => {
      if (Array.isArray(data)) data = { results: data.slice((page - 1) * 20, page * 20), next: page * 20 < data.length, previous: page > 1 };
      if (!Array.isArray(data?.results)) throw new Error("Unexpected project response.");
      if (!controller.signal.aborted) setResult({ key, data: { ...data, results: data.results.filter((project) => ["ACTIVE", "MAINTENANCE"].includes(project.status)) } });
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ key, error: validationMessage(error, "Unable to load assigned projects.") });
    });
    return () => controller.abort();
  }, [key, query, page]);
  function proceed(event) {
    event.preventDefault();
    if (!selected || !current?.data || navigating.current || !["ACTIVE", "MAINTENANCE"].includes(selected.status)) return;
    navigating.current = true;
    const section = action === "report" ? "daily-reports" : "tasks";
    navigate(`/supervisor/projects/${encodeURIComponent(selected.id)}/${section}?create=true`);
    onClose();
  }
  return <ApprovalModal label={`${title}: choose project`} onClose={onClose}>
    <form onSubmit={proceed} className="space-y-5 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{title}</h2><p className="mt-2 text-sm text-[#817669]">Choose an assigned Active or Maintenance project.</p></div><button type="button" onClick={onClose} aria-label="Close project selector" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1EADF] focus-visible:outline-2 focus-visible:outline-[#211E1A]"><X size={20} /></button></div>
      <ProjectSearch query={query} onSearch={(value) => { setQuery(value); setPage(1); }} label="Search assigned projects" />
      {!current && <p role="status" className="text-sm text-[#817669]">Loading assigned projects...</p>}
      {current?.error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{current.error} <button type="button" onClick={() => setRevision((value) => value + 1)} className="min-h-11 px-3 font-semibold underline">Retry</button></div>}
      {current?.data && <>
        <fieldset className="max-h-[35dvh] space-y-2 overflow-y-auto"><legend className="mb-2 text-sm font-semibold">Project</legend>
          {current.data.results.map((project) => <label key={project.id} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 ${selected?.id === project.id ? "border-[#211E1A] bg-[#F1EADF]" : "border-[#E7DED2] bg-[#FFFDFA]"}`}>
            <input type="radio" name="quick-action-project" value={project.id} checked={selected?.id === project.id} onChange={() => setSelected(project)} className="mt-1 accent-[#211E1A]" /><span className="min-w-0"><strong className="block break-words text-sm">{project.name}</strong><span className="mt-1 block text-xs text-[#817669]">{project.status === "ACTIVE" ? "Active" : "Maintenance"}</span></span>
          </label>)}
          {!current.data.results.length && <p role="status" className="py-4 text-sm text-[#817669]">No eligible projects on this page. {current.data.next || current.data.previous ? "Try another page or search by project name." : "Try another search, or contact Admin about your project assignments."}</p>}
        </fieldset>
        {(current.data.next || current.data.previous) && <nav aria-label="Assigned project pages" className="rare-pagination"><button type="button" className="rare-button rare-button-secondary" disabled={!current.data.previous} onClick={() => setPage((value) => value - 1)}>Previous</button><span aria-live="polite" aria-atomic="true" className="text-xs text-[#817669]">Page {page}</span><button type="button" className="rare-button rare-button-secondary" disabled={!current.data.next} onClick={() => setPage((value) => value + 1)}>Next</button></nav>}
      </>}
      {selected && <p role="status" className="break-words rounded-xl bg-[#E6F4EA] p-3 text-sm text-[#166534]">Selected: <strong>{selected.name}</strong> / {selected.status === "ACTIVE" ? "Active" : "Maintenance"}</p>}
      <div className="rare-action-footer flex flex-wrap justify-end gap-3"><button type="button" onClick={onClose} className="rare-button rare-button-secondary">Cancel</button><button type="submit" disabled={!selected || !current || Boolean(current.error)} className="rare-button rare-button-primary">Continue<ArrowRight size={18} aria-hidden="true" /></button></div>
    </form>
  </ApprovalModal>;
}

function SupervisorQuickActions({ draftGroup } = {}) {
  const [action, setAction] = useState(null);
  const reportAction = {
    label: "Submit today's report",
    action: "report",
    icon: FileText,
    tile: "bg-[#E6F4EA] text-[#16A34A] group-hover:bg-[#16A34A]",
  };
  const secondaryActions = [
    { label: "My Projects", path: "/supervisor/projects", icon: FolderKanban, tile: "bg-[#E8F0FE] text-[#2563EB] group-hover:bg-[#2563EB]" },
    { label: "My Tasks", path: "/supervisor/tasks", icon: ListTodo, tile: "bg-[#EDE9FE] text-[#7C3AED] group-hover:bg-[#7C3AED]" },
    { label: "Create Task", action: "task", icon: Plus, tile: "bg-[#E8F0FE] text-[#2563EB] group-hover:bg-[#2563EB]" },
  ];
  const primaryClass = "group flex min-h-24 w-full items-center gap-4 rounded-2xl border border-[#B5DCCB] bg-[#F8FCF9] px-5 py-5 text-left transition-colors hover:bg-[#E9F6EF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176647]";
  const secondaryClass = "group flex min-h-14 items-center justify-center gap-2 rounded-xl border border-[#E7DED2] bg-transparent px-3 py-3 text-center text-sm font-medium text-[#665E53] transition-colors hover:bg-[#F8F4EE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]";
  const draftItems = draftGroup?.items || [];
  const draft = draftItems.find((item) => item?.id && item?.project_id);
  const primaryLabel = draft ? "Continue today's draft" : reportAction.label;
  const PrimaryIcon = reportAction.icon;
  const draftPath = draft
    ? `/supervisor/projects/${encodeURIComponent(draft.project_id)}/daily-reports?report=${encodeURIComponent(draft.id)}`
    : null;
  return <>
    <section aria-label="Supervisor Quick Actions" className="rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] px-4 py-5 sm:px-6">
      <h2 className="mb-4 text-base font-bold text-[#211E1A] sm:mb-5">Quick Actions</h2>
      <div className="space-y-3">
        {draftPath ? <Link to={draftPath} className={primaryClass}>
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-colors group-hover:text-white sm:h-16 sm:w-16 ${reportAction.tile}`}><PrimaryIcon size={25} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block text-base font-bold text-[#211E1A] sm:text-lg">{primaryLabel}</span><span className="mt-1 block text-sm text-[#665E53]">Open your saved daily report draft</span></span>
        </Link> : <button type="button" onClick={() => setAction("report")} className={primaryClass}>
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-colors group-hover:text-white sm:h-16 sm:w-16 ${reportAction.tile}`}><PrimaryIcon size={25} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block text-base font-bold text-[#211E1A] sm:text-lg">{primaryLabel}</span><span className="mt-1 block text-sm text-[#665E53]">Record today's site progress</span></span>
        </button>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">{secondaryActions.map((item) => {
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

  return (
    <div className="space-y-5 sm:space-y-6">
      <DashboardStyles />
      <SupervisorGreeting name={displayName} count={attentionCount} now={now} />
      <NeedsAttention
        items={attentionItems}
        noItemsMessage={hasOtherAttention ? "No immediate task items need attention." : ""}
      />
      <section>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
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

      <SupervisorQuickActions draftGroup={actionItems.draft_daily_reports} />
      <WorkSummary tasks={tasks} reports={reports} work={summary.project_daily_task_work || {}} />
      {!!pendingDelayItems.length && <section aria-labelledby="my-action-center-heading" className="space-y-3">
        <div><h2 id="my-action-center-heading" className="text-lg font-semibold text-[#211E1A]">My Action Center</h2><p className="text-xs font-medium text-[#716658]">Delay reports awaiting Admin review.</p></div>
        <Panel title="Pending Delay Reports">
          <div className="space-y-2">{pendingDelayItems.map((item) => <AttentionRow key={item.key} item={item} />)}</div>
        </Panel>
      </section>}
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
          rare-rise rounded-3xl border border-[#e8dfd3]
          bg-[#fffdfa] px-5 py-10 text-center
          sm:px-6 sm:py-12
        "
      >
        <DashboardStyles />

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#fde8e6] text-[#9e3535]">
          <AlertTriangle size={28} strokeWidth={1.6} />
        </div>

        <h2 className="mt-4 text-xl font-bold text-[#211e1a]">
          Dashboard unavailable
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm text-[#716658]">
          {error || "Dashboard data is currently unavailable."}
        </p>

        <button
          type="button"
          onClick={fetchDashboard}
          className="
            group mx-auto mt-6 inline-flex items-center gap-2
            rounded-xl bg-[#211e1a] px-5 py-3
            text-sm font-semibold text-white
            shadow-[0_6px_18px_rgba(33,30,26,0.18)]
            transition-all duration-200 ease-out
            hover:-translate-y-0.5 hover:bg-[#38332c]
            hover:shadow-[0_10px_24px_rgba(33,30,26,0.24)]
            active:translate-y-0 active:scale-[0.98]
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-[#211e1a]/40 focus-visible:ring-offset-2
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
    <header className="rare-page-header border border-[#E7DED2] bg-[#FFFDFA]"><h1>Dashboard</h1><p className="text-sm text-[#716658]">Project priorities and decisions at a glance.</p></header>
    <AdminDashboard summary={summary} reviewQueue={details} />
  </> : <SupervisorDashboard summary={summary} actionItems={details} user={user} now={currentTime} />}</div>;
}
