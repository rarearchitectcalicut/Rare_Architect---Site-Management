from django.shortcuts import get_object_or_404
from django.db.models import Case, Count, F, IntegerField, Q, When
from django.db.models.functions import Lower
from django.utils import timezone

from rest_framework import generics, status, serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from projects.models import Project, ProjectSupervisor
from projects.pagination import ProjectPagination

from users.permissions import MustChangePasswordPermission,IsAdminRole

from .models import Task,TaskHistory,TaskChangeRequest
from .permissions import IsSupervisorRole
from .serializers import (
    TaskCreateSerializer,
    BulkTaskCreateSerializer,
    TaskListSerializer,
    TaskRegisterSerializer,
    TaskRegisterQuerySerializer,
    TaskDetailSerializer,
    TaskApprovalSerializer,
    TaskRejectionSerializer,
    TaskApprovalListSerializer,
    TaskDetailSerializer,
    TaskHistorySerializer,
    TaskCancelSerializer,
    TaskReopenSerializer,
    TaskCompleteSerializer,
    TaskChangeRequestCreateSerializer,
    TaskChangeRequestDetailSerializer,
    TaskChangeRequestReviewSerializer,
    TimelineReorderSerializer,
    TimelineChangeRequestDetailSerializer,
    TimelineChangeReviewSerializer,
    TaskResubmissionSerializer,
    TaskDetailSerializer,
)
from .services import (
    create_task,
    create_bulk_tasks,
    approve_task,
    reject_task,
    cancel_task,
    reopen_task,
    complete_task,
    start_task,
    create_task_change_request,
    approve_task_change_request,
    reject_task_change_request,
    get_timeline_tasks,
    create_timeline_reorder_request,
    approve_timeline_reorder_request,
    reject_timeline_reorder_request,
    resubmit_task,
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


class TaskRegisterView(generics.ListAPIView):
    """Read-only, server-paginated register over the user's accessible projects."""
    serializer_class = TaskRegisterSerializer
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, IsAdminRole | IsSupervisorRole]
    pagination_class = ProjectPagination

    def accessible_projects(self):
        projects = Project.objects.all()
        if self.request.user.role == "SUPERVISOR":
            projects = projects.filter(supervisor_assignments__supervisor=self.request.user)
        return projects

    def get_queryset(self):
        return Task.objects.filter(project__in=self.accessible_projects()).select_related(
            "project", "created_by",
        ).prefetch_related("project__supervisor_assignments__supervisor")

    def list(self, request, *args, **kwargs):
        validator = TaskRegisterQuerySerializer(data=request.query_params)
        validator.is_valid(raise_exception=True)
        filters = validator.validated_data
        if request.user.role != "ADMIN" and "supervisor" in filters:
            raise serializers.ValidationError({"supervisor": "Supervisor filtering is only available to Admins."})

        base = self.get_queryset()
        overdue = Q(approval_status=Task.ApprovalStatus.APPROVED, end_date__lt=timezone.localdate()) & ~Q(
            work_status__in=[Task.WorkStatus.COMPLETED, Task.WorkStatus.CANCELLED],
        )
        summary = base.aggregate(
            total=Count("id"), pending_approval=Count("id", filter=Q(approval_status=Task.ApprovalStatus.PENDING)),
            not_started=Count("id", filter=Q(work_status=Task.WorkStatus.NOT_STARTED)),
            in_progress=Count("id", filter=Q(work_status=Task.WorkStatus.IN_PROGRESS)),
            completed=Count("id", filter=Q(work_status=Task.WorkStatus.COMPLETED)), overdue=Count("id", filter=overdue),
        )
        queryset = base
        for field in ("approval_status", "work_status", "priority"):
            if field in filters:
                queryset = queryset.filter(**{field: filters[field]})
        if "project" in filters:
            # Validate access before filtering, matching project-task URL authorization.
            project = get_object_or_404(self.accessible_projects(), pk=filters["project"])
            queryset = queryset.filter(project=project)
        if "supervisor" in filters:
            assigned_projects = ProjectSupervisor.objects.filter(supervisor_id=filters["supervisor"]).values("project_id")
            queryset = queryset.filter(project_id__in=assigned_projects)
        for key, lookup in {"start_from": "start_date__gte", "start_to": "start_date__lte", "end_from": "end_date__gte", "end_to": "end_date__lte"}.items():
            if key in filters:
                queryset = queryset.filter(**{lookup: filters[key]})
        if filters["overdue"]:
            queryset = queryset.filter(overdue)
        for term in filters.get("search", "").split():
            queryset = queryset.filter(Q(title__icontains=term) | Q(description__icontains=term) | Q(worker_name__icontains=term) | Q(project__name__icontains=term))

        sort = filters["sort"]
        ordering = {
            "order": ["project__name", "project_id", "display_order", "created_at", "id"],
            "newest": ["-created_at", "-id"], "oldest": ["created_at", "id"],
            "start_date": [F("start_date").asc(nulls_last=True), "id"],
            "end_date": [F("end_date").asc(nulls_last=True), "id"],
            "title": [Lower("title"), "id"],
            "priority": ["priority_rank", "project__name", "display_order", "id"],
        }
        if sort == "priority":
            queryset = queryset.annotate(priority_rank=Case(
                *[When(priority=value, then=index) for index, value in enumerate(["URGENT", "HIGH", "MEDIUM", "LOW"])],
                default=4, output_field=IntegerField(),
            ))
        queryset = queryset.order_by(*ordering[sort])
        page = self.paginate_queryset(queryset)
        response = self.get_paginated_response(self.get_serializer(page, many=True).data)
        projects = self.accessible_projects()
        assignments = ProjectSupervisor.objects.filter(project__in=projects).order_by("supervisor__username").values(
            "supervisor_id", "supervisor__first_name", "supervisor__last_name", "supervisor__username",
        ).distinct()
        response.data["summary"] = summary
        response.data["filter_options"] = {
            "projects": list(projects.order_by("name", "id").values("id", "name")),
            "supervisors": [
                {"id": item["supervisor_id"], "name": " ".join(filter(None, [item["supervisor__first_name"], item["supervisor__last_name"]])).strip() or item["supervisor__username"]}
                for item in assignments
            ] if request.user.role == "ADMIN" else [],
        }
        return response


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
    Admin can list task approvals by status (pending by default).
    """

    serializer_class = TaskApprovalListSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminRole,
    ]

    pagination_class = ProjectPagination

    def get_queryset(self):
        requested_status = self.request.query_params.get("status", Task.ApprovalStatus.PENDING)
        if requested_status not in Task.ApprovalStatus.values:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"status": "Invalid task approval status."})

        return (
            Task.objects.filter(approval_status=requested_status)
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
            .select_related("actor", "task__project")
            .order_by("-created_at", "-id")
        )


class TaskDecisionListView(generics.ListAPIView):
    """Read-only task approval cycles, including decisions before resubmission."""
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, IsAdminRole]
    serializer_class = TaskHistorySerializer
    pagination_class = ProjectPagination

    def get_queryset(self):
        queryset = TaskHistory.objects.filter(action__in=["APPROVED", "REJECTED"])
        project = self.request.query_params.get("project")
        if project:
            queryset = queryset.filter(task__project_id=serializers.UUIDField().run_validation(project))
        return queryset.select_related("actor", "task__project").order_by("-created_at", "-id")


# =====================================================
# START TASK VIEW
# =====================================================


class TaskStartView(generics.GenericAPIView):
    serializer_class = serializers.Serializer
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsSupervisorRole,
    ]

    def post(self, request, id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task = start_task(task_id=id, user=request.user)
        return Response(
            {
                "message": "Task started successfully.",
                "task": TaskDetailSerializer(task, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )


# =====================================================
# COMPLETE TASK VIEW
# =====================================================


class TaskCompleteView(generics.GenericAPIView):
    serializer_class = TaskCompleteSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsSupervisorRole,
    ]

    def post(self, request, id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        task = complete_task(
            task_id=id,
            user=request.user,
            comment=serializer.validated_data.get("comment", ""),
        )

        return Response(
            {
                "message": "Task completed successfully.",
                "task": TaskDetailSerializer(
                    task,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_200_OK,
        )


# =====================================================
# CANCEL TASK VIEW
# =====================================================


class TaskCancelView(generics.GenericAPIView):
    serializer_class = TaskCancelSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminRole | IsSupervisorRole,
    ]

    def post(self, request, id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        task = cancel_task(
            task_id=id,
            user=request.user,
            reason=serializer.validated_data["reason"],
        )

        return Response(
            {
                "message": "Task cancelled successfully.",
                "task": TaskDetailSerializer(
                    task,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_200_OK,
        )


# =====================================================
# REOPEN COMPLETED TASK
# =====================================================

class TaskReopenView(generics.GenericAPIView):
    serializer_class = TaskReopenSerializer
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, IsAdminRole]

    def post(self, request, id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task = reopen_task(task_id=id, admin_user=request.user, reason=serializer.validated_data["reason"])
        return Response(
            {"message": "Task reopened successfully.", "task": TaskDetailSerializer(task, context={"request": request}).data},
            status=status.HTTP_200_OK,
        )


# =====================================================
# CREATE TASK CHANGE REQUEST
# =====================================================


class TaskChangeRequestCreateView(generics.GenericAPIView):
    serializer_class = TaskChangeRequestCreateSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsSupervisorRole,
    ]

    def post(self, request, id):
        task = get_accessible_task(request.user, id)

        serializer = self.get_serializer(
            data=request.data,
            context={
                "request": request,
                "task": task,
            },
        )
        serializer.is_valid(raise_exception=True)

        change_request = create_task_change_request(
            task_id=task.id,
            supervisor=request.user,
            new_values=serializer.validated_data["new_values"],
            reason=serializer.validated_data["reason"],
        )

        return Response(
            TaskChangeRequestDetailSerializer(
                change_request,
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# CHANGE REQUEST ACCESS HELPER
# =====================================================

def accessible_change_requests(user):
    queryset = TaskChangeRequest.objects.select_related(
        "task",
        "requested_by",
        "reviewed_by",
    )

    if user.role == "ADMIN" and user.is_staff and user.is_active:
        return queryset

    if user.role == "SUPERVISOR" and user.is_active:
        return queryset.filter(
            task__project__supervisor_assignments__supervisor=user
        ).distinct()

    return queryset.none()


# =====================================================
# LIST CHANGE REQUESTS
# =====================================================

class TaskChangeRequestListView(generics.ListAPIView):
    serializer_class = TaskChangeRequestDetailSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    pagination_class = ProjectPagination

    def get_queryset(self):
        queryset = accessible_change_requests(
            self.request.user
        )

        # Ordinary task edits only.
        queryset = queryset.filter(
            change_type=TaskChangeRequest.ChangeType.EDIT
        )

        requested_status = self.request.query_params.get("status")

        if requested_status:
            if requested_status not in (
                TaskChangeRequest.Status.values
            ):
                from rest_framework.exceptions import ValidationError
                raise ValidationError({
                    "status": "Invalid change request status."
                })

            queryset = queryset.filter(status=requested_status)

        return queryset.order_by("-created_at", "-id")


# =====================================================
# CHANGE REQUEST DETAILS
# =====================================================

class TaskChangeRequestDetailView(generics.RetrieveAPIView):
    serializer_class = TaskChangeRequestDetailSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    lookup_field = "id"

    def get_queryset(self):
        return accessible_change_requests(
            self.request.user
        )


# =====================================================
# APPROVE CHANGE REQUEST
# =====================================================

class TaskChangeRequestApproveView(generics.GenericAPIView):
    serializer_class = TaskChangeRequestReviewSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminRole,
    ]

    def post(self, request, id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        change_request = approve_task_change_request(
            change_request_id=id,
            admin_user=request.user,
            admin_comment=serializer.validated_data.get(
                "admin_comment", ""
            ),
        )

        return Response(
            {
                "message": "Task changes approved successfully.",
                "change_request": TaskChangeRequestDetailSerializer(
                    change_request,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_200_OK,
        )


# =====================================================
# REJECT CHANGE REQUEST
# =====================================================

class TaskChangeRequestRejectView(generics.GenericAPIView):
    serializer_class = TaskChangeRequestReviewSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminRole,
    ]

    def post(self, request, id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        change_request = reject_task_change_request(
            change_request_id=id,
            admin_user=request.user,
            admin_comment=serializer.validated_data.get(
                "admin_comment", ""
            ),
        )

        return Response(
            {
                "message": "Task changes rejected successfully.",
                "change_request": TaskChangeRequestDetailSerializer(
                    change_request,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_200_OK,
        )


# =====================================================
# PROJECT TIMELINE
# =====================================================


class ProjectTimelineView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get(self, request, project_id):
        project = get_accessible_project(
            request.user,
            project_id,
        )

        tasks = get_timeline_tasks(project)

        return Response(
            {
                "project_id": str(project.id),
                "project_name": project.name,
                "task_count": len(tasks),
                "tasks": TaskListSerializer(
                    tasks,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )


# =====================================================
# REQUEST TIMELINE REORDER
# =====================================================


class TimelineReorderView(generics.GenericAPIView):
    serializer_class = TimelineReorderSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsSupervisorRole,
    ]

    def post(self, request, project_id):
        project = get_accessible_project(
            request.user,
            project_id,
        )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        change_request = create_timeline_reorder_request(
            project=project,
            supervisor=request.user,
            task_ids=serializer.validated_data["task_ids"],
            reason=serializer.validated_data["reason"],
        )

        return Response(
            {
                "message": "Timeline reorder submitted for approval.",
                "change_request": TimelineChangeRequestDetailSerializer(
                    change_request,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# LIST TIMELINE CHANGE REQUESTS
# =====================================================


class TimelineChangeRequestListView(generics.ListAPIView):
    serializer_class = TimelineChangeRequestDetailSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    pagination_class = ProjectPagination

    def get_queryset(self):
        queryset = accessible_change_requests(self.request.user).filter(
            change_type=TaskChangeRequest.ChangeType.ORDER_CHANGE
        )

        requested_status = self.request.query_params.get("status")

        if requested_status:
            if requested_status not in TaskChangeRequest.Status.values:
                from rest_framework.exceptions import ValidationError

                raise ValidationError({"status": "Invalid timeline request status."})

            queryset = queryset.filter(status=requested_status)

        return queryset.order_by("-created_at", "-id")


# =====================================================
# APPROVE TIMELINE REORDER
# =====================================================


class TimelineChangeApproveView(generics.GenericAPIView):
    serializer_class = TimelineChangeReviewSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminRole,
    ]

    def post(self, request, id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        change_request = approve_timeline_reorder_request(
            request_id=id,
            admin_user=request.user,
            admin_comment=serializer.validated_data.get(
                "admin_comment",
                "",
            ),
        )

        return Response(
            {
                "message": "Timeline order approved successfully.",
                "change_request": TimelineChangeRequestDetailSerializer(
                    change_request,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_200_OK,
        )


# =====================================================
# REJECT TIMELINE REORDER
# =====================================================


class TimelineChangeRejectView(generics.GenericAPIView):
    serializer_class = TimelineChangeReviewSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsAdminRole,
    ]

    def post(self, request, id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        change_request = reject_timeline_reorder_request(
            request_id=id,
            admin_user=request.user,
            admin_comment=serializer.validated_data.get(
                "admin_comment",
                "",
            ),
        )

        return Response(
            {
                "message": "Timeline reorder rejected.",
                "change_request": TimelineChangeRequestDetailSerializer(
                    change_request,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_200_OK,
        )


# =====================================================
# RESUBMIT REJECTED TASK VIEW
# =====================================================
class TaskResubmitView(generics.GenericAPIView):
    """
    Allows the original Supervisor to correct
    and resubmit a rejected task.

    The service verifies ownership and resets
    the task to PENDING Admin approval.
    """

    serializer_class = TaskResubmissionSerializer

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        IsSupervisorRole,
    ]

    def post(self, request, id):
        # Check whether Supervisor can access the task.
        task = get_accessible_task(
            request.user,
            id,
        )

        # Validate input against existing task values.
        serializer = self.get_serializer(
            instance=task,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)

        # Service revalidates under database lock.
        updated_task = resubmit_task(
            task_id=task.id,
            supervisor=request.user,
            validated_data=serializer.validated_data,
        )

        return Response(
            {
                "message": ("Task resubmitted for Admin approval."),
                "task": TaskDetailSerializer(
                    updated_task,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_200_OK,
        )
