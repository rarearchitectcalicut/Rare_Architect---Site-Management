from uuid import UUID

from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework import generics
from rest_framework.exceptions import (
    PermissionDenied,
    ValidationError,
)
from rest_framework.permissions import IsAuthenticated

from users.permissions import MustChangePasswordPermission
from projects.pagination import ProjectPagination

from .serializers import ActivityLogSerializer
from .services import admin_activity_logs

# =====================================================
# ADMIN-ONLY ACCESS CHECK
# =====================================================


def validate_activity_admin(user):
    if not (
        user.is_authenticated
        and user.is_active
        and user.role == "ADMIN"
        and user.is_staff
    ):
        raise PermissionDenied("Only Admins can view activity logs.")


# =====================================================
# LIST ACTIVITY LOGS
# =====================================================


class ActivityLogListView(generics.ListAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    serializer_class = ActivityLogSerializer
    pagination_class = ProjectPagination

    def get_queryset(self):
        user = self.request.user

        validate_activity_admin(user)

        queryset = admin_activity_logs(user)

        params = self.request.query_params

        action = params.get("action")
        entity_type = params.get("entity_type")
        entity_id = params.get("entity_id")
        actor_id = params.get("actor")

        search = params.get("search", "").strip()
        if search:
            if len(search) > 200:
                raise ValidationError({"search": "Use no more than 200 characters."})
            queryset = queryset.filter(
                Q(description__icontains=search)
                | Q(action__icontains=search)
                | Q(entity_type__icontains=search)
                | Q(actor__username__icontains=search)
                | Q(actor__first_name__icontains=search)
                | Q(actor__last_name__icontains=search)
                | Q(metadata__actor_name__icontains=search)
                | Q(metadata__subject_name__icontains=search)
                | Q(metadata__project_name__icontains=search)
            )

        dates = {}
        for key in ("date_from", "date_to"):
            value = params.get(key)
            if value:
                try:
                    day = parse_date(value)
                except ValueError:
                    day = None
                if day is None or day.isoformat() != value:
                    raise ValidationError({key: "Use a valid date in YYYY-MM-DD format."})
                dates[key] = day
        if dates.get("date_from") and dates.get("date_to") and dates["date_from"] > dates["date_to"]:
            raise ValidationError({"date_to": "End date must be on or after start date."})
        if "date_from" in dates:
            queryset = queryset.filter(created_at__date__gte=dates["date_from"])
        if "date_to" in dates:
            queryset = queryset.filter(created_at__date__lte=dates["date_to"])

        if action:
            queryset = queryset.filter(action=action)

        if entity_type:
            queryset = queryset.filter(entity_type=entity_type)

        if entity_id:
            try:
                entity_uuid = UUID(entity_id)
            except (ValueError, TypeError, AttributeError):
                raise ValidationError({"entity_id": "A valid UUID is required."})

            queryset = queryset.filter(entity_id=entity_uuid)

        if actor_id:
            try:
                actor_uuid = UUID(actor_id)
            except (ValueError, TypeError, AttributeError):
                raise ValidationError({"actor": "A valid UUID is required."})

            queryset = queryset.filter(actor_id=actor_uuid)

        return queryset


# =====================================================
# RETRIEVE ONE ACTIVITY LOG
# =====================================================


class ActivityLogDetailView(generics.RetrieveAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    serializer_class = ActivityLogSerializer
    lookup_field = "id"

    def get_queryset(self):
        user = self.request.user

        validate_activity_admin(user)

        return admin_activity_logs(user)
