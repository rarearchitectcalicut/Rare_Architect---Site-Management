import uuid
from pathlib import Path
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower

# ============================================================
# IMAGE VALIDATION AND UPLOAD PATHS
# ============================================================

MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB

IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"]


def validate_image_size(image):
    if image and image.size > MAX_IMAGE_SIZE:
        raise ValidationError("Image size must not exceed 5 MB.")


def category_image_upload_path(instance, filename):
    extension = Path(filename).suffix.lower()

    return f"project_categories/{instance.pk}/" f"{uuid.uuid4().hex}{extension}"


def project_cover_upload_path(instance, filename):
    extension = Path(filename).suffix.lower()

    return f"projects/{instance.pk}/covers/" f"{uuid.uuid4().hex}{extension}"


# ============================================================
# PROJECT CATEGORY
# ============================================================


class ProjectCategory(models.Model):
    """
    Categories such as Commercial, Residential, and Art.

    Categories are stored in the database so administrators
    can manage them without code changes.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    name = models.CharField(
        max_length=100,
    )

    description = models.TextField(
        blank=True,
    )

    image = models.ImageField(
        upload_to=category_image_upload_path,
        null=True,
        blank=True,
        validators=[
            FileExtensionValidator(allowed_extensions=IMAGE_EXTENSIONS),
            validate_image_size,
        ],
    )

    is_active = models.BooleanField(
        default=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["name"]

        verbose_name = "Project Category"
        verbose_name_plural = "Project Categories"

        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                name="unique_project_category_name_ci",
            ),
            models.CheckConstraint(
                condition=~Q(name=""),
                name="project_category_name_not_empty",
            ),
        ]

    def clean(self):
        super().clean()

        if self.name is not None:
            self.name = self.name.strip()

            if not self.name:
                raise ValidationError({"name": "Category name cannot be empty."})

    def __str__(self):
        return self.name


# ============================================================
# PROJECT
# ============================================================


class Project(models.Model):
    """
    Stores the core details of an architecture project.

    Project documents are managed separately in
    the documents application.
    """

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        COMPLETED = "COMPLETED", "Completed"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        ON_HOLD = "ON_HOLD", "On Hold"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    category = models.ForeignKey(
        ProjectCategory,
        on_delete=models.PROTECT,
        related_name="projects",
    )

    name = models.CharField(
        max_length=200,
    )

    client_name = models.CharField(
        max_length=200,
        blank=True,
    )

    description = models.TextField(
        blank=True,
    )

    location = models.CharField(
        max_length=255,
        blank=True,
    )

    start_date = models.DateField(
        null=True,
        blank=True,
    )

    end_date = models.DateField(
        null=True,
        blank=True,
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    cover_image = models.ImageField(
        upload_to=project_cover_upload_path,
        null=True,
        blank=True,
        validators=[
            FileExtensionValidator(allowed_extensions=IMAGE_EXTENSIONS),
            validate_image_size,
        ],
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_projects",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["-created_at"]

        indexes = [
            models.Index(
                fields=["status", "-created_at"],
                name="project_status_created_idx",
            ),
            models.Index(
                fields=["category", "status"],
                name="project_category_status_idx",
            ),
        ]

        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(start_date__isnull=True)
                    | Q(end_date__isnull=True)
                    | Q(start_date__lte=F("end_date"))
                ),
                name="project_valid_date_range",
            ),
            models.CheckConstraint(
                condition=Q(
                    status__in=[
                        "ACTIVE",
                        "COMPLETED",
                        "MAINTENANCE",
                        "ON_HOLD",
                        "CANCELLED",
                    ]
                ),
                name="project_valid_status",
            ),
            models.CheckConstraint(
                condition=~Q(name=""),
                name="project_name_not_empty",
            ),
        ]

    def clean(self):
        super().clean()

        if self.name is not None:
            self.name = self.name.strip()

            if not self.name:
                raise ValidationError({"name": "Project name cannot be empty."})

        if self.client_name is not None:
            self.client_name = self.client_name.strip()

        if self.location is not None:
            self.location = self.location.strip()

        if (
            self.start_date is not None
            and self.end_date is not None
            and self.start_date > self.end_date
        ):
            raise ValidationError(
                {"end_date": ("Project end date cannot be " "earlier than start date.")}
            )

    def __str__(self):
        return self.name


# ============================================================
# PROJECT SUPERVISOR ASSIGNMENT
# ============================================================


class ProjectSupervisor(models.Model):
    """
    Represents a supervisor assigned to a project.

    A project can have multiple supervisors.
    A supervisor can work on multiple projects.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="supervisor_assignments",
    )

    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="project_assignments",
    )

    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="project_assignments_made",
    )

    assigned_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        ordering = ["-assigned_at"]

        constraints = [
            models.UniqueConstraint(
                fields=["project", "supervisor"],
                name="unique_project_supervisor",
            ),
            models.CheckConstraint(
                condition=~Q(supervisor=F("assigned_by")),
                name="assignment_supervisor_not_assigner",
            ),
        ]

        indexes = [
            models.Index(
                fields=["supervisor", "project"],
                name="assignment_user_project_idx",
            ),
        ]

    def clean(self):
        super().clean()

        User = get_user_model()

        errors = {}

        if self.supervisor_id:
            valid_supervisor = User.objects.filter(
                pk=self.supervisor_id,
                role=User.Role.SUPERVISOR,
                is_active=True,
            ).exists()

            if not valid_supervisor:
                errors["supervisor"] = (
                    "Only active supervisor accounts " "can be assigned to projects."
                )

        if self.assigned_by_id:
            valid_admin = User.objects.filter(
                pk=self.assigned_by_id,
                role=User.Role.ADMIN,
                is_staff=True,
                is_active=True,
            ).exists()

            if not valid_admin:
                errors["assigned_by"] = (
                    "Only active administrators " "can assign supervisors."
                )

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.supervisor.username} " f"-> {self.project.name}"
