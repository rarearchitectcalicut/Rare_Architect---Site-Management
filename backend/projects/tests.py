from django.test import TestCase, TransactionTestCase
from django.db import connection, close_old_connections, connections
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from datetime import date
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import InMemoryStorage
from django.utils import timezone
from rest_framework.test import APIClient
from activity.models import ActivityLog
from documents.models import ProjectDocument, ProjectDocumentVersion, TaskDocument, TaskDocumentVersion
from documents.tests import pdf_upload
from reports.models import DailyReport, DailyTaskWork, DailyReportAttachment
from tasks.models import Task, TaskHistory
from .models import Project, ProjectCategory, ProjectSupervisor


class ProjectCancellationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(username="cancel_admin", first_name="Admin", phone="+919900001001", email="cancel-admin@example.com", role="ADMIN", is_staff=True)
        self.supervisor = User.objects.create_user(username="cancel_supervisor", first_name="Supervisor", phone="+919900001002", email="cancel-supervisor@example.com", role="SUPERVISOR")
        self.other = User.objects.create_user(username="cancel_other", first_name="Other", phone="+919900001003", email="cancel-other@example.com", role="SUPERVISOR")
        self.project = Project.objects.create(name="Retained project", category=ProjectCategory.objects.create(name="Cancellation tests"), created_by=self.admin)
        ProjectSupervisor.objects.create(project=self.project, supervisor=self.supervisor, assigned_by=self.admin)
        self.task = Task.objects.create(project=self.project, created_by=self.supervisor, title="Retained task", approval_status="APPROVED", completion_criteria="Finish work")
        self.history = TaskHistory.objects.create(task=self.task, actor=self.admin, action="APPROVED", details={"comment": "Retain this decision"})
        self.report = DailyReport.objects.create(project=self.project, reported_by=self.supervisor, report_date=date.today(), work_summary="Retained diary", status="SUBMITTED", submitted_at=timezone.now())
        self.entry = DailyTaskWork.objects.create(daily_report=self.report, task=self.task, work_description="Retained measurement", verification_status="VERIFIED", verified_by=self.admin, verified_at=timezone.now(), completion_claimed=True)
        self.draft = DailyReport.objects.create(project=self.project, reported_by=self.supervisor, report_date=date.today(), work_summary="Existing draft")
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = f"/api/v1/projects/{self.project.pk}/"

    def cancel(self, **values):
        return self.client.patch(self.url, {"status": "CANCELLED", "cancellation_reason": "Client ended the contract.", **values}, format="json")

    def test_cancel_retains_records_files_decisions_and_audits_reason(self):
        storage = InMemoryStorage()
        fields = [Project._meta.get_field("cover_image"), ProjectDocumentVersion._meta.get_field("file"), TaskDocumentVersion._meta.get_field("file"), DailyReportAttachment._meta.get_field("file")]
        for field in fields:
            replacement = patch.object(field, "storage", storage)
            replacement.start()
            self.addCleanup(replacement.stop)
        self.project.refresh_from_db()
        self.project.cover_image.save("cover.png", ContentFile(b"existing cover"))
        document = ProjectDocument.objects.create(project=self.project, title="Retained drawing", document_type="DRAWING", uploaded_by=self.admin)
        version = ProjectDocumentVersion.objects.create(document=document, uploaded_by=self.admin, version_number=1, original_filename="drawing.pdf", file_size=8, file=ContentFile(b"drawing", name="drawing.pdf"))
        task_document = TaskDocument.objects.create(task=self.task, title="Retained task file", uploaded_by=self.supervisor)
        task_version = TaskDocumentVersion.objects.create(document=task_document, uploaded_by=self.supervisor, version_number=1, original_filename="task.pdf", file_size=8, file=ContentFile(b"task file", name="task.pdf"))
        attachment = DailyReportAttachment.objects.create(daily_report=self.report, original_filename="evidence.pdf", file_size=8, uploaded_by=self.supervisor, file=ContentFile(b"evidence", name="evidence.pdf"))
        files = [self.project.cover_image.name, version.file.name, task_version.file.name, attachment.file.name]
        self.assertEqual(self.cancel().status_code, 200)
        self.project.refresh_from_db()
        self.task.refresh_from_db()
        self.entry.refresh_from_db()
        self.assertEqual(self.project.status, "CANCELLED")
        self.assertEqual(self.task.approval_status, "APPROVED")
        self.assertEqual(self.task.work_status, "NOT_STARTED")
        self.assertEqual(self.entry.verification_status, "VERIFIED")
        self.assertTrue(DailyReport.objects.filter(pk=self.report.pk, status="SUBMITTED").exists())
        self.assertTrue(TaskHistory.objects.filter(pk=self.history.pk, action="APPROVED").exists())
        self.assertTrue(ProjectDocumentVersion.objects.filter(pk=version.pk).exists())
        self.assertTrue(TaskDocumentVersion.objects.filter(pk=task_version.pk).exists())
        self.assertTrue(DailyReportAttachment.objects.filter(pk=attachment.pk).exists())
        self.assertTrue(all(storage.exists(name) for name in files))
        log = ActivityLog.objects.get(entity_id=self.project.pk, action="PROJECT_STATUS_CHANGED")
        self.assertEqual(log.actor, self.admin)
        self.assertEqual(log.metadata["old_status"], "ACTIVE")
        self.assertEqual(log.metadata["new_status"], "CANCELLED")
        self.assertEqual(log.metadata["reason"], "Client ended the contract.")
        self.assertIsNotNone(log.created_at)

    def test_permissions_reason_and_status_transitions(self):
        for user in (self.supervisor, self.other):
            self.client.force_authenticate(user)
            self.assertEqual(self.cancel().status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.cancel().status_code, 401)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(self.url, {"status": "CANCELLED"}, format="json").status_code, 400)
        self.assertEqual(self.cancel(cancellation_reason="   ").status_code, 400)
        self.assertEqual(self.cancel(cancellation_reason="x" * 1001).status_code, 400)
        self.project.status = "COMPLETED"
        self.project.save(update_fields=["status"])
        self.assertEqual(self.cancel().status_code, 400)
        self.assertFalse(ActivityLog.objects.filter(entity_id=self.project.pk, action="PROJECT_STATUS_CHANGED").exists())

    def test_inactive_admin_cannot_cancel(self):
        self.admin.is_active = False
        self.admin.save(update_fields=["is_active"])
        self.assertEqual(self.cancel().status_code, 403)

    def test_duplicate_cancel_and_reactivation_rejected_but_metadata_edit_allowed(self):
        self.assertEqual(self.cancel().status_code, 200)
        self.assertEqual(self.cancel().status_code, 400)
        self.assertEqual(self.client.patch(self.url, {"status": "ACTIVE"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(self.url, {"location": "Corrected historical address"}, format="json").status_code, 200)
        self.assertEqual(ActivityLog.objects.filter(entity_id=self.project.pk, action="PROJECT_STATUS_CHANGED").count(), 1)

    def test_audit_failure_rolls_back_cancellation(self):
        with patch("projects.views.create_activity_log", side_effect=RuntimeError("Audit unavailable")):
            with self.assertRaises(RuntimeError):
                self.cancel()
        self.project.refresh_from_db()
        self.assertEqual(self.project.status, "ACTIVE")

    def test_cancelled_projects_remain_readable_and_filterable_and_delete_is_rejected(self):
        self.assertEqual(self.cancel().status_code, 200)
        for user in (self.admin, self.supervisor):
            self.client.force_authenticate(user)
            detail = self.client.get(self.url)
            self.assertEqual(detail.status_code, 200)
            self.assertEqual(detail.data["cancellation"]["reason"], "Client ended the contract.")
            for suffix in ("overview/", "tasks/", "daily-reports/", "documents/"):
                self.assertEqual(self.client.get(self.url + suffix).status_code, 200, suffix)
            listing = self.client.get("/api/v1/projects/?status=CANCELLED")
            self.assertEqual(listing.status_code, 200)
            self.assertEqual(listing.data["count"], 1)
            self.assertIn(self.client.delete(self.url).status_code, (403, 405))
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertTrue(Project.objects.filter(pk=self.project.pk).exists())

    def test_operational_writes_are_blocked_after_cancellation(self):
        self.assertEqual(self.cancel().status_code, 200)
        self.client.force_authenticate(self.supervisor)
        attempts = [
            (self.url + "tasks/", {"title": "New task"}),
            (self.url + "daily-reports/", {"report_date": date.today().isoformat()}),
            (f"/api/v1/daily-reports/{self.draft.pk}/submit/", {}),
            (f"/api/v1/tasks/{self.task.pk}/start/", {}),
            (f"/api/v1/tasks/{self.task.pk}/change-requests/", {"new_values": {"title": "Changed"}, "reason": "Change"}),
            (self.url + "timeline/reorder/", {"task_ids": [str(self.task.pk)], "reason": "Reorder"}),
            (f"/api/v1/tasks/{self.task.pk}/delay-reports/", {"reason": "Delayed", "delay_type": "OTHER"}),
        ]
        for url, data in attempts:
            response = self.client.post(url, data, format="json")
            self.assertEqual(response.status_code, 400, (url, response.data))
            self.assertIn("project", response.data, (url, response.data))
        response = self.client.patch(f"/api/v1/daily-reports/{self.draft.pk}/", {"work_summary": "Changed"}, format="json")
        self.assertEqual(response.status_code, 400)
        for url in (f"/api/v1/tasks/{self.task.pk}/documents/", f"/api/v1/daily-reports/{self.draft.pk}/attachments/"):
            self.assertEqual(self.client.post(url, {"title": "Blocked upload", "file": pdf_upload()}, format="multipart").status_code, 400)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(self.url + "documents/", {"title": "Blocked upload", "document_type": "DRAWING", "file": pdf_upload()}, format="multipart").status_code, 400)
        self.assertEqual(Task.objects.filter(project=self.project).count(), 1)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, "DRAFT")
        self.assertEqual(self.draft.work_summary, "Existing draft")

    def test_all_eligible_current_statuses_can_cancel(self):
        for value in ("ON_HOLD", "MAINTENANCE"):
            project = Project.objects.create(name=value, category=self.project.category, created_by=self.admin, status=value)
            self.assertEqual(self.client.patch(f"/api/v1/projects/{project.pk}/", {"status": "CANCELLED", "cancellation_reason": "Site closed"}, format="json").status_code, 200)


@skipUnless(connection.vendor == "postgresql", "Requires PostgreSQL row locks")
class ConcurrentProjectCancellationTests(TransactionTestCase):
    setUp = ProjectCancellationTests.setUp

    def test_concurrent_cancellation_creates_one_transition_and_one_audit_record(self):
        barrier = Barrier(2)

        def cancel():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.admin)
                barrier.wait(timeout=10)
                return client.patch(self.url, {"status": "CANCELLED", "cancellation_reason": "Contract ended"}, format="json").status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            first, second = pool.submit(cancel), pool.submit(cancel)
            results = sorted([first.result(timeout=20), second.result(timeout=20)])
        self.assertEqual(results, [200, 400])
        self.assertEqual(ActivityLog.objects.filter(entity_id=self.project.pk, action="PROJECT_STATUS_CHANGED").count(), 1)
        self.assertTrue(Task.objects.filter(pk=self.task.pk).exists())
