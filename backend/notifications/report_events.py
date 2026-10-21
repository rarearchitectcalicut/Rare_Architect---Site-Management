from .models import Notification
from .services import (
    get_active_admin_ids,
    schedule_notifications,
)

# =====================================================
# DAILY REPORT SUBMITTED
# =====================================================


def notify_admins_daily_report_submitted(report):
    """
    Notify every active Admin when a Supervisor
    successfully submits a Daily Report.

    Creates one notification per active Admin.
    """

    admin_ids = get_active_admin_ids()

    if not admin_ids:
        return

    report_date = report.report_date.isoformat()

    schedule_notifications(
        recipient_ids=admin_ids,
        notification_type=Notification.Type.DAILY_REPORT,
        title="Daily Report submitted",
        message=(
            f"A Daily Report for project "
            f"'{report.project.name}' dated "
            f"{report_date} has been submitted "
            "and is ready for review."
        ),
        reference_type="DAILY_REPORT",
        reference_id=report.id,
    )


# =====================================================
# DAILY TASK WORK VERIFIED NOTIFICATION
# =====================================================


def notify_daily_task_work_verified(work_entry):
    """
    Notify the Supervisor who submitted the
    Daily Report when Admin verifies a work entry.

    Notification is created after the surrounding
    transaction commits successfully.
    """

    report = work_entry.daily_report
    task = work_entry.task

    schedule_notifications(
        recipient_ids=[report.reported_by_id],
        notification_type=Notification.Type.DAILY_REPORT,
        title="Daily task work verified",
        message=(
            f"Your work entry for task '{task.title}' "
            f"in the Daily Report dated "
            f"{report.report_date.isoformat()} "
            "has been verified by Admin."
        ),
        reference_type="DAILY_TASK_WORK",
        reference_id=work_entry.id,
    )


# =====================================================
# DAILY TASK WORK REJECTED NOTIFICATION
# =====================================================

def notify_daily_task_work_rejected(entry):
    """
    Notify the Supervisor who submitted the
    Daily Report when Admin rejects a work entry.

    The original rejected work entry remains
    unchanged. Corrections use the separate
    correction workflow.
    """

    report = entry.daily_report

    schedule_notifications(
        recipient_ids=[report.reported_by_id],
        notification_type=Notification.Type.DAILY_REPORT,
        title="Daily task work rejected",
        message=(
            f"Your work entry for task '{entry.task.title}' "
            "has been rejected by Admin. "
            "Review the verification feedback and "
            "submit a corrected work entry."
        ),
        reference_type="DAILY_TASK_WORK",
        reference_id=entry.id,
    )


# =====================================================
# DELAY REPORT SUBMITTED
# =====================================================


def notify_admins_delay_report_submitted(delay_report):
    """
    Notify every active Admin when a Supervisor
    successfully submits a Delay Report.

    If a deadline extension is requested,
    include the proposed date in the message.
    """

    admin_ids = get_active_admin_ids()

    if not admin_ids:
        return

    task_title = delay_report.task.title

    if delay_report.extension_requested:
        requested_date = (
            delay_report.requested_end_date.isoformat()
            if delay_report.requested_end_date
            else "not specified"
        )

        title = "Delay and deadline extension requested"

        message = (
            f"A delay report for task '{task_title}' "
            "has been submitted with a deadline "
            f"extension request to {requested_date}. "
            "Both decisions require Admin review."
        )

    else:
        title = "New delay report requires review"

        message = (
            f"A delay report for task '{task_title}' "
            "has been submitted and requires "
            "Admin review."
        )

    schedule_notifications(
        recipient_ids=admin_ids,
        notification_type=Notification.Type.DELAY_REPORT,
        title=title,
        message=message,
        reference_type="DELAY_REPORT",
        reference_id=delay_report.id,
    )


# =====================================================
# DELAY REPORT APPROVED
# =====================================================


def notify_delay_report_approved(delay_report):
    """
    Notify the Supervisor who submitted the
    Delay Report after Admin approval.
    """

    schedule_notifications(
        recipient_ids=[delay_report.reported_by_id],
        notification_type=Notification.Type.DELAY_REPORT,
        title="Delay report approved",
        message=(
            f"Your delay report for task "
            f"'{delay_report.task.title}' "
            "has been approved by Admin."
        ),
        reference_type="DELAY_REPORT",
        reference_id=delay_report.id,
    )


# =====================================================
# DELAY REPORT REJECTED
# =====================================================


def notify_delay_report_rejected(delay_report):
    """
    Notify the Supervisor who submitted the
    Delay Report after Admin rejection.
    """

    schedule_notifications(
        recipient_ids=[delay_report.reported_by_id],
        notification_type=Notification.Type.DELAY_REPORT,
        title="Delay report rejected",
        message=(
            f"Your delay report for task "
            f"'{delay_report.task.title}' "
            "has been rejected by Admin. "
            "Please review the Admin's feedback."
        ),
        reference_type="DELAY_REPORT",
        reference_id=delay_report.id,
    )


# =====================================================
# DEADLINE EXTENSION APPROVED
# =====================================================


def notify_deadline_extension_approved(delay_report):
    """
    Notify the reporting Supervisor when Admin
    approves a requested deadline extension.

    The Task deadline has already been updated
    by the extension approval service.
    """

    new_end_date = delay_report.requested_end_date.isoformat()

    schedule_notifications(
        recipient_ids=[delay_report.reported_by_id],
        notification_type=Notification.Type.EXTENSION_REQUEST,
        title="Deadline extension approved",
        message=(
            f"Your deadline extension request for task "
            f"'{delay_report.task.title}' has been approved. "
            f"The new deadline is {new_end_date}."
        ),
        reference_type="DELAY_REPORT",
        reference_id=delay_report.id,
    )


# =====================================================
# DEADLINE EXTENSION REJECTED
# =====================================================


def notify_deadline_extension_rejected(delay_report):
    """
    Notify the reporting Supervisor when Admin
    rejects a requested deadline extension.

    The existing Task deadline remains unchanged.
    """

    schedule_notifications(
        recipient_ids=[delay_report.reported_by_id],
        notification_type=Notification.Type.EXTENSION_REQUEST,
        title="Deadline extension rejected",
        message=(
            f"Your deadline extension request for task "
            f"'{delay_report.task.title}' was rejected. "
            "The Task deadline remains unchanged. "
            "Please review the Admin's feedback."
        ),
        reference_type="DELAY_REPORT",
        reference_id=delay_report.id,
    )
