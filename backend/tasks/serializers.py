from django.utils import timezone
from rest_framework import serializers
from .models import Task,TaskChangeRequest


# =====================================================
# TASK CREATE SERIALIZER
# =====================================================
class TaskCreateSerializer(serializers.ModelSerializer):
    """
    Validates input for one new task.

    Project and creator are assigned by the backend.
    Approval and work statuses cannot be supplied
    by the client during task creation.
    """

    class Meta:
        model = Task

        fields = (
            "title",
            "description",
            "worker_name",
            "priority",
            "start_date",
            "end_date",
            "display_order",
            "measurement_method",
            "planned_quantity",
            "measurement_unit",
            "completion_criteria",
        )

        extra_kwargs = {
            "title": {
                "required": True,
                "allow_blank": False,
            },
            "description": {
                "required": False,
                "allow_blank": True,
            },
            "worker_name": {
                "required": False,
                "allow_blank": True,
            },
            "priority": {
                "required": False,
            },
            "start_date": {
                "required": False,
                "allow_null": True,
            },
            "end_date": {
                "required": False,
                "allow_null": True,
            },
            "display_order": {
                "required": False,
                "min_value": 0,
            },
        }

    def validate_title(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Task title is required.")

        return value

    def validate_worker_name(self, value):
        return value.strip()
    
    
    
    
    def validate(self, attrs):
    
        start_date = attrs.get(
            "start_date",
            getattr(self.instance, "start_date", None),
        )

        end_date = attrs.get(
            "end_date",
            getattr(self.instance, "end_date", None),
        )

        if (
            start_date is not None
            and end_date is not None
            and start_date > end_date
        ):
            raise serializers.ValidationError({
                "end_date": (
                    "End date cannot be earlier "
                    "than start date."
                )
            })

        # -----------------------------------------
        # Progress measurement validation
        # -----------------------------------------

        method = attrs.get(
            "measurement_method",
            getattr(
                self.instance,
                "measurement_method",
                Task.MeasurementMethod.COMPLETION_ONLY,
            ),
        )

        quantity = attrs.get(
            "planned_quantity",
            getattr(self.instance, "planned_quantity", None),
        )

        unit = attrs.get(
            "measurement_unit",
            getattr(self.instance, "measurement_unit", None),
        )

        if method == Task.MeasurementMethod.QUANTITY:

            if quantity is None or quantity <= 0:
                raise serializers.ValidationError({
                    "planned_quantity": (
                        "Quantity-based tasks require "
                        "a planned quantity greater than zero."
                    )
                })

            if not unit:
                raise serializers.ValidationError({
                    "measurement_unit": (
                        "A measurement unit is required "
                        "for quantity-based tasks."
                    )
                })

        elif method == Task.MeasurementMethod.COMPLETION_ONLY:

            if quantity is not None:
                raise serializers.ValidationError({
                    "planned_quantity": (
                        "Completion-only tasks cannot "
                        "have a planned quantity."
                    )
                })

            if unit is not None:
                raise serializers.ValidationError({
                    "measurement_unit": (
                        "Completion-only tasks cannot "
                        "have a measurement unit."
                    )
                })

        return attrs


# =====================================================
# BULK TASK CREATE SERIALIZER
# =====================================================
class BulkTaskCreateSerializer(serializers.Serializer):
    """
    Validates a complete bulk task submission.

    A batch is created only after all submitted
    tasks pass validation.
    """

    tasks = TaskCreateSerializer(
        many=True,
        allow_empty=False,
    )

    def validate_tasks(self, value):
        if len(value) > 100:
            raise serializers.ValidationError(
                "You can create a maximum of " "100 tasks in one batch."
            )

        return value


# =====================================================
# TASK LIST SERIALIZER
# =====================================================
class TaskListSerializer(serializers.ModelSerializer):

    created_by_name = serializers.CharField(
        source="created_by.username",
        read_only=True,
    )

    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Task

        fields = (
            "id",
            "project",
            "batch",
            "title",
            "worker_name",
            "priority",
            "start_date",
            "end_date",
            "display_order",
            "approval_status",
            "work_status",
            "measurement_method",
            "planned_quantity",
            "measurement_unit",
            "completion_criteria",
            "is_overdue",
            "created_by",
            "created_by_name",
            "created_at",
        )

        read_only_fields = fields

    def get_is_overdue(self, obj):
        if obj.end_date is None:
            return False

        if obj.approval_status != Task.ApprovalStatus.APPROVED:
            return False

        if obj.work_status in (
            Task.WorkStatus.COMPLETED,
            Task.WorkStatus.CANCELLED,
        ):
            return False

        return obj.end_date < timezone.localdate()


# =====================================================
# TASK DETAIL SERIALIZER
# =====================================================
class TaskDetailSerializer(serializers.ModelSerializer):

    project_name = serializers.CharField(
        source="project.name",
        read_only=True,
    )

    created_by_name = serializers.CharField(
        source="created_by.username",
        read_only=True,
    )

    approved_by_name = serializers.CharField(
        source="approved_by.username",
        read_only=True,
        allow_null=True,
    )

    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Task

        fields = (
            "id",
            "project",
            "project_name",
            "batch",
            "title",
            "description",
            "worker_name",
            "priority",
            "start_date",
            "end_date",
            "display_order",
            "approval_status",
            "work_status",
            "measurement_method",
            "planned_quantity",
            "measurement_unit",
            "completion_criteria",
            "is_overdue",
            "created_by",
            "created_by_name",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "created_at",
            "updated_at",
        )

        read_only_fields = fields

    def get_is_overdue(self, obj):
        if obj.end_date is None:
            return False

        if obj.approval_status != Task.ApprovalStatus.APPROVED:
            return False

        if obj.work_status in (
            Task.WorkStatus.COMPLETED,
            Task.WorkStatus.CANCELLED,
        ):
            return False

        return obj.end_date < timezone.localdate()


# =====================================================
# TASK APPROVAL SERIALIZER
# =====================================================
class TaskApprovalSerializer(serializers.Serializer):
    """
    Admin approves a pending task.

    Approval fields will be updated by the service.
    """

    comment = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=1000,
        trim_whitespace=True,
    )


# =====================================================
# TASK REJECTION SERIALIZER
# =====================================================
class TaskRejectionSerializer(serializers.Serializer):
    """
    Admin rejects a pending task.

    A rejection reason is required for audit history.
    """

    reason = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=1000,
        trim_whitespace=True,
    )

    def validate_reason(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Rejection reason is required.")

        return value


# =====================================================
# TASK APPROVAL LIST SERIALIZER
# =====================================================
class TaskApprovalListSerializer(serializers.ModelSerializer):

    project_name = serializers.CharField(
        source="project.name",
        read_only=True,
    )

    created_by_name = serializers.CharField(
        source="created_by.username",
        read_only=True,
    )

    class Meta:
        model = Task

        fields = (
            "id",
            "project",
            "project_name",
            "batch",
            "title",
            "description",
            "worker_name",
            "priority",
            "start_date",
            "end_date",
            "display_order",
            "measurement_method",
            "planned_quantity",
            "measurement_unit",
            "completion_criteria",
            "approval_status",
            "created_by",
            "created_by_name",
            "created_at",
        )

        read_only_fields = fields


# =====================================================
# TASK HISTORY SERIALIZER
# =====================================================
from .models import TaskHistory
class TaskHistorySerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source="task.title", read_only=True)
    project_id = serializers.UUIDField(source="task.project_id", read_only=True)
    project_name = serializers.CharField(source="task.project.name", read_only=True)
    actor_name = serializers.CharField(
        source="actor.username",
        read_only=True,
        allow_null=True,
    )

    action_display = serializers.CharField(
        source="get_action_display",
        read_only=True,
    )

    class Meta:
        model = TaskHistory

        fields = (
            "id",
            "task",
            "task_title",
            "project_id",
            "project_name",
            "actor",
            "actor_name",
            "action",
            "action_display",
            "details",
            "created_at",
        )

        read_only_fields = fields


# =====================================================
# TASK COMPLETION SERIALIZER
# =====================================================
class TaskCompleteSerializer(serializers.Serializer):
    comment = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        max_length=1000,
    )


# =====================================================
# TASK CANCELLATION SERIALIZER
# =====================================================
class TaskCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(
        required=True,
        allow_blank=False,
        trim_whitespace=True,
        max_length=1000,
    )

    def validate_reason(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Cancellation reason is required.")

        return value


# =====================================================
# TASK CHANGE REQUEST CREATE SERIALIZER
# =====================================================
class TaskChangeRequestCreateSerializer(serializers.Serializer):
    """
    Supervisor proposes changes to an approved task.

    The task is NOT modified by this serializer.
    """

    new_values = serializers.DictField(
        child=serializers.JSONField(),
        allow_empty=False,
    )

    reason = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=2000,
        trim_whitespace=True,
    )

    ALLOWED_EDIT_FIELDS = {
        "title",
        "description",
        "worker_name",
        "priority",
        "start_date",
        # Progress measurement baseline
        "measurement_method",
        "planned_quantity",
        "measurement_unit",
        "completion_criteria",
    }

    def validate_new_values(self, value):
        unknown_fields = set(value) - self.ALLOWED_EDIT_FIELDS

        if unknown_fields:
            raise serializers.ValidationError(
                "Unsupported task fields: " + ", ".join(sorted(unknown_fields))
            )

        task = self.context.get("task")

        if task is None:
            raise serializers.ValidationError("Task context is required.")

        # Reuse field validation from the existing
        # TaskCreateSerializer.
        validator = TaskCreateSerializer(
            instance=task,
            data=value,
            partial=True,
        )

        validator.is_valid(raise_exception=True)

        cleaned_values = dict(validator.validated_data)

        # JSONField needs JSON-compatible values.
        # Convert validated dates to ISO strings.
        from decimal import Decimal
        from datetime import date, datetime
        for field, value in cleaned_values.items():
            if isinstance(value, Decimal):
                cleaned_values[field] = str(value)

            elif isinstance(value, (date, datetime)):
                cleaned_values[field] = value.isoformat()

        if not cleaned_values:
            raise serializers.ValidationError("At least one valid change is required.")

        return cleaned_values

    def validate_reason(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("A reason is required.")

        return value


# =====================================================
# TASK CHANGE REQUEST DETAIL SERIALIZER
# =====================================================
class TaskChangeRequestDetailSerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(
        source="task.title",
        read_only=True,
    )

    project_id = serializers.UUIDField(
        source="task.project_id",
        read_only=True,
    )

    requested_by_name = serializers.CharField(
        source="requested_by.username",
        read_only=True,
    )

    reviewed_by_name = serializers.CharField(
        source="reviewed_by.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = TaskChangeRequest

        fields = (
            "id",
            "task",
            "task_title",
            "project_id",
            "requested_by",
            "requested_by_name",
            "change_type",
            "old_values",
            "new_values",
            "reason",
            "status",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "admin_comment",
            "created_at",
            "updated_at",
        )

        read_only_fields = fields


# =====================================================
# TASK CHANGE REQUEST REVIEW SERIALIZER
# =====================================================
class TaskChangeRequestReviewSerializer(serializers.Serializer):
    admin_comment = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
        trim_whitespace=True,
    )


# =====================================================
# TASK RESUBMISSION SERIALIZER
# =====================================================


class TaskResubmissionSerializer(TaskCreateSerializer):
    """
    Validate corrections to a rejected task.

    The existing Task instance must be supplied
    through serializer(instance=task, data=...).

    The service will handle:
    - checking rejection status
    - checking task ownership
    - checking supervisor assignment
    - resetting approval status to PENDING
    - recording the RESUBMITTED history event
    """

    resubmission_note = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=2000,
        trim_whitespace=True,
        write_only=True,
    )

    class Meta(TaskCreateSerializer.Meta):
        fields = (
                "title",
                "description",
                "worker_name",
                "priority",
                "start_date",
                "end_date",
                "display_order",
                "measurement_method",
                "planned_quantity",
                "measurement_unit",
                "completion_criteria",
                "resubmission_note",
            )

        extra_kwargs = {
                **TaskCreateSerializer.Meta.extra_kwargs,
                "title": {
                    "required": False,
                    "allow_blank": False,
                },
            }

    def validate_resubmission_note(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Explain what was corrected before resubmitting."
            )

        return value

    def validate(self, attrs):
        # Reuse the TaskCreateSerializer's date checks,
        # including comparison with existing task dates.
        attrs = super().validate(attrs)

        corrected_fields = {
            "title",
            "description",
            "worker_name",
            "priority",
            "start_date",
            "end_date",
            "display_order",
            "measurement_method",
            "planned_quantity",
            "measurement_unit",
            "completion_criteria",
        }

        if not corrected_fields.intersection(attrs):
            raise serializers.ValidationError(
                {
                    "detail": (
                        "Provide at least one task field "
                        "to correct before resubmitting."
                    )
                }
            )

        task = self.instance

        if task is not None:
            has_actual_change = any(
                getattr(task, field) != attrs[field]
                for field in corrected_fields.intersection(attrs)
            )

            if not has_actual_change:
                raise serializers.ValidationError(
                    {
                        "detail": (
                            "No actual changes detected. "
                            "Modify at least one task field."
                        )
                    }
                )

        # The note is metadata for the resubmission
        # history event, not a Task model field.
        return attrs


# =====================================================
# TIMELINE REORDER REQUEST SERIALIZER
# =====================================================


class TimelineReorderSerializer(serializers.Serializer):
    """
    Accepts the proposed order of approved tasks.

    Task IDs must be unique.
    Project membership and completeness are
    checked in the service.
    """

    task_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
        min_length=1,
    )

    reason = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=2000,
        trim_whitespace=True,
    )

    def validate_task_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Duplicate task IDs are not allowed.")

        return value

    def validate_reason(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("A reason for reordering is required.")

        return value


# =====================================================
# TIMELINE CHANGE REQUEST DETAIL SERIALIZER
# =====================================================


class TimelineChangeRequestDetailSerializer(TaskChangeRequestDetailSerializer):
    """
    Reuses the existing change-request detail
    serializer for ORDER_CHANGE requests.
    """

    pass


# =====================================================
# TIMELINE CHANGE REVIEW SERIALIZER
# =====================================================


class TimelineChangeReviewSerializer(TaskChangeRequestReviewSerializer):
    """
    Admin comment for order approval or rejection.
    """

    pass
