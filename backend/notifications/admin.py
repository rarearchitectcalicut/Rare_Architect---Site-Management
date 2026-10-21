from django.contrib import admin

from .models import Notification

# =====================================================
# READ-ONLY NOTIFICATION ADMIN
# =====================================================


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "recipient",
        "notification_type",
        "title",
        "is_read",
        "created_at",
    )

    list_filter = (
        "notification_type",
        "is_read",
        "created_at",
    )

    search_fields = (
        "title",
        "message",
        "recipient__phone",
    )

    readonly_fields = (
        "id",
        "recipient",
        "notification_type",
        "title",
        "message",
        "reference_type",
        "reference_id",
        "is_read",
        "read_at",
        "created_at",
    )

    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
