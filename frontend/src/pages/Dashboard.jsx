import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { dashboardApi } from "../api/dashboardApi";
import LoadingScreen from "../components/LoadingScreen";
import AdminQuickActions from "../components/dashboard/AdminQuickActions";

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
const stagger = (index, step = 70, max = 700) =>
  Math.min(index * step, max);

// Count-up hook for stat numbers
function useCountUp(target, duration = 900) {
  const end = Number(target);
  const isNumber = Number.isFinite(end);

  const [display, setDisplay] = useState(isNumber ? 0 : target);

  useEffect(() => {
    if (!isNumber) {
      setDisplay(target);
      return undefined;
    }

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || end === 0) {
      setDisplay(end);
      return undefined;
    }

    let frame;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplay(Math.round(end * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [end, isNumber, target, duration]);

  return display;
}

function AnimatedNumber({ value }) {
  const display = useCountUp(value ?? 0);

  return (
    <>
      {typeof display === "number"
        ? display.toLocaleString()
        : display}
    </>
  );
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
          <p className="mt-1 text-[13px] text-[#8a8175] sm:text-sm">
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
  label,
  value,
  icon: Icon,
  hint,
  delay = 0,
  tone = "neutral",
}) {
  return (
    <div
      className="rare-rise h-full min-w-0"
      style={{ "--d": `${delay}ms` }}
    >
      <div
        className="
          group h-full cursor-default
          rounded-[18px] border border-[#e8dfd3]
          bg-[#fffdfa] p-4
          shadow-[0_3px_14px_rgba(33,30,26,0.025)]
          transition-all duration-300 ease-out
          hover:-translate-y-1 hover:border-[#d9ccba]
          hover:shadow-[0_14px_34px_rgba(33,30,26,0.08)]
          motion-reduce:transition-none
          motion-reduce:hover:translate-y-0
          sm:rounded-[22px] sm:p-6
        "
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[13px] font-medium text-[#776f63] sm:text-sm">
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
              ${iconTones[tone] || iconTones.neutral}
            `}
          >
            <Icon size={19} strokeWidth={1.8} />
          </div>
        </div>

        <p className="mt-3 text-[28px] font-bold leading-none tracking-tight tabular-nums text-[#211e1a] sm:mt-4 sm:text-[32px]">
          <AnimatedNumber value={value} />
        </p>

        {hint && (
          <p className="mt-2.5 text-xs text-[#958a7d] sm:mt-3">
            {hint}
          </p>
        )}
      </div>
    </div>
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
    DRAFT: "bg-[#ece8e2] text-[#72675b]",
    SUBMITTED: "bg-[#e6ebfa] text-[#415eaa]",
  };

  return (
    <span
      className={`
        inline-flex shrink-0 items-center gap-1.5
        rounded-full px-2.5 py-1
        text-[10px] font-semibold
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
    <div className="rare-fade py-8 text-center sm:py-10">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#E6F4EA] text-[#16A34A]">
        <CheckCircle2 size={26} strokeWidth={1.6} />
      </div>

      <p className="text-sm text-[#8a8175]">
        {message}
      </p>
    </div>
  );
}

function Panel({ title, subtitle, children, action, delay = 0 }) {
  return (
    <div
      className="rare-rise h-full min-w-0"
      style={{ "--d": `${delay}ms` }}
    >
      <section
        className="
          h-full min-w-0 rounded-[18px]
          border border-[#e8dfd3]
          bg-[#fffdfa] p-4
          transition-all duration-300 ease-out
          hover:border-[#dccfbd]
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
            ${iconTones[tone] || iconTones.neutral}
          `}
        >
          <Icon size={17} strokeWidth={1.8} />
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

            <p className="mt-1 wrap-break-word text-xs text-[#8a8175]">
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
            tone="blue"
            value={projects.total}
            icon={FolderKanban}
            hint={`${projects.active ?? 0} active projects`}
          />

          <StatCard
            delay={stagger(1)}
            label="Pending Tasks"
            tone="orange"
            value={tasks.pending_approval}
            icon={ClipboardCheck}
            hint="Awaiting approval"
          />

          <StatCard
            delay={stagger(2)}
            label="Daily Reports"
            tone="green"
            value={reports.total}
            icon={FileText}
            hint={`${reports.submitted ?? 0} submitted`}
          />

          <StatCard
            delay={stagger(3)}
            label="Pending Delays"
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
                    {entry.description || entry.action}
                  </p>

                  <p className="mt-1 break-words text-xs text-[#8a8175]">
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
// SUPERVISOR ACTION SECTION
// =====================================================

function SupervisorActionPanel({ title, group, type, delay = 0 }) {
  const items = group?.items || [];
  const count = group?.count ?? 0;

  return (
    <Panel
      delay={delay}
      title={title}
      subtitle={`${count} matching records`}
    >
      <ItemList
        items={items}
        getTitle={(item) =>
          item.title ||
          item.task_title ||
          (type === "draft" ? "Daily Report Draft" : "Work Item")
        }
        getSubtitle={(item) => {
          if (item.report_date) {
            return `Report date: ${item.report_date}`;
          }

          if (item.requested_end_date) {
            return `Requested end: ${item.requested_end_date}`;
          }

          if (item.change_type) {
            return `Type: ${item.change_type}`;
          }

          if (item.verification_note) {
            return item.verification_note;
          }

          return `ID: ${item.id}`;
        }}
        getStatus={(item) =>
          item.approval_status ||
          item.verification_status ||
          item.extension_status ||
          item.status
        }
      />
    </Panel>
  );
}

// =====================================================
// SUPERVISOR DASHBOARD
// =====================================================

function SupervisorDashboard({ summary, actionItems }) {
  const projects = summary.projects || {};
  const tasks = summary.my_tasks || {};
  const reports = summary.project_daily_reports || {};
  const work = summary.project_daily_task_work || {};
  const delays = summary.my_delay_reports || {};
  const notifications = summary.notifications || {};

  return (
    <div className="space-y-6 sm:space-y-8">
      <DashboardStyles />

      {/* SUPERVISOR OVERVIEW */}
      <section>
        <SectionHeading
          title="My Site Overview"
          subtitle="Your assigned projects and work summary."
        />

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            delay={stagger(0)}
            label="Assigned Projects"
            tone="blue"
            value={projects.total_assigned}
            icon={FolderKanban}
            hint={`${projects.active ?? 0} active`}
          />

          <StatCard
            delay={stagger(1)}
            label="My Tasks"
            tone="orange"
            value={tasks.total_created}
            icon={ListTodo}
            hint={`${tasks.pending_approval ?? 0} pending approval`}
          />

          <StatCard
            delay={stagger(2)}
            label="Project Reports"
            tone="green"
            value={reports.total}
            icon={FileText}
            hint={`${reports.submitted ?? 0} submitted`}
          />

          <StatCard
            delay={stagger(3)}
            label="My Pending Delays"
            tone="red"
            value={delays.pending_review}
            icon={AlertTriangle}
            hint="Awaiting Admin review"
          />
        </div>
      </section>

      {/* STATUS OVERVIEW */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Panel delay={stagger(4)} title="My Tasks">
          <CountRow
            label="Created tasks"
            tone="blue"
            value={tasks.total_created}
            icon={ListTodo}
          />
          <CountRow
            label="Pending approval"
            tone="orange"
            value={tasks.pending_approval}
            icon={Clock3}
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
            label="Completed"
            tone="violet"
            value={tasks.completed}
            icon={ClipboardCheck}
          />
        </Panel>

        <Panel delay={stagger(5)} title="Assigned Project Work">
          <CountRow
            label="Submitted daily reports"
            tone="blue"
            value={reports.submitted}
            icon={FileText}
          />
          <CountRow
            label="Draft daily reports"
            tone="slate"
            value={reports.draft}
            icon={FileText}
          />
          <CountRow
            label="Work awaiting verification"
            tone="orange"
            value={work.pending_verification}
            icon={Clock3}
          />
          <CountRow
            label="Verified work entries"
            tone="green"
            value={work.verified}
            icon={CheckCircle2}
          />
          <CountRow
            label="Unread notifications"
            tone="red"
            value={notifications.unread_count}
            icon={Bell}
          />
        </Panel>
      </div>

      {/* ACTION CENTER */}
      <section>
        <SectionHeading
          title="My Action Center"
          subtitle="Items needing correction and requests awaiting decisions."
        />

        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          <SupervisorActionPanel
            delay={stagger(6)}
            title="Rejected Tasks"
            group={actionItems.rejected_tasks}
          />

          <SupervisorActionPanel
            delay={stagger(7)}
            title="Work to Correct"
            group={actionItems.rejected_work_to_correct}
          />

          <SupervisorActionPanel
            delay={stagger(8)}
            title="Draft Daily Reports"
            group={actionItems.draft_daily_reports}
            type="draft"
          />

          <SupervisorActionPanel
            delay={stagger(9)}
            title="Pending Change Requests"
            group={actionItems.pending_change_requests}
          />

          <SupervisorActionPanel
            delay={stagger(10)}
            title="Pending Delay Reports"
            group={actionItems.pending_delay_reports}
          />

          <SupervisorActionPanel
            delay={stagger(11)}
            title="Pending Extensions"
            group={actionItems.pending_extensions}
          />
        </div>
      </section>
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

        <p className="mx-auto mt-2 max-w-md text-sm text-[#8a8175]">
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

  return isAdmin ? (
    <AdminDashboard
      summary={summary}
      reviewQueue={details}
    />
  ) : (
    <SupervisorDashboard
      summary={summary}
      actionItems={details}
    />
  );
}