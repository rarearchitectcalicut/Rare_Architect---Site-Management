from django.urls import path

from .views import (
    ProjectTaskListCreateView,
    BulkTaskCreateView,
    TaskApprovalListView,
    TaskApproveView,
    TaskRejectView,
    TaskDetailView,
    TaskHistoryView,
)

app_name = "tasks"

urlpatterns = [
    path(
        "projects/<uuid:project_id>/tasks/",
        ProjectTaskListCreateView.as_view(),
        name="project-task-list-create",
    ),
    path(
        "projects/<uuid:project_id>/tasks/bulk-create/",
        BulkTaskCreateView.as_view(),
        name="bulk-task-create",
    ),
    path(
        "task-approvals/",
        TaskApprovalListView.as_view(),
        name="task-approval-list",
    ),
    path(
        "tasks/<uuid:id>/approve/",
        TaskApproveView.as_view(),
        name="task-approve",
    ),
    path(
        "tasks/<uuid:id>/reject/",
        TaskRejectView.as_view(),
        name="task-reject",
    ),
    path(
        "tasks/<uuid:id>/",
        TaskDetailView.as_view(),
        name="task-detail",
    ),
    path(
        "tasks/<uuid:id>/history/",
        TaskHistoryView.as_view(),
        name="task-history",
    ),
]
