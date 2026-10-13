# RARE Project & Site Management System
## Phase 1 — Full Implementation Strategy

**Document purpose:** Single source of truth for Phase 1 architecture, database, APIs, workflows, permissions, frontend, team workflow, testing, and delivery.

**Status:** Implementation plan — not a statement that the system has already been built.

---

## 1. Product Scope

Build a web application for an architecture company to manage projects, supervisors, tasks, approvals, project/site reports, delays, documents, notifications, and audit history.

### 1.1 Roles

- **Admin:** manages supervisors, categories, projects, assignments, approvals, documents, and overall system activity.
- **Supervisor:** accesses assigned projects, proposes and tracks tasks, submits daily reports and delay reports, and accesses authorized project/task documents.

Use one `users` identity table with a `role` field. Do not create separate Admin and Supervisor identity tables.

### 1.2 Phase 1 inclusions

- Authentication and role-based permissions
- Project categories: Commercial, Residential, Art (managed through database records)
- Project CRUD, project cover image, client name, dates, status, location, description
- Supervisor creation and project assignments
- Normal and bulk task creation
- Task approval/rejection
- Approved-task edit and timeline-order change requests
- Task completion/cancellation
- Timeline view and drag-and-drop ordering
- Delay reports and deadline-extension approval
- Daily site reports with multiple attachments
- Project and task documents with retained versions
- Notifications, task history, and activity logs
- Admin and Supervisor dashboards
- Server-side search, filtering, ordering, and pagination

### 1.3 Explicit exclusions

Do not build these in Phase 1 unless the client formally changes scope:

- Client login/portal or a dedicated client management module
- Worker accounts or a Worker table
- Expenses, budgets, invoices, payments, payroll, or inventory
- Task dependencies or advanced resource scheduling
- Real-time chat
- Batch-level approval as a substitute for per-task approval

**Client name:** Store `client_name` directly on `projects` for Phase 1. A separate `clients` table can be introduced later if contact details, client accounts, or multiple structured client records are needed.

---

## 2. Technology Stack

### Backend
- Python
- Django
- Django REST Framework (DRF)
- PostgreSQL
- JWT authentication (for example, Simple JWT)
- `django-filter`
- Django ORM
- Django media storage in development; private object storage in production

### Frontend
- React
- React Router
- Axios
- Tailwind CSS
- Lucide icons
- A form/validation approach selected by the team and used consistently

### Development and delivery
- Git and GitHub
- Pull requests and code review
- Environment variables for secrets/configuration
- Automated tests and API documentation
- Docker may be used if the team has agreed on a common setup

Pin compatible dependency versions and commit the lockfiles. Do not commit `.env`, secrets, virtual environments, `node_modules`, build output, or uploaded media.

---

## 3. High-Level Architecture

```text
React UI
  |
  | HTTPS / JSON / multipart file uploads
  v
Django REST Framework API (/api/v1/)
  |
  +-- Authentication and permission checks
  +-- Serializers and input validation
  +-- Views / ViewSets
  +-- Service layer for multi-step business workflows
  +-- Django ORM
  |
  v
PostgreSQL

Uploaded files --> local media in development
                --> private object storage in production
```

### 3.1 Backend conventions

- Keep views thin: parse the request, check permissions, call services where workflow logic is involved, and return a response.
- Put multi-step business operations in service functions.
- Use serializers for input validation and output representation.
- Use database constraints for invariants that can be expressed in the database.
- Use `transaction.atomic()` for operations that must succeed or fail as a unit.
- Avoid duplicating business logic in API views.
- Enforce authorization on every API endpoint, including file download endpoints.
- Use UUID primary keys for main domain entities.
- Use timezone-aware timestamps.
- Prefer explicit status choices and documented transitions.

### 3.2 Suggested repository layout

```text
repository/
├── backend/
│   ├── manage.py
│   ├── config/
│   ├── apps/
│   │   ├── users/
│   │   ├── projects/
│   │   ├── tasks/
│   │   ├── reports/
│   │   ├── documents/
│   │   ├── notifications/
│   │   └── common/
│   ├── requirements.txt (or chosen dependency lock)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── layouts/
│   │   ├── pages/
│   │   └── routes/
│   ├── package.json
│   └── .env.example
├── docs/
└── README.md
```

Adapt this to the repository that already exists; do not move or recreate files without checking the current structure first.

---

## 4. Database Design

Use PostgreSQL and Django migrations as the source of truth. Table names below are logical names; Django may generate app-prefixed physical names unless `db_table` is explicitly configured.

### 4.1 `users`

Suggested fields:

- `id`: UUID primary key
- `email`: unique login identifier
- `name`: display name
- `role`: `ADMIN` or `SUPERVISOR`
- `is_active`: boolean
- `must_change_password`: boolean, default false
- `password`: Django password hash (never plaintext)
- `last_login`: nullable timestamp
- `created_at`, `updated_at`: timestamps

Use a custom Django user model from the beginning if the project has not already migrated using Django's default user model. Do not casually swap user models after production data exists.

### 4.2 `project_categories`

- `id`: UUID primary key
- `name`: unique, e.g. Commercial, Residential, Art
- `description`: nullable text
- `is_active`: boolean
- `created_at`, `updated_at`: timestamps

### 4.3 `projects`

- `id`: UUID primary key
- `category_id`: FK → `project_categories`
- `name`: `VARCHAR(200)`
- `client_name`: nullable `VARCHAR(200)` for Phase 1
- `description`: nullable text
- `location`: nullable `VARCHAR(255)`
- `start_date`: nullable date
- `end_date`: nullable date
- `status`: `ACTIVE`, `COMPLETED`, `ON_HOLD`, `CANCELLED`
- `cover_image`: nullable image/file storage key
- `created_by_id`: FK → `users`
- `created_at`, `updated_at`: timestamps

Validation: if both project dates are provided, `start_date <= end_date`.

### 4.4 `project_supervisors`

- `id`: UUID primary key (or composite unique constraint)
- `project_id`: FK → `projects`
- `supervisor_id`: FK → `users`
- `assigned_by_id`: FK → `users`
- `assigned_at`: timestamp

Constraint: unique `(project_id, supervisor_id)`. Only Supervisor users may be assigned.

### 4.5 `tasks`

- `id`: UUID primary key
- `project_id`: FK → `projects`
- `batch_id`: nullable FK → `task_batches`
- `title`: `VARCHAR(200)`
- `description`: nullable text
- `worker_name`: nullable `VARCHAR(200)`; no Worker table in Phase 1
- `priority`: `LOW`, `MEDIUM`, `HIGH`, `URGENT`
- `start_date`: nullable date
- `end_date`: nullable date
- `display_order`: integer
- `approval_status`: `PENDING`, `APPROVED`, `REJECTED`
- `work_status`: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `DELAYED`, `CANCELLED`
- `created_by_id`: FK → `users`
- `approved_by_id`: nullable FK → `users`
- `approved_at`: nullable timestamp
- `created_at`, `updated_at`: timestamps

Constraints/validation:
- If both task dates are supplied, `start_date <= end_date`.
- Overdue is derived, not stored: today is after `end_date` and `work_status != COMPLETED` (with any product decision on cancelled tasks applied consistently).
- Keep approval status separate from work status.
- A task must belong to a project.
- Supervisors may only create tasks for projects assigned to them.
- Define explicitly whether a rejected task can be edited/resubmitted; recommended: permit the creator to correct and resubmit it, resetting approval fields.

### 4.6 `task_batches`

Tracks one bulk submission; it does not replace individual task records.

- `id`: UUID primary key
- `project_id`: FK → `projects`
- `created_by_id`: FK → `users`
- `created_at`: timestamp

Each task in a batch has its own title, dates, worker name, priority, and description. Normal tasks use `batch_id = NULL`. A batch is a grouping/audit aid; approval remains per task in Phase 1.

### 4.7 `task_change_requests`

- `id`: UUID primary key
- `task_id`: FK → `tasks`
- `requested_by_id`: FK → `users`
- `change_type`: `EDIT` or `ORDER_CHANGE`
- `old_values`: JSON/JSONB snapshot
- `new_values`: JSON/JSONB snapshot
- `reason`: text
- `status`: `PENDING`, `APPROVED`, `REJECTED`
- `reviewed_by_id`: nullable FK → `users`
- `reviewed_at`: nullable timestamp
- `admin_comment`: nullable text
- `created_at`, `updated_at`: timestamps

The current approved task remains unchanged until Admin approval. Prevent multiple conflicting pending change requests for the same task unless explicitly supported.

### 4.8 `task_history`

Append-only task audit history:

- `id`: UUID primary key
- `task_id`: FK → `tasks`
- `actor_id`: nullable FK → `users`
- `action`: documented choice
- `details`: JSON/JSONB
- `created_at`: timestamp

Suggested actions: `CREATED`, `APPROVED`, `REJECTED`, `EDIT_REQUESTED`, `EDIT_APPROVED`, `EDIT_REJECTED`, `ORDER_CHANGE_REQUESTED`, `ORDER_CHANGE_APPROVED`, `DELAY_REPORTED`, `EXTENSION_REQUESTED`, `EXTENSION_APPROVED`, `COMPLETED`, `CANCELLED`.

Do not edit or delete history rows through ordinary application APIs.

### 4.9 `delay_reports`

- `id`: UUID primary key
- `task_id`: FK → `tasks`
- `reported_by_id`: FK → `users`
- `delay_type`: `MATERIAL_DELAY`, `WORKER_UNAVAILABLE`, `WEATHER`, `CLIENT_CHANGE`, `SITE_CONDITION`, `EQUIPMENT_FAILURE`, `APPROVAL_DELAY`, `OTHER`
- `reason`: `VARCHAR(200)`
- `description`: nullable text
- `expected_completion_date`: nullable date
- `extension_requested`: boolean, default false
- `requested_end_date`: nullable date
- `status`: `PENDING`, `APPROVED`, `REJECTED`
- `reviewed_by_id`: nullable FK → `users`
- `admin_comment`: nullable text
- `reported_at`: timestamp
- `reviewed_at`: nullable timestamp

Do not include `current_progress` here. Add a separate progress-update model only if progress tracking becomes an explicit requirement. An extension request does not alter `tasks.end_date` until Admin approval.

### 4.10 `daily_reports`

- `id`: UUID primary key
- `project_id`: FK → `projects`
- `reported_by_id`: FK → `users`
- `report_date`: date
- `work_summary`: text
- `site_notes`: nullable text
- `issues`: nullable text
- `materials_required`: nullable text
- `overall_progress`: nullable numeric percentage, constrained to 0–100 if used
- `status`: `DRAFT`, `SUBMITTED`
- `created_at`, `updated_at`: timestamps
- Optional unique constraint: `(project_id, reported_by_id, report_date)` if one report per supervisor per project per day is the agreed rule.

### 4.11 `daily_report_attachments`

- `id`: UUID primary key
- `daily_report_id`: FK → `daily_reports`
- `file`: storage key/path
- `original_filename`: `VARCHAR(255)`
- `file_size`: bigint
- `uploaded_by_id`: FK → `users`
- `created_at`: timestamp

One daily report can have multiple attachments/photos.

### 4.12 `project_documents`

Represents a logical document, not necessarily a single immutable file version.

- `id`: UUID primary key
- `project_id`: FK → `projects`
- `title`: `VARCHAR(200)`
- `description`: nullable text
- `document_type`: `DESIGN`, `DRAWING`, `BOQ`, `SPECIFICATION`, `CONTRACT`, `CLIENT_DOCUMENT`, `REFERENCE`, `OTHER`
- `uploaded_by_id`: FK → `users`
- `created_at`, `updated_at`: timestamps

### 4.13 `project_document_versions`

Recommended for real version history:

- `id`: UUID primary key
- `project_document_id`: FK → `project_documents`
- `version_number`: integer
- `file`: storage key/path
- `original_filename`: `VARCHAR(255)`
- `file_size`: bigint
- `uploaded_by_id`: FK → `users`
- `is_current`: boolean
- `created_at`: timestamp

Constraints: unique `(project_document_id, version_number)`; ensure only one current version per document (use a suitable conditional unique constraint if supported). Uploading a new version should atomically mark the previous version non-current and the new version current. Never overwrite the previous version's file.

### 4.14 `task_documents`

- `id`: UUID primary key
- `task_id`: FK → `tasks`
- `title`: `VARCHAR(200)`
- `description`: nullable text
- `document_type`: `DESIGN`, `DRAWING`, `REFERENCE`, `INSTRUCTION`, `SPECIFICATION`, `PHOTO`, `OTHER`
- `uploaded_by_id`: FK → `users`
- `created_at`, `updated_at`: timestamps

### 4.15 `task_document_versions`

Use the same version pattern as `project_document_versions`, linked to `task_documents`.

### 4.16 `notifications`

- `id`: UUID primary key
- `recipient_id`: FK → `users`
- `type`: `TASK_APPROVAL`, `TASK_CHANGE_REQUEST`, `DELAY_REPORT`, `EXTENSION_REQUEST`, `PROJECT_ASSIGNMENT`, `DAILY_REPORT`, `SYSTEM`
- `title`: `VARCHAR(200)`
- `message`: text
- `reference_type`: nullable string
- `reference_id`: nullable UUID/string
- `is_read`: boolean, default false
- `read_at`: nullable timestamp
- `created_at`: timestamp

Notifications are user-specific; users may only view or mark their own notifications as read.

### 4.17 `activity_logs`

- `id`: UUID primary key
- `actor_id`: nullable FK → `users`
- `action`: `VARCHAR(100)`
- `entity_type`: `VARCHAR(100)`
- `entity_id`: nullable UUID/string
- `description`: text
- `metadata`: JSON/JSONB
- `created_at`: timestamp

Limit access to authorized Admins. Avoid storing secrets, passwords, tokens, or unnecessary sensitive data in audit metadata.

### 4.18 Relationships overview

```text
users --< projects (created_by)
users >--< projects through project_supervisors
project_categories --< projects
projects --< tasks
task_batches --< tasks
tasks --< task_change_requests
tasks --< task_history
tasks --< delay_reports
projects --< daily_reports --< daily_report_attachments
projects --< project_documents --< project_document_versions
tasks --< task_documents --< task_document_versions
users --< notifications
users --< activity_logs (actor)
```

### 4.19 Indexing

Add indexes based on actual query patterns, including:
- Projects by status, category, and date fields
- Project assignments by supervisor and project
- Tasks by project, approval status, work status, end date, and display order
- Pending change requests by status and creation time
- Delay reports by status and task
- Daily reports by project and report date
- Document records by project/task
- Notifications by recipient, read status, and creation time
- Activity logs by creation time and entity

Use migrations and inspect query plans before adding excessive indexes.

---

## 5. Business Rules and Workflows

### 5.1 Authentication and first login

1. Admin creates a Supervisor account.
2. System sets a secure temporary password or provides a secure password-setup flow.
3. Supervisor logs in.
4. If `must_change_password = true`, restrict access to normal application pages until password change succeeds.
5. Never email or log plaintext passwords. Prefer a time-limited setup/reset link when feasible.
6. Apply rate limiting to login/password endpoints.

### 5.2 Project creation and assignment

1. Admin creates a project with category, name, optional client name, location, dates, status, and cover image.
2. Admin assigns one or more Supervisors through `project_supervisors`.
3. Supervisor sees only assigned projects.
4. Removing an assignment immediately removes that Supervisor's access to the project's data and documents.

### 5.3 Task creation and approval

**Normal task**
1. Authorized Supervisor submits one task for an assigned project.
2. Validate all fields and date rules.
3. Create task with `approval_status = PENDING`.
4. Record history and notify Admin.
5. Admin approves or rejects.
6. Approved task becomes available for execution; rejected task remains rejected until corrected/resubmitted under the agreed policy.

**Bulk task**
1. Supervisor submits a list of tasks.
2. Validate the whole request before writing.
3. Use `transaction.atomic()` to create a `task_batches` record and all task records.
4. Each task has independent fields and its own `PENDING` approval state.
5. If any task is invalid, reject the whole API request rather than silently creating a partial batch.
6. Notify Admin about the submitted tasks/batch.
7. Admin reviews each task independently.

### 5.4 Editing an approved task

- A Supervisor must not directly modify an approved task's protected fields.
- Supervisor submits a `TaskChangeRequest` with old/new values and a reason.
- Admin reviews a before/after comparison.
- On approval, apply the change and mark the request approved in one atomic transaction; record history and notifications.
- On rejection, leave the task unchanged and record the decision.
- Define a consistent list of editable fields and reject arbitrary fields from the JSON payload.

### 5.5 Timeline ordering

- Tasks have a `display_order`.
- A Supervisor can propose reordering tasks.
- For approved tasks, submit an `ORDER_CHANGE` request with the proposed order; do not silently update approved ordering.
- Validate that all task IDs belong to the same project and that the proposed order contains no duplicate/missing IDs where a complete ordering is required.
- Apply approved ordering atomically.

### 5.6 Task status and overdue calculation

- Work status choices: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `DELAYED`, `CANCELLED`.
- Completion/cancellation endpoints must validate current state and permissions.
- Overdue is computed from the due date and status; do not store `OVERDUE` as a second status.
- Decide and document whether cancelled tasks are excluded from overdue counts; recommended: exclude both completed and cancelled tasks.

### 5.7 Delay reports and extensions

1. Supervisor submits a delay report for a task in an assigned project.
2. Validate delay type, reason, and optional requested end date.
3. Notify Admin.
4. Admin approves/rejects the report.
5. If an extension was requested, Admin separately approves/rejects the extension.
6. Only extension approval changes `tasks.end_date`.
7. Perform deadline update, request/report status update, history, and notifications atomically.

### 5.8 Daily reports

- Supervisor creates a draft report for an assigned project and report date.
- Supervisor can attach multiple files/photos.
- Submission changes status to `SUBMITTED`; enforce the agreed edit-after-submit policy.
- Validate percentage range if `overall_progress` is used.
- Notify Admin after submission.

### 5.9 Project/task documents and access

- Admin can manage project-level documents.
- Supervisors can view/download documents only for projects assigned to them.
- Task document access follows the task's project access.
- Check authorization on upload, metadata retrieval, version listing, and file download.
- Validate file size and allowed file types; generate safe storage names.
- Store uploads in private storage and use authorized download endpoints or short-lived signed URLs. Do not expose private files through guessable public URLs.
- Keep previous versions; enforce a single current version per logical document.

### 5.10 Notifications and audit

- Create notifications for important workflow events.
- Notification creation should not make a critical business transaction partially fail. Use `transaction.on_commit()` or a reliable outbox/background-job pattern if available.
- Write append-only task history for task workflow transitions.
- Write activity logs for important project, assignment, user, document, and approval actions.
- Do not record secrets or sensitive payloads.

---

## 6. API Standards

Base path: `/api/v1/`

### 6.1 Conventions

- JSON for ordinary requests/responses; multipart form data for file uploads.
- Consistent error shape, field validation errors, HTTP status codes, and pagination.
- Use server-side filtering/search/ordering; never rely on the frontend to enforce access control.
- Prefer explicit action endpoints for workflow transitions (`approve`, `reject`, `submit`, `complete`) instead of allowing clients to patch protected status fields arbitrarily.
- Use `PATCH` for partial updates and `DELETE` only where deletion is allowed.
- Document request/response examples and permission requirements.
- Use idempotency or duplicate-submission protections for sensitive operations where appropriate.

### 6.2 Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/login/` | Obtain tokens |
| POST | `/auth/refresh/` | Refresh access token |
| POST | `/auth/logout/` | Revoke/blacklist refresh token if configured |
| GET | `/auth/me/` | Current user |
| POST | `/auth/change-password/` | Change password |

### 6.3 Project categories

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/project-categories/` | List categories |
| POST | `/project-categories/` | Create category (Admin) |
| GET | `/project-categories/{id}/` | Category detail |
| PATCH | `/project-categories/{id}/` | Update category (Admin) |
| DELETE | `/project-categories/{id}/` | Deactivate/delete only if safe |

Seed Commercial, Residential, and Art via a data migration or management command. Prefer deactivation over deletion when a category is already used.

### 6.4 Supervisors

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/users/supervisors/` | List Supervisors (Admin) |
| POST | `/users/supervisors/` | Create Supervisor (Admin) |
| GET | `/users/supervisors/{id}/` | Detail (Admin) |
| PATCH | `/users/supervisors/{id}/` | Update/deactivate (Admin) |
| POST | `/users/supervisors/{id}/reset-password/` | Start secure reset/setup flow |

### 6.5 Projects and assignments

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/projects/` | Admin: all allowed projects; Supervisor: assigned projects only |
| POST | `/projects/` | Create project (Admin) |
| GET | `/projects/{id}/` | Project detail if authorized |
| PATCH | `/projects/{id}/` | Update project (Admin) |
| DELETE | `/projects/{id}/` | Prefer archive/deactivation; delete only under defined policy |
| GET | `/projects/{id}/overview/` | Project summary |
| GET | `/projects/{id}/supervisors/` | List assigned Supervisors |
| POST | `/projects/{id}/assign-supervisors/` | Assign Supervisors (Admin) |
| DELETE | `/projects/{id}/supervisors/{supervisor_id}/` | Remove assignment (Admin) |

Example project payload:

```json
{
  "category_id": "uuid",
  "name": "Villa Renovation",
  "client_name": "ABC Constructions",
  "description": "Renovation and interior work",
  "location": "Kozhikode",
  "start_date": "2026-10-12",
  "end_date": "2027-02-28",
  "status": "ACTIVE"
}
```

### 6.6 Tasks

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/projects/{project_id}/tasks/` | List project tasks if authorized |
| POST | `/projects/{project_id}/tasks/` | Create one task |
| POST | `/projects/{project_id}/tasks/bulk-create/` | Create batch of tasks atomically |
| GET | `/tasks/{id}/` | Task detail |
| PATCH | `/tasks/{id}/` | Update only fields allowed by policy |
| DELETE | `/tasks/{id}/` | Delete only under defined state/permission policy |
| POST | `/tasks/{id}/complete/` | Mark completed |
| POST | `/tasks/{id}/cancel/` | Cancel task |
| GET | `/tasks/{id}/history/` | Task history |

### 6.7 Task approvals and change requests

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/task-approvals/` | List pending task approvals (Admin) |
| POST | `/tasks/{id}/approve/` | Approve task (Admin) |
| POST | `/tasks/{id}/reject/` | Reject task (Admin) |
| POST | `/tasks/{id}/change-requests/` | Request a task change |
| GET | `/task-change-requests/` | List change requests with filters |
| GET | `/task-change-requests/{id}/` | Change request detail |
| POST | `/task-change-requests/{id}/approve/` | Apply approved change |
| POST | `/task-change-requests/{id}/reject/` | Reject change |

### 6.8 Timeline

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/projects/{project_id}/timeline/` | Ordered task timeline |
| POST | `/projects/{project_id}/timeline/reorder/` | Propose/reorder according to approval rules |
| GET | `/timeline-change-requests/` | List order-change requests |
| POST | `/timeline-change-requests/{id}/approve/` | Approve order change |
| POST | `/timeline-change-requests/{id}/reject/` | Reject order change |

Implementation note: timeline-change endpoints can be backed by `task_change_requests` where `change_type=ORDER_CHANGE`, avoiding a duplicate table. The endpoint naming may remain task-specific if it improves API clarity.

### 6.9 Delay reports

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/delay-reports/` | List reports allowed for current user |
| POST | `/tasks/{id}/delay-reports/` | Report task delay |
| GET | `/delay-reports/{id}/` | Report detail |
| POST | `/delay-reports/{id}/approve/` | Approve report (Admin) |
| POST | `/delay-reports/{id}/reject/` | Reject report (Admin) |
| POST | `/delay-reports/{id}/approve-extension/` | Approve deadline extension (Admin) |
| POST | `/delay-reports/{id}/reject-extension/` | Reject deadline extension (Admin) |

### 6.10 Daily reports

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/projects/{project_id}/daily-reports/` | List reports for project |
| POST | `/projects/{project_id}/daily-reports/` | Create draft report |
| GET | `/daily-reports/{id}/` | Detail |
| PATCH | `/daily-reports/{id}/` | Update draft if authorized |
| POST | `/daily-reports/{id}/submit/` | Submit report |
| POST | `/daily-reports/{id}/attachments/` | Upload attachment |
| DELETE | `/daily-report-attachments/{id}/` | Delete attachment if policy allows |

### 6.11 Project documents

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/projects/{project_id}/documents/` | List project documents |
| POST | `/projects/{project_id}/documents/` | Create document/upload first version |
| GET | `/project-documents/{id}/` | Document metadata |
| GET | `/project-documents/{id}/download/` | Download current version if authorized |
| POST | `/project-documents/{id}/new-version/` | Upload a new version |
| GET | `/project-documents/{id}/versions/` | List versions |

### 6.12 Task documents

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/tasks/{task_id}/documents/` | List task documents |
| POST | `/tasks/{task_id}/documents/` | Create/upload document |
| GET | `/task-documents/{id}/` | Document metadata |
| GET | `/task-documents/{id}/download/` | Download current version if authorized |
| POST | `/task-documents/{id}/new-version/` | Upload a new version |
| GET | `/task-documents/{id}/versions/` | List versions |

### 6.13 Notifications, activity, dashboards

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/notifications/` | Current user's notifications |
| GET | `/notifications/unread-count/` | Unread count |
| POST | `/notifications/{id}/read/` | Mark own notification read |
| POST | `/notifications/read-all/` | Mark all own notifications read |
| GET | `/activity/` | Admin activity log (Supervisor scope if later required) |
| GET | `/activity/{id}/` | Activity detail if authorized |
| GET | `/dashboard/admin/` | Admin metrics |
| GET | `/dashboard/supervisor/` | Assigned-project metrics |

### 6.14 Common query parameters

Use consistently where relevant:
- `search`
- `ordering`
- `page`
- `page_size`
- `status`
- `approval_status`
- `work_status`
- `project`
- `start_date`
- `end_date`
- `unread`

Validate ordering fields and page-size limits.

---

## 7. Permissions Matrix

| Action | Admin | Supervisor |
|---|---|---|
| Create/manage Supervisors | Yes | No |
| Create/manage projects | Yes | No |
| Assign Supervisors | Yes | No |
| View project | All projects | Assigned projects only |
| Upload/manage project documents | Yes | As explicitly allowed; default read-only |
| Create task | Yes if needed by policy | Assigned projects only |
| Approve/reject new tasks | Yes | No |
| Request change to approved task | Yes if needed by policy | Assigned projects only |
| Approve/reject change request | Yes | No |
| Reorder approved tasks directly | No; use audited action | No; request approval |
| Report delay | Yes if needed by policy | Assigned projects only |
| Approve delay/extension | Yes | No |
| Create/submit daily report | Yes if needed by policy | Assigned projects only |
| View assigned-project task documents | Yes | Assigned projects only |
| View all activity logs | Yes | No by default |
| View/mark own notifications | Yes | Yes |

Every rule must be enforced on the server. Filter querysets by the user's role and project assignments. Return 403 or 404 consistently according to the API's chosen information-disclosure policy.

---

## 8. Frontend Implementation Strategy

### 8.1 Shared layout
- Authenticated application shell
- Role-aware sidebar
- Header with project context, notifications, and account menu
- Responsive layouts for desktop/tablet/mobile
- Loading, empty, error, and permission-denied states
- Consistent forms, validation messages, confirmation dialogs, and toast feedback

### 8.2 Admin screens
- Login and mandatory password change
- Dashboard
- Projects list and create/edit form
- Project details: Overview, Tasks, Timeline, Documents, Daily Reports, Delays, Activity
- Supervisor management and project assignments
- Task approval queue
- Task-change/timeline approval center
- Delay and extension approval queue
- Document version management
- Notifications and activity logs
- Profile/account

### 8.3 Supervisor screens
- Dashboard
- My Projects
- Project details
- Task list and task detail
- Single task form and bulk task form
- Task change-request form
- Timeline with drag-and-drop proposal flow
- Daily report creation and attachments
- Delay reporting and extension requests
- Read-only project documents and authorized task documents
- Notifications and account settings

### 8.4 Frontend rules
- Do not put API calls throughout UI components; centralize Axios setup and feature API modules.
- Handle token expiry and unauthorized responses consistently.
- Never treat client-side route guards as security; backend permissions are authoritative.
- Avoid duplicating server-owned workflow state in multiple client stores.
- Show pending approval/rejection status clearly.
- Confirm destructive or irreversible actions.
- Use accessible labels, keyboard-operable controls, and responsive forms.

---

## 9. Git and Team Collaboration

### 9.1 Branches

- `main`: stable, tested/releasable code
- `develop`: integrated development code
- `feature/<developer>-<feature>`: individual feature
- `fix/<short-description>`: bug fixes

Examples:
- `feature/akshay-auth`
- `feature/vaishnav-admin`
- `feature/project-management`
- `feature/task-approval`

Each developer uses their own GitHub account. Do not share the RARE admin account password. Give repository/organization access to individual accounts.

### 9.2 Initial teammate setup

If `develop` already exists on GitHub, each teammate runs:

```powershell
git fetch origin
git switch -c develop --track origin/develop
git switch -c feature/their-name-feature
```

If they already have a local `develop`, use `git switch develop` and `git pull origin develop` instead of recreating it.

### 9.3 Daily workflow

```powershell
git switch develop
git pull origin develop
git switch -c feature/your-name-feature
```

Work in the feature branch. Commit focused changes:

```powershell
git status
git add path/to/changed-files
git commit -m "Add project creation API"
git push -u origin feature/your-name-feature
```

Open a Pull Request from the feature branch into `develop`. Review and test before merging. Do not commit `.env`, secrets, generated files, or unrelated changes.

### 9.4 After other work is merged

```powershell
git switch develop
git pull origin develop
git switch feature/your-name-feature
git merge develop
```

Resolve conflicts deliberately, run tests, and commit the resolution. Never run merge/rebase commands with uncommitted changes unless you understand the consequences; commit or stash first.

### 9.5 Team rules
- Agree on ownership of modules and API contracts before parallel work.
- Use PR review; protect `main` and ideally `develop` from direct pushes.
- Keep commits small and descriptive.
- Do not force-push shared branches.
- Avoid multiple developers editing the same files simultaneously where possible.
- Merge complete, tested units of work, not half-finished features.

---

## 10. Testing Strategy

### 10.1 Backend tests
- Model constraints and date validation
- Serializer validation and invalid payloads
- Authentication, password change, and inactive users
- Admin/Supervisor permission matrix
- Supervisor access limited to assigned projects
- Task approval/rejection and status transitions
- Bulk creation is atomic: invalid item means no partial creation
- Approved-task changes do not apply before approval
- Timeline order validation and atomic application
- Deadline changes only after extension approval
- Document upload/version/access/download checks
- Notification ownership and read actions
- Audit history immutability through ordinary endpoints

### 10.2 Frontend tests / manual QA
- Login, logout, token expiry, mandatory password change
- Role-specific navigation and API error states
- Create/edit project and assign Supervisors
- Single and bulk task flows
- Approval center and before/after change review
- Timeline drag/drop and rejected changes
- Daily report with multiple attachments
- Delay and extension decisions
- Document upload, version listing, and access denial
- Responsive layout and accessibility checks

### 10.3 Integration and acceptance
- Run migrations against a clean database.
- Test a full Admin-to-Supervisor workflow with separate accounts.
- Verify a Supervisor cannot access another Supervisor's projects by changing IDs in requests.
- Test invalid, oversized, and disallowed file uploads.
- Test backups and recovery before production.
- Run lint/type checks if configured and a production frontend build.
- Keep a reproducible test dataset or seed command without real user secrets.

---

## 11. Security and Operational Requirements

- Store only password hashes using Django's password system.
- Keep secret keys, database credentials, JWT secrets, and storage credentials in environment variables.
- Use HTTPS in production.
- Restrict CORS to approved frontend origins.
- Apply secure cookie/token handling appropriate to the chosen JWT setup.
- Rate-limit login and password-reset endpoints.
- Validate file extensions, MIME types, and size; do not trust client-supplied metadata.
- Use random storage names and private file storage.
- Enforce project authorization before returning document metadata or file contents.
- Configure allowed hosts, secure headers, backups, error monitoring, and log retention.
- Never return tracebacks or secrets in production API errors.
- Avoid storing access tokens or passwords in application logs.
- Establish a policy for user deactivation, data retention, and deletion/archive.

---

## 12. Recommended Implementation Order and Definition of Done

### Module 0 — Repository baseline
- Confirm repository layout, branch, `.gitignore`, environment examples, and README.
- Create backend/frontend run instructions.
- Confirm all teammates can clone, install, run, and test the project.

**Done when:** every developer can run the baseline without sharing local secrets.

### Module 1 — Backend foundation and users
- Django settings, PostgreSQL connection, custom user model if appropriate, migrations, JWT, login/me/password change, role permissions.
- Create automated auth/permission tests.

**Done when:** Admin and Supervisor can authenticate and unauthorized access is blocked.

### Module 2 — Categories, projects, assignments
- Category seed data, project CRUD, `client_name`, cover image, project-supervisor assignments, project query scoping.
- Project dashboard summary.

**Done when:** Admin can create and assign a project; Supervisor sees only assigned projects.

### Module 3 — Tasks
- Task model, normal creation, bulk creation, filters, history, status transitions, approval queue.
- Add atomic bulk-create tests.

**Done when:** individual and batch submissions create correct task rows and require approval.

### Module 4 — Change requests and timeline
- Edit request, approval/rejection, order-change requests, timeline API.
- Apply changes only after Admin approval.

**Done when:** approved task data/order cannot be silently mutated by a Supervisor.

### Module 5 — Delay and daily reports
- Delay report, extension decision flow, daily report, multiple attachments.

**Done when:** extension changes the deadline only after approval and reports are restricted to assigned projects.

### Module 6 — Documents
- Project/task document records, version tables, uploads, secure download endpoints, file validation.

**Done when:** previous versions remain retained and unauthorized users cannot access files.

### Module 7 — Notifications and audit
- Notification creation/read APIs, task history completion, activity log.

**Done when:** key workflows create traceable records and users can only access their own notifications.

### Module 8 — Frontend feature integration
- Build Admin and Supervisor screens in the same sequence as the APIs.
- Add loading/error/empty states and role-aware navigation.

**Done when:** users can complete the end-to-end workflows through the UI.

### Module 9 — Stabilization and release
- Regression tests, responsive/accessibility checks, deployment configuration, migrations, backups, documentation, and release PR from `develop` to `main`.

**Done when:** acceptance checklist passes and the deployed app can be recovered from a backup.

---

## 13. API and Implementation Conventions

Before multiple developers implement modules, agree on:
- UUID format and response envelope/pagination format
- Date format (`YYYY-MM-DD`) and timezone policy
- Error response shape
- Status transition rules
- Serializer naming and API route naming
- File size/type limits
- Permission error policy (403 vs 404)
- Notification behavior and audit fields
- Code formatting, linting, and test commands

Maintain a small API contract document or OpenAPI schema. When changing a shared model/API, coordinate the change and merge it before dependent frontend work.

---

## 14. Phase 1 Final Checklist

### Product
- [ ] Admin and Supervisor roles work
- [ ] Projects include optional client name
- [ ] Project categories are database-backed
- [ ] Supervisor assignment permissions are enforced
- [ ] Single and bulk tasks share one `tasks` table
- [ ] Bulk task creation is atomic
- [ ] New tasks require approval
- [ ] Approved task edits/order changes require requests and approval
- [ ] Delay and extension workflows work correctly
- [ ] Daily reports support multiple attachments
- [ ] Project/task documents retain versions
- [ ] Notifications and audit records are generated
- [ ] Dashboards and filters work

### Engineering
- [ ] Migrations work from a clean database
- [ ] Automated tests cover permissions and workflows
- [ ] No secrets are committed
- [ ] File downloads are authorization-protected
- [ ] Search, filtering, ordering, and pagination are server-side
- [ ] README and environment setup are documented
- [ ] Teammates use feature branches and pull requests
- [ ] `main` is protected and only receives tested releases
- [ ] Deployment, backups, and recovery are documented

---

## 15. Key Decisions Summary

1. One `users` table with Admin/Supervisor roles.
2. Store `client_name` on `projects` for Phase 1; no dedicated client table yet.
3. One `tasks` table for normal and bulk task creation.
4. Optional `task_batches` groups a bulk submission; approval remains per task.
5. Keep task approval status separate from work status.
6. Approved-task edits and timeline reordering go through `task_change_requests`.
7. Deadline extensions change the task deadline only after Admin approval.
8. Overdue is computed, not stored as a work status.
9. Store uploaded files outside PostgreSQL; keep metadata and storage keys in the database.
10. Retain document versions using separate version tables.
11. Enforce role and project assignment checks on the backend for every endpoint.
12. Build module by module, with tests and PR review before merging into `develop`.
