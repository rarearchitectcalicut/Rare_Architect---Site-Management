import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q


# ======================================================
# TASK BATCH
# ======================================================
class TaskBatch(models.Model):
    """
    Groups tasks created through one bulk submission.

    Each task has its own approval status.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.PROTECT,
        related_name="task_batches",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_task_batches",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Batch {self.id} - {self.project.name}"


# ======================================================
# TASK
# ======================================================


class Task(models.Model):

    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        URGENT = "URGENT", "Urgent"

    class ApprovalStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    class WorkStatus(models.TextChoices):
        NOT_STARTED = "NOT_STARTED", "Not Started"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        DELAYED = "DELAYED", "Delayed"
        CANCELLED = "CANCELLED", "Cancelled"

    class MeasurementMethod(models.TextChoices):
        QUANTITY = "QUANTITY", "Quantity Based"
        COMPLETION_ONLY = "COMPLETION_ONLY", "Completion Only"

    class MeasurementUnit(models.TextChoices):
        SQM = "SQM", "Square Metres"
        METER = "METER", "Metres"
        CUM = "CUM", "Cubic Metres"
        COUNT = "COUNT", "Count"
        KG = "KG", "Kilograms"
        LITRE = "LITRE", "Litres"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.PROTECT,
        related_name="tasks",
    )

    batch = models.ForeignKey(
        TaskBatch,
        on_delete=models.PROTECT,
        related_name="tasks",
        null=True,
        blank=True,
    )

    title = models.CharField(
        max_length=200,
    )

    description = models.TextField(
        blank=True,
    )

    worker_name = models.CharField(
        max_length=200,
        blank=True,
    )

    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )

    start_date = models.DateField(
        null=True,
        blank=True,
    )

    end_date = models.DateField(
        null=True,
        blank=True,
    )

    display_order = models.PositiveIntegerField(
        default=0,
    )

    # =====================================================
    # TASK PROGRESS BASELINE
    # =====================================================

    measurement_method = models.CharField(
        max_length=20,
        choices=MeasurementMethod.choices,
        default=MeasurementMethod.COMPLETION_ONLY,
    )

    planned_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
    )

    measurement_unit = models.CharField(
        max_length=20,
        choices=MeasurementUnit.choices,
        null=True,
        blank=True,
    )

    completion_criteria = models.TextField(
        blank=True,
        default="",
    )

    approval_status = models.CharField(
        max_length=10,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING,
    )

    work_status = models.CharField(
        max_length=20,
        choices=WorkStatus.choices,
        default=WorkStatus.NOT_STARTED,
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_tasks",
    )

    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="approved_tasks",
        null=True,
        blank=True,
    )

    approved_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["display_order", "created_at"]

        indexes = [
            models.Index(
                fields=["project", "display_order"],
                name="task_project_order_idx",
            ),
            models.Index(
                fields=["project", "approval_status"],
                name="task_project_approval_idx",
            ),
            models.Index(
                fields=["project", "work_status"],
                name="task_project_work_idx",
            ),
        ]

        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(start_date__isnull=True)
                    | Q(end_date__isnull=True)
                    | Q(start_date__lte=F("end_date"))
                ),
                name="task_valid_date_range",
            ),
            models.CheckConstraint(
                condition=~Q(title=""),
                name="task_title_not_empty",
            ),
            models.CheckConstraint(
                condition=Q(
                    priority__in=[
                        "LOW",
                        "MEDIUM",
                        "HIGH",
                        "URGENT",
                    ]
                ),
                name="task_valid_priority",
            ),
            models.CheckConstraint(
                condition=Q(
                    approval_status__in=[
                        "PENDING",
                        "APPROVED",
                        "REJECTED",
                    ]
                ),
                name="task_valid_approval",
            ),
            models.CheckConstraint(
                condition=Q(
                    work_status__in=[
                        "NOT_STARTED",
                        "IN_PROGRESS",
                        "COMPLETED",
                        "DELAYED",
                        "CANCELLED",
                    ]
                ),
                name="task_valid_work_status",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    measurement_method__in=[
                        "QUANTITY",
                        "COMPLETION_ONLY",
                    ]
                ),
                name="task_valid_measurement_method",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        measurement_method="QUANTITY",
                        planned_quantity__gt=0,
                        measurement_unit__in=[
                            "SQM",
                            "METER",
                            "CUM",
                            "COUNT",
                            "KG",
                            "LITRE",
                        ],
                    )
                    | models.Q(
                        measurement_method="COMPLETION_ONLY",
                        planned_quantity__isnull=True,
                        measurement_unit__isnull=True,
                    )
                ),
                name="task_valid_progress_baseline",
            ),
        ]

    def clean(self):
        super().clean()

        errors = {}

        if self.title is not None:
            self.title = self.title.strip()

            if not self.title:
                errors["title"] = "Task title cannot be empty."

        if (
            self.start_date is not None
            and self.end_date is not None
            and self.start_date > self.end_date
        ):
            errors["end_date"] = "End date cannot be earlier than start date."

        if (
            self.batch_id
            and self.project_id
            and self.batch.project_id != self.project_id
        ):
            errors["batch"] = "Task batch must belong to the same project."

        if self.measurement_method == self.MeasurementMethod.QUANTITY:

            if (
                self.planned_quantity is None
                or self.planned_quantity <= 0
            ):
                raise ValidationError({
                    "planned_quantity": (
                        "Quantity-based tasks require "
                        "a planned quantity greater than zero."
                    )
                })

            if not self.measurement_unit:
                raise ValidationError({
                    "measurement_unit": (
                        "Choose a measurement unit "
                        "for quantity-based tasks."
                    )
                })

        elif self.measurement_method == self.MeasurementMethod.COMPLETION_ONLY:

            if (
                self.planned_quantity is not None
                or self.measurement_unit
            ):
                raise ValidationError({
                    "measurement_method": (
                        "Completion-only tasks must not "
                        "have a planned quantity or unit."
                    )
                })

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return self.title


# ======================================================
# TASK CHANGE REQUEST
# ======================================================
class TaskChangeRequest(models.Model):
    """
    Stores proposed changes to approved tasks.

    The task remains unchanged until Admin approval.
    """

    class ChangeType(models.TextChoices):
        EDIT = "EDIT", "Edit"
        ORDER_CHANGE = "ORDER_CHANGE", "Order Change"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    task = models.ForeignKey(
        Task,
        on_delete=models.PROTECT,
        related_name="change_requests",
    )

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requested_task_changes",
    )

    change_type = models.CharField(
        max_length=20,
        choices=ChangeType.choices,
    )

    old_values = models.JSONField(default=dict)
    new_values = models.JSONField(default=dict)

    reason = models.TextField()

    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reviewed_task_changes",
    )

    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    admin_comment = models.TextField(blank=True)

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
                name="task_change_status_idx",
            ),
        ]

        constraints = [
            models.UniqueConstraint(
                fields=["task"],
                condition=Q(status="PENDING"),
                name="unique_pending_task_change",
            ),
            models.CheckConstraint(
                condition=Q(change_type__in=["EDIT", "ORDER_CHANGE"]),
                name="task_change_valid_type",
            ),
            models.CheckConstraint(
                condition=Q(status__in=["PENDING", "APPROVED", "REJECTED"]),
                name="task_change_valid_status",
            ),
        ]

    def clean(self):
        super().clean()

        if not self.reason.strip():
            raise ValidationError({"reason": "A reason is required."})

        if not isinstance(self.old_values, dict):
            raise ValidationError({"old_values": "Must be a JSON object."})

        if not isinstance(self.new_values, dict):
            raise ValidationError({"new_values": "Must be a JSON object."})

    def __str__(self):
        return f"{self.change_type} - {self.task.title}"


# ======================================================
# TASK HISTORY
# ======================================================
class TaskHistory(models.Model):
    """
    Append-only audit trail for task workflow events.

    Application APIs must never expose normal editing
    or deleting of these records.
    """

    class Action(models.TextChoices):
        CREATED = "CREATED", "Created"
        RESUBMITTED = "RESUBMITTED", "Resubmitted"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

        EDIT_REQUESTED = "EDIT_REQUESTED", "Edit Requested"
        EDIT_APPROVED = "EDIT_APPROVED", "Edit Approved"
        EDIT_REJECTED = "EDIT_REJECTED", "Edit Rejected"

        ORDER_CHANGE_REQUESTED = (
            "ORDER_CHANGE_REQUESTED",
            "Order Change Requested",
        )
        ORDER_CHANGE_APPROVED = (
            "ORDER_CHANGE_APPROVED",
            "Order Change Approved",
        )
        ORDER_CHANGE_REJECTED = (
            "ORDER_CHANGE_REJECTED",
            "Order Change Rejected",
        )

        DELAY_REPORTED = "DELAY_REPORTED", "Delay Reported"
        EXTENSION_REQUESTED = (
            "EXTENSION_REQUESTED",
            "Extension Requested",
        )
        EXTENSION_APPROVED = (
            "EXTENSION_APPROVED",
            "Extension Approved",
        )
        EXTENSION_REJECTED = "EXTENSION_REJECTED", "Extension Rejected"

        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    task = models.ForeignKey(
        Task,
        on_delete=models.PROTECT,
        related_name="history",
    )

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="task_history_actions",
    )

    action = models.CharField(
        max_length=40,
        choices=Action.choices,
    )

    details = models.JSONField(
        default=dict,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        ordering = ["-created_at"]

        indexes = [
            models.Index(
                fields=["task", "-created_at"],
                name="task_history_date_idx",
            ),
        ]

        constraints = [
            models.CheckConstraint(
                condition=Q(
                    action__in=[
                        "CREATED",
                        "RESUBMITTED",
                        "APPROVED",
                        "REJECTED",
                        "EDIT_REQUESTED",
                        "EDIT_APPROVED",
                        "EDIT_REJECTED",
                        "ORDER_CHANGE_REQUESTED",
                        "ORDER_CHANGE_APPROVED",
                        "ORDER_CHANGE_REJECTED",
                        "DELAY_REPORTED",
                        "EXTENSION_REQUESTED",
                        "EXTENSION_APPROVED",
                        "COMPLETED",
                        "CANCELLED",
                    ]
                ),
                name="task_history_valid_action",
            ),
        ]

    def __str__(self):
        return f"{self.task.title} - {self.action}"
