from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Case, CharField, Count, OuterRef, Q, Subquery, Value, When
from activity.models import ActivityLog

from users.permissions import MustChangePasswordPermission
from projects.pagination import ProjectPagination

from .serializers import NotificationSerializer
from .services import (
    user_notifications,
    mark_notification_read,
    mark_all_notifications_read,
)

# =====================================================
# LIST MY NOTIFICATIONS
# =====================================================


class NotificationListView(generics.ListAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    serializer_class = NotificationSerializer
    pagination_class = ProjectPagination

    def get_queryset(self):
        queryset = user_notifications(self.request.user)
        # Derive event meaning from the durable audit at notification creation,
        # rather than the record's current status or editable display titles.
        events = ActivityLog.objects.filter(
            entity_id=OuterRef("reference_id"), entity_type=OuterRef("reference_type"),
            created_at__lte=OuterRef("created_at"),
        ).annotate(code=Case(
            When(action="PROJECT_STATUS_CHANGED", metadata__new_status="CANCELLED", then=Value("PROJECT_CANCELLED")),
            When(Q(action="PROJECT_UPDATED") & (Q(metadata__changed_fields__contains=["start_date"]) | Q(metadata__changed_fields__contains=["end_date"])), then=Value("PROJECT_DATES_CHANGED")),
            default="action", output_field=CharField(),
        )).order_by("-created_at", "-id")
        actions = {
            "TASK_APPROVAL": ["TASK_CREATED", "TASK_BATCH_CREATED", "TASK_RESUBMITTED", "TASK_APPROVED", "TASK_REJECTED"],
            "TASK_CHANGE_REQUEST": ["TASK_EDIT_REQUESTED", "TASK_EDIT_APPROVED", "TASK_EDIT_REJECTED", "TIMELINE_REORDER_REQUESTED", "TIMELINE_REORDER_APPROVED", "TIMELINE_REORDER_REJECTED"],
            "DAILY_REPORT": ["DAILY_REPORT_SUBMITTED", "DAILY_TASK_WORK_VERIFIED", "DAILY_TASK_WORK_REJECTED"],
            "DELAY_REPORT": ["DELAY_REPORT_SUBMITTED", "DELAY_REPORT_APPROVED", "DELAY_REPORT_REJECTED"],
            "EXTENSION_REQUEST": ["EXTENSION_APPROVED", "EXTENSION_REJECTED"],
            "PROJECT_ASSIGNMENT": ["SUPERVISOR_ASSIGNED"],
            "SYSTEM": ["PROJECT_UPDATED", "PROJECT_STATUS_CHANGED"],
        }
        queryset = queryset.annotate(project_id=Subquery(events.values("metadata__project_id")[:1]), event=Case(*[
            When(notification_type=kind, then=Subquery(events.filter(action__in=allowed).values("code")[:1]))
            for kind, allowed in actions.items()
        ], default=Value(""), output_field=CharField()))

        unread = self.request.query_params.get("unread")

        if unread is not None:
            if unread.lower() == "true":
                queryset = queryset.filter(is_read=False)

            elif unread.lower() == "false":
                queryset = queryset.filter(is_read=True)

        return queryset.order_by(
            "-created_at",
            "-id",
        )

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if request.query_params.get("include_counts") == "true":
            response.data.update(user_notifications(request.user).aggregate(
                total_count=Count("id"), unread_count=Count("id", filter=Q(is_read=False)),
            ))
        return response


# =====================================================
# UNREAD NOTIFICATION COUNT
# =====================================================


class NotificationUnreadCountView(generics.GenericAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get(self, request):
        count = user_notifications(request.user).filter(is_read=False).count()

        return Response({"unread_count": count})


# =====================================================
# MARK ONE NOTIFICATION AS READ
# =====================================================


class NotificationMarkReadView(generics.GenericAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def post(self, request, id):
        notification = mark_notification_read(
            notification_id=id,
            user=request.user,
        )

        data = NotificationSerializer(
            notification, context={"request": request},
        ).data
        data.update(user_notifications(request.user).aggregate(
            total_count=Count("id"), unread_count=Count("id", filter=Q(is_read=False)),
        ))
        return Response(
            data,
            status=status.HTTP_200_OK,
        )


# =====================================================
# MARK ALL NOTIFICATIONS AS READ
# =====================================================


class NotificationMarkAllReadView(generics.GenericAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def post(self, request):
        updated_count = mark_all_notifications_read(
            user=request.user,
        )

        return Response(
            {
                "message": "Notifications marked as read.",
                "updated_count": updated_count,
                **user_notifications(request.user).aggregate(
                    total_count=Count("id"), unread_count=Count("id", filter=Q(is_read=False)),
                ),
            },
            status=status.HTTP_200_OK,
        )
