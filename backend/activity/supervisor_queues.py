from django.db.models import Exists, OuterRef

from projects.models import Project
from reports.models import (
    DailyReport,
    DailyTaskWork,
    DelayReport,
)
from reports.services import accessible_projects
from tasks.models import Task, TaskChangeRequest

from .dashboard_services import validate_dashboard_supervisor

# =====================================================
# SUPERVISOR ACTION ITEMS
# =====================================================


def get_supervisor_action_items(*, user):
    """
    Return a preview of the logged-in
    Supervisor's actionable records.

    All records are scoped to currently
    assigned projects.

    This service is read-only.
    """

    validate_dashboard_supervisor(user)

    limit = 5
    projects = accessible_projects(user)

    # ---------------------------------------------
    # REJECTED TASKS
    # ---------------------------------------------

    rejected_tasks = Task.objects.filter(
        project__in=projects,
        created_by=user,
        approval_status=Task.ApprovalStatus.REJECTED,
    ).order_by("-updated_at", "-id")

    rejected_task_items = [
        {
            "id": str(task.id),
            "project_id": str(task.project_id),
            "title": task.title,
            "approval_status": task.approval_status,
            "updated_at": task.updated_at.isoformat(),
        }
        for task in rejected_tasks[:limit]
    ]

    # ---------------------------------------------
    # MY DRAFT DAILY REPORTS
    # ---------------------------------------------

    draft_reports = DailyReport.objects.filter(
        project__in=projects,
        reported_by=user,
        status=DailyReport.Status.DRAFT,
    ).order_by("-updated_at", "-id")

    draft_report_items = [
        {
            "id": str(report.id),
            "project_id": str(report.project_id),
            "report_date": report.report_date.isoformat(),
            "status": report.status,
        }
        for report in draft_reports[:limit]
    ]

    # ---------------------------------------------
    # REJECTED WORK THAT HAS NOT BEEN CORRECTED
    # ---------------------------------------------

    # The correction_of field links a new work
    # entry to the original rejected entry.
    #
    # Exclude original entries that already have
    # a linked correction to avoid repeatedly
    # suggesting the same correction.

    linked_correction = DailyTaskWork.objects.filter(correction_of_id=OuterRef("pk"))

    rejected_work = (
        DailyTaskWork.objects.filter(
            daily_report__project__in=projects,
            daily_report__reported_by=user,
            verification_status=(DailyTaskWork.VerificationStatus.REJECTED),
        )
        .annotate(has_correction=Exists(linked_correction))
        .filter(has_correction=False)
        .select_related("task", "daily_report")
        .order_by("-verified_at", "-id")
    )

    rejected_work_items = [
        {
            "id": str(entry.id),
            "task_id": str(entry.task_id),
            "task_title": entry.task.title,
            "daily_report_id": str(entry.daily_report_id),
            "verification_status": entry.verification_status,
            "verification_note": entry.verification_note,
            "report_date": (entry.daily_report.report_date.isoformat()),
        }
        for entry in rejected_work[:limit]
    ]

    # ---------------------------------------------
    # MY PENDING TASK CHANGE REQUESTS
    # ---------------------------------------------

    pending_changes = (
        TaskChangeRequest.objects.filter(
            task__project__in=projects,
            requested_by=user,
            status=TaskChangeRequest.Status.PENDING,
        )
        .select_related("task")
        .order_by("-updated_at", "-id")
    )

    change_request_items = [
        {
            "id": str(change.id),
            "task_id": str(change.task_id),
            "task_title": change.task.title,
            "change_type": change.change_type,
            "status": change.status,
        }
        for change in pending_changes[:limit]
    ]

    # ---------------------------------------------
    # MY PENDING DELAY REPORTS
    # ---------------------------------------------

    pending_delays = (
        DelayReport.objects.filter(
            task__project__in=projects,
            reported_by=user,
            status=DelayReport.Status.PENDING,
        )
        .select_related("task")
        .order_by("-reported_at", "-id")
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
        for report in pending_delays[:limit]
    ]

    # ---------------------------------------------
    # MY PENDING DEADLINE EXTENSIONS
    # ---------------------------------------------

    pending_extensions = (
        DelayReport.objects.filter(
            task__project__in=projects,
            reported_by=user,
            extension_requested=True,
            extension_status=DelayReport.Status.PENDING,
        )
        .select_related("task")
        .order_by("-reported_at", "-id")
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
        }
        for report in pending_extensions[:limit]
    ]

    # ---------------------------------------------
    # RESPONSE
    # ---------------------------------------------

    return {
        "rejected_tasks": {
            "count": rejected_tasks.count(),
            "items": rejected_task_items,
        },
        "rejected_work_to_correct": {
            "count": rejected_work.count(),
            "items": rejected_work_items,
        },
        "draft_daily_reports": {
            "count": draft_reports.count(),
            "items": draft_report_items,
        },
        "pending_change_requests": {
            "count": pending_changes.count(),
            "items": change_request_items,
        },
        "pending_delay_reports": {
            "count": pending_delays.count(),
            "items": delay_items,
        },
        "pending_extensions": {
            "count": pending_extensions.count(),
            "items": extension_items,
        },
    }
