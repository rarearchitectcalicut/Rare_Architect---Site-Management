from django.db import transaction
from rest_framework.exceptions import (
    PermissionDenied,
    ValidationError,
)
import json
from django.core.serializers.json import DjangoJSONEncoder
from datetime import date, datetime
from decimal import Decimal
from projects.models import Project, ProjectSupervisor
from activity.services import create_activity_log

from .models import Task, TaskBatch, TaskHistory, Task, TaskChangeRequest
from .serializers import TaskCreateSerializer, TaskResubmissionSerializer
from django.shortcuts import get_object_or_404
from django.utils import timezone
from notifications.task_events import (
    notify_admins_task_created,
    notify_admins_bulk_tasks_created,
    notify_task_approved,
    notify_task_rejected,
    notify_admins_task_resubmitted,
    notify_admins_task_change_requested,
    notify_task_change_approved,
    notify_task_change_rejected,
    notify_admins_timeline_reorder_requested,
    notify_timeline_reorder_approved,
    notify_timeline_reorder_rejected,
)


# HELPER
def json_safe(value):
    """
    Convert Django-specific objects into JSON-safe values.

    Handles:
    - Decimal -> string
    - UUID -> string
    - date/datetime -> ISO string
    - Nested dictionaries and lists
    """
    return json.loads(json.dumps(value, cls=DjangoJSONEncoder))


# =====================================================
# PROJECT STATUS VALIDATION
# =====================================================
def validate_project_allows_tasks(project):
    allowed_statuses = {
        Project.Status.ACTIVE,
        Project.Status.MAINTENANCE,
    }

    if project.status not in allowed_statuses:
        raise ValidationError(
            {
                "project": (
                    "Tasks can only be created for " "active or maintenance projects."
                )
            }
        )


# =====================================================
# SUPERVISOR ASSIGNMENT VALIDATION
# =====================================================


def validate_supervisor_assignment(project, user):
    if not user.is_active or user.role != "SUPERVISOR" or user.is_staff:
        raise PermissionDenied("Only active supervisors can create tasks.")

    if not ProjectSupervisor.objects.filter(
        project=project,
        supervisor=user,
    ).exists():
        raise PermissionDenied("You are not assigned to this project.")


# =====================================================
# CREATE SINGLE TASK
# =====================================================


@transaction.atomic
def create_task(*, project, user, validated_data):
    # Lock the project during creation and recheck status.
    project = Project.objects.select_for_update().get(pk=project.pk)

    validate_supervisor_assignment(project, user)
    validate_project_allows_tasks(project)

    task = Task.objects.create(
        project=project,
        created_by=user,
        batch=None,
        approval_status=Task.ApprovalStatus.PENDING,
        work_status=Task.WorkStatus.NOT_STARTED,
        **validated_data,
    )

    TaskHistory.objects.create(
        task=task,
        actor=user,
        action=TaskHistory.Action.CREATED,
        details={
            "source": "SINGLE",
            "approval_status": "PENDING",
        },
    )

    create_activity_log(
        actor=user,
        action="TASK_CREATED",
        entity_type="TASK",
        entity_id=task.id,
        description=f"Task '{task.title}' created.",
        metadata={
            "task_id": str(task.id),
            "project_id": str(task.project_id),
            "new_status": task.approval_status,
        },
    )

    notify_admins_task_created(task)

    return task


# =====================================================
# CREATE BULK TASKS
# =====================================================


@transaction.atomic
def create_bulk_tasks(*, project, user, tasks_data):

    # Lock project during bulk creation.
    project = Project.objects.select_for_update().get(pk=project.pk)

    validate_supervisor_assignment(project, user)
    validate_project_allows_tasks(project)

    # Create one batch for the submission.
    batch = TaskBatch.objects.create(
        project=project,
        created_by=user,
    )

    tasks = []

    for item in tasks_data:

        task = Task.objects.create(
            project=project,
            batch=batch,
            created_by=user,
            approval_status=Task.ApprovalStatus.PENDING,
            work_status=Task.WorkStatus.NOT_STARTED,
            **item,
        )

        TaskHistory.objects.create(
            task=task,
            actor=user,
            action=TaskHistory.Action.CREATED,
            details={
                "source": "BULK",
                "batch_id": str(batch.id),
                "approval_status": "PENDING",
            },
        )

        tasks.append(task)

    create_activity_log(
        actor=user,
        action="TASK_BATCH_CREATED",
        entity_type="TASK_BATCH",
        entity_id=batch.id,
        description="Task batch submitted for approval.",
        metadata={
            "batch_id": str(batch.id),
            "project_id": str(project.id),
            "task_count": len(tasks),
        },
    )

    # Send ONE notification per active Admin
    # for the entire batch, not per task.
    #
    # schedule_notifications() registers an
    # on_commit callback, so notification records
    # are created only after a successful commit.
    notify_admins_bulk_tasks_created(
        batch=batch,
        task_count=len(tasks),
    )

    return batch, tasks


# =====================================================
# APPROVE TASK
# =====================================================
@transaction.atomic
def approve_task(*, task_id, admin_user, comment=""):
    """
    Approve one pending task.

    Uses a database lock to prevent conflicting
    approval/rejection requests.
    """

    # Serialize timeline membership changes with project-first reorder decisions.
    reference = get_object_or_404(Task.objects.only("project_id"), pk=task_id)
    Project.objects.select_for_update().get(pk=reference.project_id)
    task = get_object_or_404(
        Task.objects.select_for_update(),
        pk=task_id,
    )

    if task.approval_status != Task.ApprovalStatus.PENDING:
        raise ValidationError({"detail": "Only pending tasks can be approved."})

    task.approval_status = Task.ApprovalStatus.APPROVED
    task.approved_by = admin_user
    task.approved_at = timezone.now()

    task.save(
        update_fields=[
            "approval_status",
            "approved_by",
            "approved_at",
            "updated_at",
        ]
    )

    TaskHistory.objects.create(
        task=task,
        actor=admin_user,
        action=TaskHistory.Action.APPROVED,
        details={
            "comment": comment,
            "approval_status": "APPROVED",
        },
    )

    create_activity_log(
        actor=admin_user,
        action="TASK_APPROVED",
        entity_type="TASK",
        entity_id=task.id,
        description=f"Task '{task.title}' approved.",
        metadata={
            "task_id": str(task.id),
            "project_id": str(task.project_id),
            "old_status": Task.ApprovalStatus.PENDING,
            "new_status": task.approval_status,
            "comment": comment,
        },
    )

    notify_task_approved(task)

    return task


# =====================================================
# REJECT TASK
# =====================================================
@transaction.atomic
def reject_task(*, task_id, admin_user, reason):
    """
    Reject one pending task.

    The rejection reason is stored in TaskHistory.
    """

    task = get_object_or_404(
        Task.objects.select_for_update(),
        pk=task_id,
    )

    if task.approval_status != Task.ApprovalStatus.PENDING:
        raise ValidationError({"detail": "Only pending tasks can be rejected."})

    task.approval_status = Task.ApprovalStatus.REJECTED
    task.approved_by = None
    task.approved_at = None

    task.save(
        update_fields=[
            "approval_status",
            "approved_by",
            "approved_at",
            "updated_at",
        ]
    )

    TaskHistory.objects.create(
        task=task,
        actor=admin_user,
        action=TaskHistory.Action.REJECTED,
        details={
            "reason": reason,
            "approval_status": "REJECTED",
        },
    )

    create_activity_log(
        actor=admin_user,
        action="TASK_REJECTED",
        entity_type="TASK",
        entity_id=task.id,
        description=f"Task '{task.title}' rejected.",
        metadata={
            "task_id": str(task.id),
            "project_id": str(task.project_id),
            "old_status": Task.ApprovalStatus.PENDING,
            "new_status": task.approval_status,
            "reason": reason,
        },
    )

    notify_task_rejected(task)

    return task


# =====================================================
# START TASK
# =====================================================


@transaction.atomic
def start_task(*, task_id, user):
    if (
        not user.is_authenticated
        or not user.is_active
        or user.role != "SUPERVISOR"
        or user.is_staff
    ):
        raise PermissionDenied("Only active Supervisors can start tasks.")

    task = get_object_or_404(
        Task.objects.select_related("project").select_for_update(of=("self",)),
        pk=task_id,
    )
    assignment = ProjectSupervisor.objects.select_for_update().filter(
        project_id=task.project_id,
        supervisor=user,
    ).first()
    if assignment is None:
        raise PermissionDenied("You are not assigned to this task's project.")

    if task.approval_status != Task.ApprovalStatus.APPROVED:
        raise ValidationError({"detail": "Only approved tasks can be started."})
    if task.work_status != Task.WorkStatus.NOT_STARTED:
        raise ValidationError({"detail": "Only tasks that have not started can be started."})

    old_work_status = task.work_status
    task.work_status = Task.WorkStatus.IN_PROGRESS
    task.save(update_fields=["work_status", "updated_at"])

    # TaskHistory's constrained action list has no STARTED event.
    create_activity_log(
        actor=user,
        action="TASK_STARTED",
        entity_type="TASK",
        entity_id=task.id,
        description=f"Task '{task.title}' started.",
        metadata={
            "task_id": str(task.id),
            "project_id": str(task.project_id),
            "old_status": old_work_status,
            "new_status": task.work_status,
        },
    )
    return task


# =====================================================
# COMPLETE TASK
# =====================================================


@transaction.atomic
def complete_task(*, task_id, user, comment=""):
    task = get_object_or_404(
        Task.objects.select_related("project").select_for_update(),
        pk=task_id,
    )

    # Only an assigned, active Supervisor can complete.
    if (
        not user.is_active
        or user.role != "SUPERVISOR"
        or user.is_staff
        or not ProjectSupervisor.objects.filter(
            project_id=task.project_id,
            supervisor=user,
        ).exists()
    ):
        raise PermissionDenied("You cannot complete this task.")

    if task.approval_status != Task.ApprovalStatus.APPROVED:
        raise ValidationError({"detail": "Only approved tasks can be completed."})

    allowed_statuses = {
        Task.WorkStatus.NOT_STARTED,
        Task.WorkStatus.IN_PROGRESS,
        Task.WorkStatus.DELAYED,
    }

    if task.work_status not in allowed_statuses:
        raise ValidationError(
            {"detail": "This task cannot be completed from its current status."}
        )

    old_work_status = task.work_status
    task.work_status = Task.WorkStatus.COMPLETED
    task.save(update_fields=["work_status", "updated_at"])

    TaskHistory.objects.create(
        task=task,
        actor=user,
        action=TaskHistory.Action.COMPLETED,
        details={
            "comment": comment,
            "work_status": Task.WorkStatus.COMPLETED,
        },
    )

    create_activity_log(
        actor=user,
        action="TASK_COMPLETED",
        entity_type="TASK",
        entity_id=task.id,
        description=f"Task '{task.title}' completed.",
        metadata={
            "task_id": str(task.id),
            "project_id": str(task.project_id),
            "old_status": old_work_status,
            "new_status": task.work_status,
            "comment": comment,
        },
    )

    return task


# =====================================================
# CANCEL TASK
# =====================================================


def validate_lifecycle_reason(reason):
    if not isinstance(reason, str) or not reason.strip():
        raise ValidationError({"reason": "An explanation is required."})
    reason = reason.strip()
    if len(reason) > 1000:
        raise ValidationError({"reason": "Use no more than 1000 characters."})
    return reason


@transaction.atomic
def cancel_task(*, task_id, user, reason):
    is_admin = user.is_authenticated and user.is_active and user.role == "ADMIN" and user.is_staff
    is_supervisor = user.is_authenticated and user.is_active and user.role == "SUPERVISOR" and not user.is_staff
    if not (is_admin or is_supervisor):
        raise PermissionDenied("Only Admins and assigned Supervisors can cancel tasks.")
    reason = validate_lifecycle_reason(reason)

    reference = get_object_or_404(Task.objects.only("project_id"), pk=task_id)
    Project.objects.select_for_update().get(pk=reference.project_id)
    task = get_object_or_404(
        Task.objects.select_related("project").select_for_update(),
        pk=task_id,
    )

    if is_supervisor:
        validate_supervisor_assignment(task.project, user)
        if not ProjectSupervisor.objects.select_for_update().filter(project_id=task.project_id, supervisor=user).first():
            raise PermissionDenied("You are not assigned to this project.")

    if task.approval_status != Task.ApprovalStatus.APPROVED:
        raise ValidationError({"detail": "Only approved tasks can be cancelled."})

    if task.work_status in {
        Task.WorkStatus.COMPLETED,
        Task.WorkStatus.CANCELLED,
    }:
        raise ValidationError(
            {"detail": "Completed or cancelled tasks cannot be cancelled again."}
        )

    old_work_status = task.work_status
    task.work_status = Task.WorkStatus.CANCELLED
    task.save(update_fields=["work_status", "updated_at"])

    TaskHistory.objects.create(
        task=task,
        actor=user,
        action=TaskHistory.Action.CANCELLED,
        details={
            "reason": reason,
            "old_status": old_work_status,
            "new_status": task.work_status,
            "work_status": Task.WorkStatus.CANCELLED,
        },
    )

    create_activity_log(
        actor=user,
        action="TASK_CANCELLED",
        entity_type="TASK",
        entity_id=task.id,
        description=f"Task '{task.title}' cancelled.",
        metadata={
            "task_id": str(task.id),
            "project_id": str(task.project_id),
            "old_status": old_work_status,
            "new_status": task.work_status,
            "reason": reason,
        },
    )

    return task


# =====================================================
# REOPEN COMPLETED TASK
# =====================================================

@transaction.atomic
def reopen_task(*, task_id, admin_user, reason):
    if not (admin_user.is_authenticated and admin_user.is_active and admin_user.role == "ADMIN" and admin_user.is_staff):
        raise PermissionDenied("Only active Admins can reopen tasks.")
    reason = validate_lifecycle_reason(reason)
    reference = get_object_or_404(Task.objects.only("project_id"), pk=task_id)
    Project.objects.select_for_update().get(pk=reference.project_id)
    task = get_object_or_404(Task.objects.select_for_update().select_related("project"), pk=task_id)
    if task.approval_status != Task.ApprovalStatus.APPROVED or task.work_status != Task.WorkStatus.COMPLETED:
        raise ValidationError({"detail": "Only approved, completed tasks can be reopened."})

    old_work_status = task.work_status
    task.work_status = Task.WorkStatus.IN_PROGRESS
    task.save(update_fields=["work_status", "updated_at"])
    details = {"reason": reason, "old_status": old_work_status, "new_status": task.work_status, "work_status": task.work_status}
    TaskHistory.objects.create(task=task, actor=admin_user, action=TaskHistory.Action.REOPENED, details=details)
    create_activity_log(
        actor=admin_user, action="TASK_REOPENED", entity_type="TASK", entity_id=task.id,
        description=f"Task '{task.title}' reopened.",
        metadata={**details, "task_id": str(task.id), "project_id": str(task.project_id)},
    )
    return task

# =====================================================
# TASK CHANGE REQUEST HELPERS
# =====================================================

EDITABLE_TASK_FIELDS = {
    "title",
    "description",
    "worker_name",
    "priority",
    "start_date",
    "measurement_method",
    "planned_quantity",
    "measurement_unit",
    "completion_criteria",
}


def task_field_snapshot(task, fields):
    """
    Capture selected task fields in a JSON-compatible form.

    Dates become ISO strings.
    Decimal quantities become strings.
    """

    snapshot = {}

    for field in fields:
        value = getattr(task, field)

        if isinstance(value, Decimal):
            value = str(value)

        elif isinstance(value, (date, datetime)):
            value = value.isoformat()

        snapshot[field] = value

    return snapshot


def validate_task_can_be_edited(task):
    if task.approval_status != Task.ApprovalStatus.APPROVED:
        raise ValidationError({"detail": "Only approved tasks can be edited."})

    if task.work_status in {
        Task.WorkStatus.COMPLETED,
        Task.WorkStatus.CANCELLED,
    }:
        raise ValidationError(
            {"detail": ("Completed or cancelled tasks " "cannot be edited.")}
        )


# =====================================================
# CREATE TASK CHANGE REQUEST
# =====================================================


@transaction.atomic
def create_task_change_request(
    *,
    task_id,
    supervisor,
    new_values,
    reason,
):
    task = get_object_or_404(
        Task.objects.select_for_update(),
        pk=task_id,
    )

    validate_supervisor_assignment(task.project, supervisor)
    validate_task_can_be_edited(task)

    if not new_values or set(new_values) - EDITABLE_TASK_FIELDS:
        raise ValidationError({"new_values": "Unsupported or empty task changes."})

    # Validate using existing task field rules.
    validator = TaskCreateSerializer(
        instance=task,
        data=new_values,
        partial=True,
    )
    validator.is_valid(raise_exception=True)

    cleaned = dict(validator.validated_data)

    # Dates must be JSON-compatible.
    for field, value in cleaned.items():
        if isinstance(value, Decimal):
            cleaned[field] = str(value)

        elif isinstance(value, (date, datetime)):
            cleaned[field] = value.isoformat()

    old_values = task_field_snapshot(task, cleaned.keys())

    # Do not create a request without actual changes.
    changed_values = {
        field: value for field, value in cleaned.items() if value != old_values[field]
    }

    if not changed_values:
        raise ValidationError({"new_values": "No changes detected."})

    if TaskChangeRequest.objects.filter(
        task=task,
        status=TaskChangeRequest.Status.PENDING,
    ).exists():
        raise ValidationError(
            {"detail": ("This task already has a pending change request.")}
        )

    change_request = TaskChangeRequest.objects.create(
        task=task,
        requested_by=supervisor,
        change_type=TaskChangeRequest.ChangeType.EDIT,
        old_values={field: old_values[field] for field in changed_values},
        new_values=changed_values,
        reason=reason,
        status=TaskChangeRequest.Status.PENDING,
    )

    TaskHistory.objects.create(
        task=task,
        actor=supervisor,
        action=TaskHistory.Action.EDIT_REQUESTED,
        details={
            "change_request_id": str(change_request.id),
            "old_values": change_request.old_values,
            "new_values": change_request.new_values,
            "reason": reason,
        },
    )

    create_activity_log(
        actor=supervisor,
        action="TASK_EDIT_REQUESTED",
        entity_type="TASK_CHANGE_REQUEST",
        entity_id=change_request.id,
        description="Task edit requested.",
        metadata={
            "change_request_id": str(change_request.id),
            "task_id": str(task.id),
            "project_id": str(task.project_id),
            "new_status": change_request.status,
            "reason": reason,
            "changed_fields": sorted(changed_values),
        },
    )

    notify_admins_task_change_requested(change_request)

    return change_request


# =====================================================
# APPROVE TASK CHANGE REQUEST
# =====================================================


@transaction.atomic
def approve_task_change_request(
    *,
    change_request_id,
    admin_user,
    admin_comment="",
):
    if (
        not admin_user.is_authenticated
        or not admin_user.is_active
        or admin_user.role != "ADMIN"
        or not admin_user.is_staff
    ):
        raise PermissionDenied("Only Admin can approve changes.")

    request_obj = get_object_or_404(
        TaskChangeRequest,
        pk=change_request_id,
        change_type=TaskChangeRequest.ChangeType.EDIT,
    )

    # Lock the Task first to stay consistent with
    # the existing task-change workflow.
    task = Task.objects.select_for_update().get(pk=request_obj.task_id)

    # Lock the change request before reviewing it.
    request_obj = TaskChangeRequest.objects.select_for_update().get(pk=request_obj.pk)

    if request_obj.status != TaskChangeRequest.Status.PENDING:
        raise ValidationError(
            {"detail": "This change request has already been reviewed."}
        )

    validate_task_can_be_edited(task)

    # Confirm the task has not changed since
    # the Supervisor submitted the request.
    current_values = task_field_snapshot(
        task,
        request_obj.old_values.keys(),
    )

    if current_values != request_obj.old_values:
        raise ValidationError(
            {
                "detail": (
                    "Task details have changed since this request "
                    "was submitted. Review the request again."
                )
            }
        )

    if not request_obj.new_values or set(request_obj.new_values) - EDITABLE_TASK_FIELDS:
        raise ValidationError({"new_values": "Unsupported task changes."})

    # Revalidate the proposed changes against
    # the latest Task state.
    validator = TaskCreateSerializer(
        instance=task,
        data=request_obj.new_values,
        partial=True,
    )
    validator.is_valid(raise_exception=True)

    # -------------------------------------------------
    # PROTECT VERIFIED MEASUREMENT BASELINES
    # -------------------------------------------------
    # The task is already locked.
    # Block actual baseline changes if verified
    # daily work exists.
    validate_task_measurement_baseline_change(
        task=task,
        proposed_values=validator.validated_data,
    )

    # -------------------------------------------------
    # APPLY APPROVED CHANGES
    # -------------------------------------------------
    for field, value in validator.validated_data.items():
        setattr(task, field, value)

    changed_fields = list(validator.validated_data.keys())

    task.full_clean()

    task.save(update_fields=changed_fields + ["updated_at"])

    # -------------------------------------------------
    # APPROVE CHANGE REQUEST
    # -------------------------------------------------
    request_obj.status = TaskChangeRequest.Status.APPROVED
    request_obj.reviewed_by = admin_user
    request_obj.reviewed_at = timezone.now()
    request_obj.admin_comment = admin_comment

    request_obj.save(
        update_fields=[
            "status",
            "reviewed_by",
            "reviewed_at",
            "admin_comment",
            "updated_at",
        ]
    )

    # -------------------------------------------------
    # TASK HISTORY
    # -------------------------------------------------
    TaskHistory.objects.create(
        task=task,
        actor=admin_user,
        action=TaskHistory.Action.EDIT_APPROVED,
        details={
            "change_request_id": str(request_obj.id),
            "old_values": request_obj.old_values,
            "new_values": request_obj.new_values,
            "comment": admin_comment,
        },
    )

    create_activity_log(
        actor=admin_user,
        action="TASK_EDIT_APPROVED",
        entity_type="TASK_CHANGE_REQUEST",
        entity_id=request_obj.id,
        description="Task edit approved.",
        metadata={
            "change_request_id": str(request_obj.id),
            "task_id": str(task.id),
            "project_id": str(task.project_id),
            "new_status": request_obj.status,
            "old_status": TaskChangeRequest.Status.PENDING,
            "comment": admin_comment,
            "changed_fields": sorted(changed_fields),
        },
    )

    notify_task_change_approved(request_obj)

    return request_obj


# =====================================================
# REJECT TASK CHANGE REQUEST
# =====================================================
@transaction.atomic
def reject_task_change_request(
    *,
    change_request_id,
    admin_user,
    admin_comment,
):
    if (
        not admin_user.is_authenticated
        or not admin_user.is_active
        or admin_user.role != "ADMIN"
        or not admin_user.is_staff
    ):
        raise PermissionDenied("Only Admin can reject changes.")

    request_obj = get_object_or_404(
        TaskChangeRequest,
        pk=change_request_id,
        change_type=TaskChangeRequest.ChangeType.EDIT,
    )

    task = Task.objects.select_for_update().get(pk=request_obj.task_id)

    request_obj = TaskChangeRequest.objects.select_for_update().get(pk=request_obj.pk)

    if request_obj.status != TaskChangeRequest.Status.PENDING:
        raise ValidationError(
            {"detail": "This change request has already been reviewed."}
        )

    if not admin_comment.strip():
        raise ValidationError({"admin_comment": "A rejection reason is required."})

    request_obj.status = TaskChangeRequest.Status.REJECTED
    request_obj.reviewed_by = admin_user
    request_obj.reviewed_at = timezone.now()
    request_obj.admin_comment = admin_comment
    request_obj.save(
        update_fields=[
            "status",
            "reviewed_by",
            "reviewed_at",
            "admin_comment",
            "updated_at",
        ]
    )

    TaskHistory.objects.create(
        task=task,
        actor=admin_user,
        action=TaskHistory.Action.EDIT_REJECTED,
        details={
            "change_request_id": str(request_obj.id),
            "reason": admin_comment,
        },
    )

    create_activity_log(
        actor=admin_user,
        action="TASK_EDIT_REJECTED",
        entity_type="TASK_CHANGE_REQUEST",
        entity_id=request_obj.id,
        description="Task edit rejected.",
        metadata={
            "change_request_id": str(request_obj.id),
            "task_id": str(task.id),
            "project_id": str(task.project_id),
            "new_status": request_obj.status,
            "old_status": TaskChangeRequest.Status.PENDING,
            "comment": admin_comment,
        },
    )

    notify_task_change_rejected(request_obj)

    return request_obj


# =====================================================
# TIMELINE HELPERS
# =====================================================


def get_timeline_tasks(project):
    """
    All approved, non-cancelled tasks in a project.

    We use a stable secondary ordering for tasks
    that currently share the same display_order.
    """
    return list(
        Task.objects.filter(
            project=project,
            approval_status=Task.ApprovalStatus.APPROVED,
        )
        .exclude(work_status=Task.WorkStatus.CANCELLED)
        .order_by("display_order", "created_at", "id")
    )


def timeline_snapshot(tasks):
    """
    Store both task identity and current display_order
    so stale reorder requests can be detected.
    """
    return [
        {
            "task_id": str(task.id),
            "display_order": task.display_order,
        }
        for task in tasks
    ]


def validate_timeline_admin(user):
    if not (
        user.is_authenticated
        and user.is_active
        and user.role == "ADMIN"
        and user.is_staff
    ):
        raise PermissionDenied("Only Admin can review timeline changes.")


def get_locked_timeline_request(request_id):
    """
    Find the project, lock it, then lock the request.

    All timeline write operations use project-first
    locking to serialize changes within a project.
    """
    request_obj = get_object_or_404(
        TaskChangeRequest.objects.filter(
            change_type=TaskChangeRequest.ChangeType.ORDER_CHANGE,
        ).select_related("task"),
        pk=request_id,
    )

    project = Project.objects.select_for_update().get(pk=request_obj.task.project_id)

    request_obj = TaskChangeRequest.objects.select_for_update().get(pk=request_obj.pk)

    return project, request_obj


# =====================================================
# CREATE TIMELINE REORDER REQUEST
# =====================================================


@transaction.atomic
def create_timeline_reorder_request(
    *,
    project,
    supervisor,
    task_ids,
    reason,
):
    project = Project.objects.select_for_update().get(pk=project.pk)

    validate_supervisor_assignment(project, supervisor)

    tasks = get_timeline_tasks(project)

    if len(tasks) < 2:
        raise ValidationError(
            {
                "task_ids": (
                    "At least two approved timeline tasks "
                    "are required for reordering."
                )
            }
        )

    current_ids = [str(task.id) for task in tasks]
    proposed_ids = [str(task_id) for task_id in task_ids]

    if len(proposed_ids) != len(set(proposed_ids)):
        raise ValidationError({"task_ids": "Duplicate task IDs are not allowed."})

    if len(proposed_ids) != len(current_ids) or set(proposed_ids) != set(current_ids):
        raise ValidationError(
            {
                "task_ids": (
                    "Provide every approved, non-cancelled "
                    "task in this project exactly once."
                )
            }
        )

    if proposed_ids == current_ids:
        raise ValidationError({"task_ids": "The proposed order is unchanged."})

    # One pending timeline reorder per project.
    existing = TaskChangeRequest.objects.filter(
        task__project=project,
        change_type=TaskChangeRequest.ChangeType.ORDER_CHANGE,
        status=TaskChangeRequest.Status.PENDING,
    ).exists()

    if existing:
        raise ValidationError(
            {
                "detail": (
                    "This project already has a pending " "timeline reorder request."
                )
            }
        )

    # TaskChangeRequest requires a task FK.
    # Use the first task as an audit anchor, while
    # storing the complete ordering in JSON.
    anchor_task = tasks[0]

    proposed_snapshot = [
        {
            "task_id": task_id,
            "display_order": index,
        }
        for index, task_id in enumerate(
            proposed_ids,
            start=1,
        )
    ]

    change_request = TaskChangeRequest.objects.create(
        task=anchor_task,
        requested_by=supervisor,
        change_type=TaskChangeRequest.ChangeType.ORDER_CHANGE,
        old_values={
            "timeline": timeline_snapshot(tasks),
        },
        new_values={
            "timeline": proposed_snapshot,
        },
        reason=reason,
        status=TaskChangeRequest.Status.PENDING,
    )

    TaskHistory.objects.create(
        task=anchor_task,
        actor=supervisor,
        action=TaskHistory.Action.ORDER_CHANGE_REQUESTED,
        details={
            "change_request_id": str(change_request.id),
            "project_id": str(project.id),
            "old_order": current_ids,
            "proposed_order": proposed_ids,
        },
    )

    create_activity_log(
        actor=supervisor,
        action="TIMELINE_REORDER_REQUESTED",
        entity_type="TASK_CHANGE_REQUEST",
        entity_id=change_request.id,
        description="Timeline reorder requested.",
        metadata={
            "change_request_id": str(change_request.id),
            "task_id": str(anchor_task.id),
            "project_id": str(anchor_task.project_id),
            "new_status": change_request.status,
            "reason": reason,
            "old_order": current_ids,
            "proposed_order": proposed_ids,
        },
    )

    if change_request.change_type == TaskChangeRequest.ChangeType.ORDER_CHANGE:
        notify_admins_timeline_reorder_requested(change_request)
    else:
        notify_admins_task_change_requested(change_request)

    return change_request


# =====================================================
# APPROVE TIMELINE REORDER REQUEST
# =====================================================


@transaction.atomic
def approve_timeline_reorder_request(
    *,
    request_id,
    admin_user,
    admin_comment="",
):
    validate_timeline_admin(admin_user)

    project, change_request = get_locked_timeline_request(request_id)

    if change_request.status != TaskChangeRequest.Status.PENDING:
        raise ValidationError({"detail": "This timeline request is already reviewed."})

    # Lock all timeline tasks before checking/applying.
    tasks = list(
        Task.objects.select_for_update()
        .filter(
            project=project,
            approval_status=Task.ApprovalStatus.APPROVED,
        )
        .exclude(work_status=Task.WorkStatus.CANCELLED)
        .order_by("display_order", "created_at", "id")
    )

    current_snapshot = timeline_snapshot(tasks)

    if current_snapshot != change_request.old_values.get("timeline"):
        raise ValidationError(
            {
                "detail": (
                    "The project timeline has changed since "
                    "this request was submitted. "
                    "Please create a new reorder request."
                )
            }
        )

    proposed_snapshot = change_request.new_values.get("timeline")

    if not isinstance(proposed_snapshot, list):
        raise ValidationError({"detail": "Invalid proposed timeline data."})

    current_ids = {str(task.id) for task in tasks}

    proposed_ids = []

    for index, item in enumerate(proposed_snapshot, start=1):
        if not isinstance(item, dict):
            raise ValidationError({"detail": "Invalid proposed timeline entry."})

        if set(item) != {"task_id", "display_order"}:
            raise ValidationError({"detail": "Invalid timeline entry fields."})

        if type(item["display_order"]) is not int or (item["display_order"] != index):
            raise ValidationError({"detail": "Invalid proposed display order."})

        proposed_ids.append(str(item["task_id"]))

    if (
        len(proposed_ids) != len(current_ids)
        or len(proposed_ids) != len(set(proposed_ids))
        or set(proposed_ids) != current_ids
    ):
        raise ValidationError(
            {
                "detail": (
                    "The proposal must contain every " "timeline task exactly once."
                )
            }
        )

    tasks_by_id = {str(task.id): task for task in tasks}

    # Update each task inside the same transaction.
    for index, task_id in enumerate(proposed_ids, start=1):
        task = tasks_by_id[task_id]
        task.display_order = index
        task.save(update_fields=["display_order", "updated_at"])

    change_request.status = TaskChangeRequest.Status.APPROVED
    change_request.reviewed_by = admin_user
    change_request.reviewed_at = timezone.now()
    change_request.admin_comment = admin_comment

    change_request.save(
        update_fields=[
            "status",
            "reviewed_by",
            "reviewed_at",
            "admin_comment",
            "updated_at",
        ]
    )

    TaskHistory.objects.create(
        task=change_request.task,
        actor=admin_user,
        action=TaskHistory.Action.ORDER_CHANGE_APPROVED,
        details={
            "change_request_id": str(change_request.id),
            "project_id": str(project.id),
            "old_values": change_request.old_values,
            "new_values": change_request.new_values,
            "comment": admin_comment,
        },
    )

    create_activity_log(
        actor=admin_user,
        action="TIMELINE_REORDER_APPROVED",
        entity_type="TASK_CHANGE_REQUEST",
        entity_id=change_request.id,
        description="Timeline reorder approved.",
        metadata={
            "change_request_id": str(change_request.id),
            "task_id": str(change_request.task.id),
            "project_id": str(change_request.task.project_id),
            "new_status": change_request.status,
            "old_status": TaskChangeRequest.Status.PENDING,
            "comment": admin_comment,
            "old_order": [item["task_id"] for item in current_snapshot],
            "new_order": proposed_ids,
        },
    )

    notify_timeline_reorder_approved(change_request)

    return change_request


# =====================================================
# REJECT TIMELINE REORDER REQUEST
# =====================================================


@transaction.atomic
def reject_timeline_reorder_request(
    *,
    request_id,
    admin_user,
    admin_comment,
):
    validate_timeline_admin(admin_user)

    project, change_request = get_locked_timeline_request(request_id)

    if change_request.status != TaskChangeRequest.Status.PENDING:
        raise ValidationError({"detail": "This timeline request is already reviewed."})

    if not admin_comment or not admin_comment.strip():
        raise ValidationError({"admin_comment": "A rejection reason is required."})

    change_request.status = TaskChangeRequest.Status.REJECTED
    change_request.reviewed_by = admin_user
    change_request.reviewed_at = timezone.now()
    change_request.admin_comment = admin_comment

    change_request.save(
        update_fields=[
            "status",
            "reviewed_by",
            "reviewed_at",
            "admin_comment",
            "updated_at",
        ]
    )

    TaskHistory.objects.create(
        task=change_request.task,
        actor=admin_user,
        action=TaskHistory.Action.ORDER_CHANGE_REJECTED,
        details={
            "change_request_id": str(change_request.id),
            "project_id": str(project.id),
            "reason": admin_comment,
        },
    )
    create_activity_log(
        actor=admin_user,
        action="TIMELINE_REORDER_REJECTED",
        entity_type="TASK_CHANGE_REQUEST",
        entity_id=change_request.id,
        description="Timeline reorder rejected.",
        metadata={
            "change_request_id": str(change_request.id),
            "task_id": str(change_request.task.id),
            "project_id": str(change_request.task.project_id),
            "new_status": change_request.status,
            "old_status": TaskChangeRequest.Status.PENDING,
            "comment": admin_comment,
        },
    )

    notify_timeline_reorder_rejected(change_request)

    return change_request


# =====================================================
# RESUBMIT REJECTED TASK
# =====================================================


@transaction.atomic
def resubmit_task(*, task_id, supervisor, validated_data):
    """
    Correct and resubmit a rejected task.

    Rules:
    - Only the original creator can resubmit.
    - Creator must still be an assigned Supervisor.
    - Task must be REJECTED.
    - Project must be ACTIVE or MAINTENANCE.
    - At least one task field must actually change.
    - Task UUID and batch remain unchanged.
    - Approval status returns to PENDING.
    - A RESUBMITTED history entry is created.
    """

    # -------------------------------------------------
    # 1. LOCK PROJECT
    # -------------------------------------------------

    existing_task = get_object_or_404(
        Task.objects.only("id", "project_id"),
        pk=task_id,
    )

    from projects.models import Project

    project = Project.objects.select_for_update().get(pk=existing_task.project_id)

    # -------------------------------------------------
    # 2. LOCK TASK
    # -------------------------------------------------

    task = get_object_or_404(
        Task.objects.select_for_update(),
        pk=task_id,
        project=project,
    )

    # -------------------------------------------------
    # 3. PERMISSIONS & WORKFLOW VALIDATION
    # -------------------------------------------------

    if task.created_by_id != supervisor.id:
        raise PermissionDenied("Only the original task creator can resubmit.")

    validate_supervisor_assignment(project, supervisor)

    validate_project_allows_tasks(project)

    if task.approval_status != Task.ApprovalStatus.REJECTED:
        raise ValidationError({"detail": "Only rejected tasks can be resubmitted."})

    if task.work_status != Task.WorkStatus.NOT_STARTED:
        raise ValidationError(
            {
                "detail": (
                    "Rejected tasks must be in NOT_STARTED "
                    "status before resubmission."
                )
            }
        )

    # -------------------------------------------------
    # 4. VALIDATE CORRECTIONS
    # -------------------------------------------------

    serializer = TaskResubmissionSerializer(
        instance=task,
        data=validated_data,
        partial=True,
    )

    serializer.is_valid(raise_exception=True)

    cleaned_data = dict(serializer.validated_data)

    # Resubmission note is saved in history,
    # not as a Task model field.
    resubmission_note = cleaned_data.pop("resubmission_note")

    # -------------------------------------------------
    # 5. RECORD PREVIOUS VALUES
    # -------------------------------------------------

    old_values = {}

    for field in cleaned_data:
        old_values[field] = json_safe(getattr(task, field))

    # -------------------------------------------------
    # 6. APPLY CORRECTIONS
    # -------------------------------------------------

    for field, value in cleaned_data.items():
        setattr(task, field, value)

    # Restart the approval workflow.
    task.approval_status = Task.ApprovalStatus.PENDING
    task.approved_by = None
    task.approved_at = None

    task.save(
        update_fields=[
            *cleaned_data.keys(),
            "approval_status",
            "approved_by",
            "approved_at",
            "updated_at",
        ]
    )

    # -------------------------------------------------
    # 7. RECORD UPDATED VALUES
    # -------------------------------------------------

    new_values = {}

    for field in cleaned_data:
        new_values[field] = json_safe(getattr(task, field))

    # -------------------------------------------------
    # 8. CREATE TASK HISTORY
    # -------------------------------------------------

    TaskHistory.objects.create(
        task=task,
        actor=supervisor,
        action=TaskHistory.Action.RESUBMITTED,
        details={
            "resubmission_note": resubmission_note,
            "old_values": old_values,
            "new_values": new_values,
            "approval_status": "PENDING",
        },
    )

    # -------------------------------------------------
    # 9. CREATE ACTIVITY LOG
    # -------------------------------------------------

    create_activity_log(
        actor=supervisor,
        action="TASK_RESUBMITTED",
        entity_type="TASK",
        entity_id=task.id,
        description=f"Task '{task.title}' resubmitted.",
        metadata={
            "task_id": str(task.id),
            "project_id": str(task.project_id),
            "old_status": Task.ApprovalStatus.REJECTED,
            "new_status": task.approval_status,
            "changed_fields": sorted(cleaned_data),
            "comment": resubmission_note,
        },
    )

    # -------------------------------------------------
    # 10. NOTIFY ADMINS
    # -------------------------------------------------

    notify_admins_task_resubmitted(task)

    return task


# Fields that define how task progress is measured.
PROTECTED_MEASUREMENT_FIELDS = {
    "measurement_method",
    "planned_quantity",
    "measurement_unit",
    "completion_criteria",
}


# =====================================================
# PROTECT TASK MEASUREMENT BASELINES
# =====================================================


def validate_task_measurement_baseline_change(
    *,
    task,
    proposed_values,
):
    """
    Protect measurement fields when pending or
    verified daily work entries exist.

    Must be called inside transaction.atomic()
    while holding a select_for_update() lock
    on the corresponding Task row.
    """

    from decimal import Decimal

    # Local import avoids circular dependencies.
    from reports.models import DailyTaskWork

    affected_fields = PROTECTED_MEASUREMENT_FIELDS & set(proposed_values.keys())

    # Ordinary task edits do not need this check.
    if not affected_fields:
        return

    actual_changes = set()

    for field in affected_fields:
        old_value = getattr(task, field)
        new_value = proposed_values[field]

        if field == "planned_quantity":
            old_value = Decimal(str(old_value)) if old_value is not None else None

            new_value = Decimal(str(new_value)) if new_value is not None else None

        if old_value != new_value:
            actual_changes.add(field)

    # No baseline change if all values are identical.
    if not actual_changes:
        return

    blocking_entries = DailyTaskWork.objects.filter(
        task=task,
        verification_status__in=[
            DailyTaskWork.VerificationStatus.PENDING,
            DailyTaskWork.VerificationStatus.VERIFIED,
        ],
    )

    if blocking_entries.exists():
        raise ValidationError(
            {
                "new_values": (
                    "This task has pending or verified "
                    "daily work entries. Its measurement "
                    "method, planned quantity, measurement "
                    "unit, and completion criteria cannot "
                    "be changed through an ordinary "
                    "task change request."
                )
            }
        )
