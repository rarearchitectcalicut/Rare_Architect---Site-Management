from django.shortcuts import get_object_or_404

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from projects.models import Project
from projects.pagination import ProjectPagination

from users.permissions import MustChangePasswordPermission,IsAdminRole

from .models import Task,TaskHistory
from .permissions import IsSupervisorRole
from .serializers import (
    TaskCreateSerializer,
    BulkTaskCreateSerializer,
    TaskListSerializer,
    TaskDetailSerializer,
    TaskApprovalSerializer,
    TaskRejectionSerializer,
    TaskApprovalListSerializer,
    TaskDetailSerializer,
    TaskHistorySerializer
)
from .services import (
    create_task,
    create_bulk_tasks,
    approve_task,
    reject_task,
)

# =====================================================
# ACCESSIBLE PROJECT HELPER
# =====================================================


def get_accessible_project(user, project_id):
    """
    Admin can access any project.
    Supervisor can access assigned projects only.
    """

    queryset = Project.objects.all()

    if user.role == "ADMIN" and user.is_staff:
        pass

    elif user.role == "SUPERVISOR":
        queryset = queryset.filter(supervisor_assignments__supervisor=user)

    else:
        queryset = queryset.none()

    return get_object_or_404(queryset, pk=project_id)


# =====================================================
# SINGLE TASK CREATE + TASK LIST
# =====================================================


class ProjectTaskListCreateView(generics.ListCreateAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    pagination_class = ProjectPagination

    def get_permissions(self):
        permissions = [
            IsAuthenticated(),
            MustChangePasswordPermission(),
        ]

        if self.request.method == "POST":
            permissions.append(IsSupervisorRole())

        return permissions

    def get_project(self):
        return get_accessible_project(
            self.request.user,
            self.kwargs["project_id"],
        )

    def get_queryset(self):
        project = self.get_project()

        return (
            Task.objects.filter(project=project)
            .select_related(
                "project",
                "created_by",
            )
            .order_by(
                "display_order",
                "created_at",
                "id",
            )
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return TaskCreateSerializer

        return TaskListSerializer

    def create(self, request, *args, **kwargs):
        project = self.get_project()

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        task = create_task(
            project=project,
            user=request.user,
            validated_data=serializer.validated_data,
        )

        output = TaskDetailSerializer(
            task,
            context={"request": request},
        )

        return Response(
            output.data,
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# BULK TASK CREATE
# =====================================================


class BulkTaskCreateView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsSupervisorRole,
    ]

    serializer_class = BulkTaskCreateSerializer

    def post(self, request, project_id):
        project = get_accessible_project(
            request.user,
            project_id,
        )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        batch, tasks = create_bulk_tasks(
            project=project,
            user=request.user,
            tasks_data=serializer.validated_data["tasks"],
        )

        output = TaskDetailSerializer(
            tasks,
            many=True,
            context={"request": request},
        )

        return Response(
            {
                "message": "Tasks submitted for approval.",
                "batch_id": str(batch.id),
                "task_count": len(tasks),
                "tasks": output.data,
            },
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# TASK APPROVAL QUEUE
# ====================================================
class TaskApprovalListView(generics.ListAPIView):
    """
    Admin can see all pending task approvals.
    """

    serializer_class = TaskApprovalListSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminRole,
    ]

    pagination_class = ProjectPagination

    def get_queryset(self):
        return (
            Task.objects.filter(approval_status=Task.ApprovalStatus.PENDING)
            .select_related(
                "project",
                "created_by",
            )
            .order_by("-created_at", "-id")
        )


# =====================================================
# APPROVE TASK VIEW
# =====================================================
class TaskApproveView(generics.GenericAPIView):
    """
    Admin approves a pending task.
    """

    serializer_class = TaskApprovalSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminRole,
    ]

    def post(self, request, id):
        serializer = self.get_serializer(data=request.data)

        serializer.is_valid(raise_exception=True)

        task = approve_task(
            task_id=id,
            admin_user=request.user,
            comment=serializer.validated_data.get(
                "comment",
                "",
            ),
        )

        output = TaskDetailSerializer(
            task,
            context={"request": request},
        )

        return Response(
            {
                "message": "Task approved successfully.",
                "task": output.data,
            },
            status=status.HTTP_200_OK,
        )


# =====================================================
# REJECT TASK VIEW
# =====================================================
class TaskRejectView(generics.GenericAPIView):
    """
    Admin rejects a pending task.
    """

    serializer_class = TaskRejectionSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminRole,
    ]

    def post(self, request, id):
        serializer = self.get_serializer(data=request.data)

        serializer.is_valid(raise_exception=True)

        task = reject_task(
            task_id=id,
            admin_user=request.user,
            reason=serializer.validated_data["reason"],
        )

        output = TaskDetailSerializer(
            task,
            context={"request": request},
        )

        return Response(
            {
                "message": "Task rejected successfully.",
                "task": output.data,
            },
            status=status.HTTP_200_OK,
        )


# =====================================================
#               ACCESSIBLE TASK HELPER
# =====================================================
def get_accessible_task(user, task_id):
    """
    Admin can access all tasks.
    Supervisor can access tasks in assigned projects.
    """

    queryset = Task.objects.select_related(
        "project",
        "created_by",
        "approved_by",
    )

    if user.role == "ADMIN" and user.is_staff and user.is_active:
        pass

    elif user.role == "SUPERVISOR" and user.is_active:
        queryset = queryset.filter(
            project__supervisor_assignments__supervisor=user,
        )

    else:
        queryset = queryset.none()

    return get_object_or_404(
        queryset,
        pk=task_id,
    )


# =====================================================
#                  TASK DETAIL VIEW
# =====================================================
class TaskDetailView(generics.RetrieveAPIView):
    serializer_class = TaskDetailSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    lookup_field = "id"

    def get_queryset(self):
        user = self.request.user

        queryset = Task.objects.select_related(
            "project",
            "created_by",
            "approved_by",
        )

        if user.role == "ADMIN" and user.is_staff and user.is_active:
            return queryset

        if user.role == "SUPERVISOR" and user.is_active:
            return queryset.filter(project__supervisor_assignments__supervisor=user)

        return queryset.none()


# =====================================================
# TASK HISTORY VIEW
# =====================================================


class TaskHistoryView(generics.ListAPIView):
    serializer_class = TaskHistorySerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    pagination_class = ProjectPagination

    def get_queryset(self):
        task = get_accessible_task(
            self.request.user,
            self.kwargs["id"],
        )

        return (
            TaskHistory.objects.filter(task=task)
            .select_related("actor")
            .order_by("-created_at", "-id")
        )
