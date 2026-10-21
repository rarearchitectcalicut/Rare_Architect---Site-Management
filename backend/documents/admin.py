from django.contrib import admin

from .models import (
    ProjectDocument,
    ProjectDocumentVersion,
    TaskDocument,
    TaskDocumentVersion,
)

# =====================================================
# READ-ONLY DOCUMENT ADMIN
# =====================================================


class ReadOnlyDocumentAdmin(admin.ModelAdmin):

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ProjectDocument)
class ProjectDocumentAdmin(ReadOnlyDocumentAdmin):
    list_display = (
        "title",
        "project",
        "document_type",
        "uploaded_by",
        "created_at",
    )

    list_filter = ("document_type", "created_at")
    search_fields = ("title", "description")


@admin.register(ProjectDocumentVersion)
class ProjectDocumentVersionAdmin(ReadOnlyDocumentAdmin):
    list_display = (
        "document",
        "version_number",
        "original_filename",
        "file_size",
        "is_current",
        "created_at",
    )

    list_filter = ("is_current", "created_at")
    search_fields = ("original_filename", "document__title")

    # Do not expose private FileField URLs in Admin forms.
    exclude = ("file",)


@admin.register(TaskDocument)
class TaskDocumentAdmin(ReadOnlyDocumentAdmin):
    list_display = (
        "title",
        "task",
        "document_type",
        "uploaded_by",
        "created_at",
    )

    list_filter = ("document_type", "created_at")
    search_fields = ("title", "description")


@admin.register(TaskDocumentVersion)
class TaskDocumentVersionAdmin(ReadOnlyDocumentAdmin):
    list_display = (
        "document",
        "version_number",
        "original_filename",
        "file_size",
        "is_current",
        "created_at",
    )

    list_filter = ("is_current", "created_at")
    search_fields = ("original_filename", "document__title")

    exclude = ("file",)
