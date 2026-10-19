from rest_framework import serializers
from pathlib import Path
from django.conf import settings
from tasks.models import Task

from .models import (
    DailyReport,
    DailyTaskWork,
    DailyManpower,
    DailyMaterialEntry,
    DailyReportAttachment,
)

# =====================================================
# DAILY REPORT CREATE SERIALIZER
# =====================================================


class DailyReportCreateSerializer(serializers.ModelSerializer):
    """
    Create a daily site report as a DRAFT.

    The backend assigns:
    - project
    - reported_by
    - status = DRAFT
    """

    class Meta:
        model = DailyReport

        fields = (
            "report_date",
            "weather_condition",
            "site_condition",
            "work_summary",
            "site_notes",
            "issues",
            "next_day_plan",
        )

        extra_kwargs = {
            "report_date": {
                "required": True,
            },
            "weather_condition": {
                "required": False,
            },
            "site_condition": {
                "required": False,
                "allow_blank": True,
            },
            "work_summary": {
                "required": False,
                "allow_blank": True,
            },
            "site_notes": {
                "required": False,
                "allow_blank": True,
            },
            "issues": {
                "required": False,
                "allow_blank": True,
            },
            "next_day_plan": {
                "required": False,
                "allow_blank": True,
            },
        }


# =====================================================
# DAILY REPORT DETAIL SERIALIZER
# =====================================================
class DailyReportDetailSerializer(serializers.ModelSerializer):

    project_name = serializers.CharField(
        source="project.name",
        read_only=True,
    )

    reported_by_name = serializers.CharField(
        source="reported_by.username",
        read_only=True,
    )

    work_entry_count = serializers.SerializerMethodField()

    class Meta:
        model = DailyReport

        fields = (
            "id",
            "project",
            "project_name",
            "reported_by",
            "reported_by_name",
            "report_date",
            "weather_condition",
            "site_condition",
            "work_summary",
            "site_notes",
            "issues",
            "next_day_plan",
            "status",
            "submitted_at",
            "work_entry_count",
            "created_at",
            "updated_at",
        )

        read_only_fields = fields

    def get_work_entry_count(self, obj):
        return obj.work_entries.count()


# =====================================================
# DAILY TASK WORK CREATE SERIALIZER
# =====================================================
class DailyTaskWorkCreateSerializer(serializers.ModelSerializer):

    class Meta:
        model = DailyTaskWork

        fields = (
            "task",
            "work_description",
            "location_detail",
            "quantity_completed_today",
            "completion_claimed",
        )

        extra_kwargs = {
            "task": {
                "required": True,
            },
            "work_description": {
                "required": True,
                "allow_blank": False,
            },
            "location_detail": {
                "required": False,
                "allow_blank": True,
            },
            "quantity_completed_today": {
                "required": False,
                "allow_null": True,
            },
            "completion_claimed": {
                "required": False,
            },
        }

    def validate_work_description(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Describe the work performed.")

        return value

    def validate(self, attrs):
        daily_report = self.context.get("daily_report")

        if daily_report is None:
            raise serializers.ValidationError(
                {"daily_report": "Report context is required."}
            )

        if daily_report.status != DailyReport.Status.DRAFT:
            raise serializers.ValidationError(
                {
                    "daily_report": (
                        "Work entries can only be added " "to draft reports."
                    )
                }
            )

        task = attrs.get("task")

        if task is None:
            raise serializers.ValidationError({"task": "Choose a task."})

        # Task must belong to the same project.
        if task.project_id != daily_report.project_id:
            raise serializers.ValidationError(
                {"task": ("Task must belong to the " "daily report's project.")}
            )

        # Only approved tasks are eligible.
        if task.approval_status != Task.ApprovalStatus.APPROVED:
            raise serializers.ValidationError(
                {"task": ("Only approved tasks can have " "daily work entries.")}
            )

        if task.work_status == Task.WorkStatus.CANCELLED:
            raise serializers.ValidationError(
                {"task": "Cancelled tasks cannot receive work entries."}
            )

        # Prevent the same task appearing twice
        # in the same daily report.
        if DailyTaskWork.objects.filter(
            daily_report=daily_report,
            task=task,
        ).exists():
            raise serializers.ValidationError(
                {"task": ("This task is already included " "in the daily report.")}
            )

        quantity = attrs.get("quantity_completed_today")
        completion_claimed = attrs.get(
            "completion_claimed",
            False,
        )

        # -----------------------------------------
        # QUANTITY-BASED TASK
        # -----------------------------------------

        if task.measurement_method == Task.MeasurementMethod.QUANTITY:

            if quantity is None or quantity <= 0:
                raise serializers.ValidationError(
                    {
                        "quantity_completed_today": (
                            "Enter a completed quantity " "greater than zero."
                        )
                    }
                )

            if completion_claimed:
                raise serializers.ValidationError(
                    {
                        "completion_claimed": (
                            "Quantity-based tasks must " "report measured quantities."
                        )
                    }
                )

            # Verification service will check the
            # cumulative accepted quantity under
            # a database lock.
            if quantity > task.planned_quantity:
                raise serializers.ValidationError(
                    {
                        "quantity_completed_today": (
                            "Today's reported quantity cannot "
                            "exceed the planned task quantity."
                        )
                    }
                )

        # -----------------------------------------
        # COMPLETION-ONLY TASK
        # -----------------------------------------

        elif task.measurement_method == Task.MeasurementMethod.COMPLETION_ONLY:

            if quantity is not None:
                raise serializers.ValidationError(
                    {
                        "quantity_completed_today": (
                            "Completion-only tasks cannot " "report a quantity."
                        )
                    }
                )

            if not completion_claimed:
                raise serializers.ValidationError(
                    {
                        "completion_claimed": (
                            "Confirm completion when " "reporting this task."
                        )
                    }
                )

        return attrs


# =====================================================
# DAILY TASK WORK DETAIL SERIALIZER
# =====================================================
class DailyTaskWorkDetailSerializer(serializers.ModelSerializer):

    task_title = serializers.CharField(
        source="task.title",
        read_only=True,
    )

    measurement_method = serializers.CharField(
        source="task.measurement_method",
        read_only=True,
    )

    measurement_unit = serializers.CharField(
        source="task.measurement_unit",
        read_only=True,
        allow_null=True,
    )

    planned_quantity = serializers.DecimalField(
        source="task.planned_quantity",
        max_digits=12,
        decimal_places=3,
        read_only=True,
        allow_null=True,
    )

    verified_by_name = serializers.CharField(
        source="verified_by.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = DailyTaskWork

        fields = (
            "id",
            "daily_report",
            "task",
            "task_title",
            "measurement_method",
            "measurement_unit",
            "planned_quantity",
            "work_description",
            "location_detail",
            "quantity_completed_today",
            "completion_claimed",
            "verification_status",
            "verified_by",
            "verified_by_name",
            "verified_at",
            "verification_note",
            "created_at",
            "updated_at",
        )

        read_only_fields = fields


# =====================================================
# DAILY MANPOWER CREATE SERIALIZER
# =====================================================
class DailyManpowerCreateSerializer(serializers.ModelSerializer):

    class Meta:
        model = DailyManpower

        fields = (
            "trade",
            "contractor_name",
            "worker_count",
            "hours_worked",
            "remarks",
        )

    def validate_worker_count(self, value):
        if value < 1:
            raise serializers.ValidationError("Worker count must be at least one.")
        return value

    def validate_hours_worked(self, value):
        if value is not None and not (0 <= value <= 24):
            raise serializers.ValidationError(
                "Hours per worker must be between 0 and 24."
            )
        return value


# =====================================================
# DAILY MANPOWER DETAIL SERIALIZER
# =====================================================
class DailyManpowerDetailSerializer(serializers.ModelSerializer):

    trade_display = serializers.CharField(
        source="get_trade_display",
        read_only=True,
    )

    class Meta:
        model = DailyManpower

        fields = (
            "id",
            "daily_report",
            "trade",
            "trade_display",
            "contractor_name",
            "worker_count",
            "hours_worked",
            "remarks",
            "created_at",
        )

        read_only_fields = fields


# =====================================================
# DAILY MATERIAL CREATE SERIALIZER
# =====================================================


class DailyMaterialEntryCreateSerializer(serializers.ModelSerializer):

    class Meta:
        model = DailyMaterialEntry

        fields = (
            "material_name",
            "entry_type",
            "quantity",
            "unit",
            "remarks",
        )

    def validate_material_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Material name is required.")

        return value

    def validate(self, attrs):
        quantity = attrs.get("quantity")
        unit = attrs.get("unit", "")

        if quantity is not None:
            if quantity <= 0:
                raise serializers.ValidationError(
                    {"quantity": ("Quantity must be greater than zero.")}
                )

            if not unit or not unit.strip():
                raise serializers.ValidationError(
                    {"unit": ("Provide a unit when entering " "a material quantity.")}
                )

        return attrs


# =====================================================
# DAILY MATERIAL DETAIL SERIALIZER
# =====================================================
class DailyMaterialEntryDetailSerializer(serializers.ModelSerializer):

    entry_type_display = serializers.CharField(
        source="get_entry_type_display",
        read_only=True,
    )

    class Meta:
        model = DailyMaterialEntry

        fields = (
            "id",
            "daily_report",
            "material_name",
            "entry_type",
            "entry_type_display",
            "quantity",
            "unit",
            "remarks",
            "created_at",
        )

        read_only_fields = fields


# =====================================================
# DAILY REPORT ATTACHMENT UPLOAD SERIALIZER
# =====================================================
class DailyReportAttachmentUploadSerializer(serializers.Serializer):
    file = serializers.FileField(
        allow_empty_file=False,
    )

    task_work = serializers.PrimaryKeyRelatedField(
        queryset=DailyTaskWork.objects.all(),
        required=False,
        allow_null=True,
    )

    caption = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=1000,
    )

    MAX_FILE_SIZE = 10 * 1024 * 1024

    ALLOWED_EXTENSIONS = {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".pdf",
    }

    ALLOWED_CONTENT_TYPES = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
    }

    def validate_file(self, value):
        if value.size > self.MAX_FILE_SIZE:
            raise serializers.ValidationError("File must not exceed 10 MB.")

        extension = Path(value.name).suffix.lower()

        if extension not in self.ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                "Only JPG, JPEG, PNG, WEBP, and PDF files are allowed."
            )

        # UploadedFile.content_type is client-supplied
        # metadata, so it is only an initial check.
        content_type = getattr(
            value,
            "content_type",
            None,
        )

        if content_type not in self.ALLOWED_CONTENT_TYPES:
            raise serializers.ValidationError("Unsupported file content type.")

        return value

    def validate_task_work(self, value):
        if value is None:
            return value

        daily_report = self.context.get("daily_report")

        if daily_report is None:
            raise serializers.ValidationError("Daily report context is required.")

        if value.daily_report_id != daily_report.id:
            raise serializers.ValidationError(
                "Work entry must belong to this daily report."
            )

        return value
