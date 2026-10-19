from django.shortcuts import get_object_or_404

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from projects.pagination import ProjectPagination
from users.permissions import MustChangePasswordPermission
from projects.pagination import ProjectPagination

from .models import DailyReport,DailyTaskWork
from .serializers import (
    DailyReportCreateSerializer,
    DailyReportDetailSerializer,
    DailyTaskWorkCreateSerializer,
    DailyTaskWorkDetailSerializer,
)
from .services import (
    accessible_projects,
    is_admin,
    is_supervisor,
    create_daily_report,
    update_daily_report,
    submit_daily_report,
    add_daily_task_work,
)

# =====================================================
# ACCESSIBLE DAILY REPORTS
# =====================================================


def accessible_daily_reports(user):
    queryset = DailyReport.objects.select_related(
        "project",
        "reported_by",
    )

    if is_admin(user):
        return queryset

    if is_supervisor(user):
        return queryset.filter(
            project__supervisor_assignments__supervisor=user
        ).distinct()

    return queryset.none()


def get_accessible_daily_report(user, report_id):
    return get_object_or_404(
        accessible_daily_reports(user),
        pk=report_id,
    )


# =====================================================
# DAILY REPORT LIST AND CREATE
# =====================================================


class ProjectDailyReportListCreateView(generics.ListCreateAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    pagination_class = ProjectPagination

    def get_project(self):
        return get_object_or_404(
            accessible_projects(self.request.user),
            pk=self.kwargs["project_id"],
        )

    def get_queryset(self):
        project = self.get_project()

        return (
            accessible_daily_reports(self.request.user)
            .filter(project=project)
            .order_by("-report_date", "-created_at")
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return DailyReportCreateSerializer

        return DailyReportDetailSerializer

    def create(self, request, *args, **kwargs):
        project = self.get_project()

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        report = create_daily_report(
            project=project,
            supervisor=request.user,
            validated_data=serializer.validated_data,
        )

        return Response(
            DailyReportDetailSerializer(
                report,
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# DAILY REPORT DETAIL AND DRAFT UPDATE
# =====================================================


class DailyReportDetailView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get(self, request, id):
        report = get_accessible_daily_report(
            request.user,
            id,
        )

        return Response(
            DailyReportDetailSerializer(
                report,
                context={"request": request},
            ).data
        )

    def patch(self, request, id):
        # First check project-level access.
        report = get_accessible_daily_report(
            request.user,
            id,
        )

        updated_report = update_daily_report(
            report_id=report.id,
            supervisor=request.user,
            data=request.data,
        )

        return Response(
            DailyReportDetailSerializer(
                updated_report,
                context={"request": request},
            ).data,
            status=status.HTTP_200_OK,
        )


# =====================================================
# SUBMIT DAILY REPORT
# =====================================================


class DailyReportSubmitView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def post(self, request, id):
        report = get_accessible_daily_report(
            request.user,
            id,
        )

        submitted_report = submit_daily_report(
            report_id=report.id,
            supervisor=request.user,
        )

        return Response(
            {
                "message": "Daily report submitted successfully.",
                "report": DailyReportDetailSerializer(
                    submitted_report,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_200_OK,
        )


# =====================================================
# DAILY TASK WORK LIST AND CREATE
# =====================================================


class DailyTaskWorkListCreateView(generics.ListCreateAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    pagination_class = ProjectPagination

    def get_report(self):
        return get_accessible_daily_report(
            self.request.user,
            self.kwargs["id"],
        )

    def get_queryset(self):
        report = self.get_report()

        return (
            DailyTaskWork.objects.filter(daily_report=report)
            .select_related(
                "task",
                "daily_report",
                "verified_by",
            )
            .order_by("created_at", "id")
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return DailyTaskWorkCreateSerializer

        return DailyTaskWorkDetailSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()

        if self.request.method == "POST":
            context["daily_report"] = self.get_report()

        return context

    def create(self, request, *args, **kwargs):
        report = self.get_report()

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        entry = add_daily_task_work(
            report_id=report.id,
            supervisor=request.user,
            validated_data=serializer.validated_data,
        )

        return Response(
            DailyTaskWorkDetailSerializer(
                entry,
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )
