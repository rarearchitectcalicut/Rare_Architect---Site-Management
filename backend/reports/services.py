from django.db import transaction,IntegrityError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import (
    PermissionDenied,
    ValidationError,
)
from tasks.models import Task,TaskHistory
from projects.models import Project, ProjectSupervisor
from pathlib import Path
from django.db.models import Sum
from decimal import Decimal, ROUND_HALF_UP
from activity.services import create_activity_log
from .models import (
    DailyReport,
    DailyTaskWork,
    DailyReport,
    DailyManpower,
    DailyMaterialEntry,
    DailyReportAttachment,
    DelayReport
)
from .serializers import (
    DailyReportCreateSerializer,
    DailyTaskWorkCreateSerializer,
    DailyTaskWorkUpdateSerializer,
    DailyManpowerCreateSerializer,
    DailyMaterialEntryCreateSerializer,
    DailyReportAttachmentUploadSerializer,
    DailyTaskWorkCreateSerializer,
    DelayReportCreateSerializer
)
from notifications.report_events import (
    notify_admins_daily_report_submitted,
    notify_daily_task_work_verified,
    notify_daily_task_work_rejected,
    notify_admins_delay_report_submitted,
    notify_delay_report_approved,
    notify_delay_report_rejected,
    notify_deadline_extension_approved,
    notify_deadline_extension_rejected,
)

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
# ACCESSIBLE DELAY REPORTS
# =====================================================


def accessible_delay_reports(user):
    """
    Admins can see all delay reports.

    Supervisors can see reports associated
    with their currently assigned projects.
    """

    return (
        DelayReport.objects.filter(task__project__in=accessible_projects(user))
        .select_related(
            "task",
            "task__project",
            "reported_by",
            "reviewed_by",
            "extension_reviewed_by",
        )
        .distinct()
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

    create_activity_log(
        actor=supervisor,
        action="DAILY_REPORT_CREATED",
        entity_type="DAILY_REPORT",
        entity_id=report.id,
        description="Daily report created.",
        metadata={
            "daily_report_id": str(report.id),
            "project_id": str(report.project_id),
            "new_status": report.status,
            "report_date": report.report_date.isoformat(),
        },
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

    activity_changed_fields = sorted(
        field for field, value in serializer.validated_data.items()
        if getattr(report, field) != value
    )

    for field, value in serializer.validated_data.items():
        setattr(report, field, value)

    if serializer.validated_data:
        report.save(
            update_fields=[
                *serializer.validated_data.keys(),
                "updated_at",
            ]
        )

    if activity_changed_fields:
        create_activity_log(
            actor=supervisor,
            action="DAILY_REPORT_UPDATED",
            entity_type="DAILY_REPORT",
            entity_id=report.id,
            description="Daily report updated.",
            metadata={
                "daily_report_id": str(report.id),
                "project_id": str(report.project_id),
                "changed_fields": activity_changed_fields,
            },
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
    
    create_activity_log(
        actor=supervisor,
        action="DAILY_REPORT_SUBMITTED",
        entity_type="DAILY_REPORT",
        entity_id=report.id,
        description="Daily report submitted.",
        metadata={
            "daily_report_id": str(report.id),
            "project_id": str(report.project_id),
            "old_status": DailyReport.Status.DRAFT,
            "new_status": report.status,
        },
    )

    notify_admins_daily_report_submitted(report)

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

    create_activity_log(
        actor=supervisor,
        action="DAILY_TASK_WORK_ADDED",
        entity_type="DAILY_TASK_WORK",
        entity_id=entry.id,
        description="Daily task work added.",
        metadata={
            "daily_report_id": str(entry.daily_report_id),
            "project_id": str(entry.daily_report.project_id),
            "task_id": str(entry.task_id),
        },
    )

    return entry


# =====================================================
# LOCK A DRAFT WORK ENTRY
# =====================================================


def get_locked_draft_work_entry(*, entry_id, supervisor):
    """
    Must be called inside transaction.atomic().

    Lock the parent report first, then the entry.
    This prevents edits from racing with submission.
    """

    existing_entry = get_object_or_404(
        DailyTaskWork.objects.only(
            "id",
            "daily_report_id",
        ),
        pk=entry_id,
    )

    report = get_object_or_404(
        DailyReport.objects.select_for_update().select_related("project"),
        pk=existing_entry.daily_report_id,
    )

    validate_daily_report_draft(report, supervisor)

    entry = get_object_or_404(
        DailyTaskWork.objects.select_for_update().select_related(
            "task", "daily_report"
        ),
        pk=entry_id,
        daily_report=report,
    )

    if entry.verification_status != DailyTaskWork.VerificationStatus.PENDING:
        raise ValidationError({"detail": "Reviewed work entries cannot be modified."})

    return entry


# =====================================================
# UPDATE DAILY TASK WORK
# =====================================================


@transaction.atomic
def update_daily_task_work(*, entry_id, supervisor, data):
    entry = get_locked_draft_work_entry(
        entry_id=entry_id,
        supervisor=supervisor,
    )

    allowed_fields = {
        "work_description",
        "location_detail",
        "quantity_completed_today",
        "completion_claimed",
    }

    unsupported_fields = set(data) - allowed_fields

    if unsupported_fields:
        raise ValidationError(
            {"detail": ("Unsupported fields: " + ", ".join(sorted(unsupported_fields)))}
        )

    serializer = DailyTaskWorkUpdateSerializer(
        instance=entry,
        data=data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)

    activity_changed_fields = sorted(
        field for field, value in serializer.validated_data.items()
        if getattr(entry, field) != value
    )

    for field, value in serializer.validated_data.items():
        setattr(entry, field, value)

    if serializer.validated_data:
        entry.full_clean()

        entry.save(
            update_fields=[
                *serializer.validated_data.keys(),
                "updated_at",
            ]
        )

    if activity_changed_fields:
        create_activity_log(
            actor=supervisor,
            action="DAILY_TASK_WORK_UPDATED",
            entity_type="DAILY_TASK_WORK",
            entity_id=entry.id,
            description="Daily task work updated.",
            metadata={
                "daily_report_id": str(entry.daily_report_id),
                "project_id": str(entry.daily_report.project_id),
                "task_id": str(entry.task_id),
                "changed_fields": activity_changed_fields,
            },
        )

    return entry


# =====================================================
# DELETE DAILY TASK WORK
# =====================================================


@transaction.atomic
def delete_daily_task_work(*, entry_id, supervisor):
    entry = get_locked_draft_work_entry(
        entry_id=entry_id,
        supervisor=supervisor,
    )

    # Attachments use PROTECT, so remove/reassign
    # draft attachments first through their own API.
    if entry.attachments.exists():
        raise ValidationError(
            {
                "detail": (
                    "This entry has attachments. " "Remove its draft attachments first."
                )
            }
        )

    deleted_id = entry.id
    entry.delete()

    create_activity_log(
        actor=supervisor,
        action="DAILY_TASK_WORK_DELETED",
        entity_type="DAILY_TASK_WORK",
        entity_id=deleted_id,
        description="Daily task work deleted.",
        metadata={
            "daily_report_id": str(entry.daily_report_id),
            "project_id": str(entry.daily_report.project_id),
            "task_id": str(entry.task_id),
        },
    )


# =====================================================
# DAILY MANPOWER SERVICES
# =====================================================

MANPOWER_EDITABLE_FIELDS = {
    "trade",
    "contractor_name",
    "worker_count",
    "hours_worked",
    "remarks",
}


@transaction.atomic
def add_daily_manpower(*, report_id, supervisor, data):
    report = get_object_or_404(
        DailyReport.objects.select_for_update().select_related("project"),
        pk=report_id,
    )

    validate_daily_report_draft(report, supervisor)

    unknown_fields = set(data) - MANPOWER_EDITABLE_FIELDS
    if unknown_fields:
        raise ValidationError(
            {"detail": ("Unsupported fields: " + ", ".join(sorted(unknown_fields)))}
        )

    serializer = DailyManpowerCreateSerializer(data=data)
    serializer.is_valid(raise_exception=True)

    entry = DailyManpower(
        daily_report=report,
        **serializer.validated_data,
    )
    entry.full_clean()
    entry.save()

    create_activity_log(
        actor=supervisor,
        action="DAILY_MANPOWER_ADDED",
        entity_type="DAILY_MANPOWER",
        entity_id=entry.id,
        description="Daily manpower added.",
        metadata={
            "daily_report_id": str(entry.daily_report_id),
            "project_id": str(entry.daily_report.project_id),
        },
    )

    return entry


def get_locked_draft_manpower(*, entry_id, supervisor):
    """
    Call only within transaction.atomic().
    Lock the parent report before locking the entry.
    """

    existing = get_object_or_404(
        DailyManpower.objects.only("id", "daily_report_id"),
        pk=entry_id,
    )

    report = get_object_or_404(
        DailyReport.objects.select_for_update().select_related("project"),
        pk=existing.daily_report_id,
    )

    validate_daily_report_draft(report, supervisor)

    return get_object_or_404(
        DailyManpower.objects.select_for_update(),
        pk=entry_id,
        daily_report=report,
    )


@transaction.atomic
def update_daily_manpower(*, entry_id, supervisor, data):
    entry = get_locked_draft_manpower(
        entry_id=entry_id,
        supervisor=supervisor,
    )

    unknown_fields = set(data) - MANPOWER_EDITABLE_FIELDS
    if unknown_fields:
        raise ValidationError(
            {"detail": ("Unsupported fields: " + ", ".join(sorted(unknown_fields)))}
        )

    serializer = DailyManpowerCreateSerializer(
        instance=entry,
        data=data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)

    activity_changed_fields = sorted(
        field for field, value in serializer.validated_data.items()
        if getattr(entry, field) != value
    )

    for field, value in serializer.validated_data.items():
        setattr(entry, field, value)

    entry.full_clean()

    if serializer.validated_data:
        entry.save(update_fields=list(serializer.validated_data))

    if activity_changed_fields:
        create_activity_log(
            actor=supervisor,
            action="DAILY_MANPOWER_UPDATED",
            entity_type="DAILY_MANPOWER",
            entity_id=entry.id,
            description="Daily manpower updated.",
            metadata={
                "daily_report_id": str(entry.daily_report_id),
                "project_id": str(entry.daily_report.project_id),
                "changed_fields": activity_changed_fields,
            },
        )

    return entry


@transaction.atomic
def delete_daily_manpower(*, entry_id, supervisor):
    entry = get_locked_draft_manpower(
        entry_id=entry_id,
        supervisor=supervisor,
    )

    deleted_id = entry.id
    entry.delete()

    create_activity_log(
        actor=supervisor,
        action="DAILY_MANPOWER_DELETED",
        entity_type="DAILY_MANPOWER",
        entity_id=deleted_id,
        description="Daily manpower deleted.",
        metadata={
            "daily_report_id": str(entry.daily_report_id),
            "project_id": str(entry.daily_report.project_id),
        },
    )


# =====================================================
# DAILY MATERIAL SERVICES
# =====================================================

MATERIAL_EDITABLE_FIELDS = {
    "material_name",
    "entry_type",
    "quantity",
    "unit",
    "remarks",
}


def validate_material_fields(data):
    unknown = set(data) - MATERIAL_EDITABLE_FIELDS

    if unknown:
        raise ValidationError(
            {"detail": ("Unsupported fields: " + ", ".join(sorted(unknown)))}
        )


def save_validated_material(entry, *, update_fields=None):
    """
    Run model validation and translate any errors
    into normal DRF 400 responses.
    """
    try:
        entry.full_clean()
    except DjangoValidationError as exc:
        if hasattr(exc, "message_dict"):
            raise ValidationError(exc.message_dict)
        raise ValidationError(exc.messages)

    if update_fields is None:
        entry.save()
    elif update_fields:
        entry.save(update_fields=update_fields)

    return entry


# =====================================================
# ADD MATERIAL TO A DRAFT REPORT
# =====================================================


@transaction.atomic
def add_daily_material(*, report_id, supervisor, data):
    report = get_object_or_404(
        DailyReport.objects.select_for_update().select_related("project"),
        pk=report_id,
    )

    validate_daily_report_draft(report, supervisor)
    validate_material_fields(data)

    serializer = DailyMaterialEntryCreateSerializer(data=data)
    serializer.is_valid(raise_exception=True)

    entry = DailyMaterialEntry(
        daily_report=report,
        **serializer.validated_data,
    )

    save_validated_material(entry)

    create_activity_log(
        actor=supervisor,
        action="DAILY_MATERIAL_ADDED",
        entity_type="DAILY_MATERIAL",
        entity_id=entry.id,
        description="Daily material added.",
        metadata={
            "daily_report_id": str(entry.daily_report_id),
            "project_id": str(entry.daily_report.project_id),
        },
    )

    return entry


# =====================================================
# LOCK DRAFT MATERIAL ENTRY
# =====================================================


def get_locked_draft_material(*, entry_id, supervisor):
    """
    Must be called within transaction.atomic().

    Lock the parent report before the entry,
    preventing edits after report submission.
    """

    existing = get_object_or_404(
        DailyMaterialEntry.objects.only(
            "id",
            "daily_report_id",
        ),
        pk=entry_id,
    )

    report = get_object_or_404(
        DailyReport.objects.select_for_update().select_related("project"),
        pk=existing.daily_report_id,
    )

    validate_daily_report_draft(report, supervisor)

    return get_object_or_404(
        DailyMaterialEntry.objects.select_for_update(),
        pk=entry_id,
        daily_report=report,
    )


# =====================================================
# UPDATE DRAFT MATERIAL
# =====================================================


@transaction.atomic
def update_daily_material(*, entry_id, supervisor, data):
    entry = get_locked_draft_material(
        entry_id=entry_id,
        supervisor=supervisor,
    )

    validate_material_fields(data)

    serializer = DailyMaterialEntryCreateSerializer(
        instance=entry,
        data=data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)

    activity_changed_fields = sorted(
        field for field, value in serializer.validated_data.items()
        if getattr(entry, field) != value
    )

    for field, value in serializer.validated_data.items():
        setattr(entry, field, value)

    changed_fields = list(serializer.validated_data)

    # full_clean() also catches problems arising from
    # combinations of existing and newly supplied values.
    save_validated_material(
        entry,
        update_fields=changed_fields,
    )

    if activity_changed_fields:
        create_activity_log(
            actor=supervisor,
            action="DAILY_MATERIAL_UPDATED",
            entity_type="DAILY_MATERIAL",
            entity_id=entry.id,
            description="Daily material updated.",
            metadata={
                "daily_report_id": str(entry.daily_report_id),
                "project_id": str(entry.daily_report.project_id),
                "changed_fields": activity_changed_fields,
            },
        )

    return entry


# =====================================================
# DELETE DRAFT MATERIAL
# =====================================================


@transaction.atomic
def delete_daily_material(*, entry_id, supervisor):
    entry = get_locked_draft_material(
        entry_id=entry_id,
        supervisor=supervisor,
    )

    deleted_id = entry.id
    entry.delete()

    create_activity_log(
        actor=supervisor,
        action="DAILY_MATERIAL_DELETED",
        entity_type="DAILY_MATERIAL",
        entity_id=deleted_id,
        description="Daily material deleted.",
        metadata={
            "daily_report_id": str(entry.daily_report_id),
            "project_id": str(entry.daily_report.project_id),
        },
    )


# =====================================================
# DAILY REPORT ATTACHMENT UPLOAD
# =====================================================


@transaction.atomic
def upload_daily_report_attachment(
    *,
    report_id,
    supervisor,
    data,
):
    report = get_object_or_404(
        DailyReport.objects.select_for_update().select_related("project"),
        pk=report_id,
    )

    validate_daily_report_draft(
        report,
        supervisor,
    )

    serializer = DailyReportAttachmentUploadSerializer(
        data=data,
        context={"daily_report": report},
    )
    serializer.is_valid(raise_exception=True)

    uploaded_file = serializer.validated_data["file"]

    original_filename = Path(uploaded_file.name).name[:255]

    attachment = DailyReportAttachment(
        daily_report=report,
        task_work=serializer.validated_data.get("task_work"),
        original_filename=original_filename,
        file_size=uploaded_file.size,
        caption=serializer.validated_data.get("caption", ""),
        uploaded_by=supervisor,
    )

    # FileField saves the file to private storage.
    # If DB validation or saving fails, remove
    # the newly written file.
    try:
        attachment.file.save(
            uploaded_file.name,
            uploaded_file,
            save=False,
        )

        attachment.full_clean()
        attachment.save()

        create_activity_log(
            actor=supervisor,
            action="DAILY_ATTACHMENT_UPLOADED",
            entity_type="DAILY_REPORT_ATTACHMENT",
            entity_id=attachment.id,
            description="Daily report attachment uploaded.",
            metadata={
                "daily_report_id": str(report.id),
                "project_id": str(report.project_id),
                "file_size": attachment.file_size,
                "task_work_id": str(attachment.task_work_id) if attachment.task_work_id else None,
            },
        )

    except Exception:
        if attachment.file.name:
            attachment.file.delete(save=False)
        raise

    return attachment


# =====================================================
# LOCK A DRAFT ATTACHMENT
# =====================================================


def get_locked_draft_attachment(
    *,
    attachment_id,
    supervisor,
):
    """
    Must be called inside transaction.atomic().

    Lock the parent report before deleting
    the attachment so submission and deletion
    cannot happen at the same time.
    """

    existing = get_object_or_404(
        DailyReportAttachment.objects.only(
            "id",
            "daily_report_id",
        ),
        pk=attachment_id,
    )

    report = get_object_or_404(
        DailyReport.objects.select_for_update().select_related("project"),
        pk=existing.daily_report_id,
    )

    validate_daily_report_draft(
        report,
        supervisor,
    )

    return get_object_or_404(
        DailyReportAttachment.objects.select_for_update(),
        pk=attachment_id,
        daily_report=report,
    )


# =====================================================
# DELETE DRAFT ATTACHMENT
# =====================================================


@transaction.atomic
def delete_daily_report_attachment(
    *,
    attachment_id,
    supervisor,
):
    attachment = get_locked_draft_attachment(
        attachment_id=attachment_id,
        supervisor=supervisor,
    )

    # Save the storage reference before deleting
    # the database record.
    storage = attachment.file.storage
    stored_name = attachment.file.name

    # Delete database metadata first.
    deleted_id = attachment.id
    attachment.delete()

    create_activity_log(
        actor=supervisor,
        action="DAILY_ATTACHMENT_DELETED",
        entity_type="DAILY_REPORT_ATTACHMENT",
        entity_id=deleted_id,
        description="Daily report attachment deleted.",
        metadata={
            "daily_report_id": str(attachment.daily_report_id),
            "project_id": str(attachment.daily_report.project_id),
        },
    )

    # Delete the physical file only after the
    # database transaction successfully commits.
    if stored_name:
        transaction.on_commit(
            lambda: storage.delete(stored_name),
        )


# =====================================================
# ADMIN DAILY WORK REVIEW
# =====================================================


def validate_work_reviewer(admin_user):
    if not is_admin(admin_user):
        raise PermissionDenied("Only active Admins can review daily work.")


def get_locked_pending_work(*, entry_id):
    """
    Must be called inside transaction.atomic().

    Consistent lock order:
    1. Parent DailyReport
    2. Task
    3. DailyTaskWork

    Locking the task serializes verification
    of work entries from different reports
    belonging to that same task.
    """

    reference = get_object_or_404(
        DailyTaskWork.objects.only(
            "id",
            "daily_report_id",
            "task_id",
        ),
        pk=entry_id,
    )

    report = get_object_or_404(
        DailyReport.objects.select_for_update(),
        pk=reference.daily_report_id,
    )

    task = get_object_or_404(
        Task.objects.select_for_update(),
        pk=reference.task_id,
    )

    entry = get_object_or_404(
        DailyTaskWork.objects.select_for_update().select_related(
            "daily_report", "task"
        ),
        pk=entry_id,
        daily_report_id=report.id,
        task_id=task.id,
    )

    if report.status != DailyReport.Status.SUBMITTED:
        raise ValidationError(
            {"detail": ("Only work from submitted reports " "can be reviewed.")}
        )

    if entry.verification_status != DailyTaskWork.VerificationStatus.PENDING:
        raise ValidationError(
            {"detail": ("This work entry has already been reviewed.")}
        )

    if task.project_id != report.project_id:
        raise ValidationError(
            {"task": ("Task does not belong to " "this daily report's project.")}
        )

    if task.approval_status != Task.ApprovalStatus.APPROVED:
        raise ValidationError({"task": "The task must be approved."})

    return entry, task


def save_reviewed_work(entry):
    """
    Convert Django model-validation errors
    to standard API validation responses.
    """

    try:
        entry.full_clean()

    except DjangoValidationError as exc:
        if hasattr(exc, "message_dict"):
            raise ValidationError(exc.message_dict)

        raise ValidationError(exc.messages)

    entry.save(
        update_fields=[
            "verification_status",
            "verified_by",
            "verified_at",
            "verification_note",
            "updated_at",
        ]
    )


# =====================================================
# VERIFY DAILY WORK
# =====================================================


@transaction.atomic
def verify_daily_task_work(
    *,
    entry_id,
    admin_user,
    verification_note="",
):
    validate_work_reviewer(admin_user)

    entry, task = get_locked_pending_work(
        entry_id=entry_id,
    )

    if task.measurement_method == Task.MeasurementMethod.QUANTITY:

        quantity = entry.quantity_completed_today

        if quantity is None or quantity <= 0:
            raise ValidationError(
                {"quantity_completed_today": ("A positive quantity is required.")}
            )

        verified_total = DailyTaskWork.objects.filter(
            task=task,
            verification_status=(DailyTaskWork.VerificationStatus.VERIFIED),
        ).aggregate(total=Sum("quantity_completed_today"))["total"] or Decimal("0.000")

        if task.planned_quantity is None:
            raise ValidationError(
                {"task": "The task has no approved quantity baseline."}
            )

        new_total = verified_total + quantity

        if new_total > task.planned_quantity:
            remaining = max(
                task.planned_quantity - verified_total,
                Decimal("0.000"),
            )

            raise ValidationError(
                {
                    "quantity_completed_today": (
                        "Verification would exceed the "
                        "approved planned quantity. "
                        f"Remaining allowable quantity: {remaining} "
                        f"{task.measurement_unit}."
                    )
                }
            )

    elif task.measurement_method == Task.MeasurementMethod.COMPLETION_ONLY:

        if not entry.completion_claimed:
            raise ValidationError(
                {"completion_claimed": ("The entry does not claim task completion.")}
            )

        already_verified = (
            DailyTaskWork.objects.filter(
                task=task,
                verification_status=(DailyTaskWork.VerificationStatus.VERIFIED),
                completion_claimed=True,
            )
            .exclude(
                pk=entry.id,
            )
            .exists()
        )

        if already_verified:
            raise ValidationError(
                {"detail": ("Completion for this task " "has already been verified.")}
            )

    else:
        raise ValidationError({"task": "Unsupported task measurement method."})

    entry.verification_status = DailyTaskWork.VerificationStatus.VERIFIED
    entry.verified_by = admin_user
    entry.verified_at = timezone.now()
    entry.verification_note = verification_note

    save_reviewed_work(entry)

    create_activity_log(
        actor=admin_user,
        action="DAILY_TASK_WORK_VERIFIED",
        entity_type="DAILY_TASK_WORK",
        entity_id=entry.id,
        description="Daily task work verified.",
        metadata={
            "daily_report_id": str(entry.daily_report_id),
            "project_id": str(entry.daily_report.project_id),
            "task_id": str(entry.task_id),
            "old_status": DailyTaskWork.VerificationStatus.PENDING,
            "new_status": entry.verification_status,
            "comment": verification_note,
        },
    )

    notify_daily_task_work_verified(entry)

    return entry


# =====================================================
# REJECT DAILY WORK
# =====================================================


@transaction.atomic
def reject_daily_task_work(
    *,
    entry_id,
    admin_user,
    verification_note,
):
    validate_work_reviewer(admin_user)

    verification_note = verification_note.strip()

    if not verification_note:
        raise ValidationError(
            {"verification_note": ("Provide a reason for rejecting this work.")}
        )

    entry, task = get_locked_pending_work(
        entry_id=entry_id,
    )

    entry.verification_status = DailyTaskWork.VerificationStatus.REJECTED
    entry.verified_by = admin_user
    entry.verified_at = timezone.now()
    entry.verification_note = verification_note

    save_reviewed_work(entry)
    
    create_activity_log(
        actor=admin_user,
        action="DAILY_TASK_WORK_REJECTED",
        entity_type="DAILY_TASK_WORK",
        entity_id=entry.id,
        description="Daily task work rejected.",
        metadata={
            "daily_report_id": str(entry.daily_report_id),
            "project_id": str(entry.daily_report.project_id),
            "task_id": str(entry.task_id),
            "old_status": DailyTaskWork.VerificationStatus.PENDING,
            "new_status": entry.verification_status,
            "comment": verification_note,
        },
    )

    notify_daily_task_work_rejected(entry)
    
    return entry


# =====================================================
# CORRECT REJECTED DAILY TASK WORK
# =====================================================


@transaction.atomic
def correct_rejected_daily_task_work(
    *,
    rejected_entry_id,
    new_report_id,
    supervisor,
    corrected_data,
):
    """
    Create a new pending work entry linked to
    a rejected original entry.

    Never modify the original submitted evidence.
    """

    # Find the original entry's parent report.
    original_reference = get_object_or_404(
        DailyTaskWork.objects.only(
            "id",
            "daily_report_id",
            "task_id",
        ),
        pk=rejected_entry_id,
    )

    # Lock the new report before adding work.
    new_report = get_object_or_404(
        DailyReport.objects.select_for_update().select_related("project"),
        pk=new_report_id,
    )

    validate_daily_report_draft(
        new_report,
        supervisor,
    )

    # Lock the task consistently with ordinary
    # work creation and Admin verification.
    task = get_object_or_404(
        Task.objects.select_for_update(),
        pk=original_reference.task_id,
    )

    # Lock the original entry to prevent competing
    # corrections from being created simultaneously.
    original_entry = get_object_or_404(
        DailyTaskWork.objects.select_for_update().select_related("daily_report"),
        pk=rejected_entry_id,
        task=task,
    )

    original_report = original_entry.daily_report

    if original_report.status != DailyReport.Status.SUBMITTED:
        raise ValidationError(
            {"detail": ("Only entries from submitted reports " "can be corrected.")}
        )

    if original_entry.verification_status != DailyTaskWork.VerificationStatus.REJECTED:
        raise ValidationError(
            {"detail": ("Only rejected daily work entries " "can be corrected.")}
        )

    # The correction must be made by the Supervisor
    # who originally submitted the rejected work.
    if original_report.reported_by_id != supervisor.id:
        raise PermissionDenied(
            "Only the original reporting Supervisor " "can correct this entry."
        )

    if new_report.id == original_report.id:
        raise ValidationError(
            {"new_daily_report": ("Create a new draft report for corrections.")}
        )

    if new_report.project_id != original_report.project_id:
        raise ValidationError(
            {
                "new_daily_report": (
                    "The correction report must belong " "to the original project."
                )
            }
        )

    if task.project_id != new_report.project_id:
        raise ValidationError(
            {"task": ("The task must belong to the " "correction report's project.")}
        )

    # One immediate correction per rejected entry.
    if DailyTaskWork.objects.filter(
        correction_of=original_entry,
    ).exists():
        raise ValidationError(
            {"detail": ("This rejected entry already " "has a correction.")}
        )

    # The new report can have only one entry
    # per task, following the model constraint.
    if DailyTaskWork.objects.filter(
        daily_report=new_report,
        task=task,
    ).exists():
        raise ValidationError(
            {"task": ("This task is already included " "in the correction report.")}
        )

    if task.work_status == Task.WorkStatus.COMPLETED:
        raise ValidationError(
            {"task": ("Completed tasks cannot receive " "new work entries.")}
        )

    # Reuse existing task measurement validation.
    serializer = DailyTaskWorkCreateSerializer(
        data={
            **corrected_data,
            "task": str(task.id),
        },
        context={
            "daily_report": new_report,
        },
    )

    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    # Use a nested savepoint so database uniqueness
    # errors can become an API validation response.
    try:
        with transaction.atomic():
            corrected_entry = DailyTaskWork.objects.create(
                daily_report=new_report,
                task=task,
                correction_of=original_entry,
                work_description=data["work_description"],
                location_detail=data.get("location_detail", ""),
                quantity_completed_today=data.get("quantity_completed_today"),
                completion_claimed=data.get("completion_claimed", False),
                verification_status=(DailyTaskWork.VerificationStatus.PENDING),
            )
    except IntegrityError:
        raise ValidationError(
            {
                "detail": (
                    "A correction already exists, or this "
                    "task is already in the new report."
                )
            }
        )

    create_activity_log(
        actor=supervisor,
        action="DAILY_TASK_WORK_CORRECTED",
        entity_type="DAILY_TASK_WORK",
        entity_id=corrected_entry.id,
        description="Rejected daily work corrected in a new draft report.",
        metadata={
            "project_id": str(new_report.project_id),
            "daily_report_id": str(new_report.id),
            "task_id": str(task.id),
            "original_entry_id": str(original_entry.id),
            "correction_entry_id": str(corrected_entry.id),
            "original_daily_report_id": str(original_report.id),
        },
    )

    return corrected_entry


# =====================================================
# DELAY REPORT CREATION
# =====================================================

DELAY_REPORT_CREATE_FIELDS = {
    "delay_type",
    "reason",
    "description",
    "expected_completion_date",
    "extension_requested",
    "requested_end_date",
}


@transaction.atomic
def create_delay_report(
    *,
    task_id,
    supervisor,
    data,
):
    """
    Create a pending delay report.

    Only an assigned Supervisor can report
    a delay on an approved, unfinished task.

    A deadline extension is NOT applied here.
    """

    if not is_supervisor(supervisor):
        raise PermissionDenied("Only active Supervisors can report delays.")

    # Lock the Task so its current dates and status
    # are stable while validating the request.
    task = get_object_or_404(
        Task.objects.select_for_update().select_related("project"),
        pk=task_id,
    )

    validate_report_supervisor(
        task.project,
        supervisor,
    )

    validate_report_project_status(task.project)

    if task.approval_status != Task.ApprovalStatus.APPROVED:
        raise ValidationError(
            {"task": ("Only approved tasks can have " "delay reports.")}
        )

    if task.work_status in {
        Task.WorkStatus.COMPLETED,
        Task.WorkStatus.CANCELLED,
    }:
        raise ValidationError(
            {
                "task": (
                    "Completed or cancelled tasks " "cannot receive new delay reports."
                )
            }
        )

    unknown_fields = set(data) - DELAY_REPORT_CREATE_FIELDS

    if unknown_fields:
        raise ValidationError(
            {"detail": ("Unsupported fields: " + ", ".join(sorted(unknown_fields)))}
        )

    # Revalidate against the locked Task, not an
    # earlier copy read by the API view.
    serializer = DelayReportCreateSerializer(
        data=data,
        context={"task": task},
    )
    serializer.is_valid(raise_exception=True)

    report = DelayReport(
        task=task,
        reported_by=supervisor,
        **serializer.validated_data,
    )

    if report.extension_requested and DelayReport.objects.filter(
        task=task, extension_status=DelayReport.Status.PENDING,
    ).exists():
        raise ValidationError({"extension_requested": "This task already has a pending deadline extension."})

    # Use the model's defaults for pending review
    # and pending/not-requested extension status.
    try:
        report.full_clean()
    except DjangoValidationError as exc:
        if hasattr(exc, "message_dict"):
            raise ValidationError(exc.message_dict)

        raise ValidationError(exc.messages)

    report.save()
    
    create_activity_log(
        actor=supervisor,
        action="DELAY_REPORT_SUBMITTED",
        entity_type="DELAY_REPORT",
        entity_id=report.id,
        description="Delay report submitted.",
        metadata={
            "delay_report_id": str(report.id),
            "task_id": str(report.task_id),
            "project_id": str(report.task.project_id),
            "extension_requested": report.extension_requested,
            "requested_end_date": report.requested_end_date.isoformat() if report.requested_end_date else None,
            "new_status": report.status,
        },
    )

    notify_admins_delay_report_submitted(report)

    return report


# =====================================================
# ADMIN DELAY REPORT REVIEW
# =====================================================


def validate_delay_report_reviewer(admin_user):
    """
    Only an active Admin with staff access
    can review delay reports.
    """
    if not is_admin(admin_user):
        raise PermissionDenied("Only active Admins can review delay reports.")


def get_locked_pending_delay_report(*, report_id):
    """
    Must be called inside transaction.atomic().

    Lock the report to prevent two Admins from
    reviewing the same request simultaneously.
    """
    report = get_object_or_404(
        DelayReport.objects.select_for_update(),
        pk=report_id,
    )

    if report.status != DelayReport.Status.PENDING:
        raise ValidationError(
            {"detail": "This delay report has already been reviewed."}
        )

    return report


def save_reviewed_delay_report(report):
    """
    Validate the report before saving and
    convert model validation errors to API errors.
    """
    try:
        report.full_clean()
    except DjangoValidationError as exc:
        if hasattr(exc, "message_dict"):
            raise ValidationError(exc.message_dict)

        raise ValidationError(exc.messages)

    report.save(
        update_fields=[
            "status",
            "reviewed_by",
            "reviewed_at",
            "admin_comment",
        ]
    )


# =====================================================
# APPROVE DELAY REPORT
# =====================================================


@transaction.atomic
def approve_delay_report(
    *,
    report_id,
    admin_user,
    admin_comment="",
):
    validate_delay_report_reviewer(admin_user)

    report = get_locked_pending_delay_report(
        report_id=report_id,
    )

    report.status = DelayReport.Status.APPROVED
    report.reviewed_by = admin_user
    report.reviewed_at = timezone.now()
    report.admin_comment = admin_comment.strip()

    save_reviewed_delay_report(report)
    
    create_activity_log(
        actor=admin_user,
        action="DELAY_REPORT_APPROVED",
        entity_type="DELAY_REPORT",
        entity_id=report.id,
        description="Delay report approved.",
        metadata={
            "delay_report_id": str(report.id),
            "task_id": str(report.task_id),
            "project_id": str(report.task.project_id),
            "old_status": DelayReport.Status.PENDING,
            "new_status": report.status,
            "comment": report.admin_comment,
        },
    )

    notify_delay_report_approved(report)

    # IMPORTANT:
    # Do not modify report.task.end_date.
    # Do not approve the extension here.

    return report


# =====================================================
# REJECT DELAY REPORT
# =====================================================


@transaction.atomic
def reject_delay_report(
    *,
    report_id,
    admin_user,
    admin_comment,
):
    validate_delay_report_reviewer(admin_user)

    admin_comment = admin_comment.strip()

    if not admin_comment:
        raise ValidationError({"admin_comment": ("A rejection reason is required.")})

    report = get_locked_pending_delay_report(
        report_id=report_id,
    )

    report.status = DelayReport.Status.REJECTED
    report.reviewed_by = admin_user
    report.reviewed_at = timezone.now()
    report.admin_comment = admin_comment

    save_reviewed_delay_report(report)

    create_activity_log(
        actor=admin_user,
        action="DELAY_REPORT_REJECTED",
        entity_type="DELAY_REPORT",
        entity_id=report.id,
        description="Delay report rejected.",
        metadata={
            "delay_report_id": str(report.id),
            "task_id": str(report.task_id),
            "project_id": str(report.task.project_id),
            "old_status": DelayReport.Status.PENDING,
            "new_status": report.status,
            "comment": report.admin_comment,
        },
    )

    notify_delay_report_rejected(report)

    # Deadline and extension decision remain
    # separate from the delay review.
    return report


# =====================================================
# DEADLINE EXTENSION HELPERS
# =====================================================


def get_locked_pending_extension(*, report_id):
    """
    Must be called inside transaction.atomic().

    Lock the Task first, then the DelayReport.

    This keeps concurrent deadline changes
    from silently overwriting one another.
    """

    reference = get_object_or_404(
        DelayReport.objects.only(
            "id",
            "task_id",
        ),
        pk=report_id,
    )

    task = get_object_or_404(
        Task.objects.select_for_update(),
        pk=reference.task_id,
    )

    report = get_object_or_404(
        DelayReport.objects.select_for_update(),
        pk=report_id,
        task_id=task.id,
    )

    if not report.extension_requested:
        raise ValidationError(
            {"detail": ("This delay report does not " "contain an extension request.")}
        )

    if report.extension_status != DelayReport.Status.PENDING:
        raise ValidationError(
            {
                "detail": (
                    "This extension has already " "been reviewed or is not pending."
                )
            }
        )

    if report.requested_end_date is None:
        raise ValidationError(
            {"requested_end_date": ("A requested end date is required.")}
        )

    return report, task


def validate_and_save_extension_review(report):
    """
    Validate extension decision fields and
    convert Django validation errors to DRF 400s.
    """

    try:
        report.full_clean()

    except DjangoValidationError as exc:
        if hasattr(exc, "message_dict"):
            raise ValidationError(exc.message_dict)

        raise ValidationError(exc.messages)

    report.save(
        update_fields=[
            "extension_status",
            "extension_reviewed_by",
            "extension_reviewed_at",
            "extension_admin_comment",
        ]
    )


# =====================================================
# APPROVE DEADLINE EXTENSION
# =====================================================


@transaction.atomic
def approve_delay_extension(
    *,
    report_id,
    admin_user,
    admin_comment="",
):
    # Reuse existing Admin permission helper.
    validate_delay_report_reviewer(admin_user)

    report, task = get_locked_pending_extension(
        report_id=report_id,
    )

    # -----------------------------------------
    # DELAY REPORT MUST BE APPROVED FIRST
    # -----------------------------------------

    if report.status != DelayReport.Status.APPROVED:
        raise ValidationError(
            {
                "detail": (
                    "Approve the delay report before "
                    "approving its deadline extension."
                )
            }
        )

    # -----------------------------------------
    # TASK MUST BE ELIGIBLE
    # -----------------------------------------

    if task.approval_status != Task.ApprovalStatus.APPROVED:
        raise ValidationError({"task": "Only approved tasks can receive extensions."})

    if task.work_status in {
        Task.WorkStatus.COMPLETED,
        Task.WorkStatus.CANCELLED,
    }:
        raise ValidationError(
            {
                "task": (
                    "Completed or cancelled tasks "
                    "cannot receive deadline extensions."
                )
            }
        )

    # -----------------------------------------
    # VALIDATE REQUESTED DEADLINE
    # -----------------------------------------

    old_end_date = task.end_date
    new_end_date = report.requested_end_date

    if old_end_date is not None and new_end_date <= old_end_date:
        raise ValidationError(
            {
                "requested_end_date": (
                    "The requested date must be later "
                    "than the current task deadline."
                )
            }
        )

    if task.start_date is not None and new_end_date < task.start_date:
        raise ValidationError(
            {
                "requested_end_date": (
                    "The new deadline cannot be " "earlier than the task start date."
                )
            }
        )

    # -----------------------------------------
    # CHANGE TASK DEADLINE
    # -----------------------------------------

    task.end_date = new_end_date

    try:
        task.full_clean()

    except DjangoValidationError as exc:
        if hasattr(exc, "message_dict"):
            raise ValidationError(exc.message_dict)

        raise ValidationError(exc.messages)

    task.save(
        update_fields=[
            "end_date",
            "updated_at",
        ]
    )

    # -----------------------------------------
    # APPROVE EXTENSION
    # -----------------------------------------

    report.extension_status = DelayReport.Status.APPROVED
    report.extension_reviewed_by = admin_user
    report.extension_reviewed_at = timezone.now()
    report.extension_admin_comment = admin_comment.strip()
    
    
    

    validate_and_save_extension_review(report)

    # -----------------------------------------
    # TASK HISTORY
    # -----------------------------------------

    TaskHistory.objects.create(
        task=task,
        actor=admin_user,
        action=TaskHistory.Action.EXTENSION_APPROVED,
        details={
            "delay_report_id": str(report.id),
            "old_end_date": (
                old_end_date.isoformat() if old_end_date is not None else None
            ),
            "new_end_date": new_end_date.isoformat(),
            "admin_comment": admin_comment.strip(),
        },
    )
    
    create_activity_log(
        actor=admin_user,
        action="EXTENSION_APPROVED",
        entity_type="DELAY_REPORT",
        entity_id=report.id,
        description="Extension approved.",
        metadata={
            "delay_report_id": str(report.id),
            "task_id": str(report.task_id),
            "project_id": str(report.task.project_id),
            "old_status": DelayReport.Status.PENDING,
            "new_status": report.extension_status,
            "old_end_date": old_end_date.isoformat() if old_end_date else None,
            "new_end_date": new_end_date.isoformat(),
            "comment": report.extension_admin_comment,
        },
    )

    notify_deadline_extension_approved(report)

    return report


# =====================================================
# REJECT DEADLINE EXTENSION
# =====================================================


@transaction.atomic
def reject_delay_extension(
    *,
    report_id,
    admin_user,
    admin_comment,
):
    validate_delay_report_reviewer(admin_user)

    admin_comment = admin_comment.strip()

    if not admin_comment:
        raise ValidationError({"admin_comment": ("A rejection reason is required.")})

    report, task = get_locked_pending_extension(
        report_id=report_id,
    )

    # -----------------------------------------
    # REJECT EXTENSION
    # -----------------------------------------

    report.extension_status = DelayReport.Status.REJECTED
    report.extension_reviewed_by = admin_user
    report.extension_reviewed_at = timezone.now()
    report.extension_admin_comment = admin_comment

    validate_and_save_extension_review(report)

    # -----------------------------------------
    # RECORD HISTORY
    # -----------------------------------------

    TaskHistory.objects.create(
        task=task,
        actor=admin_user,
        action=TaskHistory.Action.EXTENSION_REJECTED,
        details={
            "delay_report_id": str(report.id),
            "requested_end_date": (
                report.requested_end_date.isoformat()
                if report.requested_end_date is not None
                else None
            ),
            "current_end_date": (
                task.end_date.isoformat() if task.end_date is not None else None
            ),
            "admin_comment": admin_comment,
        },
    )
    
    create_activity_log(
        actor=admin_user,
        action="EXTENSION_REJECTED",
        entity_type="DELAY_REPORT",
        entity_id=report.id,
        description="Extension rejected.",
        metadata={
            "delay_report_id": str(report.id),
            "task_id": str(report.task_id),
            "project_id": str(report.task.project_id),
            "old_status": DelayReport.Status.PENDING,
            "new_status": report.extension_status,
            "current_end_date": task.end_date.isoformat() if task.end_date else None,
            "requested_end_date": report.requested_end_date.isoformat() if report.requested_end_date else None,
            "comment": report.extension_admin_comment,
        },
    )

    notify_deadline_extension_rejected(report)

    # IMPORTANT:
    # We never change task.end_date
    # when rejecting an extension.

    return report
