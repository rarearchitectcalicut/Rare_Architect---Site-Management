from django.urls import path

from .views import (
    ProjectDocumentListCreateView,
    ProjectDocumentDetailView,
    ProjectDocumentVersionListCreateView,
    ProjectDocumentVersionDownloadView,
    TaskDocumentListCreateView,
    TaskDocumentDetailView,
    TaskDocumentVersionListCreateView,
    TaskDocumentVersionDownloadView,
)

app_name = "documents"

urlpatterns = [
    path(
        "projects/<uuid:project_id>/documents/",
        ProjectDocumentListCreateView.as_view(),
        name="project-document-list-create",
    ),
    path(
        "project-documents/<uuid:id>/",
        ProjectDocumentDetailView.as_view(),
        name="project-document-detail",
    ),
    path(
        "project-documents/<uuid:id>/versions/",
        ProjectDocumentVersionListCreateView.as_view(),
        name="project-document-version-list-create",
    ),
    path(
        "project-document-versions/<uuid:id>/download/",
        ProjectDocumentVersionDownloadView.as_view(),
        name="project-document-version-download",
    ),
    path(
        "tasks/<uuid:task_id>/documents/",
        TaskDocumentListCreateView.as_view(),
        name="task-document-list-create",
    ),
    path(
        "task-documents/<uuid:id>/",
        TaskDocumentDetailView.as_view(),
        name="task-document-detail",
    ),
    path(
        "task-documents/<uuid:id>/versions/",
        TaskDocumentVersionListCreateView.as_view(),
        name="task-document-version-list-create",
    ),
    path(
        "task-document-versions/<uuid:id>/download/",
        TaskDocumentVersionDownloadView.as_view(),
        name="task-document-version-download",
    ),
]
