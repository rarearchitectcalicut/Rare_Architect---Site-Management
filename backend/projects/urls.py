from django.urls import path

from .views import (
    ProjectCategoryListCreateView,
    ProjectCategoryDetailView,
    ProjectListCreateView,
    ProjectDetailView,
    ProjectSupervisorListView,
    ProjectAssignSupervisorsView,
    ProjectRemoveSupervisorView,
    ProjectOverviewView
)

app_name = "projects"

urlpatterns = [
    path(
        "project-categories/",
        ProjectCategoryListCreateView.as_view(),
        name="category-list-create",
    ),
    path(
        "project-categories/<uuid:id>/",
        ProjectCategoryDetailView.as_view(),
        name="category-detail",
    ),
    path(
        "projects/",
        ProjectListCreateView.as_view(),
        name="project-list-create",
    ),
    path(
        "projects/<uuid:id>/",
        ProjectDetailView.as_view(),
        name="project-detail",
    ),
    path(
        "projects/<uuid:project_id>/supervisors/",
        ProjectSupervisorListView.as_view(),
        name="project-supervisor-list",
    ),
    path(
        "projects/<uuid:project_id>/assign-supervisors/",
        ProjectAssignSupervisorsView.as_view(),
        name="project-assign-supervisors",
    ),
    path(
        "projects/<uuid:project_id>/supervisors/<uuid:supervisor_id>/",
        ProjectRemoveSupervisorView.as_view(),
        name="project-remove-supervisor",
    ),
    path(
        "projects/<uuid:project_id>/overview/",
        ProjectOverviewView.as_view(),
        name="project-overview",
    ),
]
