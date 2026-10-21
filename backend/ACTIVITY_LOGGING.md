# Activity logging integration

Implemented 53 activity event types across Users, Projects, Tasks, Reports, and Documents using the existing `activity.services.create_activity_log()`. The Activity app implementation, API routes, permissions, serializers, and admin configuration were left untouched, including the changes already present in the working tree.

Business writes and their activity records share a database transaction. Existing TaskHistory calls, locking, validation, response formats, and notification scheduling remain in place. Metadata contains selected identifiers, status transitions, changed field names, review comments, dates, counts, and version numbers; it never copies request bodies, passwords, tokens, filenames, private paths, or file contents.

## Changed files

| File | Change |
| --- | --- |
| `users/serializers.py` | Log Supervisor creation, real profile/activation changes, and self-service password changes. Use the requesting Admin for account creation. Add transactions where required and lock Supervisor updates. |
| `users/views.py` | Log Admin password resets in the same transaction without credentials. |
| `projects/views.py` | Log category creation/edit/deletion, project creation/edit/status changes, and each assignment/unassignment. Add transaction boundaries and lock update snapshots. |
| `tasks/services.py` | Log single/batch creation, task decisions, completion/cancellation/resubmission, task edit requests, and timeline review workflows. Preserve all per-task history. |
| `reports/services.py` | Log report drafts/submission/edits, work review/corrections, child entry creation/edit/deletion, attachment upload/deletion, and separate delay/extension decisions. Include attachment logging in the existing cleanup block. |
| `documents/services.py` | Log all four creation/version upload operations inside their existing transactions and private-file cleanup blocks. |
| `tasks/models.py` | Add the already-supported `EXTENSION_REJECTED` action to the TaskHistory check constraint. No fields, relationships, or Activity models changed. |
| `tasks/migrations/0007_allow_extension_rejected_history.py` | Update that constraint. Existing extension rejection otherwise raises a PostgreSQL check violation before it can succeed or produce an activity record. |
| `activity/test_integrations.py` | Add 30 Django integration tests with real PostgreSQL transactions and isolated temporary upload storage. |
| `ACTIVITY_LOGGING.md` | Event mapping, validation results, manual verification, and remaining limitations. |

## Operation mapping

Names below are the actual service functions or serializer/view methods where an event is recorded. No event is also logged by its caller.

| App | Activity event | Entity type | Actual function / method |
| --- | --- | --- | --- |
| users | `USER_CREATED` | `USER` | `SupervisorCreateSerializer.create` |
| users | `USER_UPDATED` | `USER` | `SupervisorUpdateSerializer.update` |
| users | `USER_ACTIVATED` | `USER` | `SupervisorUpdateSerializer.update` |
| users | `USER_DEACTIVATED` | `USER` | `SupervisorUpdateSerializer.update` |
| users | `USER_PASSWORD_RESET` | `USER` | `SupervisorResetPasswordView.post` |
| users | `USER_PASSWORD_CHANGED` | `USER` | `ChangePasswordSerializer.save` |
| projects | `CATEGORY_CREATED` | `CATEGORY` | `ProjectCategoryListCreateView.perform_create` |
| projects | `CATEGORY_UPDATED` | `CATEGORY` | `ProjectCategoryDetailView.perform_update` |
| projects | `CATEGORY_DELETED` | `CATEGORY` | `ProjectCategoryDetailView.perform_destroy` |
| projects | `PROJECT_CREATED` | `PROJECT` | `ProjectListCreateView.perform_create` |
| projects | `PROJECT_UPDATED` | `PROJECT` | `ProjectDetailView.perform_update` |
| projects | `PROJECT_STATUS_CHANGED` | `PROJECT` | `ProjectDetailView.perform_update` |
| projects | `SUPERVISOR_ASSIGNED` | `PROJECT` | `ProjectAssignSupervisorsView.post` |
| projects | `SUPERVISOR_UNASSIGNED` | `PROJECT` | `ProjectRemoveSupervisorView.delete` |
| tasks | `TASK_CREATED` | `TASK` | `create_task` |
| tasks | `TASK_BATCH_CREATED` | `TASK_BATCH` | `create_bulk_tasks` |
| tasks | `TASK_APPROVED` | `TASK` | `approve_task` |
| tasks | `TASK_REJECTED` | `TASK` | `reject_task` |
| tasks | `TASK_COMPLETED` | `TASK` | `complete_task` |
| tasks | `TASK_CANCELLED` | `TASK` | `cancel_task` |
| tasks | `TASK_RESUBMITTED` | `TASK` | `resubmit_task` |
| tasks | `TASK_EDIT_REQUESTED` | `TASK_CHANGE_REQUEST` | `create_task_change_request` |
| tasks | `TASK_EDIT_APPROVED` | `TASK_CHANGE_REQUEST` | `approve_task_change_request` |
| tasks | `TASK_EDIT_REJECTED` | `TASK_CHANGE_REQUEST` | `reject_task_change_request` |
| tasks | `TIMELINE_REORDER_REQUESTED` | `TASK_CHANGE_REQUEST` | `create_timeline_reorder_request` |
| tasks | `TIMELINE_REORDER_APPROVED` | `TASK_CHANGE_REQUEST` | `approve_timeline_reorder_request` |
| tasks | `TIMELINE_REORDER_REJECTED` | `TASK_CHANGE_REQUEST` | `reject_timeline_reorder_request` |
| reports | `DAILY_REPORT_CREATED` | `DAILY_REPORT` | `create_daily_report` |
| reports | `DAILY_REPORT_UPDATED` | `DAILY_REPORT` | `update_daily_report` |
| reports | `DAILY_REPORT_SUBMITTED` | `DAILY_REPORT` | `submit_daily_report` |
| reports | `DAILY_TASK_WORK_ADDED` | `DAILY_TASK_WORK` | `add_daily_task_work` |
| reports | `DAILY_TASK_WORK_UPDATED` | `DAILY_TASK_WORK` | `update_daily_task_work` |
| reports | `DAILY_TASK_WORK_DELETED` | `DAILY_TASK_WORK` | `delete_daily_task_work` |
| reports | `DAILY_TASK_WORK_VERIFIED` | `DAILY_TASK_WORK` | `verify_daily_task_work` |
| reports | `DAILY_TASK_WORK_REJECTED` | `DAILY_TASK_WORK` | `reject_daily_task_work` |
| reports | `DAILY_TASK_WORK_CORRECTED` | `DAILY_TASK_WORK` | `correct_rejected_daily_task_work` |
| reports | `DAILY_MANPOWER_ADDED` | `DAILY_MANPOWER` | `add_daily_manpower` |
| reports | `DAILY_MANPOWER_UPDATED` | `DAILY_MANPOWER` | `update_daily_manpower` |
| reports | `DAILY_MANPOWER_DELETED` | `DAILY_MANPOWER` | `delete_daily_manpower` |
| reports | `DAILY_MATERIAL_ADDED` | `DAILY_MATERIAL` | `add_daily_material` |
| reports | `DAILY_MATERIAL_UPDATED` | `DAILY_MATERIAL` | `update_daily_material` |
| reports | `DAILY_MATERIAL_DELETED` | `DAILY_MATERIAL` | `delete_daily_material` |
| reports | `DAILY_ATTACHMENT_UPLOADED` | `DAILY_REPORT_ATTACHMENT` | `upload_daily_report_attachment` |
| reports | `DAILY_ATTACHMENT_DELETED` | `DAILY_REPORT_ATTACHMENT` | `delete_daily_report_attachment` |
| reports | `DELAY_REPORT_SUBMITTED` | `DELAY_REPORT` | `create_delay_report` |
| reports | `DELAY_REPORT_APPROVED` | `DELAY_REPORT` | `approve_delay_report` |
| reports | `DELAY_REPORT_REJECTED` | `DELAY_REPORT` | `reject_delay_report` |
| reports | `EXTENSION_APPROVED` | `DELAY_REPORT` | `approve_delay_extension` |
| reports | `EXTENSION_REJECTED` | `DELAY_REPORT` | `reject_delay_extension` |
| documents | `PROJECT_DOCUMENT_UPLOADED` | `PROJECT_DOCUMENT` | `create_project_document` |
| documents | `PROJECT_DOCUMENT_VERSION_UPLOADED` | `PROJECT_DOCUMENT` | `upload_project_document_version` |
| documents | `TASK_DOCUMENT_UPLOADED` | `TASK_DOCUMENT` | `create_task_document` |
| documents | `TASK_DOCUMENT_VERSION_UPLOADED` | `TASK_DOCUMENT` | `upload_task_document_version` |

An unchanged PATCH, including clearing an already-empty image, creates no activity record. An update that changes both a project status and its details produces two distinct events, with `PROJECT_UPDATED` listing only changed detail fields. User activation plus profile changes follows the same policy. Assigning multiple Supervisors produces one assignment event per Supervisor; the entire assignment request is atomic. Bulk task creation produces one central batch event, with `batch_id`, `project_id`, and `task_count`, and retains the existing TaskHistory entry for each task. Corrections produce one correction event containing both original and correction entry UUIDs.

## Deliberate exclusions

- `USER_ROLE_CHANGED`: there is no role-changing business API or service. Supervisor creation sets its fixed role; Supervisor updates cannot edit roles.
- Project deletion and whole DailyReport deletion: there are no implemented endpoints/services for these operations.
- Delay report editing/deletion and document metadata editing/deletion: no implemented business endpoints/services.
- Task status transitions such as starting work or setting `DELAYED`: no standalone implemented transition service. Creation, approval, resubmission, completion, and cancellation are covered.
- Notification creation, listing, unread counts, and read-state writes remain unlogged, as requested.
- Authentication, refresh/logout, reads, downloads, and failed/denied operations create no success activity.
- Generic Django admin edits, management commands, and direct ORM/database writes do not pass through these business-operation boundaries. No signals or middleware were introduced to intercept them.

## Validation results

Run from `backend` using the existing virtual environment:

```powershell
.\venv\Scripts\python.exe manage.py check
.\venv\Scripts\python.exe manage.py makemigrations --check --dry-run
.\venv\Scripts\python.exe manage.py test --noinput
```

Verified on 21 October 2026 against PostgreSQL:

- System check: **no issues**.
- Migration consistency: **no changes detected** after generating migration 0007.
- Full available test suite: **30 tests passed**. The existing apps' `tests.py` files were placeholders; no new testing framework or dependency was added.
- Tests exercise every event type in the mapping, exact intended event counts, no-op suppression, invalid/denied operations, business/activity/history rollback, notification callback cancellation on rollback, successful notification creation, credential-free password metadata, work quantity limits, completion-only duplicate restrictions, measurement baseline protection, deadline-edit restrictions, timeline order, separate delay/extension decisions, correction linkage, document access/version preservation, upload cleanup when logging fails, and Admin activity filtering/pagination/read-only access plus Supervisor 403s.

Migration 0007 was applied automatically to the disposable test database. It has **not** been applied to the configured development database. Before using extension rejection there, run:

```powershell
.\venv\Scripts\python.exe manage.py migrate
```

## Postman verification

Use `{{base}} = http://127.0.0.1:8000/api/v1` and separate active Admin and assigned Supervisor JWTs. Accounts must have completed the temporary-password change. Record the Activity count or latest IDs before each operation, then inspect the Admin-only activity endpoint afterward.

1. Admin: `POST {{base}}/users/supervisors/` with `username`, unique `email`, international `phone`, and `first_name`. Expect 201 and one `USER_CREATED` whose actor is the Admin. PATCH the returned Supervisor URL to deactivate/reactivate and edit a name; repeat the identical PATCH and confirm no new event. Reset through `POST .../reset-password/` with matching `new_password`/`confirm_password`; inspect metadata and confirm it contains only the user UUID.
2. Admin: create a category at `POST {{base}}/project-categories/`, then a project at `POST {{base}}/projects/` with `name` and `category`. PATCH the project status to `ON_HOLD`; expect `PROJECT_STATUS_CHANGED` with actual old/new statuses. Repeat unchanged; no new event. Return it to `ACTIVE`. Assign through `POST {{base}}/projects/{{project_id}}/assign-supervisors/` with `{"supervisor_ids": ["{{supervisor_id}}"]}`. Repeat to verify duplicate validation creates no event. DELETE the corresponding `/supervisors/{{supervisor_id}}/` to verify unassignment, then reassign for the remaining checks.
3. Supervisor: `POST {{base}}/projects/{{project_id}}/tasks/` with `{"title": "Install fittings"}`. Expect one `TASK_CREATED` and one TaskHistory entry. Submit a second request to `/tasks/bulk-create/` with `{"tasks": [{"title": "One"}, {"title": "Two"}]}`. Expect one `TASK_BATCH_CREATED` with count 2 and each task's existing history; no per-task central creation logs for that batch.
4. Admin: `POST {{base}}/tasks/{{task_id}}/approve/` with `{"comment": "Proceed"}`. Repeat the approval to confirm validation produces no second success log. Use another pending task for rejection through `/reject/` with `{"reason": "Revise scope"}`. Original Supervisor: `/resubmit/` with a changed `title` and `resubmission_note`; verify the existing UUID, new PENDING approval status, and one resubmission event.
5. Supervisor: create an edit request at `POST {{base}}/tasks/{{task_id}}/change-requests/` with `{"new_values": {"title": "Updated scope"}, "reason": "Correction"}`. Admin: review at `/task-change-requests/{{request_id}}/approve/` or `/reject/` using `admin_comment`. Attempt an `end_date` edit and confirm it is rejected. For timeline tests, approve at least two tasks; POST every task UUID once in a different order to `/projects/{{project_id}}/timeline/reorder/`, then review using `/timeline-change-requests/{{request_id}}/approve/` or `/reject/`.
6. Supervisor: `POST {{base}}/projects/{{project_id}}/daily-reports/` with `report_date` (YYYY-MM-DD) and `work_summary`. Add work at `/daily-reports/{{report_id}}/work-entries/` with `task`, `work_description`, and `completion_claimed: true` for a completion-only task. For a QUANTITY task use `quantity_completed_today` instead. PATCH a draft, repeat the same PATCH, and confirm only the actual change logs. Add/edit/delete manpower and material entries through their existing routes; each actual mutation should log once.
7. Supervisor: `POST {{base}}/daily-reports/{{report_id}}/submit/`. Admin: `/daily-task-work/{{entry_id}}/verify/` or `/reject/` with `verification_note`. Confirm verified progress remains based only on accepted work. An excess quantity or duplicate completion verification must fail without a success event. Correct a rejected entry at `/daily-task-work/{{entry_id}}/correct/` with a new draft's `new_daily_report`, `work_description`, and appropriate measurement values; verify both UUIDs in the single correction event.
8. Supervisor: `POST {{base}}/tasks/{{task_id}}/delay-reports/` with `delay_type: "WEATHER"`, `reason`, `extension_requested: true`, and `requested_end_date` later than the current deadline. Admin: approve `/delay-reports/{{delay_id}}/approve/`; confirm the task deadline stays unchanged. Then approve `/approve-extension/`; confirm a separate `EXTENSION_APPROVED` and the correct ISO old/new dates. Repeat with separate reports for rejection and `/reject-extension/`; deadlines must remain unchanged.
9. Upload a valid PDF using multipart `file`, `title`, and `document_type: "DRAWING"` at `/projects/{{project_id}}/documents/`, and again at `/tasks/{{task_id}}/documents/`. Upload replacements through `/project-documents/{{document_id}}/versions/` or `/task-documents/{{document_id}}/versions/`. Verify one event per request, sequential versions, one current version, preserved history, and no paths/URLs in activity metadata. Test an unassigned Supervisor: listing/downloading must remain denied. Valid authenticated downloads must create no activity.
10. Admin: `GET {{base}}/activity/?action=TASK_APPROVED&entity_type=TASK&entity_id={{task_id}}&actor={{admin_id}}`. Verify matching entries and test `page_size=1` / `page=2` separately on an unfiltered list. Supervisor requests to both `/activity/` and `/activity/{{log_id}}/` must return 403. Admin POST/PATCH/DELETE attempts must return 405. Mark notifications read and retrieve counts; Activity count must stay unchanged.

## Django shell rollback check

Run with existing active records; the transaction below deliberately rolls back its new task and activity/history and does not persist the probe:

```python
from django.contrib.auth import get_user_model
from django.db import transaction
from activity.models import ActivityLog
from projects.models import Project
from tasks.models import Task, TaskHistory
from tasks.services import create_task

User = get_user_model()
project = Project.objects.filter(status="ACTIVE").first()
supervisor = User.objects.get(
    pk=project.supervisor_assignments.filter(supervisor__is_active=True).first().supervisor_id
)
before = ActivityLog.objects.count()
try:
    with transaction.atomic():
        task = create_task(
            project=project,
            user=supervisor,
            validated_data={"title": "Rollback probe"},
        )
        task_id = task.id
        assert ActivityLog.objects.filter(action="TASK_CREATED", entity_id=task_id).count() == 1
        raise RuntimeError("Deliberate rollback")
except RuntimeError:
    pass

assert not Task.objects.filter(pk=task_id).exists()
assert not TaskHistory.objects.filter(task_id=task_id).exists()
assert not ActivityLog.objects.filter(entity_id=task_id).exists()
assert ActivityLog.objects.count() == before
```

## Remaining storage and audit considerations

- Upload exceptions raised inside document/report services, including activity insertion failures, use existing private-file cleanup. A later failure at transaction commit, or rollback of a caller's outer transaction after an upload service returns, can still orphan a file. Database transactions do not undo filesystem writes. Cleanup itself can also fail. No assumption of filesystem rollback was introduced.
- Category/project image writes have no existing compensating cleanup. Database/log rollback can leave image files behind, including when an activity write fails. Category deletion also retains the existing image-file lifecycle behavior.
- Report attachment deletion still schedules physical deletion only after commit. Storage failures in that callback can leave an unreferenced file while the deletion and its activity remain committed.
- Activity insertion failures intentionally fail the entire business operation. Database availability/validation therefore affects both together, as required for audit integrity.
- Existing business service/view permission boundaries are preserved. Direct ORM writes and generic admin changes remain outside this explicit audit coverage; API activity endpoints remain Admin-only and read-only. No backfill of historical activity was attempted.
- The test suite verifies transactional and workflow behavior but does not simulate concurrent sessions, commit-time disk/database failures, or every request/response variant.
