from rest_framework import serializers

from .models import (
    ProjectDocument,
    ProjectDocumentVersion,
    TaskDocument,
    TaskDocumentVersion
)
from .validators import validate_document_file

# =====================================================
# PROJECT DOCUMENT VERSION SERIALIZER
# =====================================================


class ProjectDocumentVersionSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.username", read_only=True)

    class Meta:
        model = ProjectDocumentVersion

        fields = (
            "id",
            "version_number",
            "original_filename",
            "file_size",
            "uploaded_by",
            "uploaded_by_name",
            "is_current",
            "created_at",
        )

        read_only_fields = fields


# =====================================================
# PROJECT DOCUMENT LIST SERIALIZER
# =====================================================


class ProjectDocumentListSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.username", read_only=True)

    current_version = serializers.SerializerMethodField()

    class Meta:
        model = ProjectDocument

        fields = (
            "id",
            "project",
            "title",
            "description",
            "document_type",
            "uploaded_by",
            "uploaded_by_name",
            "created_at",
            "updated_at",
            "current_version",
        )

        read_only_fields = fields

    def get_current_version(self, obj):
        versions = getattr(
            obj,
            "prefetched_versions",
            None,
        )

        if versions is not None:
            current = next(
                (version for version in versions if version.is_current),
                None,
            )
        else:
            current = obj.versions.select_related("uploaded_by").filter(is_current=True).first()

        if current is None:
            return None

        return ProjectDocumentVersionSerializer(current).data


# =====================================================
# PROJECT DOCUMENT DETAIL SERIALIZER
# =====================================================


class ProjectDocumentDetailSerializer(ProjectDocumentListSerializer):

    version_count = serializers.SerializerMethodField()

    class Meta(ProjectDocumentListSerializer.Meta):

        fields = (
            *ProjectDocumentListSerializer.Meta.fields,
            "version_count",
        )

        read_only_fields = fields

    def get_version_count(self, obj):
        if hasattr(obj, "total_versions"):
            return obj.total_versions
        versions = getattr(
            obj,
            "prefetched_versions",
            None,
        )

        if versions is not None:
            return len(versions)

        return obj.versions.count()


# =====================================================
# CREATE PROJECT DOCUMENT SERIALIZER
# =====================================================


class ProjectDocumentQuerySerializer(serializers.Serializer):
    search = serializers.CharField(required=False, allow_blank=True, max_length=200)
    document_type = serializers.ChoiceField(choices=ProjectDocument.DocumentType.choices, required=False)
    sort = serializers.ChoiceField(choices=["newest", "oldest", "title", "updated"], default="newest")


class ProjectDocumentCreateSerializer(serializers.Serializer):

    title = serializers.CharField(
        max_length=200,
        trim_whitespace=True,
    )

    description = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )

    document_type = serializers.ChoiceField(
        choices=ProjectDocument.DocumentType.choices,
    )

    file = serializers.FileField(
        allow_empty_file=False,
        write_only=True,
    )

    def validate_file(self, value):
        validate_document_file(value)
        return value


# =====================================================
# PROJECT DOCUMENT NEW VERSION UPLOAD
# =====================================================


class ProjectDocumentVersionUploadSerializer(serializers.Serializer):
    file = serializers.FileField(
        allow_empty_file=False,
        write_only=True,
    )

    def validate_file(self, value):
        validate_document_file(value)
        return value


# =====================================================
# TASK DOCUMENT VERSION SERIALIZER
# =====================================================


class TaskDocumentVersionSerializer(serializers.ModelSerializer):

    class Meta:
        model = TaskDocumentVersion

        fields = (
            "id",
            "version_number",
            "original_filename",
            "file_size",
            "uploaded_by",
            "is_current",
            "created_at",
        )

        read_only_fields = fields


# =====================================================
# TASK DOCUMENT LIST SERIALIZER
# =====================================================


class TaskDocumentListSerializer(serializers.ModelSerializer):

    current_version = serializers.SerializerMethodField()

    class Meta:
        model = TaskDocument

        fields = (
            "id",
            "task",
            "title",
            "description",
            "document_type",
            "uploaded_by",
            "created_at",
            "updated_at",
            "current_version",
        )

        read_only_fields = fields

    def get_current_version(self, obj):

        versions = getattr(
            obj,
            "prefetched_versions",
            None,
        )

        if versions is not None:
            current = next(
                (version for version in versions if version.is_current),
                None,
            )
        else:
            current = obj.versions.filter(is_current=True).first()

        if current is None:
            return None

        return TaskDocumentVersionSerializer(current).data


# =====================================================
# TASK DOCUMENT DETAIL SERIALIZER
# =====================================================


class TaskDocumentDetailSerializer(TaskDocumentListSerializer):

    version_count = serializers.SerializerMethodField()

    class Meta(TaskDocumentListSerializer.Meta):

        fields = (
            *TaskDocumentListSerializer.Meta.fields,
            "version_count",
        )

        read_only_fields = fields

    def get_version_count(self, obj):

        versions = getattr(
            obj,
            "prefetched_versions",
            None,
        )

        if versions is not None:
            return len(versions)

        return obj.versions.count()


# =====================================================
# CREATE TASK DOCUMENT SERIALIZER
# =====================================================


class TaskDocumentCreateSerializer(serializers.Serializer):

    title = serializers.CharField(
        max_length=200,
        trim_whitespace=True,
    )

    description = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )

    document_type = serializers.ChoiceField(
        choices=TaskDocument.DocumentType.choices,
    )

    file = serializers.FileField(
        allow_empty_file=False,
        write_only=True,
    )

    def validate_file(self, value):
        validate_document_file(value)
        return value


# =====================================================
# TASK DOCUMENT NEW VERSION UPLOAD
# =====================================================


class TaskDocumentVersionUploadSerializer(serializers.Serializer):
    file = serializers.FileField(
        allow_empty_file=False,
        write_only=True,
    )

    def validate_file(self, value):
        validate_document_file(value)
        return value
