from django.db.models.deletion import ProtectedError
from django.db.models import Count, Prefetch, Q
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from users.permissions import MustChangePasswordPermission,IsAdminRole
from .models import ProjectCategory,Project,ProjectSupervisor
from .permissions import IsAdminOrReadOnly
from .serializers import (
    ProjectCategorySerializer,
    ProjectCategoryListSerializer,
    ProjectCreateUpdateSerializer,
    ProjectListSerializer,
    ProjectDetailSerializer,
    ProjectSupervisorSerializer,
    ProjectAssignmentSerializer,
    ProjectOverviewSerializer
)
from django.shortcuts import get_object_or_404
from django.db import IntegrityError, transaction
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .filters import ProjectFilter
from .pagination import ProjectPagination
from activity.services import create_activity_log

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

    @transaction.atomic
    def perform_create(self, serializer):
        category = serializer.save()
        create_activity_log(
            actor=self.request.user,
            action="CATEGORY_CREATED",
            entity_type="CATEGORY",
            entity_id=category.id,
            description=f"Category '{category.name}' created.",
            metadata={"category_id": str(category.id)},
        )


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

    @transaction.atomic
    def perform_update(self, serializer):
        instance = ProjectCategory.objects.select_for_update().get(
            pk=serializer.instance.pk,
        )
        serializer.instance = instance
        changed_fields = [
            field for field, value in serializer.validated_data.items()
            if not (field == "image" and value is None and not instance.image)
            and getattr(instance, field) != value
        ]
        category = serializer.save()
        if changed_fields:
            create_activity_log(
                actor=self.request.user,
                action="CATEGORY_UPDATED",
                entity_type="CATEGORY",
                entity_id=category.id,
                description=f"Category '{category.name}' updated.",
                metadata={
                    "category_id": str(category.id),
                    "changed_fields": sorted(changed_fields),
                },
            )

    @transaction.atomic
    def perform_destroy(self, instance):
        category_id = instance.id
        name = instance.name
        instance.delete()
        create_activity_log(
            actor=self.request.user,
            action="CATEGORY_DELETED",
            entity_type="CATEGORY",
            entity_id=category_id,
            description=f"Category '{name}' deleted.",
            metadata={"category_id": str(category_id)},
        )

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


# ====================================
# PROJECT LIST CREATE VIEW
# ====================================
class ProjectListCreateView(generics.ListCreateAPIView):
    """
    GET:
        Admin sees all projects.
        Supervisor sees only assigned projects.

    POST:
        Only Admin can create projects.
    """

    parser_classes = [
        MultiPartParser,
        FormParser,
        JSONParser,
    ]

    def get_permissions(self):
        permission_classes = [
            IsAuthenticated,
            MustChangePasswordPermission,
        ]

        if self.request.method == "POST":
            permission_classes.append(IsAdminRole)

        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user

        queryset = Project.objects.select_related(
            "category",
            "created_by",
        )

        if user.role == "ADMIN" and user.is_staff:
            return queryset.all()

        if user.role == "SUPERVISOR":
            return queryset.filter(
                supervisor_assignments__supervisor=user,
                supervisor_assignments__supervisor__is_active=True,
            ).distinct()

        return queryset.none()

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ProjectCreateUpdateSerializer

        return ProjectListSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        project = serializer.save(
            created_by=self.request.user,
        )
        create_activity_log(
            actor=self.request.user,
            action="PROJECT_CREATED",
            entity_type="PROJECT",
            entity_id=project.id,
            description=f"Project '{project.name}' created.",
            metadata={"project_id": str(project.id), "new_status": project.status},
        )

    filter_backends = [
        DjangoFilterBackend,
        SearchFilter,
        OrderingFilter,
    ]

    filterset_class = ProjectFilter

    search_fields = [
        "name",
        "client_name",
        "location",
        "description",
        "category__name",
    ]

    ordering_fields = [
        "name",
        "created_at",
        "start_date",
        "end_date",
        "status",
    ]

    ordering = ["-created_at"]

    pagination_class = ProjectPagination

# ====================================
# PROJECT DETAIL VIEW
# ====================================
class ProjectDetailView(generics.RetrieveUpdateAPIView):
    """
    GET:
        Admin can view any project.
        Supervisor can view assigned projects only.

    PATCH:
        Only Admin can update projects.
    """

    lookup_field = "id"

    http_method_names = [
        "get",
        "patch",
        "head",
        "options",
    ]

    parser_classes = [
        MultiPartParser,
        FormParser,
        JSONParser,
    ]

    def get_permissions(self):
        permission_classes = [
            IsAuthenticated,
            MustChangePasswordPermission,
        ]

        if self.request.method == "PATCH":
            permission_classes.append(IsAdminRole)

        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user

        queryset = Project.objects.select_related(
            "category",
            "created_by",
        ).annotate(
            supervisor_count=Count(
                "supervisor_assignments",
                distinct=True,
            )
        )

        if user.role == "ADMIN" and user.is_staff:
            return queryset

        if user.role == "SUPERVISOR":
            return queryset.filter(
                supervisor_assignments__supervisor=user,
                supervisor_assignments__supervisor__is_active=True,
            )

        return queryset.none()

    def get_serializer_class(self):
        if self.request.method == "PATCH":
            return ProjectCreateUpdateSerializer

        return ProjectDetailSerializer

    @transaction.atomic
    def perform_update(self, serializer):
        instance = Project.objects.select_for_update().get(pk=serializer.instance.pk)
        serializer.instance = instance
        old_status = instance.status
        changed_fields = [
            field for field, value in serializer.validated_data.items()
            if not (field == "cover_image" and value is None and not instance.cover_image)
            and getattr(instance, field) != value
        ]
        project = serializer.save()
        if "status" in changed_fields:
            create_activity_log(
                actor=self.request.user,
                action="PROJECT_STATUS_CHANGED",
                entity_type="PROJECT",
                entity_id=project.id,
                description=f"Project '{project.name}' status changed.",
                metadata={
                    "project_id": str(project.id),
                    "old_status": old_status,
                    "new_status": project.status,
                },
            )
        detail_fields = sorted(set(changed_fields) - {"status"})
        if detail_fields:
            create_activity_log(
                actor=self.request.user,
                action="PROJECT_UPDATED",
                entity_type="PROJECT",
                entity_id=project.id,
                description=f"Project '{project.name}' updated.",
                metadata={
                    "project_id": str(project.id),
                    "changed_fields": detail_fields,
                },
            )


# ====================================
# PROJECT SUPERVISOR LIST VIEW
# ====================================

class ProjectSupervisorListView(generics.ListAPIView):
    """
    Admin: Can list supervisors of any project.
    Supervisor: Can list supervisors of assigned projects.
    """

    serializer_class = ProjectSupervisorSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get_queryset(self):
        user = self.request.user
        project_id = self.kwargs["project_id"]

        if user.role == "ADMIN" and user.is_staff:
            project = get_object_or_404(
                Project,
                id=project_id,
            )

        elif user.role == "SUPERVISOR":
            project = get_object_or_404(
                Project.objects.filter(
                    supervisor_assignments__supervisor=user,
                ),
                id=project_id,
            )

        else:
            return ProjectSupervisor.objects.none()

        return (
            ProjectSupervisor.objects.filter(
                project=project,
            )
            .select_related(
                "supervisor",
                "assigned_by",
            )
            .order_by("-assigned_at")
        )


# ====================================
# PROJECT ASSIGN SUPERVISOR VIEW
# ====================================
class ProjectAssignSupervisorsView(generics.GenericAPIView):
    """
    Assign one or more supervisors to a project.

    Admin only.
    """

    serializer_class = ProjectAssignmentSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminRole,
    ]

    def post(self, request, project_id):
        project = get_object_or_404(
            Project,
            id=project_id,
        )

        serializer = self.get_serializer(
            data=request.data,
            context={"project": project},
        )

        serializer.is_valid(raise_exception=True)

        supervisors = serializer.validated_data["supervisor_ids"]

        try:
            with transaction.atomic():
                assignments = []

                for supervisor in supervisors:
                    assignment = ProjectSupervisor(
                        project=project,
                        supervisor=supervisor,
                        assigned_by=request.user,
                    )

                    assignment.full_clean()
                    assignment.save()

                    create_activity_log(
                        actor=request.user,
                        action="SUPERVISOR_ASSIGNED",
                        entity_type="PROJECT",
                        entity_id=project.id,
                        description=f"Supervisor assigned to project '{project.name}'.",
                        metadata={
                            "project_id": str(project.id),
                            "supervisor_id": str(supervisor.id),
                            "assignment_id": str(assignment.id),
                        },
                    )

                    assignments.append(assignment)

        except (IntegrityError, ValidationError) as exc:
            raise ValidationError(
                {
                    "detail": (
                        "Supervisor assignment failed. "
                        "Check whether any selected supervisor "
                        "is already assigned or no longer eligible."
                    )
                }
            ) from exc

        response_serializer = ProjectSupervisorSerializer(
            assignments,
            many=True,
            context={"request": request},
        )

        return Response(
            {
                "message": ("Supervisors assigned successfully."),
                "assignments": response_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )


# ====================================
# PROJECT REMOVE SUPERVISOR VIEW
# ====================================
class ProjectRemoveSupervisorView(generics.GenericAPIView):
    """
    Remove a supervisor assignment from a project.

    Admin only.
    """

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminRole,
    ]

    @transaction.atomic
    def delete(self, request, project_id, supervisor_id):
        assignment = get_object_or_404(
            ProjectSupervisor.objects.select_for_update(),
            project_id=project_id,
            supervisor_id=supervisor_id,
        )

        assignment_id = assignment.id
        assignment.delete()
        create_activity_log(
            actor=request.user,
            action="SUPERVISOR_UNASSIGNED",
            entity_type="PROJECT",
            entity_id=project_id,
            description="Supervisor removed from project.",
            metadata={
                "project_id": str(project_id),
                "supervisor_id": str(supervisor_id),
                "assignment_id": str(assignment_id),
            },
        )

        return Response(
            {"message": ("Supervisor removed from project successfully.")},
            status=status.HTTP_200_OK,
        )


# ====================================
# PROJECT OVERVIEW VIEW
# ====================================
class ProjectOverviewView(generics.RetrieveAPIView):
    """
    Project overview for Admin and assigned Supervisors.
    """

    serializer_class = ProjectOverviewSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    lookup_field = "id"
    lookup_url_kwarg = "project_id"

    def get_queryset(self):
        user = self.request.user

        queryset = (
            Project.objects.select_related("category", "created_by")
            .annotate(
                supervisor_count=Count(
                    "supervisor_assignments",
                    filter=Q(supervisor_assignments__supervisor__is_active=True),
                    distinct=True,
                )
            )
            .prefetch_related(
                Prefetch(
                    "supervisor_assignments",
                    queryset=(
                        ProjectSupervisor.objects.filter(
                            supervisor__is_active=True
                        ).select_related("supervisor", "assigned_by")
                    ),
                )
            )
        )

        if user.role == "ADMIN" and user.is_staff and user.is_active:
            return queryset

        if user.role == "SUPERVISOR" and user.is_active:
            return queryset.filter(supervisor_assignments__supervisor=user).distinct()

        return queryset.none()
