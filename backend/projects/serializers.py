from pathlib import Path

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_image_file_extension
from rest_framework import serializers

from .models import ProjectCategory, MAX_IMAGE_SIZE


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
