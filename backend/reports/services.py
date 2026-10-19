from django.db import transaction,IntegrityError
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework.exceptions import (
    PermissionDenied,
    ValidationError,
)
from tasks.models import Task
from projects.models import Project, ProjectSupervisor

from .models import DailyReport,DailyTaskWork
from .serializers import DailyReportCreateSerializer,DailyTaskWorkCreateSerializer

# =====================================================
# PROJECT ACCESS HELPERS
# =====================================================


def is_admin(user):
    return bool(
        user.is_authenticated
        and user.is_active
        and user.role == "ADMIN"
        and user.is_staff
    )


def is_supervisor(user):
    return bool(
        user.is_authenticated
        and user.is_active
        and user.role == "SUPERVISOR"
        and not user.is_staff
    )


def accessible_projects(user):
    if is_admin(user):
        return Project.objects.all()

    if is_supervisor(user):
        return Project.objects.filter(
            supervisor_assignments__supervisor=user
        ).distinct()

    return Project.objects.none()


def validate_report_supervisor(project, user):
    if not is_supervisor(user):
        raise PermissionDenied("Only active Supervisors can create reports.")

    if not ProjectSupervisor.objects.filter(
        project=project,
        supervisor=user,
    ).exists():
        raise PermissionDenied("You are not assigned to this project.")


def validate_report_project_status(project):
    if project.status not in {
        Project.Status.ACTIVE,
        Project.Status.MAINTENANCE,
    }:
        raise ValidationError(
            {
                "project": (
                    "Daily reports can only be created "
                    "for active or maintenance projects."
                )
            }
        )


# =====================================================
# CREATE DAILY REPORT DRAFT
# =====================================================


@transaction.atomic
def create_daily_report(*, project, supervisor, validated_data):
    project = Project.objects.select_for_update().get(pk=project.pk)

    validate_report_supervisor(project, supervisor)
    validate_report_project_status(project)

    report = DailyReport.objects.create(
        project=project,
        reported_by=supervisor,
        status=DailyReport.Status.DRAFT,
        submitted_at=None,
        **validated_data,
    )

    return report


# =====================================================
# UPDATE DAILY REPORT DRAFT
# =====================================================


@transaction.atomic
def update_daily_report(*, report_id, supervisor, data):
    report = get_object_or_404(
        DailyReport.objects.select_for_update(),
        pk=report_id,
    )

    validate_report_supervisor(report.project, supervisor)

    if report.reported_by_id != supervisor.id:
        raise PermissionDenied("Only the report creator can edit this draft.")

    if report.status != DailyReport.Status.DRAFT:
        raise ValidationError({"detail": "Submitted reports cannot be edited."})

    serializer = DailyReportCreateSerializer(
        instance=report,
        data=data,
        partial=True,
    )

    serializer.is_valid(raise_exception=True)

    for field, value in serializer.validated_data.items():
        setattr(report, field, value)

    if serializer.validated_data:
        report.save(
            update_fields=[
                *serializer.validated_data.keys(),
                "updated_at",
            ]
        )

    return report


# =====================================================
# SUBMIT DAILY REPORT
# =====================================================


@transaction.atomic
def submit_daily_report(*, report_id, supervisor):
    report = get_object_or_404(
        DailyReport.objects.select_for_update(),
        pk=report_id,
    )

    validate_report_supervisor(report.project, supervisor)

    if report.reported_by_id != supervisor.id:
        raise PermissionDenied("Only the report creator can submit it.")

    if report.status != DailyReport.Status.DRAFT:
        raise ValidationError({"detail": "This report has already been submitted."})

    if not report.work_summary.strip():
        raise ValidationError(
            {
                "work_summary": (
                    "Provide a work summary or explain " "why no work was performed."
                )
            }
        )

    report.status = DailyReport.Status.SUBMITTED
    report.submitted_at = timezone.now()

    report.full_clean()

    report.save(
        update_fields=[
            "status",
            "submitted_at",
            "updated_at",
        ]
    )

    return report


# =====================================================
# DAILY REPORT DRAFT ACCESS
# =====================================================


def validate_daily_report_draft(report, supervisor):
    """
    Only the original reporting Supervisor can
    modify an unsubmitted daily report.
    """

    validate_report_supervisor(
        report.project,
        supervisor,
    )

    if report.reported_by_id != supervisor.id:
        raise PermissionDenied("Only the report creator can add work entries.")

    if report.status != DailyReport.Status.DRAFT:
        raise ValidationError(
            {"detail": ("Work entries can only be added " "to draft daily reports.")}
        )


# =====================================================
# ADD DAILY TASK WORK
# =====================================================


@transaction.atomic
def add_daily_task_work(
    *,
    report_id,
    supervisor,
    validated_data,
):
    # Lock the report so submission and adding
    # work cannot happen simultaneously.
    report = get_object_or_404(
        DailyReport.objects.select_for_update().select_related("project"),
        pk=report_id,
    )

    validate_daily_report_draft(report, supervisor)

    # Revalidate task information against the
    # latest database state.
    task = validated_data.get("task")

    if task is None:
        raise ValidationError({"task": "Choose a task."})

    task = get_object_or_404(
        Task.objects.select_for_update(),
        pk=task.pk,
    )

    serializer = DailyTaskWorkCreateSerializer(
        data={
            **validated_data,
            "task": str(task.pk),
        },
        context={"daily_report": report},
    )
    serializer.is_valid(raise_exception=True)
    
    if task.work_status == Task.WorkStatus.COMPLETED:
        raise ValidationError({
            "task": "Completed tasks cannot receive new work entries."
        })

    # The serializer checks project membership,
    # task approval and measurement type.
    data = serializer.validated_data

    try:
        # The savepoint allows the outer transaction
        # to handle a uniqueness violation cleanly.
        with transaction.atomic():
            entry = DailyTaskWork.objects.create(
                daily_report=report,
                task=task,
                work_description=data["work_description"],
                location_detail=data.get("location_detail", ""),
                quantity_completed_today=data.get("quantity_completed_today"),
                completion_claimed=data.get("completion_claimed", False),
                verification_status=(DailyTaskWork.VerificationStatus.PENDING),
            )
    except IntegrityError:
        raise ValidationError(
            {"task": ("This task is already included " "in the daily report.")}
        )

    return entry
