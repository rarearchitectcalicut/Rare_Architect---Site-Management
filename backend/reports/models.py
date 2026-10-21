import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from pathlib import Path
from .storage import private_report_storage

# =====================================================
# DELAY REPORT MODEL
# =====================================================


class DelayReport(models.Model):

    # ---------------------------------------------
    # Delay Types
    # ---------------------------------------------

    class DelayType(models.TextChoices):
        MATERIAL_DELAY = (
            "MATERIAL_DELAY",
            "Material Delay",
        )
        WORKER_UNAVAILABLE = (
            "WORKER_UNAVAILABLE",
            "Worker Unavailable",
        )
        WEATHER = (
            "WEATHER",
            "Weather",
        )
        CLIENT_CHANGE = (
            "CLIENT_CHANGE",
            "Client Change",
        )
        SITE_CONDITION = (
            "SITE_CONDITION",
            "Site Condition",
        )
        EQUIPMENT_FAILURE = (
            "EQUIPMENT_FAILURE",
            "Equipment Failure",
        )
        APPROVAL_DELAY = (
            "APPROVAL_DELAY",
            "Approval Delay",
        )
        OTHER = (
            "OTHER",
            "Other",
        )

    # ---------------------------------------------
    # Review Status
    # ---------------------------------------------

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    # ---------------------------------------------
    # Primary Key
    # ---------------------------------------------

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    # ---------------------------------------------
    # Task Relationship
    # ---------------------------------------------

    task = models.ForeignKey(
        "tasks.Task",
        on_delete=models.PROTECT,
        related_name="delay_reports",
    )

    # ---------------------------------------------
    # Reporting Supervisor
    # ---------------------------------------------

    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="submitted_delay_reports",
    )

    # ---------------------------------------------
    # Delay Information
    # ---------------------------------------------

    delay_type = models.CharField(
        max_length=30,
        choices=DelayType.choices,
    )

    reason = models.CharField(
        max_length=200,
    )

    description = models.TextField(
        blank=True,
        default="",
    )

    expected_completion_date = models.DateField(
        null=True,
        blank=True,
    )

    # ---------------------------------------------
    # Deadline Extension Request
    # ---------------------------------------------

    extension_requested = models.BooleanField(
        default=False,
    )

    requested_end_date = models.DateField(
        null=True,
        blank=True,
    )

    extension_status = models.CharField(
        max_length=10,
        choices=Status.choices,
        null=True,
        blank=True,
    )

    # ---------------------------------------------
    # Delay Report Review
    # ---------------------------------------------

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
        related_name="reviewed_delay_reports",
    )

    admin_comment = models.TextField(
        blank=True,
        default="",
    )

    reported_at = models.DateTimeField(
        auto_now_add=True,
    )

    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    # ---------------------------------------------
    # Extension Review Metadata
    # ---------------------------------------------

    extension_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reviewed_task_extensions",
    )

    extension_reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    extension_admin_comment = models.TextField(
        blank=True,
        default="",
    )

    # ---------------------------------------------
    # Model Validation
    # ---------------------------------------------

    def clean(self):
        super().clean()

        if not self.reason or not self.reason.strip():
            raise ValidationError({"reason": "Delay reason is required."})

        if self.extension_requested:
            if self.requested_end_date is None:
                raise ValidationError(
                    {
                        "requested_end_date": (
                            "Provide a new end date when " "requesting an extension."
                        )
                    }
                )

            if self.extension_status is None:
                self.extension_status = self.Status.PENDING

        else:
            if self.requested_end_date is not None:
                raise ValidationError(
                    {
                        "requested_end_date": (
                            "A requested end date requires " "extension_requested=True."
                        )
                    }
                )

            if self.extension_status is not None:
                raise ValidationError(
                    {
                        "extension_status": (
                            "Extension status must be empty "
                            "when no extension is requested."
                        )
                    }
                )

    # ---------------------------------------------
    # Meta
    # ---------------------------------------------

    class Meta:
        ordering = ["-reported_at", "-id"]

        indexes = [
            models.Index(
                fields=["status", "reported_at"],
                name="delay_status_date_idx",
            ),
            models.Index(
                fields=["task", "reported_at"],
                name="delay_task_date_idx",
            ),
            models.Index(
                fields=["extension_status"],
                name="delay_ext_status_idx",
            ),
        ]

        constraints = [
            models.CheckConstraint(
                condition=Q(
                    delay_type__in=[
                        "MATERIAL_DELAY",
                        "WORKER_UNAVAILABLE",
                        "WEATHER",
                        "CLIENT_CHANGE",
                        "SITE_CONDITION",
                        "EQUIPMENT_FAILURE",
                        "APPROVAL_DELAY",
                        "OTHER",
                    ]
                ),
                name="delay_valid_type",
            ),
            models.CheckConstraint(
                condition=Q(
                    status__in=[
                        "PENDING",
                        "APPROVED",
                        "REJECTED",
                    ]
                ),
                name="delay_valid_status",
            ),
            models.CheckConstraint(
                condition=(
                    Q(extension_status__isnull=True)
                    | Q(
                        extension_status__in=[
                            "PENDING",
                            "APPROVED",
                            "REJECTED",
                        ]
                    )
                ),
                name="delay_valid_ext_status",
            ),
            models.CheckConstraint(
                condition=(
                    Q(
                        extension_requested=False,
                        requested_end_date__isnull=True,
                        extension_status__isnull=True,
                    )
                    | Q(
                        extension_requested=True,
                        requested_end_date__isnull=False,
                        extension_status__isnull=False,
                    )
                ),
                name="delay_ext_fields_consistent",
            ),
        ]

    def __str__(self):
        return f"{self.task.title} - {self.delay_type}"


# =====================================================
# DAILY SITE REPORT
# =====================================================
class DailyReport(models.Model):

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"

    class WeatherCondition(models.TextChoices):
        SUNNY = "SUNNY", "Sunny"
        CLOUDY = "CLOUDY", "Cloudy"
        RAINY = "RAINY", "Rainy"
        HEAVY_RAIN = "HEAVY_RAIN", "Heavy Rain"
        WINDY = "WINDY", "Windy"
        OTHER = "OTHER", "Other"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.PROTECT,
        related_name="daily_reports",
    )

    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="daily_reports",
    )

    report_date = models.DateField()

    weather_condition = models.CharField(
        max_length=20,
        choices=WeatherCondition.choices,
        blank=True,
        default="",
    )

    site_condition = models.CharField(
        max_length=255,
        blank=True,
        default="",
    )

    work_summary = models.TextField(
        blank=True,
        default="",
    )

    site_notes = models.TextField(
        blank=True,
        default="",
    )

    issues = models.TextField(
        blank=True,
        default="",
    )

    next_day_plan = models.TextField(
        blank=True,
        default="",
    )

    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    submitted_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    def clean(self):
        super().clean()

        if self.status == self.Status.SUBMITTED:
            if not self.work_summary.strip():
                raise ValidationError(
                    {
                        "work_summary": (
                            "A work summary or explanation " "of no work is required."
                        )
                    }
                )

            if self.submitted_at is None:
                raise ValidationError(
                    {
                        "submitted_at": (
                            "Submission time is required " "for submitted reports."
                        )
                    }
                )

        elif self.status == self.Status.DRAFT:
            if self.submitted_at is not None:
                raise ValidationError(
                    {
                        "submitted_at": (
                            "Draft reports cannot have " "a submission timestamp."
                        )
                    }
                )

    class Meta:
        ordering = ["-report_date", "-created_at"]

        indexes = [
            models.Index(
                fields=["project", "report_date"],
                name="daily_project_date_idx",
            ),
            models.Index(
                fields=["reported_by", "report_date"],
                name="daily_author_date_idx",
            ),
        ]

        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(
                        status="DRAFT",
                        submitted_at__isnull=True,
                    )
                    | models.Q(
                        status="SUBMITTED",
                        submitted_at__isnull=False,
                    )
                ),
                name="daily_valid_submission_state",
            ),
        ]

    def __str__(self):
        return f"{self.project.name} - " f"{self.report_date}"


# =====================================================
# DAILY TASK WORK ENTRY
# =====================================================


class DailyTaskWork(models.Model):

    class VerificationStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    daily_report = models.ForeignKey(
        DailyReport,
        on_delete=models.PROTECT,
        related_name="work_entries",
    )

    task = models.ForeignKey(
        "tasks.Task",
        on_delete=models.PROTECT,
        related_name="daily_work_entries",
    )

    work_description = models.TextField()

    location_detail = models.CharField(
        max_length=255,
        blank=True,
        default="",
    )

    # Used for quantity-based tasks.
    quantity_completed_today = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
    )

    # =================================================
    # REJECTED WORK CORRECTION REFERENCE
    # =================================================

    correction_of = models.OneToOneField(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="correction",
    )

    # Used for completion-only tasks.
    completion_claimed = models.BooleanField(
        default=False,
    )

    verification_status = models.CharField(
        max_length=10,
        choices=VerificationStatus.choices,
        default=VerificationStatus.PENDING,
    )

    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="verified_daily_work",
    )

    verified_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    verification_note = models.TextField(
        blank=True,
        default="",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    def clean(self):
        super().clean()

        if not self.work_description.strip():
            raise ValidationError(
                {"work_description": ("Describe the work performed.")}
            )

        # An entry must refer to a task belonging
        # to the same project as its daily report.
        if self.task_id and self.daily_report_id:
            if self.task.project_id != self.daily_report.project_id:
                raise ValidationError(
                    {"task": ("Task must belong to the " "daily report's project.")}
                )

            if self.task.approval_status != self.task.ApprovalStatus.APPROVED:
                raise ValidationError(
                    {"task": ("Only approved tasks can " "have daily work entries.")}
                )

            method = self.task.measurement_method

            if method == self.task.MeasurementMethod.QUANTITY:
                if (
                    self.quantity_completed_today is None
                    or self.quantity_completed_today <= 0
                ):
                    raise ValidationError(
                        {
                            "quantity_completed_today": (
                                "Enter a completed quantity " "greater than zero."
                            )
                        }
                    )

                if self.completion_claimed:
                    raise ValidationError(
                        {
                            "completion_claimed": (
                                "Quantity-based tasks must " "use measured quantities."
                            )
                        }
                    )

            elif method == self.task.MeasurementMethod.COMPLETION_ONLY:
                if self.quantity_completed_today is not None:
                    raise ValidationError(
                        {
                            "quantity_completed_today": (
                                "Completion-only tasks " "cannot report a quantity."
                            )
                        }
                    )

                if not self.completion_claimed:
                    raise ValidationError(
                        {
                            "completion_claimed": (
                                "Confirm completion when " "reporting this task."
                            )
                        }
                    )

        if self.verification_status == self.VerificationStatus.PENDING:
            if self.verified_by_id or self.verified_at:
                raise ValidationError(
                    {
                        "verification_status": (
                            "Pending work cannot have " "reviewer information."
                        )
                    }
                )

        else:
            if not self.verified_by_id or not self.verified_at:
                raise ValidationError(
                    {
                        "verification_status": (
                            "Reviewed work requires an " "Admin and review timestamp."
                        )
                    }
                )

    class Meta:
        ordering = ["created_at", "id"]

        indexes = [
            models.Index(
                fields=["task", "verification_status"],
                name="work_task_verify_idx",
            ),
            models.Index(
                fields=["daily_report"],
                name="work_daily_report_idx",
            ),
        ]

        constraints = [
            models.UniqueConstraint(
                fields=["daily_report", "task"],
                name="unique_task_per_daily_report",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    verification_status__in=[
                        "PENDING",
                        "VERIFIED",
                        "REJECTED",
                    ]
                ),
                name="daily_work_valid_verify",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(quantity_completed_today__isnull=True)
                    | models.Q(quantity_completed_today__gt=0)
                ),
                name="daily_work_positive_qty",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        verification_status="PENDING",
                        verified_by__isnull=True,
                        verified_at__isnull=True,
                    )
                    | (
                        models.Q(
                            verification_status__in=[
                                "VERIFIED",
                                "REJECTED",
                            ]
                        )
                        & models.Q(
                            verified_by__isnull=False,
                            verified_at__isnull=False,
                        )
                    )
                ),
                name="daily_work_review_consistent",
            ),
        ]

    def __str__(self):
        return f"{self.task.title} - " f"{self.daily_report.report_date}"


# =====================================================
# DAILY SITE MANPOWER
# =====================================================


class DailyManpower(models.Model):

    class Trade(models.TextChoices):
        MASON = "MASON", "Mason"
        HELPER = "HELPER", "Helper"
        CARPENTER = "CARPENTER", "Carpenter"
        ELECTRICIAN = "ELECTRICIAN", "Electrician"
        PLUMBER = "PLUMBER", "Plumber"
        PAINTER = "PAINTER", "Painter"
        TILER = "TILER", "Tiler"
        WELDER = "WELDER", "Welder"
        SUPERVISOR = "SUPERVISOR", "Site Supervisor"
        OTHER = "OTHER", "Other"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    daily_report = models.ForeignKey(
        DailyReport,
        on_delete=models.PROTECT,
        related_name="manpower_entries",
    )

    trade = models.CharField(
        max_length=20,
        choices=Trade.choices,
    )

    contractor_name = models.CharField(
        max_length=200,
        blank=True,
        default="",
    )

    worker_count = models.PositiveIntegerField()

    # Average hours worked per person in this entry.
    hours_worked = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )

    remarks = models.TextField(
        blank=True,
        default="",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def clean(self):
        super().clean()

        if self.worker_count < 1:
            raise ValidationError(
                {"worker_count": ("Worker count must be at least one.")}
            )

        if self.hours_worked is not None and (
            self.hours_worked < 0 or self.hours_worked > 24
        ):
            raise ValidationError(
                {"hours_worked": ("Hours per worker must be " "between 0 and 24.")}
            )

    class Meta:
        ordering = ["trade", "created_at", "id"]

        indexes = [
            models.Index(
                fields=["daily_report", "trade"],
                name="daily_manpower_trade_idx",
            ),
        ]

        constraints = [
            models.CheckConstraint(
                condition=models.Q(worker_count__gte=1),
                name="daily_manpower_count_valid",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(hours_worked__isnull=True)
                    | models.Q(
                        hours_worked__gte=0,
                        hours_worked__lte=24,
                    )
                ),
                name="daily_manpower_hours_valid",
            ),
        ]

    def __str__(self):
        return f"{self.get_trade_display()} - " f"{self.worker_count} workers"


# =====================================================
# DAILY SITE MATERIAL ENTRIES
# =====================================================


class DailyMaterialEntry(models.Model):

    class EntryType(models.TextChoices):
        RECEIVED = "RECEIVED", "Received"
        USED = "USED", "Used"
        REQUIRED = "REQUIRED", "Required"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    daily_report = models.ForeignKey(
        DailyReport,
        on_delete=models.PROTECT,
        related_name="material_entries",
    )

    material_name = models.CharField(
        max_length=200,
    )

    entry_type = models.CharField(
        max_length=10,
        choices=EntryType.choices,
    )

    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
    )

    unit = models.CharField(
        max_length=30,
        blank=True,
        default="",
    )

    remarks = models.TextField(
        blank=True,
        default="",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def clean(self):
        super().clean()

        self.material_name = self.material_name.strip()

        if not self.material_name:
            raise ValidationError({"material_name": "Material name is required."})

        if self.quantity is not None and self.quantity <= 0:
            raise ValidationError(
                {
                    "quantity": (
                        "Material quantity must be greater " "than zero when provided."
                    )
                }
            )

        if self.quantity is not None and not self.unit.strip():
            raise ValidationError(
                {"unit": ("Provide a unit when entering " "a material quantity.")}
            )

    class Meta:
        ordering = ["created_at", "id"]

        indexes = [
            models.Index(
                fields=["daily_report", "entry_type"],
                name="daily_material_type_idx",
            ),
        ]

        constraints = [
            models.CheckConstraint(
                condition=models.Q(
                    entry_type__in=[
                        "RECEIVED",
                        "USED",
                        "REQUIRED",
                    ]
                ),
                name="daily_material_type_valid",
            ),
            models.CheckConstraint(
                condition=(models.Q(quantity__isnull=True) | models.Q(quantity__gt=0)),
                name="daily_material_qty_valid",
            ),
        ]

    def __str__(self):
        return f"{self.material_name} - " f"{self.get_entry_type_display()}"


# =====================================================
# DAILY REPORT FILE STORAGE PATH
# =====================================================


def daily_report_attachment_path(instance, filename):
    """
    Store files under the daily report UUID.

    Randomized filenames prevent accidental
    overwriting and avoid using user-supplied
    names as storage paths.
    """

    extension = Path(filename).suffix.lower()

    return f"daily_reports/{instance.daily_report_id}/" f"{uuid.uuid4().hex}{extension}"


# =====================================================
# DAILY REPORT ATTACHMENTS
# =====================================================


class DailyReportAttachment(models.Model):

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    daily_report = models.ForeignKey(
        DailyReport,
        on_delete=models.PROTECT,
        related_name="attachments",
    )

    task_work = models.ForeignKey(
        DailyTaskWork,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="attachments",
    )

    
    file = models.FileField(
        upload_to=daily_report_attachment_path,
        storage=private_report_storage,
        max_length=500,
    )

    original_filename = models.CharField(
        max_length=255,
    )

    file_size = models.PositiveBigIntegerField()

    caption = models.TextField(
        blank=True,
        default="",
    )

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="uploaded_daily_report_files",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def clean(self):
        super().clean()

        if self.task_work_id and self.daily_report_id:
            if self.task_work.daily_report_id != self.daily_report_id:
                raise ValidationError(
                    {
                        "task_work": (
                            "The work entry must belong " "to this daily report."
                        )
                    }
                )

        if self.file_size <= 0:
            raise ValidationError({"file_size": ("Uploaded files must not be empty.")})

    class Meta:
        ordering = ["created_at", "id"]

        indexes = [
            models.Index(
                fields=["daily_report", "created_at"],
                name="daily_attachment_date_idx",
            ),
        ]

        constraints = [
            models.CheckConstraint(
                condition=models.Q(file_size__gt=0),
                name="daily_attachment_size_valid",
            ),
        ]

    def __str__(self):
        return self.original_filename
