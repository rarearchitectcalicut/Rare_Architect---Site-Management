from django.db.models import Prefetch
from django.shortcuts import get_object_or_404

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from django.http import FileResponse, Http404
from users.permissions import MustChangePasswordPermission
from projects.models import Project
from projects.pagination import ProjectPagination
from reports.services import accessible_projects
from pathlib import Path
from tasks.models import Task
from .models import (
    ProjectDocument,
    ProjectDocumentVersion,
    TaskDocumentVersion,
    TaskDocument,
)
from .serializers import (
    ProjectDocumentCreateSerializer,
    ProjectDocumentListSerializer,
    ProjectDocumentDetailSerializer,
    ProjectDocumentVersionSerializer,
    ProjectDocumentVersionUploadSerializer,
    TaskDocumentCreateSerializer,
    TaskDocumentListSerializer,
    TaskDocumentDetailSerializer,
)
from .services import (
    create_project_document,
    validate_document_access,
    upload_project_document_version,
    create_task_document,
    validate_document_access,
)

# =====================================================
# PROJECT DOCUMENT QUERYSET
# =====================================================


def accessible_project_documents(user):
    """
    Only include Project Documents belonging
    to projects accessible to this user.
    """

    return (
        ProjectDocument.objects.filter(project__in=accessible_projects(user))
        .select_related(
            "project",
            "uploaded_by",
        )
        .prefetch_related(
            Prefetch(
                "versions",
                queryset=ProjectDocumentVersion.objects.order_by("-version_number"),
                to_attr="prefetched_versions",
            )
        )
    )


# =====================================================
# PROJECT DOCUMENT LIST + CREATE
# =====================================================


class ProjectDocumentListCreateView(generics.ListCreateAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    parser_classes = [
        MultiPartParser,
        FormParser,
    ]

    pagination_class = ProjectPagination

    def get_project(self, project_id):
        project = get_object_or_404(
            Project,
            pk=project_id,
        )

        validate_document_access(
            user=self.request.user,
            project=project,
        )

        return project

    # -----------------------------------------
    # GET /projects/{id}/documents/
    # -----------------------------------------

    def get(self, request, project_id):

        project = self.get_project(project_id)

        queryset = (
            accessible_project_documents(request.user)
            .filter(
                project=project,
            )
            .order_by(
                "-created_at",
                "-id",
            )
        )

        page = self.paginate_queryset(queryset)

        if page is not None:
            serializer = ProjectDocumentListSerializer(
                page,
                many=True,
                context={"request": request},
            )
            return self.get_paginated_response(serializer.data)

        serializer = ProjectDocumentListSerializer(
            queryset,
            many=True,
            context={"request": request},
        )

        return Response(serializer.data)

    # -----------------------------------------
    # POST /projects/{id}/documents/
    # -----------------------------------------

    def post(self, request, project_id):

        self.get_project(project_id)

        serializer = ProjectDocumentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        document, version = create_project_document(
            project_id=project_id,
            user=request.user,
            title=data["title"],
            description=data.get("description", ""),
            document_type=data["document_type"],
            uploaded_file=data["file"],
        )

        # Reload with the same version prefetch used
        # by the list/detail serializer.
        document = accessible_project_documents(request.user).get(pk=document.pk)

        return Response(
            ProjectDocumentDetailSerializer(
                document,
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# PROJECT DOCUMENT DETAIL
# =====================================================


class ProjectDocumentDetailView(generics.RetrieveAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    serializer_class = ProjectDocumentDetailSerializer

    lookup_field = "id"

    def get_queryset(self):
        return accessible_project_documents(self.request.user)


# =====================================================
# PROJECT DOCUMENT VERSION LIST AND UPLOAD
# =====================================================


class ProjectDocumentVersionListCreateView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    parser_classes = [
        MultiPartParser,
        FormParser,
    ]

    pagination_class = ProjectPagination

    def get_document(self, user, document_id):
        """
        Only retrieve a document from a project
        accessible to the requesting user.
        """
        return get_object_or_404(
            accessible_project_documents(user),
            pk=document_id,
        )

    # ---------------------------------------------
    # GET - VERSION HISTORY
    # ---------------------------------------------

    def get(self, request, id):
        document = self.get_document(
            request.user,
            id,
        )

        queryset = ProjectDocumentVersion.objects.filter(
            document=document,
        ).order_by("-version_number")

        page = self.paginate_queryset(queryset)

        if page is not None:
            serializer = ProjectDocumentVersionSerializer(
                page,
                many=True,
            )
            return self.get_paginated_response(serializer.data)

        serializer = ProjectDocumentVersionSerializer(
            queryset,
            many=True,
        )
        return Response(serializer.data)

    # ---------------------------------------------
    # POST - UPLOAD NEW VERSION
    # ---------------------------------------------

    def post(self, request, id):
        # Check access before processing the upload.
        self.get_document(request.user, id)

        serializer = ProjectDocumentVersionUploadSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        version = upload_project_document_version(
            document_id=id,
            user=request.user,
            uploaded_file=serializer.validated_data["file"],
        )

        return Response(
            ProjectDocumentVersionSerializer(version).data,
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# SECURE PROJECT DOCUMENT VERSION DOWNLOAD
# =====================================================


class ProjectDocumentVersionDownloadView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get(self, request, id):
        """
        Stream the file only after checking
        access to its parent project.

        No direct storage URL is exposed.
        """

        version = get_object_or_404(
            ProjectDocumentVersion.objects.select_related(
                "document",
                "document__project",
            ).filter(
                document__in=accessible_project_documents(
                    request.user,
                )
            ),
            pk=id,
        )

        if not version.file.name:
            raise Http404("Document file is unavailable.")

        try:
            file_handle = version.file.storage.open(
                version.file.name,
                mode="rb",
            )
        except (OSError, FileNotFoundError):
            raise Http404("Document file is unavailable.")

        # The original filename is metadata only.
        # FileResponse uses it as a suggested
        # download name; the stored name remains
        # randomized and private.
        download_name = Path(version.original_filename.replace("\\", "/")).name

        response = FileResponse(
            file_handle,
            as_attachment=True,
            filename=download_name,
            content_type="application/octet-stream",
        )

        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"

        return response


# =====================================================
# ACCESSIBLE TASK DOCUMENTS
# =====================================================


def accessible_task_documents(user):
    """
    Return only Task Documents belonging
    to projects accessible to the user.

    Prefetch all versions for efficient
    current-version and count serialization.
    """

    return (
        TaskDocument.objects.filter(task__project__in=accessible_projects(user))
        .select_related(
            "task",
            "task__project",
            "uploaded_by",
        )
        .prefetch_related(
            Prefetch(
                "versions",
                queryset=TaskDocumentVersion.objects.order_by("-version_number"),
                to_attr="prefetched_versions",
            )
        )
    )


# =====================================================
# TASK DOCUMENT LIST AND CREATE
# =====================================================


class TaskDocumentListCreateView(generics.ListCreateAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    parser_classes = [
        MultiPartParser,
        FormParser,
    ]

    pagination_class = ProjectPagination

    def get_task(self, task_id):
        """
        Check that the Task exists and belongs
        to a project accessible to the user.
        """

        task = get_object_or_404(
            Task.objects.select_related("project"),
            pk=task_id,
        )

        validate_document_access(
            user=self.request.user,
            project=task.project,
        )

        return task

    # ---------------------------------------------
    # LIST TASK DOCUMENTS
    # ---------------------------------------------

    def get(self, request, task_id):

        task = self.get_task(task_id)

        queryset = (
            accessible_task_documents(request.user)
            .filter(
                task=task,
            )
            .order_by(
                "-created_at",
                "-id",
            )
        )

        page = self.paginate_queryset(queryset)

        if page is not None:
            serializer = TaskDocumentListSerializer(
                page,
                many=True,
                context={"request": request},
            )

            return self.get_paginated_response(serializer.data)

        serializer = TaskDocumentListSerializer(
            queryset,
            many=True,
            context={"request": request},
        )

        return Response(serializer.data)

    # ---------------------------------------------
    # CREATE TASK DOCUMENT
    # ---------------------------------------------

    def post(self, request, task_id):

        # Check access before processing the file.
        self.get_task(task_id)

        serializer = TaskDocumentCreateSerializer(
            data=request.data,
        )

        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        document, version = create_task_document(
            task_id=task_id,
            user=request.user,
            title=data["title"],
            description=data.get("description", ""),
            document_type=data["document_type"],
            uploaded_file=data["file"],
        )

        # Reload with prefetched version information.
        document = accessible_task_documents(request.user).get(pk=document.pk)

        return Response(
            TaskDocumentDetailSerializer(
                document,
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# TASK DOCUMENT DETAIL
# =====================================================


class TaskDocumentDetailView(generics.RetrieveAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    serializer_class = TaskDocumentDetailSerializer

    lookup_field = "id"

    def get_queryset(self):
        return accessible_task_documents(self.request.user)
