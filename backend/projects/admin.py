from django.contrib import admin
from django.contrib.auth import get_user_model

from .models import (
    ProjectCategory,
    Project,
    ProjectSupervisor,
)

User = get_user_model()


# ==================================================
# PROJECT CATEGORY ADMIN
# ==================================================


@admin.register(ProjectCategory)
class ProjectCategoryAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "is_active",
        "created_at",
    )

    list_filter = ("is_active",)
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")

    fields = (
        "name",
        "description",
        "image",
        "is_active",
        "created_at",
        "updated_at",
    )


# ==================================================
# PROJECT SUPERVISOR INLINE
# ==================================================


class ProjectSupervisorInline(admin.TabularInline):
    model = ProjectSupervisor

    extra = 1
    autocomplete_fields = ("supervisor",)

    fields = ("supervisor",)

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related(
                "supervisor",
            )
        )

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "supervisor":
            kwargs["queryset"] = User.objects.filter(
                role=User.Role.SUPERVISOR,
                is_active=True,
            )

        return super().formfield_for_foreignkey(
            db_field,
            request,
            **kwargs,
        )

    def save_formset(self, request, form, formset, change):
        # Note: inline formset saving is handled by
        # ProjectAdmin.save_formset below.
        pass


# ==================================================
# PROJECT ADMIN
# ==================================================


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "category",
        "client_name",
        "status",
        "start_date",
        "end_date",
        "created_at",
    )

    list_filter = (
        "status",
        "category",
        "created_at",
    )

    search_fields = (
        "name",
        "client_name",
        "location",
    )

    readonly_fields = (
        "id",
        "created_by",
        "created_at",
        "updated_at",
    )

    autocomplete_fields = ("category",)

    inlines = [ProjectSupervisorInline]

    fieldsets = (
        (
            "Project Information",
            {
                "fields": (
                    "name",
                    "category",
                    "client_name",
                    "description",
                    "location",
                    "cover_image",
                )
            },
        ),
        (
            "Project Schedule",
            {
                "fields": (
                    "start_date",
                    "end_date",
                    "status",
                )
            },
        ),
        (
            "System Information",
            {
                "fields": (
                    "created_by",
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user

        obj.full_clean()
        super().save_model(request, obj, form, change)

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)

        for deleted_obj in formset.deleted_objects:
            deleted_obj.delete()

        for instance in instances:
            if isinstance(instance, ProjectSupervisor):
                if not instance.assigned_by_id:
                    instance.assigned_by = request.user

            instance.full_clean()
            instance.save()

        formset.save_m2m()


# ==================================================
# PROJECT SUPERVISOR ADMIN
# ==================================================


@admin.register(ProjectSupervisor)
class ProjectSupervisorAdmin(admin.ModelAdmin):
    list_display = (
        "project",
        "supervisor",
        "assigned_by",
        "assigned_at",
    )

    list_filter = ("assigned_at",)
    search_fields = (
        "project__name",
        "supervisor__username",
        "supervisor__phone",
    )

    autocomplete_fields = (
        "project",
        "supervisor",
    )

    readonly_fields = (
        "id",
        "assigned_by",
        "assigned_at",
    )

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related(
                "project",
                "supervisor",
                "assigned_by",
            )
        )

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "supervisor":
            kwargs["queryset"] = User.objects.filter(
                role=User.Role.SUPERVISOR,
                is_active=True,
            )

        return super().formfield_for_foreignkey(
            db_field,
            request,
            **kwargs,
        )

    def save_model(self, request, obj, form, change):
        if not change:
            obj.assigned_by = request.user

        obj.full_clean()
        super().save_model(request, obj, form, change)
