from rest_framework import serializers
from pathlib import Path
from django.conf import settings
from tasks.models import Task
from PIL import Image, UnidentifiedImageError
from django.conf import settings

from .models import (
    DailyReport,
    DailyTaskWork,
    DailyManpower,
    DailyMaterialEntry,
    DailyReportAttachment,
    DelayReport
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

    source_report = serializers.PrimaryKeyRelatedField(queryset=DailyReport.objects.all(), required=False, write_only=True)
    client_id = serializers.UUIDField(required=False, write_only=True)

    def validate(self, attrs):
        if self.instance and ({"source_report", "client_id"} & set(attrs)):
            raise serializers.ValidationError("Source and retry identifiers are accepted only when creating a draft.")
        return attrs

    class Meta:
        model = DailyReport

        fields = (
            "source_report",
            "client_id",
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
    work_counts = serializers.SerializerMethodField()
    correction_summary = serializers.SerializerMethodField()

    def get_correction_summary(self, obj):
        user = getattr(self.context.get("request"), "user", None)
        if not user or user.role != "SUPERVISOR" or user.is_staff or not user.is_active or obj.reported_by_id != user.id or obj.status != "SUBMITTED":
            return None
        rejected = obj.work_entries.filter(verification_status="REJECTED")
        eligible = rejected.filter(correction__isnull=True, task__approval_status="APPROVED").exclude(task__work_status__in=["COMPLETED", "CANCELLED"])
        def preview(row):
            correction = getattr(row, "correction", None)
            target = correction.daily_report if correction else None
            visible = target and (target.status == "SUBMITTED" or target.reported_by_id == user.id)
            return {"id": str(row.id), "task_title": row.task.title, "verification_note": row.verification_note,
                    "correction_report": {"id": str(target.id), "status": target.status} if visible else None}
        return {"rejected_count": obj.rejected_count if hasattr(obj, "rejected_count") else rejected.count(), "eligible_count": (obj.eligible_corrections if hasattr(obj, "eligible_corrections") else eligible.count()) if obj.project.status in ["ACTIVE", "MAINTENANCE"] else 0,
                "entries": [preview(row) for row in (obj.rejected_preview if hasattr(obj, "rejected_preview") else rejected.select_related("task", "correction__daily_report").order_by("created_at", "id")[:5])]}

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
            "work_counts",
            "correction_summary",
            "created_at",
            "updated_at",
        )

        read_only_fields = fields

    def get_work_entry_count(self, obj):
        return obj.entry_count if hasattr(obj, "entry_count") else obj.work_entries.count()

    def get_work_counts(self, obj):
        if hasattr(obj, "pending_count"):
            return {"pending": obj.pending_count, "verified": obj.verified_count, "rejected": obj.rejected_count}
        from django.db.models import Count, Q
        return obj.work_entries.aggregate(
            pending=Count("id", filter=Q(verification_status="PENDING")),
            verified=Count("id", filter=Q(verification_status="VERIFIED")),
            rejected=Count("id", filter=Q(verification_status="REJECTED")),
        )


class DailyReportQuerySerializer(serializers.Serializer):
    search = serializers.CharField(required=False, allow_blank=True, max_length=200)
    status = serializers.ChoiceField(choices=DailyReport.Status.choices, required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    reported_by = serializers.UUIDField(required=False)
    sort = serializers.ChoiceField(choices=["newest", "oldest"], default="newest")

    def validate(self, attrs):
        if attrs.get("date_from") and attrs.get("date_to") and attrs["date_from"] > attrs["date_to"]:
            raise serializers.ValidationError({"date_to": "End date must be on or after start date."})
        return attrs


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
        ).exclude(pk=self.instance.pk if self.instance else None).exists():
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
    reviewed_baseline = serializers.SerializerMethodField()

    def get_reviewed_baseline(self, obj):
        if not obj.verified_at:
            return None
        from tasks.models import TaskHistory
        fields = ("measurement_method", "planned_quantity", "measurement_unit", "completion_criteria")
        baseline = {field: getattr(obj.task, field) for field in fields}
        if "baseline_changes" not in self.context:
            entries = list(self.parent.instance) if isinstance(self.parent, serializers.ListSerializer) else [obj]
            originals = [entry.correction_of for entry in entries if entry.correction_of_id]
            reviewed = [entry for entry in [*entries, *originals] if entry.verified_at]
            self.context["baseline_changes"] = list(TaskHistory.objects.filter(
                task_id__in=[entry.task_id for entry in reviewed], action="EDIT_APPROVED",
                created_at__gt=min(entry.verified_at for entry in reviewed),
            ).order_by("-created_at", "-id").values("task_id", "created_at", "details"))
        # Approved changes already retain old_values. Roll them back to the decision time.
        for change in self.context["baseline_changes"]:
            if change["task_id"] == obj.task_id and change["created_at"] > obj.verified_at:
                old = change["details"].get("old_values", {})
                baseline.update({field: old[field] for field in fields if field in old})
        if baseline["planned_quantity"] is not None:
            baseline["planned_quantity"] = str(baseline["planned_quantity"])
        return baseline

    progress = serializers.SerializerMethodField()

    def get_progress(self, obj):
        from .progress import calculate_task_progress, verified_work_totals
        if "work_progress_totals" not in self.context:
            entries = self.parent.instance if isinstance(self.parent, serializers.ListSerializer) else [obj]
            self.context["work_progress_totals"] = verified_work_totals([entry.task_id for entry in entries])
        return calculate_task_progress(obj.task, self.context["work_progress_totals"])

    completion_criteria = serializers.CharField(source="task.completion_criteria", read_only=True)
    task_work_status = serializers.CharField(source="task.work_status", read_only=True)
    correction_id = serializers.SerializerMethodField()
    correction_report = serializers.SerializerMethodField()
    original_work = serializers.SerializerMethodField()
    can_correct = serializers.SerializerMethodField()

    def get_can_correct(self, obj):
        user = getattr(self.context.get("request"), "user", None)
        return bool(user and user.is_active and user.role == "SUPERVISOR" and not user.is_staff and obj.daily_report.reported_by_id == user.id
                    and obj.daily_report.status == "SUBMITTED" and obj.verification_status == "REJECTED" and not hasattr(obj, "correction")
                    and obj.task.approval_status == "APPROVED" and obj.task.work_status not in ["COMPLETED", "CANCELLED"]
                    and obj.daily_report.project.status in ["ACTIVE", "MAINTENANCE"])

    def get_correction_report(self, obj):
        if not self.get_correction_id(obj):
            return None
        report = obj.correction.daily_report
        return {"id": str(report.id), "status": report.status}

    def get_original_work(self, obj):
        if not obj.correction_of_id:
            return None
        original = obj.correction_of
        if original.daily_report.status != "SUBMITTED":
            return None
        if original.task_id == obj.task_id:
            original.task = obj.task
        return {"id": str(original.id), "daily_report": str(original.daily_report_id), "verification_status": original.verification_status,
                "work_description": original.work_description, "location_detail": original.location_detail,
                "quantity_completed_today": str(original.quantity_completed_today) if original.quantity_completed_today is not None else None,
                "completion_claimed": original.completion_claimed, "verification_note": original.verification_note,
                "baseline": self.get_reviewed_baseline(original)}

    def get_correction_id(self, obj):
        try:
            correction = obj.correction
            user = getattr(self.context.get("request"), "user", None)
            if correction.daily_report.status == DailyReport.Status.DRAFT and (
                user is None or correction.daily_report.reported_by_id != user.id
            ):
                return None
            return str(correction.id)
        except DailyTaskWork.DoesNotExist:
            return None
    project_id = serializers.UUIDField(source="daily_report.project_id", read_only=True)
    project_name = serializers.CharField(source="daily_report.project.name", read_only=True)
    report_date = serializers.DateField(source="daily_report.report_date", read_only=True)
    reported_by_name = serializers.CharField(source="daily_report.reported_by.username", read_only=True)
    report_status = serializers.CharField(source="daily_report.status", read_only=True)

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
            "progress",
            "reviewed_baseline",
            "daily_report",
            "project_id",
            "project_name",
            "report_date",
            "reported_by_name",
            "report_status",
            "task",
            "task_title",
            "measurement_method",
            "completion_criteria",
            "task_work_status",
            "correction_id",
            "correction_report",
            "original_work",
            "can_correct",
            "measurement_unit",
            "planned_quantity",
            "work_description",
            "location_detail",
            "quantity_completed_today",
            "completion_claimed",
            "correction_of",
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
    client_id = serializers.UUIDField(required=False, write_only=True)

    class Meta:
        model = DailyManpower

        fields = (
            "client_id",
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
    client_id = serializers.UUIDField(required=False, write_only=True)

    class Meta:
        model = DailyMaterialEntry

        fields = (
            "client_id",
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
    # For PATCH, use existing values when a field
    # was not included in the request.

        existing = self.instance

        quantity = attrs.get(
            "quantity",
            getattr(existing, "quantity", None),
        )

        unit = attrs.get(
            "unit",
            getattr(existing, "unit", ""),
        )

        if quantity is not None:
            if quantity <= 0:
                raise serializers.ValidationError({
                    "quantity": (
                        "Quantity must be greater than zero."
                    )
                })

            if not unit or not unit.strip():
                raise serializers.ValidationError({
                    "unit": (
                        "Provide a unit when entering "
                        "a material quantity."
                    )
                })

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
    client_id = serializers.UUIDField(required=False, write_only=True)
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
        extension = Path(value.name).suffix.lower()

        allowed_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".pdf": "application/pdf",
        }

        expected_type = allowed_types.get(extension)

        if expected_type is None:
            raise serializers.ValidationError(
                "Only JPG, PNG, WEBP and PDF files are allowed."
            )

        if value.size <= 0 or value.size > settings.DAILY_REPORT_MAX_FILE_SIZE:
            raise serializers.ValidationError("File must be between 1 byte and 10 MB.")

        if getattr(value, "content_type", None) != expected_type:
            raise serializers.ValidationError(
                "File content type does not match its extension."
            )

        try:
            value.seek(0)

            if extension == ".pdf":
                # Basic format identification, not full
                # PDF malware/content sanitization.
                if value.read(5) != b"%PDF-":
                    raise serializers.ValidationError(
                        "The uploaded file is not a valid PDF."
                    )

            else:
                with Image.open(value) as image:
                    if image.format not in {"JPEG", "PNG", "WEBP"}:
                        raise serializers.ValidationError("Unsupported image format.")

                    image.verify()

        except (
            UnidentifiedImageError,
            OSError,
            ValueError,
        ):
            raise serializers.ValidationError("The uploaded image is invalid or corrupted.")

        finally:
            value.seek(0)

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


# =====================================================
# DAILY REPORT ATTACHMENT DETAIL SERIALIZER
# =====================================================


class DailyReportAttachmentDetailSerializer(serializers.ModelSerializer):

    uploaded_by_name = serializers.CharField(
        source="uploaded_by.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = DailyReportAttachment

        fields = (
            "id",
            "daily_report",
            "task_work",
            "original_filename",
            "file_size",
            "caption",
            "uploaded_by",
            "uploaded_by_name",
            "created_at",
        )

        read_only_fields = fields


# =====================================================
# DAILY TASK WORK UPDATE SERIALIZER
# =====================================================


class DailyTaskWorkUpdateSerializer(serializers.ModelSerializer):
    """
    Update permitted fields on a draft work entry.

    The task, report, and verification fields
    cannot be modified through this serializer.
    """

    class Meta:
        model = DailyTaskWork

        fields = (
            "work_description",
            "location_detail",
            "quantity_completed_today",
            "completion_claimed",
        )

        extra_kwargs = {
            "work_description": {
                "required": False,
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
            raise serializers.ValidationError("Work description cannot be empty.")

        return value

    def validate(self, attrs):
        entry = self.instance

        if entry is None:
            raise serializers.ValidationError("An existing work entry is required.")

        if entry.daily_report.status != DailyReport.Status.DRAFT:
            raise serializers.ValidationError(
                {"detail": "Only draft work entries can be edited."}
            )

        if entry.verification_status != DailyTaskWork.VerificationStatus.PENDING:
            raise serializers.ValidationError(
                {"detail": "Reviewed work entries cannot be edited."}
            )

        task = entry.task

        if task.approval_status != Task.ApprovalStatus.APPROVED:
            raise serializers.ValidationError({"task": "Task must still be approved."})

        if task.work_status in {
            Task.WorkStatus.COMPLETED,
            Task.WorkStatus.CANCELLED,
        }:
            raise serializers.ValidationError(
                {"task": "Completed or cancelled tasks cannot be edited."}
            )

        description = attrs.get(
            "work_description",
            entry.work_description,
        )

        quantity = attrs.get(
            "quantity_completed_today",
            entry.quantity_completed_today,
        )

        claimed = attrs.get(
            "completion_claimed",
            entry.completion_claimed,
        )

        if not description or not description.strip():
            raise serializers.ValidationError(
                {"work_description": "Work description is required."}
            )

        if task.measurement_method == Task.MeasurementMethod.QUANTITY:
            if quantity is None or quantity <= 0:
                raise serializers.ValidationError(
                    {
                        "quantity_completed_today": (
                            "Enter a quantity greater than zero."
                        )
                    }
                )

            if quantity > task.planned_quantity:
                raise serializers.ValidationError(
                    {
                        "quantity_completed_today": (
                            "Quantity cannot exceed the planned quantity."
                        )
                    }
                )

            if claimed:
                raise serializers.ValidationError(
                    {
                        "completion_claimed": (
                            "Quantity-based tasks must use measured quantities."
                        )
                    }
                )

        elif task.measurement_method == Task.MeasurementMethod.COMPLETION_ONLY:
            if quantity is not None:
                raise serializers.ValidationError(
                    {
                        "quantity_completed_today": (
                            "Completion-only tasks cannot report quantities."
                        )
                    }
                )

            if not claimed:
                raise serializers.ValidationError(
                    {"completion_claimed": ("Confirm completion for this task.")}
                )

        return attrs


class DailyTaskWorkReviewSerializer(serializers.Serializer):
    verification_note = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
        trim_whitespace=True,
    )


# =====================================================
# REJECTED DAILY WORK CORRECTION SERIALIZER
# =====================================================


class DailyTaskWorkCorrectionSerializer(serializers.Serializer):
    new_daily_report = serializers.PrimaryKeyRelatedField(
        queryset=DailyReport.objects.all(),
    )

    work_description = serializers.CharField(
        allow_blank=False,
        trim_whitespace=True,
    )

    location_detail = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255,
    )

    quantity_completed_today = serializers.DecimalField(
        max_digits=12,
        decimal_places=3,
        required=False,
        allow_null=True,
    )

    completion_claimed = serializers.BooleanField(
        required=False,
        default=False,
    )


# =====================================================
# DELAY REPORT CREATE SERIALIZER
# =====================================================


class DelayReportCreateSerializer(serializers.ModelSerializer):
    """
    Supervisor submits a delay report for a Task.

    The backend controls:
    - task
    - reported_by
    - report status
    - review fields
    - extension approval status
    """

    class Meta:
        model = DelayReport

        fields = (
            "delay_type",
            "reason",
            "description",
            "expected_completion_date",
            "extension_requested",
            "requested_end_date",
        )

        extra_kwargs = {
            "reason": {
                "required": True,
                "allow_blank": False,
            },
            "description": {
                "required": False,
                "allow_blank": True,
            },
            "expected_completion_date": {
                "required": False,
                "allow_null": True,
            },
            "extension_requested": {
                "required": False,
            },
            "requested_end_date": {
                "required": False,
                "allow_null": True,
            },
        }

    def validate_reason(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("A delay reason is required.")

        return value

    def validate(self, attrs):
        task = self.context.get("task")

        if task is None:
            raise serializers.ValidationError({"task": "Task context is required."})

        extension_requested = attrs.get(
            "extension_requested",
            False,
        )

        requested_end_date = attrs.get(
            "requested_end_date",
        )

        expected_completion_date = attrs.get(
            "expected_completion_date",
        )

        # -----------------------------------------
        # EXTENSION REQUEST VALIDATION
        # -----------------------------------------

        if extension_requested:

            if requested_end_date is None:
                raise serializers.ValidationError(
                    {
                        "requested_end_date": (
                            "A proposed end date is required "
                            "when requesting an extension."
                        )
                    }
                )

            if task.end_date is not None and requested_end_date <= task.end_date:
                raise serializers.ValidationError(
                    {
                        "requested_end_date": (
                            "The requested end date must be "
                            "later than the current task deadline."
                        )
                    }
                )

            if task.start_date is not None and requested_end_date < task.start_date:
                raise serializers.ValidationError(
                    {
                        "requested_end_date": (
                            "The requested end date cannot be "
                            "earlier than the task start date."
                        )
                    }
                )

        elif requested_end_date is not None:
            raise serializers.ValidationError(
                {
                    "requested_end_date": (
                        "Set extension_requested to true "
                        "when providing a requested end date."
                    )
                }
            )

        # -----------------------------------------
        # EXPECTED COMPLETION DATE VALIDATION
        # -----------------------------------------

        if (
            expected_completion_date is not None
            and task.start_date is not None
            and expected_completion_date < task.start_date
        ):
            raise serializers.ValidationError(
                {
                    "expected_completion_date": (
                        "Expected completion cannot be "
                        "earlier than the task start date."
                    )
                }
            )

        return attrs


# =====================================================
# DELAY REPORT DETAIL SERIALIZER
# =====================================================


class DelayReportQuerySerializer(serializers.Serializer):
    project = serializers.UUIDField(required=False)
    task = serializers.UUIDField(required=False)
    status = serializers.ChoiceField(choices=DelayReport.Status.choices, required=False)
    delay_type = serializers.ChoiceField(choices=DelayReport.DelayType.choices, required=False)
    extension_status = serializers.ChoiceField(choices=DelayReport.Status.choices, required=False)
    extension_requested = serializers.BooleanField(required=False)
    pending_only = serializers.BooleanField(required=False, default=False)
    search = serializers.CharField(required=False, allow_blank=True, max_length=200)
    project_search = serializers.CharField(required=False, allow_blank=True, max_length=200)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    sort = serializers.ChoiceField(choices=["newest", "oldest"], default="newest")

    def validate(self, attrs):
        if attrs.get("date_from") and attrs.get("date_to") and attrs["date_from"] > attrs["date_to"]:
            raise serializers.ValidationError({"date_to": "End date must be on or after start date."})
        return attrs


class DelayReportDetailSerializer(serializers.ModelSerializer):
    deadline_history = serializers.SerializerMethodField()

    def get_deadline_history(self, obj):
        from activity.models import ActivityLog
        if "delay_audits" not in self.context:
            reports = list(self.parent.instance) if isinstance(self.parent, serializers.ListSerializer) else [obj]
            audits = ActivityLog.objects.filter(
                entity_type="DELAY_REPORT", entity_id__in=[report.pk for report in reports],
                action__in=["DELAY_REPORT_SUBMITTED", "EXTENSION_APPROVED", "EXTENSION_REJECTED"],
            ).order_by("created_at", "id").values("entity_id", "action", "metadata")
            self.context["delay_audits"] = {(audit["entity_id"], audit["action"]): audit["metadata"] for audit in audits}
        audits = self.context["delay_audits"]
        submission = audits.get((obj.pk, "DELAY_REPORT_SUBMITTED"), {})
        approved = audits.get((obj.pk, "EXTENSION_APPROVED"), {})
        rejected = audits.get((obj.pk, "EXTENSION_REJECTED"), {})
        return {
            "submission_deadline_recorded": "deadline_at_submission" in submission,
            "deadline_at_submission": submission.get("deadline_at_submission"),
            "previous_approved_deadline": approved.get("old_end_date"),
            "new_approved_deadline": approved.get("new_end_date"),
            "deadline_at_rejection": rejected.get("current_end_date"),
        }

    project_name = serializers.CharField(source="task.project.name", read_only=True)
    current_end_date = serializers.DateField(source="task.end_date", read_only=True, allow_null=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.username", read_only=True, allow_null=True)
    extension_reviewed_by_name = serializers.CharField(source="extension_reviewed_by.username", read_only=True, allow_null=True)

    task_title = serializers.CharField(
        source="task.title",
        read_only=True,
    )

    project_id = serializers.UUIDField(
        source="task.project_id",
        read_only=True,
    )

    reported_by_name = serializers.CharField(
        source="reported_by.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = DelayReport

        fields = (
            "id",
            "task",
            "task_title",
            "project_id",
            "project_name",
            "current_end_date",
            "deadline_history",
            "reported_by",
            "reported_by_name",
            "delay_type",
            "reason",
            "description",
            "expected_completion_date",
            "extension_requested",
            "requested_end_date",
            "status",
            "extension_status",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "admin_comment",
            "extension_reviewed_by",
            "extension_reviewed_by_name",
            "extension_reviewed_at",
            "extension_admin_comment",
            "reported_at",
        )

        read_only_fields = fields


# =====================================================
# DELAY REPORT REVIEW SERIALIZER
# =====================================================


class DelayReportReviewSerializer(serializers.Serializer):

    admin_comment = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
        trim_whitespace=True,
    )


# =====================================================
# DEADLINE EXTENSION REVIEW SERIALIZER
# =====================================================

class DelayExtensionReviewSerializer(serializers.Serializer):

    admin_comment = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
        trim_whitespace=True,
    )
