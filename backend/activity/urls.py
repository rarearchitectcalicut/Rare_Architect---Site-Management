from django.urls import path

from .views import (
    ActivityLogListView,
    ActivityLogDetailView,
)
from .dashboard_views import (
    AdminDashboardReviewQueueView,
    AdminDashboardSummaryView,
    SupervisorDashboardSummaryView,
    SupervisorDashboardActionItemsView,
)

app_name = "activity"

urlpatterns = [
    path(
        "activity/",
        ActivityLogListView.as_view(),
        name="activity-list",
    ),
    path(
        "activity/<uuid:id>/",
        ActivityLogDetailView.as_view(),
        name="activity-detail",
    ),
    path(
        "dashboard/admin/",
        AdminDashboardSummaryView.as_view(),
        name="admin-dashboard-summary",
    ),
    path(
        "dashboard/supervisor/",
        SupervisorDashboardSummaryView.as_view(),
        name="supervisor-dashboard-summary",
    ),
    path(
        "dashboard/admin/review-queue/",
        AdminDashboardReviewQueueView.as_view(),
        name="admin-dashboard-review-queue",
    ),
    path(
        "dashboard/supervisor/action-items/",
        SupervisorDashboardActionItemsView.as_view(),
        name="supervisor-dashboard-action-items",
    ),
]
