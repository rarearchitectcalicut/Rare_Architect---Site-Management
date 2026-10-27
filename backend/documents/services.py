import uuid
import logging

from django.core.exceptions import (
    ValidationError as DjangoValidationError,
)
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import (
    APIException,
    PermissionDenied,
    ValidationError,
)

from projects.models import Project
from tasks.models import Task
from reports.services import accessible_projects
from activity.services import create_activity_log

from .models import (
    ProjectDocument,
    ProjectDocumentVersion,
    TaskDocument,
    TaskDocumentVersion,
)
from .validators import validate_document_file

logger = logging.getLogger(__name__)


class DocumentStorageUnavailable(APIException):
    status_code = 503
    default_detail = "Document storage is temporarily unavailable. Please retry."


def validate_project_document_management(*, user, project):
    validate_document_access(user=user, project=project)
    if user.role != "ADMIN" or not user.is_staff:
        raise PermissionDenied("Only Admins can upload project documents or new versions.")


# =====================================================
# PERMISSION VALIDATION
# =====================================================


def validate_document_access(*, user, project):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied("An active account is required.")

    authorized_admin = user.role == "ADMIN" and user.is_staff

    authorized_supervisor = user.role == "SUPERVISOR" and not user.is_staff

    if not (authorized_admin or authorized_supervisor):
        raise PermissionDenied("You cannot manage documents.")

    if not accessible_projects(user).filter(pk=project.pk).exists():
        raise PermissionDenied("You do not have access to this project.")


# =====================================================
# MODEL VALIDATION
# =====================================================


def validate_document_model(instance):
    try:
        instance.full_clean()

    except DjangoValidationError as exc:
        if hasattr(exc, "message_dict"):
            raise ValidationError(exc.message_dict)

        raise ValidationError(exc.messages)


# =====================================================
# SAVE VERSION FILE
# =====================================================


def save_version_file(
    *,
    version,
    uploaded_file,
    original_filename,
):
    """
    Save the file using private randomized storage.

    The caller is responsible for deleting this
    file if a later database operation fails.
    """

    uploaded_file.seek(0)

    version.file.save(
        original_filename,
        uploaded_file,
        save=False,
    )

    return version.file.name


def cleanup_private_file(*, version, stored_name):
    """
    Best-effort cleanup if a database operation
    fails after the file has been written.
    """

    if stored_name:
        try:
            version.file.storage.delete(stored_name)
        except OSError:
            logger.exception("Unable to clean up an uncommitted document file.")


# =====================================================
# CREATE PROJECT DOCUMENT
# =====================================================


@transaction.atomic
def create_project_document(
    *,
    project_id,
    user,
    title,
    document_type,
    uploaded_file,
    description="",
):
    file_info = validate_document_file(uploaded_file)

    project = get_object_or_404(
        Project.objects.select_for_update(),
        pk=project_id,
    )

    validate_project_document_management(
        user=user,
        project=project,
    )

    document = ProjectDocument(
        project=project,
        title=title,
        description=description,
        document_type=document_type,
        uploaded_by=user,
    )

    validate_document_model(document)

    document.save()

    version = ProjectDocumentVersion(
        document=document,
        version_number=1,
        original_filename=file_info["original_filename"],
        file_size=file_info["file_size"],
        uploaded_by=user,
        is_current=True,
    )

    stored_name = None

    try:
        stored_name = save_version_file(
            version=version,
            uploaded_file=uploaded_file,
            original_filename=file_info["original_filename"],
        )

        validate_document_model(version)

        version.save()

        create_activity_log(
            actor=user,
            action="PROJECT_DOCUMENT_UPLOADED",
            entity_type="PROJECT_DOCUMENT",
            entity_id=document.id,
            description="Project document uploaded.",
            metadata={
                "project_id": str(document.project_id),
                "document_id": str(document.id),
                "version_id": str(version.id),
                "version_number": version.version_number,
                "file_size": version.file_size,
            },
        )

    except Exception as exc:
        cleanup_private_file(
            version=version,
            stored_name=stored_name,
        )
        if isinstance(exc, OSError):
            raise DocumentStorageUnavailable() from exc
        raise

    return document, version


# =====================================================
# CREATE NEXT PROJECT DOCUMENT VERSION
# =====================================================


@transaction.atomic
def upload_project_document_version(
    *,
    document_id,
    user,
    uploaded_file,
):
    file_info = validate_document_file(uploaded_file)

    document = get_object_or_404(
        ProjectDocument.objects.select_for_update().select_related("project"),
        pk=document_id,
    )

    validate_project_document_management(
        user=user,
        project=document.project,
    )

    latest_version = (
        ProjectDocumentVersion.objects.filter(document=document)
        .order_by("-version_number")
        .first()
    )

    next_version_number = latest_version.version_number + 1 if latest_version else 1

    # Turn off the previous current flag.
    ProjectDocumentVersion.objects.filter(
        document=document,
        is_current=True,
    ).update(is_current=False)

    version = ProjectDocumentVersion(
        document=document,
        version_number=next_version_number,
        original_filename=file_info["original_filename"],
        file_size=file_info["file_size"],
        uploaded_by=user,
        is_current=True,
    )

    stored_name = None

    try:
        stored_name = save_version_file(
            version=version,
            uploaded_file=uploaded_file,
            original_filename=file_info["original_filename"],
        )

        validate_document_model(version)

        version.save()

        document.save(update_fields=["updated_at"])

        create_activity_log(
            actor=user,
            action="PROJECT_DOCUMENT_VERSION_UPLOADED",
            entity_type="PROJECT_DOCUMENT",
            entity_id=document.id,
            description="Project document version uploaded.",
            metadata={
                "project_id": str(document.project_id),
                "document_id": str(document.id),
                "version_id": str(version.id),
                "version_number": version.version_number,
                "file_size": version.file_size,
            },
        )

    except Exception as exc:
        cleanup_private_file(
            version=version,
            stored_name=stored_name,
        )
        if isinstance(exc, OSError):
            raise DocumentStorageUnavailable() from exc
        raise

    return version


# =====================================================
# CREATE TASK DOCUMENT
# =====================================================


@transaction.atomic
def create_task_document(
    *,
    task_id,
    user,
    title,
    document_type,
    uploaded_file,
    description="",
):
    file_info = validate_document_file(uploaded_file)

    task = get_object_or_404(
        Task.objects.select_for_update().select_related("project"),
        pk=task_id,
    )

    validate_document_access(
        user=user,
        project=task.project,
    )

    document = TaskDocument(
        task=task,
        title=title,
        description=description,
        document_type=document_type,
        uploaded_by=user,
    )

    validate_document_model(document)

    document.save()

    version = TaskDocumentVersion(
        document=document,
        version_number=1,
        original_filename=file_info["original_filename"],
        file_size=file_info["file_size"],
        uploaded_by=user,
        is_current=True,
    )

    stored_name = None

    try:
        stored_name = save_version_file(
            version=version,
            uploaded_file=uploaded_file,
            original_filename=file_info["original_filename"],
        )

        validate_document_model(version)

        version.save()

        create_activity_log(
            actor=user,
            action="TASK_DOCUMENT_UPLOADED",
            entity_type="TASK_DOCUMENT",
            entity_id=document.id,
            description="Task document uploaded.",
            metadata={
                "project_id": str(document.task.project_id),
                "document_id": str(document.id),
                "version_id": str(version.id),
                "version_number": version.version_number,
                "file_size": version.file_size,
                "task_id": str(document.task_id),
            },
        )

    except Exception:
        cleanup_private_file(
            version=version,
            stored_name=stored_name,
        )
        raise

    return document, version


# =====================================================
# CREATE NEXT TASK DOCUMENT VERSION
# =====================================================


@transaction.atomic
def upload_task_document_version(
    *,
    document_id,
    user,
    uploaded_file,
):
    file_info = validate_document_file(uploaded_file)

    document = get_object_or_404(
        TaskDocument.objects.select_for_update().select_related("task__project"),
        pk=document_id,
    )

    validate_document_access(
        user=user,
        project=document.task.project,
    )

    latest_version = (
        TaskDocumentVersion.objects.filter(document=document)
        .order_by("-version_number")
        .first()
    )

    next_version_number = latest_version.version_number + 1 if latest_version else 1

    TaskDocumentVersion.objects.filter(
        document=document,
        is_current=True,
    ).update(is_current=False)

    version = TaskDocumentVersion(
        document=document,
        version_number=next_version_number,
        original_filename=file_info["original_filename"],
        file_size=file_info["file_size"],
        uploaded_by=user,
        is_current=True,
    )

    stored_name = None

    try:
        stored_name = save_version_file(
            version=version,
            uploaded_file=uploaded_file,
            original_filename=file_info["original_filename"],
        )

        validate_document_model(version)

        version.save()

        document.save(update_fields=["updated_at"])

        create_activity_log(
            actor=user,
            action="TASK_DOCUMENT_VERSION_UPLOADED",
            entity_type="TASK_DOCUMENT",
            entity_id=document.id,
            description="Task document version uploaded.",
            metadata={
                "project_id": str(document.task.project_id),
                "document_id": str(document.id),
                "version_id": str(version.id),
                "version_number": version.version_number,
                "file_size": version.file_size,
                "task_id": str(document.task_id),
            },
        )

    except Exception:
        cleanup_private_file(
            version=version,
            stored_name=stored_name,
        )
        raise

    return version
