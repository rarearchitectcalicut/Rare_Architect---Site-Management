from rest_framework.exceptions import PermissionDenied

from projects.models import Project
from tasks.models import Task, TaskChangeRequest
from reports.models import (
    DailyReport,
    DailyTaskWork,
    DelayReport,
)
from notifications.models import Notification
from reports.services import accessible_projects

# =====================================================
# ADMIN DASHBOARD PERMISSION
# =====================================================


def validate_dashboard_admin(user):
    """
    Only active, authorized Admin accounts
    can access the Admin Dashboard.
    """

    if not (
        user.is_authenticated
        and user.is_active
        and user.role == "ADMIN"
        and user.is_staff
    ):
        raise PermissionDenied("Only Admins can access this dashboard.")


# =====================================================
# ADMIN DASHBOARD METRICS
# =====================================================


def get_admin_dashboard_summary(*, user):
    """
    Calculate live dashboard metrics.

    This function only reads database records.
    It does not change business state or
    create Activity Logs.
    """

    validate_dashboard_admin(user)

    # ---------------------------------------------
    # PROJECT STATISTICS
    # ---------------------------------------------

    project_metrics = {
        "total": Project.objects.count(),
        "active": Project.objects.filter(status=Project.Status.ACTIVE).count(),
        "maintenance": Project.objects.filter(
            status=Project.Status.MAINTENANCE
        ).count(),
    }

    # ---------------------------------------------
    # TASK STATISTICS
    # ---------------------------------------------

    task_metrics = {
        "total": Task.objects.count(),
        "pending_approval": Task.objects.filter(
            approval_status=Task.ApprovalStatus.PENDING
        ).count(),
        "approved": Task.objects.filter(
            approval_status=Task.ApprovalStatus.APPROVED
        ).count(),
        "rejected": Task.objects.filter(
            approval_status=Task.ApprovalStatus.REJECTED
        ).count(),
        "completed": Task.objects.filter(work_status=Task.WorkStatus.COMPLETED).count(),
    }

    # ---------------------------------------------
    # TASK CHANGE REQUEST STATISTICS
    # ---------------------------------------------

    pending_change_requests = TaskChangeRequest.objects.filter(
        status=TaskChangeRequest.Status.PENDING
    )

    change_request_metrics = {
        "pending_total": pending_change_requests.count(),
        "pending_edits": pending_change_requests.filter(
            change_type=TaskChangeRequest.ChangeType.EDIT
        ).count(),
        "pending_timeline_reorders": (
            pending_change_requests.filter(
                change_type=(TaskChangeRequest.ChangeType.ORDER_CHANGE)
            ).count()
        ),
    }

    # ---------------------------------------------
    # DAILY REPORT STATISTICS
    # ---------------------------------------------

    daily_report_metrics = {
        "total": DailyReport.objects.count(),
        "draft": DailyReport.objects.filter(status=DailyReport.Status.DRAFT).count(),
        "submitted": DailyReport.objects.filter(
            status=DailyReport.Status.SUBMITTED
        ).count(),
    }

    # ---------------------------------------------
    # DAILY TASK WORK VERIFICATION
    # ---------------------------------------------

    work_metrics = {
        "pending_verification": (
            DailyTaskWork.objects.filter(
                daily_report__status=(DailyReport.Status.SUBMITTED),
                verification_status=(DailyTaskWork.VerificationStatus.PENDING),
            ).count()
        ),
        "verified": DailyTaskWork.objects.filter(
            verification_status=(DailyTaskWork.VerificationStatus.VERIFIED)
        ).count(),
        "rejected": DailyTaskWork.objects.filter(
            verification_status=(DailyTaskWork.VerificationStatus.REJECTED)
        ).count(),
    }

    # ---------------------------------------------
    # DELAY REPORT STATISTICS
    # ---------------------------------------------

    delay_metrics = {
        "pending_review": DelayReport.objects.filter(
            status=DelayReport.Status.PENDING
        ).count(),
        "approved": DelayReport.objects.filter(
            status=DelayReport.Status.APPROVED
        ).count(),
        "rejected": DelayReport.objects.filter(
            status=DelayReport.Status.REJECTED
        ).count(),
        "pending_extensions": DelayReport.objects.filter(
            extension_requested=True,
            extension_status=DelayReport.Status.PENDING,
        ).count(),
    }

    # ---------------------------------------------
    # CURRENT ADMIN NOTIFICATIONS
    # ---------------------------------------------

    unread_notifications = Notification.objects.filter(
        recipient=user,
        is_read=False,
    ).count()

    # ---------------------------------------------
    # RESPONSE
    # ---------------------------------------------

    return {
        "projects": project_metrics,
        "tasks": task_metrics,
        "change_requests": change_request_metrics,
        "daily_reports": daily_report_metrics,
        "daily_task_work": work_metrics,
        "delay_reports": delay_metrics,
        "notifications": {
            "unread_count": unread_notifications,
        },
    }


# =====================================================
# SUPERVISOR DASHBOARD PERMISSION
# =====================================================


def validate_dashboard_supervisor(user):
    """
    Only active Supervisor accounts can
    access the Supervisor Dashboard.
    """

    if not (
        user.is_authenticated
        and user.is_active
        and user.role == "SUPERVISOR"
        and not user.is_staff
    ):
        raise PermissionDenied("Only Supervisors can access this dashboard.")


# =====================================================
# SUPERVISOR DASHBOARD SUMMARY
# =====================================================


def get_supervisor_dashboard_summary(*, user):
    """
    Calculate Supervisor dashboard statistics.

    Project-level metrics include only assigned
    projects. Personal task metrics include
    only tasks created by this Supervisor.

    This service is read-only.
    """

    validate_dashboard_supervisor(user)

    # ---------------------------------------------
    # ASSIGNED PROJECTS
    # ---------------------------------------------

    projects = accessible_projects(user)

    project_metrics = {
        "total_assigned": projects.count(),
        "active": projects.filter(status=Project.Status.ACTIVE).count(),
        "maintenance": projects.filter(status=Project.Status.MAINTENANCE).count(),
    }

    # ---------------------------------------------
    # MY TASKS
    # ---------------------------------------------

    my_tasks = Task.objects.filter(
        project__in=projects,
        created_by=user,
    )

    task_metrics = {
        "total_created": my_tasks.count(),
        "pending_approval": my_tasks.filter(
            approval_status=Task.ApprovalStatus.PENDING
        ).count(),
        "approved": my_tasks.filter(
            approval_status=Task.ApprovalStatus.APPROVED
        ).count(),
        "rejected": my_tasks.filter(
            approval_status=Task.ApprovalStatus.REJECTED
        ).count(),
        "completed": my_tasks.filter(work_status=Task.WorkStatus.COMPLETED).count(),
    }

    # ---------------------------------------------
    # DAILY REPORTS IN ASSIGNED PROJECTS
    # ---------------------------------------------

    project_reports = DailyReport.objects.filter(project__in=projects)

    daily_report_metrics = {
        "total": project_reports.count(),
        "draft": project_reports.filter(status=DailyReport.Status.DRAFT).count(),
        "submitted": project_reports.filter(
            status=DailyReport.Status.SUBMITTED
        ).count(),
    }

    # ---------------------------------------------
    # WORK VERIFICATION IN ASSIGNED PROJECTS
    # ---------------------------------------------

    work_entries = DailyTaskWork.objects.filter(daily_report__project__in=projects)

    work_metrics = {
        "pending_verification": work_entries.filter(
            daily_report__status=DailyReport.Status.SUBMITTED,
            verification_status=(DailyTaskWork.VerificationStatus.PENDING),
        ).count(),
        "verified": work_entries.filter(
            verification_status=(DailyTaskWork.VerificationStatus.VERIFIED)
        ).count(),
        "rejected": work_entries.filter(
            verification_status=(DailyTaskWork.VerificationStatus.REJECTED)
        ).count(),
    }

    # ---------------------------------------------
    # MY DELAY REPORTS
    # ---------------------------------------------

    my_delays = DelayReport.objects.filter(
        task__project__in=projects,
        reported_by=user,
    )

    delay_metrics = {
        "total_submitted": my_delays.count(),
        "pending_review": my_delays.filter(status=DelayReport.Status.PENDING).count(),
        "approved": my_delays.filter(status=DelayReport.Status.APPROVED).count(),
        "rejected": my_delays.filter(status=DelayReport.Status.REJECTED).count(),
        "pending_extensions": my_delays.filter(
            extension_requested=True,
            extension_status=DelayReport.Status.PENDING,
        ).count(),
        "approved_extensions": my_delays.filter(
            extension_requested=True,
            extension_status=DelayReport.Status.APPROVED,
        ).count(),
        "rejected_extensions": my_delays.filter(
            extension_requested=True,
            extension_status=DelayReport.Status.REJECTED,
        ).count(),
    }

    # ---------------------------------------------
    # MY UNREAD NOTIFICATIONS
    # ---------------------------------------------

    unread_notifications = Notification.objects.filter(
        recipient=user,
        is_read=False,
    ).count()

    # ---------------------------------------------
    # RESPONSE
    # ---------------------------------------------

    return {
        "projects": project_metrics,
        "my_tasks": task_metrics,
        "project_daily_reports": daily_report_metrics,
        "project_daily_task_work": work_metrics,
        "my_delay_reports": delay_metrics,
        "notifications": {
            "unread_count": unread_notifications,
        },
    }
