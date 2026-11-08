from pathlib import Path
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_image_file_extension
from rest_framework import serializers
from .models import ProjectCategory, MAX_IMAGE_SIZE , Project , ProjectSupervisor
from common.image_compression import compress_image

User = get_user_model()


def project_cancellation(project):
    if project.status != Project.Status.CANCELLED:
        return None
    from activity.models import ActivityLog
    log = ActivityLog.objects.filter(
        entity_type="PROJECT", entity_id=project.pk,
        action="PROJECT_STATUS_CHANGED", metadata__new_status="CANCELLED",
    ).select_related("actor").first()
    if not log:
        return None
    return {
        "reason": log.metadata.get("reason", ""),
        "cancelled_at": log.created_at.isoformat(),
        "cancelled_by": log.metadata.get("actor_name") or (log.actor.username if log.actor else "Former Admin"),
    }

# ============================================================
# PROJECT CATEGORY SERIALIZERS
# ============================================================

class ProjectCategorySerializer(serializers.ModelSerializer):
    image = serializers.ImageField(
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ProjectCategory
        fields = (
            "id",
            "name",
            "description",
            "image",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
        )

    def validate_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Category name cannot be empty.")

        queryset = ProjectCategory.objects.filter(name__iexact=value)

        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError(
                "A category with this name already exists."
            )

        return value

    def validate_image(self, value):
        if value is None:
            return value

        if value.size > MAX_IMAGE_SIZE:
            raise serializers.ValidationError("Image size must not exceed 5 MB.")

        try:
            validate_image_file_extension(value)
        except DjangoValidationError:
            raise serializers.ValidationError("Upload a valid image file.")

        allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}

        if Path(value.name).suffix.lower() not in allowed_extensions:
            raise serializers.ValidationError("Allowed formats: JPG, JPEG, PNG, WEBP.")

        return compress_image(value)


# ============================================================
# PROJECT CATEGORY LIST SERIALIZERS
# ============================================================

class ProjectCategoryListSerializer(serializers.ModelSerializer):

    class Meta:
        model = ProjectCategory
        fields = (
            "id",
            "name",
            "description",
            "image",
        )
        read_only_fields = fields


# ============================================================
# PROJECT CREATE UPDATE SERIALIZER
# ============================================================
class ProjectCreateUpdateSerializer(serializers.ModelSerializer):
    """
    Used by Admin to create and update projects.
    """

    category = serializers.PrimaryKeyRelatedField(
        queryset=ProjectCategory.objects.filter(is_active=True)
    )
    cancellation_reason = serializers.CharField(write_only=True, required=False, max_length=1000)

    class Meta:
        model = Project

        fields = (
            "id",
            "category",
            "name",
            "client_name",
            "description",
            "location",
            "start_date",
            "end_date",
            "status",
            "cancellation_reason",
            "cover_image",
            "created_at",
            "updated_at",
        )

        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
        )

        extra_kwargs = {
            "name": {"required": True},
            "cover_image": {
                "required": False,
                "allow_null": True,
            },
        }

    def validate_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Project name cannot be empty.")

        return value

    def validate(self, attrs):
        current_status = getattr(self.instance, "status", None)
        new_status = attrs.get("status")
        if current_status == Project.Status.CANCELLED and (
            set(attrs) != {"status"} or new_status == Project.Status.CANCELLED
        ):
            raise serializers.ValidationError({"project": "Change the cancelled project's status before editing its details. Send only the new status."})
        if new_status == Project.Status.CANCELLED:
            if current_status not in {Project.Status.ACTIVE, Project.Status.MAINTENANCE, Project.Status.ON_HOLD}:
                raise serializers.ValidationError({"status": "Only active, maintenance or on-hold projects can be cancelled."})
            if not attrs.get("cancellation_reason", "").strip():
                raise serializers.ValidationError({"cancellation_reason": "A cancellation reason is required."})
        elif "cancellation_reason" in attrs:
            raise serializers.ValidationError({"cancellation_reason": "A reason is only accepted when cancelling a project."})

        start_date = attrs.get(
            "start_date",
            getattr(self.instance, "start_date", None),
        )

        end_date = attrs.get(
            "end_date",
            getattr(self.instance, "end_date", None),
        )

        if start_date is not None and end_date is not None and start_date > end_date:
            raise serializers.ValidationError(
                {"end_date": ("Project end date cannot be " "earlier than start date.")}
            )

        return attrs

    def validate_cover_image(self, value):
        if value is None:
            return value

        # Check the original upload before compression.
        if value.size > MAX_IMAGE_SIZE:
            raise serializers.ValidationError("Image size must not exceed 5 MB.")

        # DRF's ImageField already validates image readability.
        # Preserve the uploaded file format.
        allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}

        if Path(value.name).suffix.lower() not in allowed_extensions:
            raise serializers.ValidationError("Allowed formats: JPG, JPEG, PNG, WEBP.")

        return compress_image(value)


# ===========================================
#          PROJECT LIST SERIALIZER
# ===========================================


class ProjectListSerializer(serializers.ModelSerializer):

    category_name = serializers.CharField(
        source="category.name",
        read_only=True,
    )

    class Meta:
        model = Project

        fields = (
            "id",
            "name",
            "category",
            "category_name",
            "client_name",
            "location",
            "status",
            "start_date",
            "end_date",
            "cover_image",
            "created_at",
        )

        read_only_fields = fields


# ===========================================
#          PROJECT DETAILED SERIALIZER
# ===========================================
class ProjectDetailSerializer(serializers.ModelSerializer):
    category_is_active = serializers.BooleanField(source="category.is_active", read_only=True)
    cancellation = serializers.SerializerMethodField()

    def get_cancellation(self, obj):
        return project_cancellation(obj)

    category_name = serializers.CharField(
        source="category.name",
        read_only=True,
    )

    created_by_name = serializers.CharField(
        source="created_by.username",
        read_only=True,
    )

    supervisor_count = serializers.IntegerField(
        read_only=True,
    )

    class Meta:
        model = Project

        fields = (
            "id",
            "name",
            "category",
            "category_name",
            "client_name",
            "description",
            "location",
            "start_date",
            "end_date",
            "status",
            "cover_image",
            "created_by",
            "created_by_name",
            "supervisor_count",
            "cancellation",
            "category_is_active",
            "created_at",
            "updated_at",
        )

        read_only_fields = fields


# ===========================================
#          PROJECT SUPERVISOR SERIALIZER
# ===========================================
class ProjectSupervisorSerializer(serializers.ModelSerializer):
    supervisor_name = serializers.CharField(
        source="supervisor.get_full_name",
        read_only=True,
    )

    supervisor_phone = serializers.CharField(
        source="supervisor.phone",
        read_only=True,
    )

    supervisor_email = serializers.EmailField(
        source="supervisor.email",
        read_only=True,
    )

    class Meta:
        model = ProjectSupervisor

        fields = (
            "id",
            "project",
            "supervisor",
            "supervisor_name",
            "supervisor_phone",
            "supervisor_email",
            "assigned_by",
            "assigned_at",
        )

        read_only_fields = fields


# ===========================================
#          PROJECT ASSIGNMENT SERIALIZER
# ===========================================
class ProjectAssignmentSerializer(serializers.Serializer):
    supervisor_ids = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(
            role=User.Role.SUPERVISOR,
            is_active=True,
        ),
        many=True,
        allow_empty=False,
    )

    def validate_supervisor_ids(self, supervisors):
        ids = [supervisor.pk for supervisor in supervisors]

        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Duplicate supervisors are not allowed.")

        project = self.context.get("project")

        if project is None:
            raise serializers.ValidationError("Project context is required.")

        existing_ids = set(
            ProjectSupervisor.objects.filter(
                project=project,
                supervisor_id__in=ids,
            ).values_list("supervisor_id", flat=True)
        )

        return [supervisor for supervisor in supervisors if supervisor.pk not in existing_ids]

# ===========================================
#     PROJECT OVERVIEW SERIALIZER
# ===========================================
class ProjectOverviewSerializer(serializers.ModelSerializer):
    category_is_active = serializers.BooleanField(source="category.is_active", read_only=True)
    cancellation = serializers.SerializerMethodField()

    def get_cancellation(self, obj):
        return project_cancellation(obj)
    category_name = serializers.CharField(
        source="category.name",
        read_only=True,
    )

    category_image = serializers.ImageField(
        source="category.image",
        read_only=True,
    )

    created_by_name = serializers.CharField(
        source="created_by.username",
        read_only=True,
    )

    supervisors = ProjectSupervisorSerializer(
        source="supervisor_assignments",
        many=True,
        read_only=True,
    )

    supervisor_count = serializers.IntegerField(
        read_only=True,
    )

    class Meta:
        model = Project

        fields = (
            "id",
            "name",
            "client_name",
            "description",
            "location",
            "category",
            "category_name",
            "category_image",
            "category_is_active",
            "cover_image",
            "start_date",
            "end_date",
            "status",
            "created_by",
            "created_by_name",
            "supervisor_count",
            "supervisors",
            "cancellation",
            "created_at",
            "updated_at",
        )

        read_only_fields = fields
