from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

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

        return Response(
            NotificationSerializer(
                notification,
                context={"request": request},
            ).data,
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
                "unread_count": 0,
            },
            status=status.HTTP_200_OK,
        )
