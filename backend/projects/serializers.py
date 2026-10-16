from pathlib import Path
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_image_file_extension
from rest_framework import serializers
from .models import ProjectCategory, MAX_IMAGE_SIZE , Project , ProjectSupervisor


User = get_user_model()

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

        return value


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

        if existing_ids:
            raise serializers.ValidationError(
                "One or more supervisors are already " "assigned to this project."
            )

        return supervisors

# ===========================================
#     PROJECT OVERVIEW SERIALIZER
# ===========================================
class ProjectOverviewSerializer(serializers.ModelSerializer):
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
            "cover_image",
            "start_date",
            "end_date",
            "status",
            "created_by",
            "created_by_name",
            "supervisor_count",
            "supervisors",
            "created_at",
            "updated_at",
        )

        read_only_fields = fields
