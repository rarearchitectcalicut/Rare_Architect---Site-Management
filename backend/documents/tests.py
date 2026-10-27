from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.storage import InMemoryStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import close_old_connections, connection, connections
from django.test import TestCase, TransactionTestCase
from django.urls import reverse
from PIL import Image
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient

from activity.models import ActivityLog
from projects.models import Project, ProjectCategory, ProjectSupervisor
from tasks.models import Task
from .models import ProjectDocument, ProjectDocumentVersion, TaskDocumentVersion
from .services import create_project_document, upload_project_document_version, create_task_document, DocumentStorageUnavailable
from .validators import MAX_DOCUMENT_SIZE


def pdf_upload(name="plan.pdf"):
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>", b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>"]
    content = b"%PDF-1.4\n"
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(content))
        content += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"
    start = len(content)
    content += b"xref\n0 4\n0000000000 65535 f \n"
    content += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    content += f"trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode()
    return SimpleUploadedFile(name, content, "application/pdf")


class ProjectDocumentFixture:
    def setUp(self):
        super().setUp()
        User = get_user_model()
        self.admin = User.objects.create_user(username="docadmin", first_name="Admin", phone="+919711111111", email="docadmin@test.com", role="ADMIN", is_staff=True)
        self.supervisor = User.objects.create_user(username="docsupervisor", first_name="Supervisor", phone="+919722222222", email="docsupervisor@test.com", role="SUPERVISOR")
        self.other = User.objects.create_user(username="docother", first_name="Other", phone="+919733333333", email="docother@test.com", role="SUPERVISOR")
        category = ProjectCategory.objects.create(name="Documents")
        self.project = Project.objects.create(name="Document project", category=category, created_by=self.admin)
        self.other_project = Project.objects.create(name="Other project", category=category, created_by=self.admin)
        ProjectSupervisor.objects.create(project=self.project, supervisor=self.supervisor, assigned_by=self.admin)
        ProjectSupervisor.objects.create(project=self.other_project, supervisor=self.other, assigned_by=self.admin)
        self.storage = InMemoryStorage()
        for model in (ProjectDocumentVersion, TaskDocumentVersion):
            storage_patch = patch.object(model._meta.get_field("file"), "storage", self.storage)
            storage_patch.start()
            self.addCleanup(storage_patch.stop)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def create(self, name="plan.pdf", **kwargs):
        return create_project_document(project_id=self.project.pk, user=self.admin, title="Site plan", document_type="DRAWING", uploaded_file=pdf_upload(name), **kwargs)


class ProjectDocumentTests(ProjectDocumentFixture, TestCase):
    def test_admin_upload_and_retained_versions_use_authenticated_identity(self):
        url = reverse("documents:project-document-list-create", args=[self.project.pk])
        response = self.client.post(url, {"title": "Floor plan", "document_type": "DRAWING", "file": pdf_upload(), "uploaded_by": self.other.pk, "project": self.other_project.pk, "version_number": 99}, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        document = ProjectDocument.objects.get(pk=response.data["id"])
        first = document.versions.get()
        self.assertEqual(document.uploaded_by, self.admin)
        self.assertEqual(document.project, self.project)
        self.assertEqual(first.version_number, 1)
        original = first.file.read()
        response = self.client.post(reverse("documents:project-document-new-version", args=[document.pk]), {"file": pdf_upload("revision.pdf"), "version_number": 99, "uploaded_by": self.other.pk}, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["version_number"], 2)
        self.assertEqual(response.data["uploaded_by_name"], self.admin.username)
        first.refresh_from_db()
        self.assertFalse(first.is_current)
        self.assertTrue(self.storage.exists(first.file.name))
        self.assertEqual(document.versions.filter(is_current=True).count(), 1)
        response = self.client.get(reverse("documents:project-document-version-download", args=[first.pk]))
        self.assertEqual(b"".join(response.streaming_content), original)
        self.assertEqual(ActivityLog.objects.filter(entity_id=document.pk).count(), 2)
        detail = self.client.get(reverse("documents:project-document-detail", args=[document.pk])).data
        self.assertEqual(detail["version_count"], 2)
        self.assertEqual(detail["current_version"]["version_number"], 2)
        self.assertNotIn(first.file.name, str(detail))
        self.assertNotIn("file", response.headers)

    def test_upload_validation_rejects_empty_disallowed_truncated_and_spoofed_files(self):
        url = reverse("documents:project-document-list-create", args=[self.project.pk])
        cases = [
            {"title": " "}, {"title": "x" * 201}, {"document_type": "PHOTO"},
            {"file": SimpleUploadedFile("empty.pdf", b"")},
            {"file": SimpleUploadedFile("active.svg", b"<svg><script/></svg>")},
            {"file": SimpleUploadedFile("truncated.pdf", b"%PDF-1.4\ntruncated")},
            {"file": SimpleUploadedFile("spoof.png", b"\x89PNG\r\n\x1a\ninvalid")},
            {"file": SimpleUploadedFile("huge.pdf", b"%PDF-1.4" + b"x" * MAX_DOCUMENT_SIZE + b"%%EOF")},
        ]
        for values in cases:
            response = self.client.post(url, {"title": "Plan", "document_type": "DRAWING", "file": pdf_upload(), **values}, format="multipart")
            self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(ProjectDocument.objects.exists())
        self.assertFalse(ActivityLog.objects.exists())

    def test_safe_images_are_verified_and_inline_headers_are_allowlisted(self):
        for fmt, extension, mime in [("JPEG", "jpg", "image/jpeg"), ("PNG", "png", "image/png"), ("WEBP", "webp", "image/webp")]:
            buffer = BytesIO()
            Image.new("RGB", (20, 10), "white").save(buffer, fmt)
            document, version = create_project_document(project_id=self.project.pk, user=self.admin, title=fmt, document_type="DESIGN", uploaded_file=SimpleUploadedFile(f"plan.{extension}", buffer.getvalue(), "text/html"))
            response = self.client.get(reverse("documents:project-document-version-download", args=[version.pk]), {"inline": "true"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Content-Type"], mime)
            self.assertTrue(response["Content-Disposition"].startswith("inline"))
            self.assertEqual(response["X-Content-Type-Options"], "nosniff")
            self.assertEqual(response["Cache-Control"], "private, no-store")
            self.assertTrue(b"".join(response.streaming_content))

    def test_supervisor_reads_assigned_documents_but_cannot_write(self):
        document, version = self.create()
        self.client.force_authenticate(self.supervisor)
        for url in [reverse("documents:project-document-list-create", args=[self.project.pk]), reverse("documents:project-document-detail", args=[document.pk]), reverse("documents:project-document-version-list-create", args=[document.pk]), reverse("documents:project-document-version-download", args=[version.pk])]:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            if response.streaming:
                list(response.streaming_content)
        self.assertEqual(self.client.post(reverse("documents:project-document-list-create", args=[self.project.pk]), {"title": "Denied", "document_type": "DRAWING", "file": pdf_upload()}, format="multipart").status_code, 403)
        for name in ["project-document-version-list-create", "project-document-new-version"]:
            self.assertEqual(self.client.post(reverse(f"documents:{name}", args=[document.pk]), {"file": pdf_upload()}, format="multipart").status_code, 403)
        with self.assertRaises(PermissionDenied):
            upload_project_document_version(document_id=document.pk, user=self.supervisor, uploaded_file=pdf_upload())
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(reverse("documents:project-document-list-create", args=[self.project.pk])).status_code, 403)
        for name, ref in [("project-document-detail", document.pk), ("project-document-version-list-create", document.pk), ("project-document-version-download", version.pk)]:
            self.assertEqual(self.client.get(reverse(f"documents:{name}", args=[ref])).status_code, 404)
        self.assertEqual(document.versions.count(), 1)

    def test_inactive_and_invalid_roles_are_denied(self):
        document, version = self.create()
        for user, field in [(self.admin, "is_staff"), (self.admin, "is_active"), (self.supervisor, "is_staff")]:
            original = getattr(user, field)
            setattr(user, field, not original)
            self.client.force_authenticate(user)
            for name, ref in [("project-document-detail", document.pk), ("project-document-version-list-create", document.pk), ("project-document-version-download", version.pk)]:
                self.assertEqual(self.client.get(reverse(f"documents:{name}", args=[ref])).status_code, 403)
            setattr(user, field, original)

    def test_filters_filename_search_pagination_and_upload_rules(self):
        document, version = self.create("foundation-plan.pdf", description="Ground floor")
        upload_project_document_version(document_id=document.pk, user=self.admin, uploaded_file=pdf_upload("latest.pdf"))
        create_project_document(project_id=self.project.pk, user=self.admin, title="Contract", document_type="CONTRACT", uploaded_file=pdf_upload("contract.pdf"))
        url = reverse("documents:project-document-list-create", args=[self.project.pk])
        response = self.client.get(url, {"page_size": 1, "sort": "title"})
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(response.data["results"][0]["title"], "Contract")
        self.assertEqual(response.data["upload_rules"]["max_file_size"], MAX_DOCUMENT_SIZE)
        self.assertIn(".webp", response.data["upload_rules"]["allowed_extensions"])
        for search in ["foundation-plan", "Ground floor", "DRAWING", "Site plan"]:
            response = self.client.get(url, {"search": search})
            self.assertEqual(response.data["count"], 1)
            self.assertEqual(response.data["results"][0]["current_version"]["version_number"], 2)
        self.assertEqual(self.client.get(url, {"document_type": "CONTRACT"}).data["count"], 1)
        self.assertEqual(self.client.get(url, {"sort": "invalid"}).status_code, 400)
        self.assertEqual(self.client.get(url, {"document_type": "invalid"}).status_code, 400)
        history = self.client.get(reverse("documents:project-document-version-list-create", args=[document.pk]), {"page_size": 1})
        self.assertEqual(history.data["count"], 2)
        self.assertEqual(history.data["results"][0]["version_number"], 2)

    def test_upload_and_audit_failures_preserve_current_version(self):
        document, first = self.create()
        for target, failure, expected in [("documents.services.save_version_file", OSError("storage failed"), DocumentStorageUnavailable), ("documents.services.create_activity_log", RuntimeError("audit failed"), RuntimeError)]:
            with patch(target, side_effect=failure):
                with self.assertRaises(expected):
                    upload_project_document_version(document_id=document.pk, user=self.admin, uploaded_file=pdf_upload())
            first.refresh_from_db()
            self.assertTrue(first.is_current)
            self.assertEqual(document.versions.count(), 1)
            self.assertTrue(self.storage.exists(first.file.name))
        with patch("documents.services.save_version_file", side_effect=OSError("storage failed")):
            response = self.client.post(reverse("documents:project-document-new-version", args=[document.pk]), {"file": pdf_upload()}, format="multipart")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("storage failed", str(response.data))

    def test_unsupported_legacy_content_downloads_as_attachment_and_pdf_previews_inline(self):
        document, first = self.create()
        response = self.client.get(reverse("documents:project-document-version-download", args=[first.pk]), {"inline": "true"})
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response["Content-Disposition"].startswith("inline"))
        list(response.streaming_content)
        legacy = ProjectDocumentVersion(document=document, version_number=2, original_filename="legacy.svg", file_size=25, uploaded_by=self.admin)
        legacy.file.save("legacy.svg", SimpleUploadedFile("legacy.svg", b"<svg><script/></svg>"), save=False)
        legacy.save()
        response = self.client.get(reverse("documents:project-document-version-download", args=[legacy.pk]), {"inline": "true"})
        self.assertEqual(response["Content-Type"], "application/octet-stream")
        self.assertTrue(response["Content-Disposition"].startswith("attachment"))
        list(response.streaming_content)
        self.assertEqual(self.client.patch(reverse("documents:project-document-detail", args=[document.pk]), {"title": "Changed"}).status_code, 405)
        self.assertEqual(self.client.delete(reverse("documents:project-document-detail", args=[document.pk])).status_code, 405)

    def test_project_library_does_not_load_all_previous_versions_or_query_per_card(self):
        for index in range(12):
            self.create(f"plan-{index}.pdf")
        with self.assertNumQueries(5):
            response = self.client.get(reverse("documents:project-document-list-create", args=[self.project.pk]), {"page_size": 100})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 12)

    def test_task_documents_keep_existing_assigned_supervisor_upload_permissions(self):
        task = Task.objects.create(project=self.project, created_by=self.supervisor, title="Task")
        document, first = create_task_document(task_id=task.pk, user=self.supervisor, title="Task plan", document_type="DRAWING", uploaded_file=pdf_upload())
        self.assertEqual(document.uploaded_by, self.supervisor)
        self.assertEqual(first.version_number, 1)


@skipUnless(connection.vendor == "postgresql", "Version locking requires PostgreSQL")
class ProjectDocumentConcurrencyTests(ProjectDocumentFixture, TransactionTestCase):
    def test_concurrent_uploads_keep_unique_numbers_and_one_current_version(self):
        document, first = self.create()
        barrier = Barrier(2)
        def upload():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return upload_project_document_version(document_id=document.pk, user=self.admin, uploaded_file=pdf_upload()).version_number
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(upload) for _ in range(2)]
            self.assertCountEqual([future.result(timeout=20) for future in futures], [2, 3])
        self.assertEqual(document.versions.count(), 3)
        self.assertEqual(document.versions.filter(is_current=True).get().version_number, 3)
        self.assertTrue(self.storage.exists(first.file.name))
