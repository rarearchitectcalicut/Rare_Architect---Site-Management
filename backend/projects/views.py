from django.db.models.deletion import ProtectedError
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from users.permissions import MustChangePasswordPermission
from .models import ProjectCategory
from .permissions import IsAdminOrReadOnly
from .serializers import (
    ProjectCategorySerializer,
    ProjectCategoryListSerializer,
)


# ============================================================
# PROJECT CATEGORY LIST-CREATE VIEW
# ============================================================

class ProjectCategoryListCreateView(generics.ListCreateAPIView):
    """
    GET: List categories.
    POST: Admin creates a category with optional image.
    """

    queryset = ProjectCategory.objects.all()

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminOrReadOnly,
    ]

    parser_classes = [
        MultiPartParser,
        FormParser,
        JSONParser,
    ]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Supervisors see only active categories.
        if self.request.user.role == "SUPERVISOR":
            queryset = queryset.filter(is_active=True)

        return queryset

    def get_serializer_class(self):
        if self.request.method == "GET":
            return ProjectCategoryListSerializer

        return ProjectCategorySerializer


# ============================================================
# PROJECT CATEGORY RETRIEVE-UPDATE-DESTROY VIEW
# ============================================================

class ProjectCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET: Retrieve category.
    PATCH: Admin edits category.
    DELETE: Admin deletes unused category.
    """

    queryset = ProjectCategory.objects.all()

    serializer_class = ProjectCategorySerializer

    lookup_field = "id"

    http_method_names = [
        "get",
        "patch",
        "delete",
        "head",
        "options",
    ]

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminOrReadOnly,
    ]

    parser_classes = [
        MultiPartParser,
        FormParser,
        JSONParser,
    ]

    def get_queryset(self):
        queryset = super().get_queryset()

        if self.request.user.role == "SUPERVISOR":
            queryset = queryset.filter(is_active=True)

        return queryset

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        if instance.projects.exists():
            raise ValidationError(
                {
                    "detail": (
                        "Cannot delete this category because "
                        "it is used by one or more projects."
                    )
                }
            )

        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            raise ValidationError({"detail": "Category is currently in use."})
