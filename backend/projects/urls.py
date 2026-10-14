from django.urls import path

from .views import (
    ProjectCategoryListCreateView,
    ProjectCategoryDetailView,
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
]
