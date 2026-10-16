from django.db import transaction
from rest_framework.exceptions import (
    PermissionDenied,
    ValidationError,
)

from projects.models import Project, ProjectSupervisor

from .models import Task, TaskBatch, TaskHistory , Task

from django.shortcuts import get_object_or_404
from django.utils import timezone


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

    return task


# =====================================================
# CREATE BULK TASKS
# =====================================================


@transaction.atomic
def create_bulk_tasks(*, project, user, tasks_data):
    project = Project.objects.select_for_update().get(pk=project.pk)

    validate_supervisor_assignment(project, user)
    validate_project_allows_tasks(project)

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

    return task
