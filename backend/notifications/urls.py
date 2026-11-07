from django.urls import path

from .views import (
    NotificationListView,
    NotificationUnreadCountView,
    NotificationMarkReadView,
    NotificationMarkAllReadView,
)

from .push_views import PushPublicKeyView, PushSubscriptionView, PushSubscriptionStatusView

app_name = "notifications"

urlpatterns = [
    path("notifications/push/public-key/", PushPublicKeyView.as_view(), name="push-public-key"),
    path("notifications/push/subscription/", PushSubscriptionView.as_view(), name="push-subscription"),
    path("notifications/push/subscription/status/", PushSubscriptionStatusView.as_view(), name="push-subscription-status"),
    path(
        "notifications/",
        NotificationListView.as_view(),
        name="notification-list",
    ),
    path(
        "notifications/unread-count/",
        NotificationUnreadCountView.as_view(),
        name="notification-unread-count",
    ),
    path(
        "notifications/read-all/",
        NotificationMarkAllReadView.as_view(),
        name="notification-read-all",
    ),
    path(
        "notifications/<uuid:id>/read/",
        NotificationMarkReadView.as_view(),
        name="notification-mark-read",
    ),
]
