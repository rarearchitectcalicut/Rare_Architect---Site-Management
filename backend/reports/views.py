from django.shortcuts import get_object_or_404
from django.http import FileResponse, Http404
from pathlib import Path
from PIL import Image, UnidentifiedImageError
from django.db.models import Count, Q, Prefetch
from rest_framework import generics, status, serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from projects.pagination import ProjectPagination
from users.permissions import MustChangePasswordPermission, IsAdminRole
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser, FormParser
from .models import DelayReport, DailyReport, DailyTaskWork, DailyManpower, DailyMaterialEntry, DailyReportAttachment
from .serializers import (
    DailyReportCreateSerializer,
    DailyReportDetailSerializer,
    DailyReportQuerySerializer,
    DailyTaskWorkCreateSerializer,
    DailyTaskWorkDetailSerializer,
    DailyTaskWorkUpdateSerializer,
    DailyManpowerCreateSerializer,
    DailyManpowerDetailSerializer,
    DailyMaterialEntryCreateSerializer,
    DailyMaterialEntryDetailSerializer,
    DailyReportAttachmentUploadSerializer,
    DailyTaskWorkReviewSerializer,
    DailyReportAttachmentDetailSerializer,
    DailyTaskWorkCorrectionSerializer,
    DelayReportDetailSerializer,
    DelayReportReviewSerializer,
    DelayExtensionReviewSerializer,
)
from .services import (
    accessible_projects,
    is_admin,
    is_supervisor,
    create_daily_report,
    update_daily_report,
    submit_daily_report,
    add_daily_task_work,
    update_daily_task_work,
    delete_daily_task_work,
    add_daily_manpower,
    update_daily_manpower,
    delete_daily_manpower,
    add_daily_material,
    update_daily_material,
    delete_daily_material,
    upload_daily_report_attachment,
    delete_daily_report_attachment,
    delete_daily_report,
    verify_daily_task_work,
    reject_daily_task_work,
    correct_rejected_daily_task_work,
    create_delay_report,
    accessible_delay_reports,
    approve_delay_report,
    reject_delay_report,
    approve_delay_extension,
    reject_delay_extension,
)
from .progress import calculate_task_progress
from tasks.models import Task

# =====================================================
# ACCESSIBLE DAILY REPORTS
# =====================================================


def accessible_daily_reports(user):
    queryset = DailyReport.objects.select_related(
        "project",
        "reported_by",
    )

    if is_admin(user):
        return queryset.filter(status=DailyReport.Status.SUBMITTED)

    if is_supervisor(user):
        return queryset.filter(
            project__supervisor_assignments__supervisor=user
        ).filter(Q(status=DailyReport.Status.SUBMITTED) | Q(reported_by=user)).distinct()

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
        validator = DailyReportQuerySerializer(data=self.request.query_params)
        validator.is_valid(raise_exception=True)
        filters = validator.validated_data
        queryset = accessible_daily_reports(self.request.user).filter(project=project)
        for key in ("status", "reported_by"):
            if key in filters:
                queryset = queryset.filter(**{key: filters[key]})
        for key, lookup in [("date_from", "report_date__gte"), ("date_to", "report_date__lte")]:
            if key in filters:
                queryset = queryset.filter(**{lookup: filters[key]})
        for term in filters.get("search", "").split():
            queryset = queryset.filter(Q(work_summary__icontains=term) | Q(site_notes__icontains=term) | Q(issues__icontains=term) | Q(site_condition__icontains=term) | Q(next_day_plan__icontains=term))
        ordering = ["report_date", "created_at", "id"] if filters["sort"] == "oldest" else ["-report_date", "-created_at", "-id"]
        return queryset.annotate(
            entry_count=Count("work_entries"),
            pending_count=Count("work_entries", filter=Q(work_entries__verification_status="PENDING")),
            verified_count=Count("work_entries", filter=Q(work_entries__verification_status="VERIFIED")),
            rejected_count=Count("work_entries", filter=Q(work_entries__verification_status="REJECTED")),
            eligible_corrections=Count("work_entries", filter=Q(work_entries__verification_status="REJECTED", work_entries__correction__isnull=True, work_entries__task__approval_status="APPROVED") & ~Q(work_entries__task__work_status__in=["COMPLETED", "CANCELLED"])),
        ).prefetch_related(Prefetch("work_entries", queryset=DailyTaskWork.objects.filter(verification_status="REJECTED").select_related("task", "correction__daily_report").order_by("created_at", "id")[:5], to_attr="rejected_preview")).order_by(*ordering)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        reports = accessible_daily_reports(request.user).filter(project=self.get_project())
        summary = reports.aggregate(
            total=Count("id"), drafts=Count("id", filter=Q(status="DRAFT")), submitted=Count("id", filter=Q(status="SUBMITTED")),
        )
        summary["pending_work"] = DailyTaskWork.objects.filter(daily_report__in=reports, daily_report__status="SUBMITTED", verification_status="PENDING").count()
        if is_admin(request.user):
            summary.pop("drafts")
        response.data["summary"] = summary
        response.data["reporters"] = list(reports.order_by("reported_by__username").values("reported_by", "reported_by__username").distinct())
        return response

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

    def delete(self, request, id):
        report = get_accessible_daily_report(request.user, id)
        delete_daily_report(report_id=report.id, supervisor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

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


class DailyWorkQueueView(generics.ListAPIView):
    """Admin review queue; drafts never enter the verification workflow."""
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, IsAdminRole]
    serializer_class = DailyTaskWorkDetailSerializer
    pagination_class = ProjectPagination

    def get_queryset(self):
        queryset = DailyTaskWork.objects.filter(daily_report__status=DailyReport.Status.SUBMITTED)
        review_status = self.request.query_params.get("status")
        if review_status:
            if review_status not in DailyTaskWork.VerificationStatus.values:
                raise ValidationError({"status": "Invalid verification status."})
            queryset = queryset.filter(verification_status=review_status)
        for key, field in [("project", "daily_report__project_id"), ("report", "daily_report_id")]:
            value = self.request.query_params.get(key)
            if value:
                queryset = queryset.filter(**{field: serializers.UUIDField().run_validation(value)})
        return queryset.select_related(
            "task", "verified_by", "daily_report__project", "daily_report__reported_by", "correction__daily_report", "correction_of__daily_report",
        ).order_by("-created_at", "-id")


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
                "daily_report__project",
                "daily_report__reported_by",
                "verified_by",
                "correction__daily_report", "correction_of__daily_report",
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


# =====================================================
# DAILY TASK WORK DETAIL / UPDATE / DELETE
# =====================================================


class DailyTaskWorkDetailView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get_entry(self, request, id):
        # Only show entries belonging to reports the
        # authenticated user is permitted to access.
        return get_object_or_404(
            DailyTaskWork.objects.filter(
                daily_report__in=accessible_daily_reports(request.user)
            ).select_related(
                "task",
                "daily_report",
                "verified_by",
                "correction__daily_report", "correction_of__daily_report",
            ),
            pk=id,
        )

    def get(self, request, id):
        entry = self.get_entry(request, id)

        return Response(
            DailyTaskWorkDetailSerializer(
                entry,
                context={"request": request},
            ).data
        )

    def patch(self, request, id):
        entry = self.get_entry(request, id)

        updated_entry = update_daily_task_work(
            entry_id=entry.id,
            supervisor=request.user,
            data=request.data,
        )

        return Response(
            DailyTaskWorkDetailSerializer(
                updated_entry,
                context={"request": request},
            ).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request, id):
        entry = self.get_entry(request, id)

        delete_daily_task_work(
            entry_id=entry.id,
            supervisor=request.user,
        )

        return Response(status=status.HTTP_204_NO_CONTENT)


# =====================================================
# DAILY MANPOWER LIST / CREATE
# =====================================================


class DailyManpowerListCreateView(generics.ListCreateAPIView):
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

        return DailyManpower.objects.filter(daily_report=report).order_by(
            "trade", "created_at", "id"
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return DailyManpowerCreateSerializer

        return DailyManpowerDetailSerializer

    def create(self, request, *args, **kwargs):
        report = self.get_report()

        entry = add_daily_manpower(
            report_id=report.id,
            supervisor=request.user,
            data=request.data,
        )

        return Response(
            DailyManpowerDetailSerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# DAILY MANPOWER DETAIL / UPDATE / DELETE
# =====================================================


class DailyManpowerDetailView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get_entry(self, request, id):
        return get_object_or_404(
            DailyManpower.objects.filter(
                daily_report__in=accessible_daily_reports(request.user)
            ).select_related("daily_report"),
            pk=id,
        )

    def get(self, request, id):
        entry = self.get_entry(request, id)

        return Response(DailyManpowerDetailSerializer(entry).data)

    def patch(self, request, id):
        entry = self.get_entry(request, id)

        updated_entry = update_daily_manpower(
            entry_id=entry.id,
            supervisor=request.user,
            data=request.data,
        )

        return Response(
            DailyManpowerDetailSerializer(updated_entry).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request, id):
        entry = self.get_entry(request, id)

        delete_daily_manpower(
            entry_id=entry.id,
            supervisor=request.user,
        )

        return Response(status=status.HTTP_204_NO_CONTENT)


# =====================================================
# DAILY MATERIAL LIST / CREATE
# =====================================================


class DailyMaterialListCreateView(generics.ListCreateAPIView):
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

        return DailyMaterialEntry.objects.filter(daily_report=report).order_by(
            "created_at", "id"
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return DailyMaterialEntryCreateSerializer

        return DailyMaterialEntryDetailSerializer

    def create(self, request, *args, **kwargs):
        report = self.get_report()

        entry = add_daily_material(
            report_id=report.id,
            supervisor=request.user,
            data=request.data,
        )

        return Response(
            DailyMaterialEntryDetailSerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# DAILY MATERIAL DETAIL / UPDATE / DELETE
# =====================================================


class DailyMaterialDetailView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get_entry(self, request, id):
        return get_object_or_404(
            DailyMaterialEntry.objects.filter(
                daily_report__in=accessible_daily_reports(request.user)
            ).select_related("daily_report"),
            pk=id,
        )

    def get(self, request, id):
        entry = self.get_entry(request, id)

        return Response(DailyMaterialEntryDetailSerializer(entry).data)

    def patch(self, request, id):
        entry = self.get_entry(request, id)

        updated_entry = update_daily_material(
            entry_id=entry.id,
            supervisor=request.user,
            data=request.data,
        )

        return Response(
            DailyMaterialEntryDetailSerializer(updated_entry).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request, id):
        entry = self.get_entry(request, id)

        delete_daily_material(
            entry_id=entry.id,
            supervisor=request.user,
        )

        return Response(status=status.HTTP_204_NO_CONTENT)


# =====================================================
# DAILY REPORT ATTACHMENT UPLOAD
# =====================================================


class DailyReportAttachmentUploadView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    parser_classes = [
        MultiPartParser,
        FormParser,
    ]

    def post(self, request, id):
        report = get_accessible_daily_report(
            request.user,
            id,
        )

        attachment = upload_daily_report_attachment(
            report_id=report.id,
            supervisor=request.user,
            data=request.data,
        )

        return Response(
            DailyReportAttachmentDetailSerializer(attachment).data,
            status=status.HTTP_201_CREATED,
        )

    def get(self, request, id):
        report = get_accessible_daily_report(
            request.user,
            id,
        )

        attachments = (
            DailyReportAttachment.objects
            .filter(daily_report=report)
            .select_related(
                "daily_report",
                "task_work",
                "uploaded_by",
            )
            .order_by("created_at", "id")
        )

        paginator = ProjectPagination()

        page = paginator.paginate_queryset(
            attachments,
            request,
            view=self,
        )

        serializer = DailyReportAttachmentDetailSerializer(
            page,
            many=True,
            context={"request": request},
        )

        return paginator.get_paginated_response(
            serializer.data
        )


# =====================================================
# ATTACHMENT DETAIL / DELETE
# =====================================================


class DailyReportAttachmentDetailView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get_attachment(self, request, id):
        return get_object_or_404(
            DailyReportAttachment.objects.filter(
                daily_report__in=accessible_daily_reports(request.user)
            ).select_related(
                "daily_report",
                "task_work",
                "uploaded_by",
            ),
            pk=id,
        )

    def get(self, request, id):
        attachment = self.get_attachment(
            request,
            id,
        )

        return Response(
            DailyReportAttachmentDetailSerializer(
                attachment,
                context={"request": request},
            ).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request, id):
        # Check project-level access first.
        attachment = self.get_attachment(
            request,
            id,
        )

        delete_daily_report_attachment(
            attachment_id=attachment.id,
            supervisor=request.user,
        )

        return Response(
            status=status.HTTP_204_NO_CONTENT,
        )


# =====================================================
# SECURE ATTACHMENT DOWNLOAD
# =====================================================


class DailyReportAttachmentDownloadView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get(self, request, id):
        attachment = get_object_or_404(
            DailyReportAttachment.objects.filter(
                daily_report__in=accessible_daily_reports(request.user)
            ),
            pk=id,
        )

        if not attachment.file.name:
            raise Http404("Attachment file not found.")

        # Access has already been checked.
        # Open the file only after authorization.
        try:
            file_handle = attachment.file.storage.open(
                attachment.file.name,
                mode="rb",
            )
        except (FileNotFoundError, OSError):
            raise Http404("Attachment file not found.")

        # Use only the filename, never a path
        # supplied by the client.
        filename = Path(attachment.original_filename).name

        # Uploaded names and client MIME headers are not sufficient evidence.
        # Re-identify allowlisted content before serving anything inline.
        content_type = "application/octet-stream"
        extension = Path(filename).suffix.lower()
        try:
            if extension == ".pdf" and file_handle.read(5) == b"%PDF-":
                content_type = "application/pdf"
            elif extension in {".jpg", ".jpeg", ".png", ".webp"}:
                file_handle.seek(0)
                with Image.open(file_handle) as picture:
                    image_format = picture.format
                    picture.verify()
                expected = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}
                if image_format == expected[extension]:
                    content_type = Image.MIME[image_format]
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
            pass
        finally:
            file_handle.seek(0)
        inline = request.query_params.get("preview") == "1" and content_type != "application/octet-stream"
        response = FileResponse(
            file_handle,
            as_attachment=not inline,
            filename=filename or "attachment",
            content_type=content_type,
        )

        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"

        return response


# =====================================================
# ADMIN VERIFY DAILY TASK WORK
# =====================================================


class DailyTaskWorkVerifyView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def post(self, request, id):
        if not is_admin(request.user):
            return Response(
                {"detail": ("Only Admins can verify daily work.")},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = DailyTaskWorkReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        entry = verify_daily_task_work(
            entry_id=id,
            admin_user=request.user,
            verification_note=(serializer.validated_data.get("verification_note", "")),
        )

        return Response(
            DailyTaskWorkDetailSerializer(entry).data,
            status=status.HTTP_200_OK,
        )


# =====================================================
# ADMIN REJECT DAILY TASK WORK
# =====================================================


class DailyTaskWorkRejectView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def post(self, request, id):
        if not is_admin(request.user):
            return Response(
                {"detail": ("Only Admins can reject daily work.")},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = DailyTaskWorkReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        entry = reject_daily_task_work(
            entry_id=id,
            admin_user=request.user,
            verification_note=(serializer.validated_data.get("verification_note", "")),
        )

        return Response(
            DailyTaskWorkDetailSerializer(entry).data,
            status=status.HTTP_200_OK,
        )


# =====================================================
# TASK PROGRESS API
# =====================================================


class TaskProgressView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get(self, request, id):

        # Access is limited to tasks belonging to
        # projects visible to this user.
        task = get_object_or_404(
            Task.objects.filter(
                project__in=accessible_projects(request.user)
            ).select_related("project"),
            pk=id,
        )

        progress = calculate_task_progress(task)

        return Response(
            {
                "task_id": str(task.id),
                "task_title": task.title,
                "project_id": str(task.project_id),
                "approval_status": task.approval_status,
                "work_status": task.work_status,
                **progress,
            }
        )


# =====================================================
# REJECTED DAILY TASK WORK CORRECTION
# =====================================================
class DailyTaskWorkCorrectionView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def post(self, request, id):
        # Confirm the user has access to the
        # original entry's project.
        original_entry = get_object_or_404(
            DailyTaskWork.objects.filter(
                daily_report__in=accessible_daily_reports(request.user)
            ),
            pk=id,
        )

        serializer = DailyTaskWorkCorrectionSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        data = dict(serializer.validated_data)
        new_report = data.pop("new_daily_report")

        # Check visibility of the new report too.
        get_accessible_daily_report(
            request.user,
            new_report.id,
        )

        corrected_entry = correct_rejected_daily_task_work(
            rejected_entry_id=original_entry.id,
            new_report_id=new_report.id,
            supervisor=request.user,
            corrected_data=data,
        )

        return Response(
            DailyTaskWorkDetailSerializer(
                corrected_entry,
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# CREATE DELAY REPORT FOR A TASK
# =====================================================


class TaskDelayReportCreateView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def post(self, request, id):
        # First ensure the user can access the task.
        task = get_object_or_404(
            Task.objects.filter(project__in=accessible_projects(request.user)),
            pk=id,
        )

        report = create_delay_report(
            task_id=task.id,
            supervisor=request.user,
            data=request.data,
        )

        return Response(
            DelayReportDetailSerializer(
                report,
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# LIST DELAY REPORTS
# =====================================================


class DelayReportListView(generics.ListAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    serializer_class = DelayReportDetailSerializer
    pagination_class = ProjectPagination

    def get_queryset(self):
        queryset = accessible_delay_reports(self.request.user)

        task_id = self.request.query_params.get("task")
        report_status = self.request.query_params.get("status")

        if task_id:
            queryset = queryset.filter(task_id=serializers.UUIDField().run_validation(task_id))

        if report_status:
            if report_status not in DelayReport.Status.values:
                raise ValidationError({"status": "Invalid delay report status."})
            queryset = queryset.filter(status=report_status)

        project = self.request.query_params.get("project")
        if project:
            queryset = queryset.filter(task__project_id=serializers.UUIDField().run_validation(project))
        delay_type = self.request.query_params.get("delay_type")
        if delay_type:
            if delay_type not in DelayReport.DelayType.values:
                raise ValidationError({"delay_type": "Invalid delay type."})
            queryset = queryset.filter(delay_type=delay_type)
        extension_status = self.request.query_params.get("extension_status")
        if extension_status:
            if extension_status not in DelayReport.Status.values:
                raise ValidationError({"extension_status": "Invalid extension status."})
            queryset = queryset.filter(extension_status=extension_status)

        return queryset.order_by("-reported_at", "-id")


# =====================================================
# DELAY REPORT DETAIL
# =====================================================


class DelayReportDetailView(generics.RetrieveAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    serializer_class = DelayReportDetailSerializer
    lookup_field = "id"
    lookup_url_kwarg = "id"

    def get_queryset(self):
        return accessible_delay_reports(self.request.user)


# =====================================================
# ADMIN APPROVE DELAY REPORT
# =====================================================


class DelayReportApproveView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def post(self, request, id):
        if not is_admin(request.user):
            return Response(
                {"detail": ("Only Admins can approve delay reports.")},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = DelayReportReviewSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        report = approve_delay_report(
            report_id=id,
            admin_user=request.user,
            admin_comment=serializer.validated_data.get(
                "admin_comment",
                "",
            ),
        )

        return Response(
            DelayReportDetailSerializer(
                report,
                context={"request": request},
            ).data,
            status=status.HTTP_200_OK,
        )


# =====================================================
# ADMIN REJECT DELAY REPORT
# =====================================================


class DelayReportRejectView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def post(self, request, id):
        if not is_admin(request.user):
            return Response(
                {"detail": ("Only Admins can reject delay reports.")},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = DelayReportReviewSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        report = reject_delay_report(
            report_id=id,
            admin_user=request.user,
            admin_comment=serializer.validated_data.get(
                "admin_comment",
                "",
            ),
        )

        return Response(
            DelayReportDetailSerializer(
                report,
                context={"request": request},
            ).data,
            status=status.HTTP_200_OK,
        )


# =====================================================
# ADMIN APPROVE DEADLINE EXTENSION
# =====================================================


class DelayExtensionApproveView(generics.GenericAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def post(self, request, id):

        if not is_admin(request.user):
            return Response(
                {"detail": ("Only Admins can approve " "deadline extensions.")},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = DelayExtensionReviewSerializer(
            data=request.data,
        )

        serializer.is_valid(raise_exception=True)

        report = approve_delay_extension(
            report_id=id,
            admin_user=request.user,
            admin_comment=serializer.validated_data.get(
                "admin_comment",
                "",
            ),
        )

        return Response(
            DelayReportDetailSerializer(
                report,
                context={"request": request},
            ).data,
            status=status.HTTP_200_OK,
        )


# =====================================================
# ADMIN REJECT DEADLINE EXTENSION
# =====================================================


class DelayExtensionRejectView(generics.GenericAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def post(self, request, id):

        if not is_admin(request.user):
            return Response(
                {"detail": ("Only Admins can reject " "deadline extensions.")},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = DelayExtensionReviewSerializer(
            data=request.data,
        )

        serializer.is_valid(raise_exception=True)

        report = reject_delay_extension(
            report_id=id,
            admin_user=request.user,
            admin_comment=serializer.validated_data.get(
                "admin_comment",
                "",
            ),
        )

        return Response(
            DelayReportDetailSerializer(
                report,
                context={"request": request},
            ).data,
            status=status.HTTP_200_OK,
        )
