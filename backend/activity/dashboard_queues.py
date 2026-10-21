from activity.models import ActivityLog

from tasks.models import Task, TaskChangeRequest
from reports.models import (
    DailyReport,
    DailyTaskWork,
    DelayReport,
)

from .dashboard_services import validate_dashboard_admin

# =====================================================
# ADMIN DASHBOARD REVIEW QUEUE
# =====================================================


def get_admin_dashboard_review_queue(*, user):
    """
    Return a compact preview of pending review
    records and recent system activity.

    Admin-only and read-only.
    """

    validate_dashboard_admin(user)

    limit = 5

    # ---------------------------------------------
    # PENDING TASK APPROVALS
    # ---------------------------------------------

    pending_tasks = Task.objects.filter(
        approval_status=Task.ApprovalStatus.PENDING
    ).order_by("-updated_at", "-id")[:limit]

    task_items = [
        {
            "id": str(task.id),
            "project_id": str(task.project_id),
            "title": task.title,
            "approval_status": task.approval_status,
        }
        for task in pending_tasks
    ]

    # ---------------------------------------------
    # PENDING TASK CHANGE REQUESTS
    # ---------------------------------------------

    pending_changes = (
        TaskChangeRequest.objects.filter(status=TaskChangeRequest.Status.PENDING)
        .select_related("task")
        .order_by("-updated_at", "-id")[:limit]
    )

    change_items = [
        {
            "id": str(change.id),
            "task_id": str(change.task_id),
            "task_title": change.task.title,
            "change_type": change.change_type,
            "status": change.status,
        }
        for change in pending_changes
    ]

    # ---------------------------------------------
    # DAILY TASK WORK AWAITING VERIFICATION
    # ---------------------------------------------

    pending_work = (
        DailyTaskWork.objects.filter(
            daily_report__status=DailyReport.Status.SUBMITTED,
            verification_status=(DailyTaskWork.VerificationStatus.PENDING),
        )
        .select_related("task", "daily_report")
        .order_by("-daily_report__report_date", "-id")[:limit]
    )

    work_items = [
        {
            "id": str(entry.id),
            "task_id": str(entry.task_id),
            "task_title": entry.task.title,
            "daily_report_id": str(entry.daily_report_id),
            "verification_status": entry.verification_status,
        }
        for entry in pending_work
    ]

    # ---------------------------------------------
    # PENDING DELAY REPORTS
    # ---------------------------------------------

    pending_delays = (
        DelayReport.objects.filter(status=DelayReport.Status.PENDING)
        .select_related("task")
        .order_by("-reported_at", "-id")[:limit]
    )

    delay_items = [
        {
            "id": str(report.id),
            "task_id": str(report.task_id),
            "task_title": report.task.title,
            "delay_type": report.delay_type,
            "status": report.status,
            "extension_requested": report.extension_requested,
        }
        for report in pending_delays
    ]

    # ---------------------------------------------
    # PENDING EXTENSION DECISIONS
    # ---------------------------------------------

    pending_extensions = (
        DelayReport.objects.filter(
            extension_requested=True,
            extension_status=DelayReport.Status.PENDING,
        )
        .select_related("task")
        .order_by("-reported_at", "-id")[:limit]
    )

    extension_items = [
        {
            "id": str(report.id),
            "task_id": str(report.task_id),
            "task_title": report.task.title,
            "delay_status": report.status,
            "extension_status": report.extension_status,
            "requested_end_date": (
                report.requested_end_date.isoformat()
                if report.requested_end_date
                else None
            ),
            "ready_for_approval": (report.status == DelayReport.Status.APPROVED),
        }
        for report in pending_extensions
    ]

    # ---------------------------------------------
    # RECENT ACTIVITY
    # ---------------------------------------------

    recent_logs = ActivityLog.objects.select_related("actor").order_by(
        "-created_at", "-id"
    )[:10]

    activity_items = [
        {
            "id": str(log.id),
            "actor_id": (str(log.actor_id) if log.actor_id else None),
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": (str(log.entity_id) if log.entity_id else None),
            "description": log.description,
            "created_at": log.created_at.isoformat(),
        }
        for log in recent_logs
    ]

    # ---------------------------------------------
    # RETURN DASHBOARD DATA
    # ---------------------------------------------

    return {
        "pending_task_approvals": task_items,
        "pending_change_requests": change_items,
        "pending_work_verifications": work_items,
        "pending_delay_reports": delay_items,
        "pending_extensions": extension_items,
        "recent_activity": activity_items,
    }
