from django.contrib import admin

from .models import ActivityLog

# =====================================================
# READ-ONLY ACTIVITY LOG ADMIN
# =====================================================


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):

    list_display = (
        "action",
        "entity_type",
        "entity_id",
        "actor",
        "created_at",
    )

    list_filter = (
        "action",
        "entity_type",
        "created_at",
    )

    search_fields = (
        "action",
        "entity_type",
        "description",
        "actor__phone",
    )

    readonly_fields = (
        "id",
        "actor",
        "action",
        "entity_type",
        "entity_id",
        "description",
        "metadata",
        "created_at",
    )

    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
