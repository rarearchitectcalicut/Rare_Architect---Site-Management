from django.utils import timezone
from rest_framework import serializers
from .models import Task


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
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")

        if start_date is not None and end_date is not None and start_date > end_date:
            raise serializers.ValidationError(
                {"end_date": ("End date cannot be earlier " "than start date.")}
            )

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
            "actor",
            "actor_name",
            "action",
            "action_display",
            "details",
            "created_at",
        )

        read_only_fields = fields
