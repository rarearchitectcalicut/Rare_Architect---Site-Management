"""Business activity integration tests using Django's existing test runner."""

import json
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.test import TestCase
from django.urls import reverse
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.test import APIClient

from activity.models import ActivityLog
from documents import services as documents
from documents.models import (
    ProjectDocument, ProjectDocumentVersion, TaskDocument, TaskDocumentVersion,
)
from notifications.models import Notification
from notifications.services import mark_all_notifications_read, mark_notification_read
from projects.models import Project, ProjectCategory, ProjectSupervisor
from reports import services as reports
from reports.models import DailyReport, DailyReportAttachment, DailyTaskWork
from reports.progress import calculate_task_progress
from tasks import services as tasks
from tasks.models import Task, TaskBatch, TaskChangeRequest, TaskHistory


class ActivityIntegrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(
            phone="+919111111111", password="Initial!safe879",
            username="admin", email="admin@example.com", first_name="Admin",
            role="ADMIN", is_staff=True,
        )
        cls.supervisor = User.objects.create_user(
            phone="+919222222222", password="Initial!safe879",
            username="supervisor", email="supervisor@example.com", first_name="Supervisor",
            role="SUPERVISOR",
        )
        cls.other = User.objects.create_user(
            phone="+919333333333", password="Initial!safe879",
            username="other", email="other@example.com", first_name="Other",
            role="SUPERVISOR",
        )
        cls.category = ProjectCategory.objects.create(name="Residential")
        cls.project = Project.objects.create(
            name="Test project", category=cls.category, created_by=cls.admin,
        )
        ProjectSupervisor.objects.create(
            project=cls.project, supervisor=cls.supervisor, assigned_by=cls.admin,
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.storage_root = Path(temporary.name)
        for model in (ProjectDocumentVersion, TaskDocumentVersion, DailyReportAttachment):
            storage_patch = patch.object(
                model._meta.get_field("file"), "storage",
                FileSystemStorage(location=temporary.name),
            )
            storage_patch.start()
            self.addCleanup(storage_patch.stop)

    def event(self, action, operation, *, actor=None, entity_id=None):
        """Require exactly one new central event for one operation."""
        previous_ids = set(ActivityLog.objects.values_list("id", flat=True))
        result = operation()
        logs = list(ActivityLog.objects.exclude(id__in=previous_ids))
        self.assertEqual(len(logs), 1, [log.action for log in logs])
        log = logs[0]
        self.assertEqual(log.action, action)
        self.assertEqual(log.actor_id, (actor or self.supervisor).id)
        if entity_id is not None:
            self.assertEqual(log.entity_id, entity_id)
        json.dumps(log.metadata)
        return result, log

    def no_event(self, operation):
        count = ActivityLog.objects.count()
        result = operation()
        self.assertEqual(ActivityLog.objects.count(), count)
        return result

    def task(self, **overrides):
        return Task.objects.create(
            project=self.project, created_by=self.supervisor,
            **{"title": "Task", "approval_status": "APPROVED", **overrides},
        )

    def draft(self):
        return DailyReport.objects.create(
            project=self.project, reported_by=self.supervisor,
            report_date=date.today(), work_summary="Site work performed.",
        )

    def work(self, report, task, **overrides):
        return DailyTaskWork.objects.create(
            daily_report=report, task=task,
            **{"work_description": "Installed", "completion_claimed": True, **overrides},
        )

    def pdf(self):
        return SimpleUploadedFile("evidence.pdf", b"%PDF-1.4\nTest file", "application/pdf")

    def test_successful_logins_record_each_users_identity_and_time(self):
        client = APIClient()
        for user in (self.admin, self.supervisor):
            response, log = self.event(
                "USER_LOGGED_IN",
                lambda: client.post(reverse("users:login"), {
                    "phone": user.phone, "password": "Initial!safe879",
                }), actor=user, entity_id=user.id,
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(log.metadata["actor_name"], user.get_full_name())
            self.assertEqual(log.metadata["actor_role"], user.role)
            self.assertIsNotNone(log.created_at)
            recorded = log.description + json.dumps(log.metadata)
            for secret in ("Initial!safe879", response.data["access"], response.data["refresh"]):
                self.assertNotIn(secret, recorded)
            client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.data["access"]}')
            self.assertEqual(self.no_event(lambda: client.get(reverse("users:current-user"))).status_code, 200)
            self.assertEqual(self.no_event(lambda: client.post(reverse("users:token-refresh"), {
                "refresh": response.data["refresh"],
            })).status_code, 200)
            client.credentials()

    def test_failed_or_inactive_logins_create_no_success_activity(self):
        client = APIClient()
        response = self.no_event(lambda: client.post(reverse("users:login"), {
            "phone": self.supervisor.phone, "password": "incorrect",
        }))
        self.assertEqual(response.status_code, 400)
        self.supervisor.is_active = False
        self.supervisor.save(update_fields=["is_active"])
        response = self.no_event(lambda: client.post(reverse("users:login"), {
            "phone": self.supervisor.phone, "password": "Initial!safe879",
        }))
        self.assertEqual(response.status_code, 400)

    def test_login_token_record_rolls_back_if_activity_logging_fails(self):
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

        count = OutstandingToken.objects.count()
        with patch("users.serializers.create_activity_log", side_effect=RuntimeError("audit failed")):
            with self.assertRaises(RuntimeError):
                APIClient().post(reverse("users:login"), {
                    "phone": self.supervisor.phone, "password": "Initial!safe879",
                })
        self.assertEqual(OutstandingToken.objects.count(), count)
        self.assertFalse(ActivityLog.objects.exists())

    def test_user_creation_actor_and_validation(self):
        payload = dict(
            username="new", email="new@example.com", phone="+919444444444",
            first_name="New", last_name="Supervisor",
        )
        response, log = self.event(
            "USER_CREATED",
            lambda: self.client.post(reverse("users:supervisor-create"), payload),
            actor=self.admin,
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(str(log.entity_id), response.data["id"])
        response = self.no_event(
            lambda: self.client.post(reverse("users:supervisor-create"), payload)
        )
        self.assertEqual(response.status_code, 400)

    def test_user_updates_activation_and_noops(self):
        url = reverse("users:supervisor-detail", args=[self.supervisor.id])
        for action, payload in [
            ("USER_UPDATED", {"first_name": "Updated"}),
            ("USER_DEACTIVATED", {"is_active": False}),
            ("USER_ACTIVATED", {"is_active": True}),
        ]:
            response, _ = self.event(
                action, lambda: self.client.patch(url, payload), actor=self.admin,
                entity_id=self.supervisor.id,
            )
            self.assertEqual(response.status_code, 200)
            self.no_event(lambda: self.client.patch(url, payload))
        self.no_event(lambda: self.client.patch(url, {}))

    def test_password_events_never_capture_credentials(self):
        password = "Changed!safe34591"
        response, log = self.event(
            "USER_PASSWORD_RESET",
            lambda: self.client.post(
                reverse("users:supervisor-reset-password", args=[self.supervisor.id]),
                {"new_password": password, "confirm_password": password},
            ), actor=self.admin,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(log.metadata, {
            "user_id": str(self.supervisor.id), "actor_name": "Admin", "actor_role": "ADMIN",
            "subject_name": "Supervisor", "subject_role": "SUPERVISOR",
        })
        self.supervisor.refresh_from_db()
        self.client.force_authenticate(self.supervisor)
        response, log = self.event(
            "USER_PASSWORD_CHANGED",
            lambda: self.client.post(reverse("users:change-password"), {
                "current_password": password,
                "new_password": "Another!safe8991",
                "confirm_password": "Another!safe8991",
            }),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(log.metadata, {
            "user_id": str(self.supervisor.id), "actor_name": "Supervisor", "actor_role": "SUPERVISOR",
            "subject_name": "Supervisor", "subject_role": "SUPERVISOR",
        })
        self.assertNotIn(password, log.description + json.dumps(log.metadata))

    def test_user_write_rolls_back_when_logging_fails(self):
        with patch("users.serializers.create_activity_log", side_effect=RuntimeError("audit failed")):
            with self.assertRaises(RuntimeError):
                self.client.patch(
                    reverse("users:supervisor-detail", args=[self.supervisor.id]),
                    {"first_name": "Should roll back"},
                )
        self.supervisor.refresh_from_db()
        self.assertEqual(self.supervisor.first_name, "Supervisor")
        self.assertFalse(ActivityLog.objects.exists())

    def test_category_create_update_delete_and_noops(self):
        response, _ = self.event(
            "CATEGORY_CREATED",
            lambda: self.client.post(reverse("projects:category-list-create"), {"name": "Art"}),
            actor=self.admin,
        )
        self.assertEqual(response.status_code, 201)
        category_id = response.data["id"]
        url = reverse("projects:category-detail", args=[category_id])
        self.event("CATEGORY_UPDATED", lambda: self.client.patch(url, {"name": "Commercial"}), actor=self.admin)
        self.no_event(lambda: self.client.patch(url, {"name": "Commercial", "image": None}, format="json"))
        response, log = self.event("CATEGORY_DELETED", lambda: self.client.delete(url), actor=self.admin)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(str(log.entity_id), category_id)
        response = self.no_event(lambda: self.client.delete(reverse("projects:category-detail", args=[self.category.id])))
        self.assertEqual(response.status_code, 400)

    def test_project_creation_details_status_and_noops(self):
        response, _ = self.event(
            "PROJECT_CREATED",
            lambda: self.client.post(reverse("projects:project-list-create"), {
                "name": "New project", "category": str(self.category.id),
            }), actor=self.admin,
        )
        self.assertEqual(response.status_code, 201)
        url = reverse("projects:project-detail", args=[response.data["id"]])
        self.event("PROJECT_UPDATED", lambda: self.client.patch(url, {"name": "Renamed"}), actor=self.admin)
        _, log = self.event("PROJECT_STATUS_CHANGED", lambda: self.client.patch(url, {"status": "ON_HOLD"}), actor=self.admin)
        self.assertEqual(log.metadata["old_status"], "ACTIVE")
        self.assertEqual(log.metadata["new_status"], "ON_HOLD")
        self.no_event(lambda: self.client.patch(url, {"name": "Renamed", "status": "ON_HOLD", "cover_image": None}, format="json"))

    def test_mixed_project_update_has_two_distinct_events(self):
        response = self.client.patch(reverse("projects:project-detail", args=[self.project.id]), {
            "name": "Renamed", "status": "ON_HOLD",
        })
        self.assertEqual(response.status_code, 200)
        self.assertCountEqual(ActivityLog.objects.values_list("action", flat=True), ["PROJECT_UPDATED", "PROJECT_STATUS_CHANGED"])
        self.assertEqual(ActivityLog.objects.get(action="PROJECT_UPDATED").metadata["changed_fields"], ["name"])

    def test_assignment_unassignment_and_duplicate_validation(self):
        url = reverse("projects:project-assign-supervisors", args=[self.project.id])
        payload = {"supervisor_ids": [str(self.other.id)]}
        response, log = self.event("SUPERVISOR_ASSIGNED", lambda: self.client.post(url, payload, format="json"), actor=self.admin)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(log.metadata["supervisor_id"], str(self.other.id))
        response = self.no_event(lambda: self.client.post(url, payload, format="json"))
        self.assertEqual(response.status_code, 400)
        response, log = self.event(
            "SUPERVISOR_UNASSIGNED",
            lambda: self.client.delete(reverse("projects:project-remove-supervisor", args=[self.project.id, self.other.id])),
            actor=self.admin,
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(log.metadata["assignment_id"])

    def test_project_write_rolls_back_when_logging_fails(self):
        with patch("projects.views.create_activity_log", side_effect=RuntimeError("audit failed")):
            with self.assertRaises(RuntimeError):
                self.client.patch(reverse("projects:project-detail", args=[self.project.id]), {"name": "Should roll back"})
        self.project.refresh_from_db()
        self.assertEqual(self.project.name, "Test project")
        self.assertFalse(ActivityLog.objects.exists())

    def test_task_create_and_batch_keep_history_and_notifications(self):
        with self.captureOnCommitCallbacks(execute=True):
            task, _ = self.event("TASK_CREATED", lambda: tasks.create_task(
                project=self.project, user=self.supervisor, validated_data={"title": "Single"},
            ))
        self.assertEqual(task.history.count(), 1)
        self.assertEqual(Notification.objects.filter(reference_id=task.id).count(), 1)
        with self.captureOnCommitCallbacks(execute=True):
            (batch, created), log = self.event("TASK_BATCH_CREATED", lambda: tasks.create_bulk_tasks(
                project=self.project, user=self.supervisor,
                tasks_data=[{"title": "One"}, {"title": "Two"}],
            ))
        self.assertEqual(log.metadata, {
            "batch_id": str(batch.id), "project_id": str(self.project.id), "task_count": 2,
            "actor_name": "Supervisor", "actor_role": "SUPERVISOR", "project_name": "Test project",
        })
        self.assertEqual(TaskHistory.objects.filter(task__in=created).count(), 2)
        self.assertEqual(Notification.objects.filter(reference_id=batch.id).count(), 1)
        self.assertEqual(ActivityLog.objects.filter(action="TASK_CREATED").count(), 1)

    def test_task_approve_complete_cancel_reject_resubmit(self):
        task = self.task(approval_status="PENDING")
        self.event("TASK_APPROVED", lambda: tasks.approve_task(task_id=task.id, admin_user=self.admin, comment="Proceed"), actor=self.admin)
        self.event("TASK_COMPLETED", lambda: tasks.complete_task(task_id=task.id, user=self.supervisor))
        task = self.task()
        self.event("TASK_CANCELLED", lambda: tasks.cancel_task(task_id=task.id, user=self.admin, reason="Cancelled"), actor=self.admin)
        task = self.task(approval_status="PENDING")
        self.event("TASK_REJECTED", lambda: tasks.reject_task(task_id=task.id, admin_user=self.admin, reason="Revise"), actor=self.admin)
        self.event("TASK_RESUBMITTED", lambda: tasks.resubmit_task(task_id=task.id, supervisor=self.supervisor, validated_data={"title": "Revised", "resubmission_note": "Corrected title"}))
        self.assertEqual(task.history.count(), 2)

    def test_task_edit_reviews_and_deadline_restriction(self):
        task = self.task()
        request, _ = self.event("TASK_EDIT_REQUESTED", lambda: tasks.create_task_change_request(task_id=task.id, supervisor=self.supervisor, new_values={"title": "Revised"}, reason="Correct title"))
        self.event("TASK_EDIT_APPROVED", lambda: tasks.approve_task_change_request(change_request_id=request.id, admin_user=self.admin), actor=self.admin)
        task.refresh_from_db()
        self.assertEqual(task.title, "Revised")
        request, _ = self.event("TASK_EDIT_REQUESTED", lambda: tasks.create_task_change_request(task_id=task.id, supervisor=self.supervisor, new_values={"title": "Another"}, reason="Change title"))
        self.event("TASK_EDIT_REJECTED", lambda: tasks.reject_task_change_request(change_request_id=request.id, admin_user=self.admin, admin_comment="Keep existing"), actor=self.admin)
        count = ActivityLog.objects.count()
        with self.assertRaises(ValidationError):
            tasks.create_task_change_request(task_id=task.id, supervisor=self.supervisor, new_values={"end_date": "2027-01-01"}, reason="Deadline")
        self.assertEqual(ActivityLog.objects.count(), count)

    def test_timeline_reviews_preserve_ordering(self):
        first = self.task(display_order=1)
        second = self.task(display_order=2)
        request, _ = self.event("TIMELINE_REORDER_REQUESTED", lambda: tasks.create_timeline_reorder_request(project=self.project, supervisor=self.supervisor, task_ids=[second.id, first.id], reason="Sequence"))
        self.event("TIMELINE_REORDER_APPROVED", lambda: tasks.approve_timeline_reorder_request(request_id=request.id, admin_user=self.admin), actor=self.admin)
        self.assertEqual([task.id for task in tasks.get_timeline_tasks(self.project)], [second.id, first.id])
        request, _ = self.event("TIMELINE_REORDER_REQUESTED", lambda: tasks.create_timeline_reorder_request(project=self.project, supervisor=self.supervisor, task_ids=[first.id, second.id], reason="Sequence"))
        self.event("TIMELINE_REORDER_REJECTED", lambda: tasks.reject_timeline_reorder_request(request_id=request.id, admin_user=self.admin, admin_comment="Keep order"), actor=self.admin)

    def test_task_failure_and_outer_rollback_leave_no_audit_or_notifications(self):
        with self.assertRaises(PermissionDenied):
            tasks.create_task(project=self.project, user=self.other, validated_data={"title": "Denied"})
        self.assertFalse(ActivityLog.objects.exists())
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            with self.assertRaises(RuntimeError):
                with transaction.atomic():
                    tasks.create_bulk_tasks(project=self.project, user=self.supervisor, tasks_data=[{"title": "Rollback"}])
                    raise RuntimeError("rollback")
        self.assertEqual(callbacks, [])
        for model in (Task, TaskBatch, TaskHistory, ActivityLog, Notification):
            self.assertFalse(model.objects.exists(), model.__name__)

    def test_task_logging_failure_rolls_back_history(self):
        with patch("tasks.services.create_activity_log", side_effect=RuntimeError("audit failed")):
            with self.assertRaises(RuntimeError):
                tasks.create_task(project=self.project, user=self.supervisor, validated_data={"title": "Rollback"})
        self.assertFalse(Task.objects.exists())
        self.assertFalse(TaskHistory.objects.exists())

    def test_report_draft_update_noop_and_submit(self):
        report, _ = self.event("DAILY_REPORT_CREATED", lambda: reports.create_daily_report(project=self.project, supervisor=self.supervisor, validated_data={"report_date": date.today()}))
        self.event("DAILY_REPORT_UPDATED", lambda: reports.update_daily_report(report_id=report.id, supervisor=self.supervisor, data={"work_summary": "Work performed"}))
        self.no_event(lambda: reports.update_daily_report(report_id=report.id, supervisor=self.supervisor, data={"work_summary": "Work performed"}))
        self.event("DAILY_REPORT_SUBMITTED", lambda: reports.submit_daily_report(report_id=report.id, supervisor=self.supervisor))

    def test_report_entries_create_edit_delete_and_noops(self):
        report = self.draft()
        task = self.task()
        for prefix, add, update, delete, data, change in [
            ("DAILY_TASK_WORK", reports.add_daily_task_work, reports.update_daily_task_work, reports.delete_daily_task_work, {"task": task, "work_description": "Installed", "completion_claimed": True}, {"location_detail": "Roof"}),
            ("DAILY_MANPOWER", reports.add_daily_manpower, reports.update_daily_manpower, reports.delete_daily_manpower, {"trade": "MASON", "worker_count": 2}, {"worker_count": 3}),
            ("DAILY_MATERIAL", reports.add_daily_material, reports.update_daily_material, reports.delete_daily_material, {"material_name": "Cement", "entry_type": "RECEIVED", "quantity": "3.000", "unit": "bags"}, {"quantity": "4.000"}),
        ]:
            with self.subTest(prefix=prefix):
                key = "validated_data" if prefix == "DAILY_TASK_WORK" else "data"
                entry, _ = self.event(prefix + "_ADDED", lambda: add(report_id=report.id, supervisor=self.supervisor, **{key: data}))
                self.event(prefix + "_UPDATED", lambda: update(entry_id=entry.id, supervisor=self.supervisor, data=change))
                self.no_event(lambda: update(entry_id=entry.id, supervisor=self.supervisor, data=change))
                self.no_event(lambda: update(entry_id=entry.id, supervisor=self.supervisor, data={}))
                entry_id = entry.id
                self.event(prefix + "_DELETED", lambda: delete(entry_id=entry_id, supervisor=self.supervisor), entity_id=entry_id)

    def test_work_verification_quantity_limits_and_baseline_protection(self):
        report = self.draft()
        task = self.task(measurement_method="QUANTITY", planned_quantity=Decimal("10.000"), measurement_unit="SQM")
        entry = self.work(report, task, quantity_completed_today=Decimal("6.000"), completion_claimed=False)
        reports.submit_daily_report(report_id=report.id, supervisor=self.supervisor)
        self.event("DAILY_TASK_WORK_VERIFIED", lambda: reports.verify_daily_task_work(entry_id=entry.id, admin_user=self.admin), actor=self.admin)
        self.assertEqual(calculate_task_progress(task)["progress_percentage"], "60.00")
        other_report = self.draft()
        excess = self.work(other_report, task, quantity_completed_today=Decimal("5.000"), completion_claimed=False)
        reports.submit_daily_report(report_id=other_report.id, supervisor=self.supervisor)
        count = ActivityLog.objects.count()
        with self.assertRaises(ValidationError):
            reports.verify_daily_task_work(entry_id=excess.id, admin_user=self.admin)
        request = tasks.create_task_change_request(task_id=task.id, supervisor=self.supervisor, new_values={"planned_quantity": "20.000"}, reason="Change baseline")
        count += 1
        with self.assertRaises(ValidationError):
            tasks.approve_task_change_request(change_request_id=request.id, admin_user=self.admin)
        self.assertEqual(ActivityLog.objects.count(), count)
        task.refresh_from_db()
        self.assertEqual(task.planned_quantity, Decimal("10.000"))

    def test_completion_only_duplicate_claim_not_logged(self):
        task = self.task()
        for index in range(2):
            report = self.draft()
            entry = self.work(report, task)
            reports.submit_daily_report(report_id=report.id, supervisor=self.supervisor)
            if index == 0:
                reports.verify_daily_task_work(entry_id=entry.id, admin_user=self.admin)
            else:
                count = ActivityLog.objects.count()
                with self.assertRaises(ValidationError):
                    reports.verify_daily_task_work(entry_id=entry.id, admin_user=self.admin)
                self.assertEqual(ActivityLog.objects.count(), count)

    def test_rejected_work_correction_records_both_ids(self):
        report = self.draft()
        entry = self.work(report, self.task())
        reports.submit_daily_report(report_id=report.id, supervisor=self.supervisor)
        self.event("DAILY_TASK_WORK_REJECTED", lambda: reports.reject_daily_task_work(entry_id=entry.id, admin_user=self.admin, verification_note="Redo evidence"), actor=self.admin)
        correction, log = self.event("DAILY_TASK_WORK_CORRECTED", lambda: reports.correct_rejected_daily_task_work(rejected_entry_id=entry.id, new_report_id=self.draft().id, supervisor=self.supervisor, corrected_data={"work_description": "Corrected", "completion_claimed": True}))
        self.assertEqual(log.metadata["original_entry_id"], str(entry.id))
        self.assertEqual(log.metadata["correction_entry_id"], str(correction.id))
        entry.refresh_from_db()
        self.assertEqual(entry.verification_status, "REJECTED")

    def test_delay_review_and_extension_are_separate(self):
        task = self.task(end_date=date.today())
        report, _ = self.event("DELAY_REPORT_SUBMITTED", lambda: reports.create_delay_report(task_id=task.id, supervisor=self.supervisor, data={"delay_type": "WEATHER", "reason": "Rain", "extension_requested": True, "requested_end_date": (date.today() + timedelta(days=3)).isoformat()}))
        self.event("DELAY_REPORT_APPROVED", lambda: reports.approve_delay_report(report_id=report.id, admin_user=self.admin), actor=self.admin)
        task.refresh_from_db()
        self.assertEqual(task.end_date, date.today())
        _, log = self.event("EXTENSION_APPROVED", lambda: reports.approve_delay_extension(report_id=report.id, admin_user=self.admin), actor=self.admin)
        self.assertEqual(log.metadata["old_end_date"], date.today().isoformat())
        self.assertEqual(log.metadata["new_end_date"], (date.today() + timedelta(days=3)).isoformat())
        self.assertEqual(task.history.count(), 1)

    def test_delay_and_extension_rejection_do_not_change_deadline(self):
        task = self.task(end_date=date.today())
        report = reports.create_delay_report(task_id=task.id, supervisor=self.supervisor, data={"delay_type": "WEATHER", "reason": "Rain", "extension_requested": True, "requested_end_date": (date.today() + timedelta(days=3)).isoformat()})
        self.event("DELAY_REPORT_REJECTED", lambda: reports.reject_delay_report(report_id=report.id, admin_user=self.admin, admin_comment="Declined"), actor=self.admin)
        self.event("EXTENSION_REJECTED", lambda: reports.reject_delay_extension(report_id=report.id, admin_user=self.admin, admin_comment="Declined"), actor=self.admin)
        task.refresh_from_db()
        self.assertEqual(task.end_date, date.today())

    def test_report_write_rolls_back_when_logging_fails(self):
        report = self.draft()
        with patch("reports.services.create_activity_log", side_effect=RuntimeError("audit failed")):
            with self.assertRaises(RuntimeError):
                reports.update_daily_report(report_id=report.id, supervisor=self.supervisor, data={"work_summary": "Should roll back"})
        report.refresh_from_db()
        self.assertEqual(report.work_summary, "Site work performed.")
        self.assertFalse(ActivityLog.objects.exists())

    def test_attachment_upload_delete_and_cleanup_after_logging_failure(self):
        report = self.draft()
        attachment, log = self.event("DAILY_ATTACHMENT_UPLOADED", lambda: reports.upload_daily_report_attachment(report_id=report.id, supervisor=self.supervisor, data={"file": self.pdf()}))
        self.assertNotIn("file", log.metadata)
        attachment_id = attachment.id
        stored_name = attachment.file.name
        with self.captureOnCommitCallbacks(execute=True):
            self.event("DAILY_ATTACHMENT_DELETED", lambda: reports.delete_daily_report_attachment(attachment_id=attachment_id, supervisor=self.supervisor), entity_id=attachment_id)
        self.assertFalse(attachment.file.storage.exists(stored_name))
        with patch("reports.services.create_activity_log", side_effect=RuntimeError("audit failed")):
            with self.assertRaises(RuntimeError):
                reports.upload_daily_report_attachment(report_id=report.id, supervisor=self.supervisor, data={"file": self.pdf()})
        self.assertFalse(DailyReportAttachment.objects.exists())
        self.assertFalse(any(path.is_file() for path in self.storage_root.rglob("*")))

    def test_document_uploads_versions_metadata_and_private_access(self):
        task = self.task()
        for entity, create, upload, args in [
            ("PROJECT_DOCUMENT", documents.create_project_document, documents.upload_project_document_version, {"project_id": self.project.id}),
            ("TASK_DOCUMENT", documents.create_task_document, documents.upload_task_document_version, {"task_id": task.id}),
        ]:
            with self.subTest(entity=entity):
                (document, first), log = self.event(entity + "_UPLOADED", lambda: create(user=self.supervisor, title="Plan", document_type="DRAWING", uploaded_file=self.pdf(), **args))
                self.assertEqual(log.metadata["version_number"], 1)
                self.assertEqual(log.metadata["version_id"], str(first.id))
                second, log = self.event(entity + "_VERSION_UPLOADED", lambda: upload(document_id=document.id, user=self.supervisor, uploaded_file=self.pdf()))
                first.refresh_from_db()
                self.assertFalse(first.is_current)
                self.assertTrue(second.is_current)
                self.assertEqual(second.version_number, 2)
                self.assertEqual(document.versions.count(), 2)
                self.assertNotIn(first.file.name, json.dumps(log.metadata))
                self.assertNotIn("original_filename", log.metadata)
                prefix = "project" if entity == "PROJECT_DOCUMENT" else "task"
                url = reverse(f"documents:{prefix}-document-version-download", args=[first.id])
                self.client.force_authenticate(self.other)
                response = self.no_event(lambda: self.client.get(url))
                self.assertEqual(response.status_code, 404)
                self.client.force_authenticate(self.supervisor)
                response = self.no_event(lambda: self.client.get(url))
                self.assertEqual(response.status_code, 200)
                self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF-"))

    def test_document_logging_failure_cleans_file_and_restores_current_version(self):
        for model, create, upload, args in [
            (ProjectDocument, documents.create_project_document, documents.upload_project_document_version, {"project_id": self.project.id}),
            (TaskDocument, documents.create_task_document, documents.upload_task_document_version, {"task_id": self.task().id}),
        ]:
            with patch("documents.services.create_activity_log", side_effect=RuntimeError("audit failed")):
                with self.assertRaises(RuntimeError):
                    create(user=self.supervisor, title="Rollback", document_type="DRAWING", uploaded_file=self.pdf(), **args)
            self.assertFalse(model.objects.exists())
            document, first = create(user=self.supervisor, title="Keep", document_type="DRAWING", uploaded_file=self.pdf(), **args)
            previous_files = {path for path in self.storage_root.rglob("*") if path.is_file()}
            count = ActivityLog.objects.count()
            with patch("documents.services.create_activity_log", side_effect=RuntimeError("audit failed")):
                with self.assertRaises(RuntimeError):
                    upload(document_id=document.id, user=self.supervisor, uploaded_file=self.pdf())
            first.refresh_from_db()
            self.assertTrue(first.is_current)
            self.assertEqual(document.versions.count(), 1)
            self.assertEqual(ActivityLog.objects.count(), count)
            self.assertEqual({path for path in self.storage_root.rglob("*") if path.is_file()}, previous_files)

    def test_activity_api_admin_filters_pagination_readonly_and_supervisor_denial(self):
        task = tasks.create_task(project=self.project, user=self.supervisor, validated_data={"title": "Task"})
        tasks.approve_task(task_id=task.id, admin_user=self.admin)
        url = reverse("activity:activity-list")
        response = self.no_event(lambda: self.client.get(url, {"action": "TASK_CREATED", "entity_type": "TASK", "entity_id": str(task.id), "actor": str(self.supervisor.id)}))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        log_id = response.data["results"][0]["id"]
        page = self.no_event(lambda: self.client.get(url, {"page_size": 1}))
        self.assertEqual(page.data["count"], 2)
        self.assertIsNotNone(page.data["next"])
        self.assertEqual(len(page.data["results"]), 1)
        detail = reverse("activity:activity-detail", args=[log_id])
        for method, target in [(self.client.post, url), (self.client.patch, detail), (self.client.delete, detail)]:
            self.assertEqual(self.no_event(lambda: method(target)).status_code, 405)
        self.client.force_authenticate(self.supervisor)
        for target in (url, detail):
            self.assertEqual(self.no_event(lambda: self.client.get(target)).status_code, 403)
        self.assertEqual(self.no_event(lambda: self.client.patch(reverse("projects:project-detail", args=[self.project.id]), {"name": "Denied"})).status_code, 403)
        self.assertEqual(self.no_event(lambda: self.client.post(reverse("tasks:task-approve", args=[task.id]), {})).status_code, 403)

    def test_notifications_reads_generate_no_activity(self):
        notification = Notification.objects.create(recipient=self.supervisor, notification_type="SYSTEM", title="Test", message="Test")
        self.no_event(lambda: mark_notification_read(notification_id=notification.id, user=self.supervisor))
        self.no_event(lambda: mark_all_notifications_read(user=self.supervisor))

    def test_invalid_and_denied_report_and_document_writes_create_no_logs(self):
        report = self.draft()
        with self.assertRaises(ValidationError):
            reports.add_daily_manpower(report_id=report.id, supervisor=self.supervisor, data={"trade": "MASON", "worker_count": 0})
        with self.assertRaises(PermissionDenied):
            reports.update_daily_report(report_id=report.id, supervisor=self.other, data={"work_summary": "Denied"})
        with self.assertRaises(PermissionDenied):
            documents.create_project_document(project_id=self.project.id, user=self.other, title="Denied", document_type="DRAWING", uploaded_file=self.pdf())
        with self.assertRaises(ValidationError):
            documents.create_project_document(project_id=self.project.id, user=self.supervisor, title="Invalid", document_type="DRAWING", uploaded_file=SimpleUploadedFile("invalid.pdf", b"not a PDF"))
        task = self.task()
        with self.assertRaises(ValidationError):
            tasks.approve_task(task_id=task.id, admin_user=self.admin)
        self.assertFalse(ActivityLog.objects.exists())
        self.assertFalse(any(path.is_file() for path in self.storage_root.rglob("*")))

    def test_review_and_activity_roll_back_together(self):
        task = self.task(approval_status="PENDING")
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            with self.assertRaises(RuntimeError):
                with transaction.atomic():
                    tasks.approve_task(task_id=task.id, admin_user=self.admin)
                    self.assertTrue(ActivityLog.objects.filter(action="TASK_APPROVED").exists())
                    raise RuntimeError("rollback")
        task.refresh_from_db()
        self.assertEqual(task.approval_status, "PENDING")
        self.assertFalse(task.history.exists())
        self.assertFalse(ActivityLog.objects.exists())
        self.assertFalse(Notification.objects.exists())
        self.assertEqual(callbacks, [])

