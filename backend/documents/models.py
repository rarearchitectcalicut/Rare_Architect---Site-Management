import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from .storage import (
    private_document_storage,
    document_upload_path,
)

# =====================================================
# PROJECT DOCUMENT
# =====================================================


class ProjectDocument(models.Model):

    class DocumentType(models.TextChoices):
        DESIGN = "DESIGN", "Design"
        DRAWING = "DRAWING", "Drawing"
        BOQ = "BOQ", "Bill of Quantities"
        SPECIFICATION = "SPECIFICATION", "Specification"
        CONTRACT = "CONTRACT", "Contract"
        CLIENT_DOCUMENT = "CLIENT_DOCUMENT", "Client Document"
        REFERENCE = "REFERENCE", "Reference"
        OTHER = "OTHER", "Other"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.PROTECT,
        related_name="documents",
    )

    title = models.CharField(
        max_length=200,
    )

    description = models.TextField(
        blank=True,
        default="",
    )

    document_type = models.CharField(
        max_length=30,
        choices=DocumentType.choices,
    )

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="uploaded_project_documents",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["-created_at", "-id"]

        indexes = [
            models.Index(
                fields=["project", "document_type"],
                name="proj_doc_type_idx",
            ),
        ]

    def __str__(self):
        return self.title


# =====================================================
# PROJECT DOCUMENT VERSION
# =====================================================


class ProjectDocumentVersion(models.Model):

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    document = models.ForeignKey(
        ProjectDocument,
        on_delete=models.PROTECT,
        related_name="versions",
    )

    version_number = models.PositiveIntegerField()

    file = models.FileField(
        storage=private_document_storage,
        upload_to=document_upload_path,
        max_length=500,
    )

    original_filename = models.CharField(
        max_length=255,
    )

    file_size = models.BigIntegerField()

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="uploaded_project_document_versions",
    )

    is_current = models.BooleanField(
        default=False,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        ordering = ["-version_number"]

        constraints = [
            models.UniqueConstraint(
                fields=["document", "version_number"],
                name="unique_project_doc_version",
            ),
            models.UniqueConstraint(
                fields=["document"],
                condition=Q(is_current=True),
                name="unique_current_project_doc",
            ),
            models.CheckConstraint(
                condition=Q(version_number__gte=1),
                name="project_doc_version_positive",
            ),
            models.CheckConstraint(
                condition=Q(file_size__gt=0),
                name="project_doc_file_size_positive",
            ),
        ]

    def __str__(self):
        return f"{self.document.title} - " f"Version {self.version_number}"


# =====================================================
# TASK DOCUMENT
# =====================================================


class TaskDocument(models.Model):

    class DocumentType(models.TextChoices):
        DESIGN = "DESIGN", "Design"
        DRAWING = "DRAWING", "Drawing"
        REFERENCE = "REFERENCE", "Reference"
        INSTRUCTION = "INSTRUCTION", "Instruction"
        SPECIFICATION = "SPECIFICATION", "Specification"
        PHOTO = "PHOTO", "Photo"
        OTHER = "OTHER", "Other"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    task = models.ForeignKey(
        "tasks.Task",
        on_delete=models.PROTECT,
        related_name="documents",
    )

    title = models.CharField(
        max_length=200,
    )

    description = models.TextField(
        blank=True,
        default="",
    )

    document_type = models.CharField(
        max_length=30,
        choices=DocumentType.choices,
    )

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="uploaded_task_documents",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["-created_at", "-id"]

        indexes = [
            models.Index(
                fields=["task", "document_type"],
                name="task_doc_type_idx",
            ),
        ]

    def __str__(self):
        return self.title


# =====================================================
# TASK DOCUMENT VERSION
# =====================================================


class TaskDocumentVersion(models.Model):

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    document = models.ForeignKey(
        TaskDocument,
        on_delete=models.PROTECT,
        related_name="versions",
    )

    version_number = models.PositiveIntegerField()

    file = models.FileField(
        storage=private_document_storage,
        upload_to=document_upload_path,
        max_length=500,
    )

    original_filename = models.CharField(
        max_length=255,
    )

    file_size = models.BigIntegerField()

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="uploaded_task_document_versions",
    )

    is_current = models.BooleanField(
        default=False,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        ordering = ["-version_number"]

        constraints = [
            models.UniqueConstraint(
                fields=["document", "version_number"],
                name="unique_task_doc_version",
            ),
            models.UniqueConstraint(
                fields=["document"],
                condition=Q(is_current=True),
                name="unique_current_task_doc",
            ),
            models.CheckConstraint(
                condition=Q(version_number__gte=1),
                name="task_doc_version_positive",
            ),
            models.CheckConstraint(
                condition=Q(file_size__gt=0),
                name="task_doc_file_size_positive",
            ),
        ]

    def __str__(self):
        return f"{self.document.title} - " f"Version {self.version_number}"
