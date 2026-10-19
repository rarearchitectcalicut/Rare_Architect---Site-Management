from django.contrib import admin

from .models import (
    DelayReport,
    DailyReport,
    DailyTaskWork,
    DailyManpower,
    DailyMaterialEntry,
    DailyReportAttachment,
)

# =====================================================
# READ-ONLY ADMIN MIXIN
# =====================================================


class ReadOnlyReportsAdminMixin:
    """
    Reports can be viewed through Django Admin.

    Creation, editing, approval, verification, and
    deletion must happen through the authorized
    API workflows instead of Django Admin forms.
    """

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


# =====================================================
# DELAY REPORT ADMIN
# =====================================================


@admin.register(DelayReport)
class DelayReportAdmin(
    ReadOnlyReportsAdminMixin,
    admin.ModelAdmin,
):
    list_display = (
        "id",
        "task",
        "delay_type",
        "reported_by",
        "status",
        "extension_requested",
        "extension_status",
        "reported_at",
    )

    list_filter = (
        "delay_type",
        "status",
        "extension_requested",
        "extension_status",
    )

    search_fields = (
        "task__title",
        "reason",
        "reported_by__username",
    )

    readonly_fields = (
        "id",
        "task",
        "reported_by",
        "delay_type",
        "reason",
        "description",
        "expected_completion_date",
        "extension_requested",
        "requested_end_date",
        "extension_status",
        "status",
        "reviewed_by",
        "admin_comment",
        "reported_at",
        "reviewed_at",
        "extension_reviewed_by",
        "extension_reviewed_at",
        "extension_admin_comment",
    )

    ordering = ("-reported_at",)


# =====================================================
# DAILY REPORT ADMIN
# =====================================================


@admin.register(DailyReport)
class DailyReportAdmin(
    ReadOnlyReportsAdminMixin,
    admin.ModelAdmin,
):
    list_display = (
        "id",
        "project",
        "report_date",
        "reported_by",
        "weather_condition",
        "status",
        "submitted_at",
    )

    list_filter = (
        "status",
        "weather_condition",
        "report_date",
    )

    search_fields = (
        "project__name",
        "reported_by__username",
        "work_summary",
    )

    readonly_fields = (
        "id",
        "project",
        "reported_by",
        "report_date",
        "weather_condition",
        "site_condition",
        "work_summary",
        "site_notes",
        "issues",
        "next_day_plan",
        "status",
        "submitted_at",
        "created_at",
        "updated_at",
    )

    ordering = ("-report_date", "-created_at")


# =====================================================
# DAILY TASK WORK ADMIN
# =====================================================


@admin.register(DailyTaskWork)
class DailyTaskWorkAdmin(
    ReadOnlyReportsAdminMixin,
    admin.ModelAdmin,
):
    list_display = (
        "id",
        "daily_report",
        "task",
        "quantity_completed_today",
        "completion_claimed",
        "verification_status",
        "verified_by",
        "verified_at",
    )

    list_filter = (
        "verification_status",
        "completion_claimed",
    )

    search_fields = (
        "task__title",
        "daily_report__project__name",
        "work_description",
    )

    readonly_fields = (
        "id",
        "daily_report",
        "task",
        "work_description",
        "location_detail",
        "quantity_completed_today",
        "completion_claimed",
        "verification_status",
        "verified_by",
        "verified_at",
        "verification_note",
        "created_at",
        "updated_at",
    )

    ordering = ("-created_at",)


# =====================================================
# DAILY MANPOWER ADMIN
# =====================================================


@admin.register(DailyManpower)
class DailyManpowerAdmin(
    ReadOnlyReportsAdminMixin,
    admin.ModelAdmin,
):
    list_display = (
        "id",
        "daily_report",
        "trade",
        "contractor_name",
        "worker_count",
        "hours_worked",
        "created_at",
    )

    list_filter = ("trade",)

    search_fields = (
        "daily_report__project__name",
        "contractor_name",
    )

    readonly_fields = (
        "id",
        "daily_report",
        "trade",
        "contractor_name",
        "worker_count",
        "hours_worked",
        "remarks",
        "created_at",
    )

    ordering = ("-created_at",)


# =====================================================
# DAILY MATERIAL ENTRY ADMIN
# =====================================================


@admin.register(DailyMaterialEntry)
class DailyMaterialEntryAdmin(
    ReadOnlyReportsAdminMixin,
    admin.ModelAdmin,
):
    list_display = (
        "id",
        "daily_report",
        "material_name",
        "entry_type",
        "quantity",
        "unit",
        "created_at",
    )

    list_filter = ("entry_type",)

    search_fields = (
        "material_name",
        "daily_report__project__name",
    )

    readonly_fields = (
        "id",
        "daily_report",
        "material_name",
        "entry_type",
        "quantity",
        "unit",
        "remarks",
        "created_at",
    )

    ordering = ("-created_at",)


# =====================================================
# DAILY REPORT ATTACHMENT ADMIN
# =====================================================


@admin.register(DailyReportAttachment)
class DailyReportAttachmentAdmin(
    ReadOnlyReportsAdminMixin,
    admin.ModelAdmin,
):
    list_display = (
        "id",
        "daily_report",
        "task_work",
        "original_filename",
        "file_size",
        "uploaded_by",
        "created_at",
    )

    search_fields = (
        "original_filename",
        "daily_report__project__name",
    )

    readonly_fields = (
        "id",
        "daily_report",
        "task_work",
        "file",
        "original_filename",
        "file_size",
        "caption",
        "uploaded_by",
        "created_at",
    )

    ordering = ("-created_at",)
