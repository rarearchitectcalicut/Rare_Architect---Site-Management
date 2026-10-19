from django.urls import path

from .views import (
    ProjectDailyReportListCreateView,
    DailyReportDetailView,
    DailyReportSubmitView,
    DailyTaskWorkListCreateView
)

app_name = "reports"

urlpatterns = [
    path(
        "projects/<uuid:project_id>/daily-reports/",
        ProjectDailyReportListCreateView.as_view(),
        name="project-daily-report-list-create",
    ),
    path(
        "daily-reports/<uuid:id>/",
        DailyReportDetailView.as_view(),
        name="daily-report-detail",
    ),
    path(
        "daily-reports/<uuid:id>/submit/",
        DailyReportSubmitView.as_view(),
        name="daily-report-submit",
    ),
    path(
        "daily-reports/<uuid:id>/work-entries/",
         DailyTaskWorkListCreateView.as_view(),
        name="daily-task-work-list-create",
    ),
]
