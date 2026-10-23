# Approval workflows: implementation and verification

This change follows the user's pasted task and the workflow reference at
`C:/Users/aksha/Downloads/implementation (2).md`. The reference is a specification;
the repository's serializers, services and URL mappings determine API contracts.

## Delivered workflows

- `/admin/approvals`: compact task, task-change, timeline, delay/extension, daily-work,
  and decision-history queues. Pending counts exclude completed decisions.
- Task details, documents, before/after changes, rejection reasons, project/category
  filters, search, sorting, and pagination remain available.
- `ORDER_CHANGE` records appear only in Timeline Changes. Timeline review resolves
  task names and highlights changed positions. Existing Supervisor Timeline components
  and proposal payloads are retained.
- `/admin/delays`: cross-project delay/extension management with independent report
  and extension decisions, filters, summary counts, and task/project links.
- `/supervisor/projects/:projectId/delays`: assigned-project reports, eligible task
  selection, all eight delay types, reasons, optional expected completion, and optional
  extension requests. Report and extension feedback are shown separately.
- `/supervisor/delays`: assigned-project selection from the existing Delays menu.
- `/admin/reports` (alias `/admin/daily-reports`): submitted work entries, report date
  and context, approved measurement baseline, submitted work, previously verified
  quantity, report/entry evidence, and individual Verify/Reject actions.
  A report deep link also displays its site diary and attachments even with no work entries.
- Decision History includes historical task approval cycles, task/timeline decisions,
  separate delay/extension decisions, and work verification decisions. Rejected
  Requests remains a quick history filter; `/admin/approvals?tab=rejected` is retained.
- Native dialogs preserve keyboard focus and prevent dismissal during submission.
  Nested dialogs share a scroll lock. The existing LoadingScreen can render inside
  a dialog's top layer. Failed decisions preserve the entered reason for retry.

## Actual API contracts

Paths below are relative to `/api/v1/`. All calls use the existing authenticated client.

| Workflow | Read | Decision payload |
| --- | --- | --- |
| Tasks | `GET task-approvals/?status=PENDING`, `GET tasks/{id}/` | `POST tasks/{id}/approve/` with `comment`; reject with `reason` |
| Task changes | `GET task-change-requests/`, `GET task-change-requests/{id}/` | approve/reject under that request with `admin_comment` |
| Timeline | `GET timeline-change-requests/`, existing task-change detail, `GET projects/{id}/timeline/` | `POST timeline-change-requests/{id}/approve/` or `reject/` with `admin_comment` |
| Delays | `GET delay-reports/`, `GET delay-reports/{id}/` | approve/reject with `admin_comment` |
| Extensions | Same delay record; independent `extension_status` | `POST delay-reports/{id}/approve-extension/` or `reject-extension/` with `admin_comment` |
| Work entries | New `GET daily-task-work/`, existing `GET daily-task-work/{id}/` | `POST daily-task-work/{id}/verify/` or `reject/` with `verification_note` |
| Task decision cycles | New `GET task-decisions/` | Read-only `TaskHistory` APPROVED/REJECTED records |

`daily-task-work/` is Admin-only, excludes draft reports, and accepts `status`, `project`
and `report`. `task-decisions/` is Admin-only and accepts `project`. Both use existing
project pagination. Delay lists now validate/support `project`, `task`, `status`,
`delay_type`, and `extension_status` filters. UUID/status validation returns HTTP 400.

The frontend follows the existing paginated-read pattern, collecting pages for queue
counts and local search/filter/sort/page controls. No approval action writes task
ordering, deadlines, quantities, or progress directly.

## Backend changes and invariants

- Existing DelayReport already stores independent extension status, reviewer,
  timestamp and comment. No model duplication or migration is necessary.
- Delay serializers now expose real usernames, project names, current deadlines,
  and both reviewers. Work serializers include project/report/supervisor context.
- Task history includes task/project names and IDs for historical review.
- A task lock prevents concurrent creation of conflicting pending extensions.
- Task approval/cancellation now acquire the project lock before the task lock,
  matching timeline membership/reorder locking order.
- Existing atomic service decisions and notification/audit behavior are reused.
  Report approval cannot change a deadline. Extension approval requires an approved
  report. Only verified work counts toward progress; cumulative verification is
  serialized on the task and cannot exceed its approved baseline.
- Historical task decisions survive correction/resubmission. Current task details
  are explicitly labelled as current, rather than invented historical snapshots.

## Deep links and notifications

Supported review URLs include:

```text
/admin/approvals?tab=tasks&task={taskId}
/admin/approvals?tab=changes&request={requestId}
/admin/approvals?tab=timeline&request={requestId}
/admin/approvals?tab=delays&type=extension&request={delayId}
/admin/approvals?tab=work&entry={entryId}
/admin/approvals?tab=history&type=tasks&task={taskId}&decision={historyId}
/admin/delays?request={delayId}&type=delay
/admin/reports?report={reportId}
/admin/reports?entry={entryId}
/supervisor/projects/{projectId}/timeline
/supervisor/projects/{projectId}/delays?request={delayId}
```

Notification navigation reads the backend's `notification_type`, resolves task-change
types from the actual request, and uses the appropriate workspace. Mark-as-read-on-open
remains unchanged. No frontend-only notifications are fabricated.

## Files created

- `frontend/src/api/delayApi.js`, `dailyReportApi.js`.
- `frontend/src/hooks/useApprovalQueues.js`, `useApprovalReview.js`,
  `useRequestList.js`, `useDelayReports.js`, `useDailyWorkQueue.js`, `useModalScrollLock.js`.
- `frontend/src/components/approvals/ApprovalOverview.jsx`, `ApprovalQueueTabs.jsx`,
  `ApprovalFilters.jsx`, `ApprovalRequestCard.jsx`, `ApprovalHistory.jsx`,
  `ApprovalModal.jsx`, `RequestList.jsx`, `RequestReview.jsx`, `ReviewFields.jsx`,
  `approvalUtils.js`, `queueData.js`.
- `frontend/src/components/approvals/review/TaskApprovalReview.jsx`,
  `TaskChangeReview.jsx`, `TimelineOrderReview.jsx`, `DelayReportReview.jsx`,
  `ExtensionReview.jsx`, `DailyWorkReview.jsx`.
- `frontend/src/components/delays/DelaySummary.jsx`.
- `frontend/src/components/daily-reports/DailyReportSummary.jsx`, `ReportEvidence.jsx`.
- `frontend/src/modal/admin/ApprovalDecisionModal.jsx`,
  `frontend/src/modal/supervisor/DelayReportForm.jsx`.
- `frontend/src/pages/admin/Delays.jsx`, `DailyReports.jsx`,
  `frontend/src/pages/supervisor/ProjectDelays.jsx`, `Delays.jsx`.
- `frontend/tests/source-loader.js`, `backend/reports/test_concurrency.py`, this document.

## Files modified for this task

- `frontend/src/pages/admin/Approvals.jsx` (small page composing extracted feature components).
- `frontend/src/App.jsx`, `frontend/package.json`.
- `frontend/src/api/approvalApi.js`, `timelineApi.js`.
- `frontend/src/components/LoadingScreen.jsx`, `ConfirmationModal.jsx`,
  `notifications/NotificationCenter.jsx`.
- `frontend/tests/approval-changes.test.js` (updated to test extracted components and workflows).
- `backend/tasks/serializers.py`, `services.py`, `views.py`, `urls.py`.
- `backend/reports/serializers.py`, `services.py`, `views.py`, `urls.py`, `tests.py`.

Other pre-existing working-tree changes, including Supervisor Timeline implementation,
were retained.

## Verification

```powershell
# frontend/
npm.cmd test
npm.cmd run lint
npm.cmd run build

# backend/
.\venv\Scripts\python.exe manage.py check
.\venv\Scripts\python.exe manage.py makemigrations --check --dry-run
.\venv\Scripts\python.exe manage.py test --noinput
```

Focused tests cover queue counts/deduplication, actual decision payloads, timeline names
and position changes, deep links, notification routing, historical read-only decisions,
supervisor permissions, mandatory rejection reasons, independent extension approval,
deadline preservation, verified-only progress, stale/repeated decisions, and PostgreSQL
concurrency for work verification, duplicate extensions, and timeline decisions.

Final results: 23 frontend tests and all 59 Django tests passed on PostgreSQL,
including the three transaction/concurrency tests. Frontend lint and production build
completed successfully with repository lint warnings and the bundle-size warning.
Django system checks passed; the migration check reported no changes. `git diff --check`
passed.

No browser surface was connected in this session. Desktop/mobile layout and native
dialog focus should receive a final interactive review in the user's browser.
