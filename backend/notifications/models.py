import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

# =====================================================
# NOTIFICATION MODEL
# =====================================================


class Notification(models.Model):

    class Type(models.TextChoices):
        TASK_APPROVAL = (
            "TASK_APPROVAL",
            "Task Approval",
        )

        TASK_CHANGE_REQUEST = (
            "TASK_CHANGE_REQUEST",
            "Task Change Request",
        )

        DELAY_REPORT = (
            "DELAY_REPORT",
            "Delay Report",
        )

        EXTENSION_REQUEST = (
            "EXTENSION_REQUEST",
            "Deadline Extension",
        )

        PROJECT_ASSIGNMENT = (
            "PROJECT_ASSIGNMENT",
            "Project Assignment",
        )

        DAILY_REPORT = (
            "DAILY_REPORT",
            "Daily Report",
        )

        SYSTEM = (
            "SYSTEM",
            "System",
        )

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )

    notification_type = models.CharField(
        max_length=30,
        choices=Type.choices,
    )

    title = models.CharField(
        max_length=200,
    )

    message = models.TextField()

    # Generic reference to the related record.
    # Example:
    # reference_type = "TASK"
    # reference_id = "<task UUID>"
    reference_type = models.CharField(
        max_length=50,
        blank=True,
        default="",
    )

    reference_id = models.UUIDField(
        null=True,
        blank=True,
    )

    is_read = models.BooleanField(
        default=False,
    )

    read_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        ordering = [
            "-created_at",
            "-id",
        ]

        indexes = [
            models.Index(
                fields=["recipient", "is_read", "created_at"],
                name="notif_recipient_read_idx",
            ),
        ]

        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(is_read=False, read_at__isnull=True)
                    | Q(is_read=True, read_at__isnull=False)
                ),
                name="notification_read_state_valid",
            ),
        ]

    def __str__(self):
        return f"{self.title} - {self.recipient_id}"
