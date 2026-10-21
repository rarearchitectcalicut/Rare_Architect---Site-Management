from .models import Notification
from .services import (
    get_active_admin_ids,
    schedule_notifications,
)

# =====================================================
# TASK SUBMITTED FOR ADMIN APPROVAL
# =====================================================


def notify_admins_task_created(task):
    """
    Notify active Admin users that a Supervisor
    submitted a new Task for approval.
    """

    admin_ids = get_active_admin_ids()

    if not admin_ids:
        return

    schedule_notifications(
        recipient_ids=admin_ids,
        notification_type=Notification.Type.TASK_APPROVAL,
        title="New task requires approval",
        message=(f"Task '{task.title}' was submitted " "and requires Admin approval."),
        reference_type="TASK",
        reference_id=task.id,
    )


# =====================================================
# BULK TASK SUBMISSION NOTIFICATION
# =====================================================


def notify_admins_bulk_tasks_created(*, batch, task_count):
    """
    Notify active Admins about a successful
    bulk task submission.

    Creates one notification per Admin,
    not one notification per Task.
    """

    if task_count <= 0:
        return

    admin_ids = get_active_admin_ids()

    if not admin_ids:
        return

    schedule_notifications(
        recipient_ids=admin_ids,
        notification_type=Notification.Type.TASK_APPROVAL,
        title="New task batch requires approval",
        message=(
            f"{task_count} new tasks were submitted "
            f"for project '{batch.project.name}' "
            "and require Admin approval."
        ),
        reference_type="TASK_BATCH",
        reference_id=batch.id,
    )


# =====================================================
# TASK APPROVED NOTIFICATION
# =====================================================


def notify_task_approved(task):
    """
    Notify the Supervisor who created the Task
    after Admin approval.
    """

    schedule_notifications(
        recipient_ids=[task.created_by_id],
        notification_type=Notification.Type.TASK_APPROVAL,
        title="Task approved",
        message=(
            f"Your task '{task.title}' has been approved. "
            "You can now proceed with the assigned work."
        ),
        reference_type="TASK",
        reference_id=task.id,
    )


# =====================================================
# TASK REJECTED NOTIFICATION
# =====================================================


def notify_task_rejected(task):
    """
    Notify the original Task creator that Admin
    rejected the task.

    Detailed rejection feedback remains available
    through the Task History API.
    """

    schedule_notifications(
        recipient_ids=[task.created_by_id],
        notification_type=Notification.Type.TASK_APPROVAL,
        title="Task rejected",
        message=(
            f"Your task '{task.title}' has been rejected. "
            "Please review the Admin's feedback and "
            "resubmit the corrected task."
        ),
        reference_type="TASK",
        reference_id=task.id,
    )

# =====================================================
# TASK RESUBMISSION NOTIFICATION
# =====================================================

def notify_admins_task_resubmitted(task):
    """
    Notify every active Admin when a rejected
    Task is corrected and resubmitted.

    Each active Admin receives one notification.
    """

    admin_ids = get_active_admin_ids()

    if not admin_ids:
        return

    schedule_notifications(
        recipient_ids=admin_ids,
        notification_type=Notification.Type.TASK_APPROVAL,
        title="Task resubmitted for approval",
        message=(
            f"Task '{task.title}' has been corrected "
            "and resubmitted for Admin approval."
        ),
        reference_type="TASK",
        reference_id=task.id,
    )


# =====================================================
# TASK CHANGE REQUEST SUBMITTED
# =====================================================

def notify_admins_task_change_requested(change_request):
    """
    Notify every active Admin when a Supervisor
    submits a Task Change Request.

    One notification is created per active Admin.
    """

    admin_ids = get_active_admin_ids()

    if not admin_ids:
        return

    task = change_request.task

    schedule_notifications(
        recipient_ids=admin_ids,
        notification_type=(Notification.Type.TASK_CHANGE_REQUEST),
        title="Task change request requires approval",
        message=(
            f"A change request for task '{task.title}' "
            "has been submitted and requires "
            "Admin review."
        ),
        reference_type="TASK_CHANGE_REQUEST",
        reference_id=change_request.id,
    )


# =====================================================
# TASK CHANGE REQUEST APPROVED
# =====================================================


def notify_task_change_approved(change_request):
    """
    Notify the Supervisor who submitted the
    Task Change Request after Admin approval.
    """

    schedule_notifications(
        recipient_ids=[change_request.requested_by_id],
        notification_type=Notification.Type.TASK_CHANGE_REQUEST,
        title="Task change request approved",
        message=(
            f"Your requested changes to task "
            f"'{change_request.task.title}' "
            "have been approved and applied."
        ),
        reference_type="TASK_CHANGE_REQUEST",
        reference_id=change_request.id,
    )


# =====================================================
# TASK CHANGE REQUEST REJECTED
# =====================================================


def notify_task_change_rejected(change_request):
    """
    Notify the requesting Supervisor after
    Admin rejects a Task Change Request.
    """

    schedule_notifications(
        recipient_ids=[change_request.requested_by_id],
        notification_type=Notification.Type.TASK_CHANGE_REQUEST,
        title="Task change request rejected",
        message=(
            f"Your requested changes to task "
            f"'{change_request.task.title}' "
            "were rejected. Please review "
            "the Admin's feedback."
        ),
        reference_type="TASK_CHANGE_REQUEST",
        reference_id=change_request.id,
    )


# =====================================================
# TIMELINE REORDER REQUEST NOTIFICATION FOR ADMIN
# =====================================================


def notify_admins_timeline_reorder_requested(change_request):
    """
    Notify active Admins when a Supervisor submits
    an ORDER_CHANGE request for timeline reordering.

    Creates one notification per active Admin.
    """

    admin_ids = get_active_admin_ids()

    if not admin_ids:
        return

    schedule_notifications(
        recipient_ids=admin_ids,
        notification_type=Notification.Type.TASK_CHANGE_REQUEST,
        title="Timeline reorder requires approval",
        message=(
            "A Supervisor has requested a change "
            "to the task timeline order. "
            "Please review the proposed arrangement."
        ),
        reference_type="TASK_CHANGE_REQUEST",
        reference_id=change_request.id,
    )


# =====================================================
# TIMELINE REORDER APPROVED
# =====================================================


def notify_timeline_reorder_approved(change_request):
    """
    Notify the Supervisor who submitted the
    timeline reorder request after Admin approval.
    """

    schedule_notifications(
        recipient_ids=[change_request.requested_by_id],
        notification_type=Notification.Type.TASK_CHANGE_REQUEST,
        title="Timeline reorder approved",
        message=(
            "Your requested task timeline reorder " "has been approved and applied."
        ),
        reference_type="TASK_CHANGE_REQUEST",
        reference_id=change_request.id,
    )


# =====================================================
# TIMELINE REORDER REJECTED
# =====================================================


def notify_timeline_reorder_rejected(change_request):
    """
    Notify the Supervisor who submitted the
    timeline reorder request after Admin rejection.
    """

    schedule_notifications(
        recipient_ids=[change_request.requested_by_id],
        notification_type=Notification.Type.TASK_CHANGE_REQUEST,
        title="Timeline reorder rejected",
        message=(
            "Your requested task timeline reorder "
            "was rejected. Please review "
            "the Admin's feedback."
        ),
        reference_type="TASK_CHANGE_REQUEST",
        reference_id=change_request.id,
    )
