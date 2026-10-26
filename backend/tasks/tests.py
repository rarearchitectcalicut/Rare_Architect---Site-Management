from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless

from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection, connections
from django.test import SimpleTestCase, TestCase, TransactionTestCase
from django.urls import reverse
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from activity.models import ActivityLog
from projects.models import Project, ProjectCategory, ProjectSupervisor
from .models import Task
from .models import TaskHistory
from documents.models import TaskDocument, TaskDocumentVersion
from reports.models import DailyReport, DailyTaskWork
from reports.progress import calculate_task_progress
from reports.services import submit_daily_report, verify_daily_task_work
from django.utils import timezone
from datetime import date, timedelta
from django.test.utils import CaptureQueriesContext

from .views import TaskApprovalListView


class TaskApprovalQueueTests(SimpleTestCase):
    def queryset_for(self, params):
        view = TaskApprovalListView()
        view.request = SimpleNamespace(query_params=params)
        return view.get_queryset()

    @patch("tasks.views.Task.objects.filter")
    def test_pending_queue_remains_the_default(self, task_filter):
        self.queryset_for({})
        task_filter.assert_called_once_with(approval_status="PENDING")

    @patch("tasks.views.Task.objects.filter")
    def test_admin_can_request_rejected_tasks(self, task_filter):
        self.queryset_for({"status": "REJECTED"})
        task_filter.assert_called_once_with(approval_status="REJECTED")

    @patch("tasks.views.Task.objects.filter")
    def test_invalid_status_is_rejected_before_querying(self, task_filter):
        with self.assertRaises(ValidationError):
            self.queryset_for({"status": "INVALID"})
        task_filter.assert_not_called()

    def test_supervisor_cannot_access_rejected_task_queue(self):
        request = APIRequestFactory().get("/task-approvals/", {"status": "REJECTED"})
        user = get_user_model()(id=uuid4(), role="SUPERVISOR", is_active=True, is_staff=False)
        force_authenticate(request, user=user)
        self.assertEqual(TaskApprovalListView.as_view()(request).status_code, 403)


class TaskStartFixture:
    def setUp(self):
        super().setUp()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="start_admin", first_name="Admin", phone="+919100001001",
            email="start-admin@example.com", role="ADMIN", is_staff=True,
        )
        self.supervisor = User.objects.create_user(
            username="start_supervisor", first_name="Supervisor", phone="+919100001002",
            email="start-supervisor@example.com", role="SUPERVISOR",
        )
        self.other = User.objects.create_user(
            username="other_supervisor", first_name="Other", phone="+919100001003",
            email="start-other@example.com", role="SUPERVISOR",
        )
        category = ProjectCategory.objects.create(name="Start test category")
        self.project = Project.objects.create(name="Start test project", category=category, created_by=self.admin)
        ProjectSupervisor.objects.create(project=self.project, supervisor=self.supervisor, assigned_by=self.admin)
        self.task = Task.objects.create(
            project=self.project, created_by=self.other, title="Start this task",
            approval_status=Task.ApprovalStatus.APPROVED,
        )
        self.url = reverse("tasks:task-start", kwargs={"id": self.task.id})
        self.client = APIClient()
        self.client.force_authenticate(self.supervisor)


class TaskStartEndpointTests(TaskStartFixture, TestCase):
    def test_assigned_supervisor_starts_task_and_records_audit(self):
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Task started successfully.")
        self.assertEqual(response.data["task"]["work_status"], "IN_PROGRESS")
        self.assertEqual(response.data["task"]["approval_status"], "APPROVED")
        self.task.refresh_from_db()
        self.assertEqual(self.task.work_status, "IN_PROGRESS")
        log = ActivityLog.objects.get(action="TASK_STARTED", entity_id=self.task.id)
        self.assertEqual(log.actor_id, self.supervisor.id)
        self.assertEqual(log.metadata["project_id"], str(self.project.id))
        self.assertEqual(log.metadata["old_status"], "NOT_STARTED")
        self.assertEqual(log.metadata["new_status"], "IN_PROGRESS")
        self.assertFalse(self.task.history.exists())  # No misleading history action is fabricated.

    def test_unapproved_and_already_started_tasks_are_rejected_without_audit(self):
        for approval in Task.ApprovalStatus.values:
            for work in Task.WorkStatus.values:
                if approval == "APPROVED" and work == "NOT_STARTED":
                    continue
                with self.subTest(approval=approval, work=work):
                    Task.objects.filter(pk=self.task.id).update(approval_status=approval, work_status=work)
                    response = self.client.post(self.url, {}, format="json")
                    self.assertEqual(response.status_code, 400)
                    self.assertIn("detail", response.data)
                    self.task.refresh_from_db()
                    self.assertEqual(self.task.work_status, work)
        self.assertFalse(ActivityLog.objects.exists())

    def test_duplicate_start_creates_exactly_one_audit_record(self):
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 200)
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 400)
        self.assertEqual(ActivityLog.objects.filter(action="TASK_STARTED").count(), 1)

    def test_unauthenticated_admin_and_unassigned_supervisor_are_denied(self):
        for user, expected in [(None, 401), (self.admin, 403), (self.other, 403)]:
            with self.subTest(user=user):
                self.client.force_authenticate(user)
                self.assertEqual(self.client.post(self.url, {}, format="json").status_code, expected)
        self.task.refresh_from_db()
        self.assertEqual(self.task.work_status, "NOT_STARTED")
        self.assertFalse(ActivityLog.objects.exists())

    def test_inactive_staff_and_password_change_required_supervisors_are_denied(self):
        for flag in ["is_staff", "must_change_password", "is_active"]:
            with self.subTest(flag=flag):
                original = getattr(self.supervisor, flag)
                setattr(self.supervisor, flag, not original)
                self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 403)
                setattr(self.supervisor, flag, original)
        self.assertFalse(ActivityLog.objects.exists())

    def test_missing_task_and_revoked_assignment(self):
        missing = reverse("tasks:task-start", kwargs={"id": uuid4()})
        self.assertEqual(self.client.post(missing, {}, format="json").status_code, 404)
        ProjectSupervisor.objects.filter(project=self.project, supervisor=self.supervisor).delete()
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 403)

    def test_only_post_is_supported_and_generic_update_cannot_change_status(self):
        for method in ["get", "put", "patch", "delete"]:
            with self.subTest(method=method):
                self.assertEqual(getattr(self.client, method)(self.url).status_code, 405)
        detail = reverse("tasks:task-detail", kwargs={"id": self.task.id})
        for method in ["put", "patch"]:
            self.assertEqual(getattr(self.client, method)(detail, {"work_status": "IN_PROGRESS"}, format="json").status_code, 405)
        self.task.refresh_from_db()
        self.assertEqual(self.task.work_status, "NOT_STARTED")

    def test_audit_failure_rolls_back_status(self):
        with patch("tasks.services.create_activity_log", side_effect=RuntimeError("Audit unavailable")):
            with self.assertRaises(RuntimeError):
                self.client.post(self.url, {}, format="json")
        self.task.refresh_from_db()
        self.assertEqual(self.task.work_status, "NOT_STARTED")
        self.assertFalse(ActivityLog.objects.exists())

    def test_complete_and_cancel_keep_existing_behavior(self):
        self.client.post(self.url, {}, format="json")
        complete = reverse("tasks:task-complete", kwargs={"id": self.task.id})
        response = self.client.post(complete, {"comment": "Finished"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["task"]["work_status"], "COMPLETED")
        self.assertTrue(self.task.history.filter(action="COMPLETED").exists())
        cancel = reverse("tasks:task-cancel", kwargs={"id": self.task.id})
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(cancel, {"reason": "Stop"}, format="json").status_code, 400)
        Task.objects.filter(pk=self.task.id).update(work_status="NOT_STARTED")
        response = self.client.post(cancel, {"reason": "Stop"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["task"]["work_status"], "CANCELLED")
        self.assertTrue(self.task.history.filter(action="CANCELLED").exists())


@skipUnless(connection.vendor == "postgresql", "Row-lock concurrency checks require PostgreSQL")
class TaskStartConcurrencyTests(TaskStartFixture, TransactionTestCase):
    def race_posts(self, url, user, payload):
        barrier = Barrier(2)

        def start():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user)
                barrier.wait(timeout=10)
                return client.post(url, payload, format="json").status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(start) for _ in range(2)]
            results = [future.result(timeout=20) for future in futures]
        return results

    def test_concurrent_starts_accept_only_one_transition(self):
        self.assertCountEqual(self.race_posts(self.url, self.supervisor, {}), [200, 400])
        self.task.refresh_from_db()
        self.assertEqual(self.task.work_status, "IN_PROGRESS")
        self.assertEqual(ActivityLog.objects.filter(action="TASK_STARTED", entity_id=self.task.id).count(), 1)

    def test_concurrent_cancellations_are_audited_once(self):
        url = reverse("tasks:task-cancel", args=[self.task.id])
        self.assertCountEqual(self.race_posts(url, self.supervisor, {"reason": "Scope removed"}), [200, 400])
        self.assertEqual(self.task.history.filter(action="CANCELLED").count(), 1)
        self.assertEqual(ActivityLog.objects.filter(action="TASK_CANCELLED").count(), 1)

    def test_concurrent_reopens_are_audited_once(self):
        Task.objects.filter(pk=self.task.id).update(work_status="COMPLETED")
        url = reverse("tasks:task-reopen", args=[self.task.id])
        self.assertCountEqual(self.race_posts(url, self.admin, {"reason": "Corrective work"}), [200, 400])
        self.assertEqual(self.task.history.filter(action="REOPENED").count(), 1)
        self.assertEqual(ActivityLog.objects.filter(action="TASK_REOPENED").count(), 1)


class TaskLifecycleTests(TaskStartFixture, TestCase):
    def cancel(self, actor=None, payload=None):
        self.client.force_authenticate(actor or self.supervisor)
        return self.client.post(reverse("tasks:task-cancel", args=[self.task.id]), payload if payload is not None else {"reason": "Scope removed"}, format="json")

    def reopen(self, actor=None, payload=None):
        self.client.force_authenticate(actor or self.admin)
        return self.client.post(reverse("tasks:task-reopen", args=[self.task.id]), payload if payload is not None else {"reason": "Corrective work"}, format="json")

    def report(self, **kwargs):
        return DailyReport.objects.create(project=self.project, reported_by=self.supervisor, report_date=date(2026, 10, 26), work_summary="Site work", **kwargs)

    def test_admin_and_assigned_supervisor_cancel_eligible_tasks(self):
        for actor in [self.admin, self.supervisor]:
            for status in ["NOT_STARTED", "IN_PROGRESS"]:
                with self.subTest(actor=actor.role, status=status):
                    Task.objects.filter(pk=self.task.id).update(work_status=status)
                    response = self.cancel(actor)
                    self.assertEqual(response.status_code, 200, response.data)
                    self.assertEqual(response.data["task"]["work_status"], "CANCELLED")
                    history = self.task.history.latest("created_at")
                    self.assertEqual(history.actor_id, actor.id)
                    self.assertEqual(history.details["old_status"], status)
                    self.assertEqual(history.details["new_status"], "CANCELLED")
                    self.assertEqual(history.details["reason"], "Scope removed")
                    self.assertEqual(ActivityLog.objects.latest("created_at").actor_id, actor.id)

    def test_cancellation_rejects_unassigned_and_anonymous_users(self):
        self.assertEqual(self.cancel(self.other).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(reverse("tasks:task-cancel", args=[self.task.id]), {"reason": "Stop"}).status_code, 401)
        self.assertFalse(ActivityLog.objects.exists())

    def test_reasons_are_required_for_both_actions(self):
        Task.objects.filter(pk=self.task.id).update(work_status="COMPLETED")
        for payload in [{}, {"reason": ""}, {"reason": "  "}, {"reason": "x" * 1001}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.reopen(payload=payload).status_code, 400)
                self.assertEqual(self.cancel(payload=payload).status_code, 400)
        self.assertFalse(ActivityLog.objects.exists())

    def test_completed_cancelled_and_unapproved_tasks_cannot_be_cancelled(self):
        for approval, status in [("APPROVED", "COMPLETED"), ("APPROVED", "CANCELLED"), ("PENDING", "NOT_STARTED"), ("REJECTED", "NOT_STARTED")]:
            Task.objects.filter(pk=self.task.id).update(approval_status=approval, work_status=status)
            self.assertEqual(self.cancel().status_code, 400)
        self.assertFalse(self.task.history.exists())

    def test_repeated_cancellation_and_work_transitions_are_rejected(self):
        self.assertEqual(self.cancel().status_code, 200)
        self.assertEqual(self.cancel().status_code, 400)
        for name in ["task-start", "task-complete"]:
            self.assertEqual(self.client.post(reverse(f"tasks:{name}", args=[self.task.id]), {}, format="json").status_code, 400)
        self.assertEqual(self.reopen().status_code, 400)
        self.assertEqual(self.task.history.count(), 1)

    def test_reopen_is_admin_only_and_requires_completed_approved_task(self):
        Task.objects.filter(pk=self.task.id).update(work_status="COMPLETED")
        self.assertEqual(self.reopen(self.supervisor).status_code, 403)
        for field in ["is_active", "is_staff"]:
            setattr(self.admin, field, False)
            self.assertEqual(self.reopen().status_code, 403)
            setattr(self.admin, field, True)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(reverse("tasks:task-reopen", args=[self.task.id]), {"reason": "Fix"}).status_code, 401)
        for approval, status in [("PENDING", "COMPLETED"), ("REJECTED", "COMPLETED"), ("APPROVED", "NOT_STARTED"), ("APPROVED", "IN_PROGRESS"), ("APPROVED", "CANCELLED")]:
            Task.objects.filter(pk=self.task.id).update(approval_status=approval, work_status=status)
            self.assertEqual(self.reopen().status_code, 400)

    def test_reopening_preserves_verified_work_reports_documents_and_completion_history(self):
        Task.objects.filter(pk=self.task.id).update(work_status="COMPLETED")
        report = self.report(status="SUBMITTED", submitted_at=timezone.now())
        work = DailyTaskWork.objects.create(daily_report=report, task=self.task, work_description="Completed work", completion_claimed=True, verification_status="VERIFIED", verified_by=self.admin, verified_at=timezone.now())
        document = TaskDocument.objects.create(task=self.task, title="Evidence", document_type="REFERENCE", uploaded_by=self.supervisor)
        version = TaskDocumentVersion.objects.create(document=document, version_number=1, file="preserved/evidence.pdf", original_filename="evidence.pdf", file_size=100, uploaded_by=self.supervisor, is_current=True)
        previous = TaskHistory.objects.create(task=self.task, actor=self.supervisor, action="COMPLETED", details={"comment": "Finished"})
        before = calculate_task_progress(self.task)
        response = self.reopen(payload={"reason": "  Corrective work  "})
        self.assertEqual(response.status_code, 200, response.data)
        self.task.refresh_from_db(); work.refresh_from_db(); version.refresh_from_db(); report.refresh_from_db()
        self.assertEqual(self.task.work_status, "IN_PROGRESS")
        self.assertEqual(calculate_task_progress(self.task), before)
        self.assertEqual(work.verification_status, "VERIFIED")
        self.assertEqual(report.status, "SUBMITTED")
        self.assertEqual(version.file.name, "preserved/evidence.pdf")
        self.assertTrue(TaskHistory.objects.filter(pk=previous.id, action="COMPLETED").exists())
        reopened = self.task.history.get(action="REOPENED")
        self.assertEqual(reopened.actor_id, self.admin.id)
        self.assertEqual(reopened.details["reason"], "Corrective work")
        self.assertEqual(reopened.details["old_status"], "COMPLETED")
        audit = ActivityLog.objects.get(action="TASK_REOPENED")
        self.assertEqual(audit.actor_id, self.admin.id)
        self.assertEqual(audit.metadata["reason"], "Corrective work")
        self.client.force_authenticate(self.supervisor)
        complete = self.client.post(reverse("tasks:task-complete", args=[self.task.id]), {}, format="json")
        self.assertEqual(complete.status_code, 200)
        self.assertEqual(self.task.history.filter(action="COMPLETED").count(), 2)

    def test_cancelled_task_cannot_receive_new_or_corrected_daily_work(self):
        report = self.report()
        rejected_report = self.report(status="SUBMITTED", submitted_at=timezone.now())
        rejected = DailyTaskWork.objects.create(daily_report=rejected_report, task=self.task, work_description="Rejected work", completion_claimed=True, verification_status="REJECTED", verified_by=self.admin, verified_at=timezone.now())
        self.cancel()
        url = reverse("reports:daily-task-work-list-create", args=[report.id])
        response = self.client.post(url, {"task": str(self.task.id), "work_description": "More work", "completion_claimed": True}, format="json")
        self.assertEqual(response.status_code, 400)
        from reports.services import correct_rejected_daily_task_work
        with self.assertRaises(ValidationError):
            correct_rejected_daily_task_work(rejected_entry_id=rejected.id, new_report_id=report.id, supervisor=self.supervisor, corrected_data={"work_description": "Correction", "completion_claimed": True})
        self.assertEqual(report.work_entries.count(), 0)

    def test_reopening_does_not_bypass_existing_verified_completion_limit(self):
        Task.objects.filter(pk=self.task.id).update(work_status="COMPLETED")
        original_report = self.report(status="SUBMITTED", submitted_at=timezone.now())
        DailyTaskWork.objects.create(daily_report=original_report, task=self.task, work_description="Verified completion", completion_claimed=True, verification_status="VERIFIED", verified_by=self.admin, verified_at=timezone.now())
        self.assertEqual(self.reopen().status_code, 200)
        extra_report = self.report(status="SUBMITTED", submitted_at=timezone.now())
        extra = DailyTaskWork.objects.create(daily_report=extra_report, task=self.task, work_description="Additional corrective work", completion_claimed=True)
        with self.assertRaises(ValidationError):
            verify_daily_task_work(entry_id=extra.id, admin_user=self.admin)
        self.assertEqual(calculate_task_progress(self.task)["progress_percentage"], "100.00")
        extra.refresh_from_db()
        self.assertEqual(extra.verification_status, "PENDING")

    def test_cancelled_tasks_block_existing_draft_submission_and_pending_verification(self):
        draft = self.report()
        pending_report = self.report(status="SUBMITTED", submitted_at=timezone.now())
        DailyTaskWork.objects.create(daily_report=draft, task=self.task, work_description="Draft work", completion_claimed=True)
        pending = DailyTaskWork.objects.create(daily_report=pending_report, task=self.task, work_description="Pending work", completion_claimed=True)
        self.cancel()
        with self.assertRaises(ValidationError):
            submit_daily_report(report_id=draft.id, supervisor=self.supervisor)
        with self.assertRaises(ValidationError):
            verify_daily_task_work(entry_id=pending.id, admin_user=self.admin)
        draft.refresh_from_db(); pending.refresh_from_db()
        self.assertEqual(draft.status, "DRAFT")
        self.assertEqual(pending.verification_status, "PENDING")

    def test_reopen_and_cancel_roll_back_if_auditing_fails(self):
        for action, status in [(self.reopen, "COMPLETED"), (self.cancel, "NOT_STARTED")]:
            Task.objects.filter(pk=self.task.id).update(work_status=status)
            with patch("tasks.services.create_activity_log", side_effect=RuntimeError("Audit unavailable")):
                with self.assertRaises(RuntimeError):
                    action()
            self.task.refresh_from_db()
            self.assertEqual(self.task.work_status, status)
            self.assertFalse(self.task.history.exists())

    def test_reopen_is_post_only_and_generic_updates_remain_disabled(self):
        self.client.force_authenticate(self.admin)
        url = reverse("tasks:task-reopen", args=[self.task.id])
        for method in ["get", "put", "patch", "delete"]:
            self.assertEqual(getattr(self.client, method)(url).status_code, 405)
        self.assertEqual(self.client.patch(reverse("tasks:task-detail", args=[self.task.id]), {"work_status": "IN_PROGRESS"}, format="json").status_code, 405)


class TaskRegisterTests(TaskStartFixture, TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        Task.objects.filter(pk=self.task.pk).update(
            title="Install cabinetry", description="Oak finishing scope", worker_name="Joinery crew",
            start_date=self.today - timedelta(days=10), end_date=self.today - timedelta(days=1),
        )
        self.other_project = Project.objects.create(name="Other project", category=self.project.category, created_by=self.admin)
        self.shared_project = Project.objects.create(name="Shared project", category=self.project.category, created_by=self.admin)
        for project, user in [(self.other_project, self.other), (self.shared_project, self.other), (self.shared_project, self.supervisor)]:
            ProjectSupervisor.objects.create(project=project, supervisor=user, assigned_by=self.admin)
        self.completed = self.task_in(self.project, "Already done", work_status="COMPLETED")
        self.pending = self.task_in(self.project, "Awaiting decision", approval_status="PENDING")
        self.outside = self.task_in(self.other_project, "Outside wall", work_status="IN_PROGRESS", end_date=self.today + timedelta(days=4), priority="URGENT")
        self.cancelled = self.task_in(self.shared_project, "Cancelled work", work_status="CANCELLED")
        self.delayed = self.task_in(self.shared_project, "Delayed paint", work_status="DELAYED", priority="LOW")
        self.register_url = reverse("tasks:task-register")

    def task_in(self, project, title, **kwargs):
        return Task.objects.create(**{
            "project": project, "created_by": self.supervisor, "title": title, "approval_status": "APPROVED",
            "display_order": 1, "start_date": self.today - timedelta(days=5), "end_date": self.today - timedelta(days=1),
            **kwargs,
        })

    def get_register(self, actor=None, **params):
        self.client.force_authenticate(actor or self.admin)
        return self.client.get(self.register_url, params)

    def test_admin_sees_all_projects_and_totals_are_independent_of_page_and_filters(self):
        response = self.get_register(page_size=1)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 6)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["summary"], {"total": 6, "pending_approval": 1, "not_started": 2, "in_progress": 1, "completed": 1, "overdue": 2})
        filtered = self.get_register(search="cabinetry", page_size=1)
        self.assertEqual(filtered.data["count"], 1)
        self.assertEqual(filtered.data["summary"]["total"], 6)

    def test_supervisor_only_sees_assigned_projects_in_results_totals_and_options(self):
        response = self.get_register(self.supervisor, page_size=100)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 5)
        self.assertEqual(response.data["summary"]["total"], 5)
        self.assertEqual(response.data["summary"]["in_progress"], 0)
        self.assertEqual(response.data["filter_options"]["supervisors"], [])
        self.assertNotIn("Other project", str(response.data))
        self.assertEqual(self.get_register(self.supervisor, project=str(self.other_project.id)).status_code, 404)
        self.assertEqual(self.get_register(self.supervisor, supervisor=str(self.other.id)).status_code, 400)
        self.client.force_authenticate(self.supervisor)
        self.assertEqual(self.client.get(reverse("tasks:task-detail", args=[self.outside.id])).status_code, 404)
        self.assertEqual(self.client.get(reverse("tasks:project-task-list-create", args=[self.other_project.id])).status_code, 404)

    def test_shared_project_assignments_do_not_duplicate_tasks_and_names_are_real(self):
        response = self.get_register(project=str(self.shared_project.id))
        self.assertEqual(response.data["count"], 2)
        supervisors = response.data["results"][0]["supervisors"]
        self.assertCountEqual([item["id"] for item in supervisors], [str(self.supervisor.id), str(self.other.id)])
        self.assertCountEqual([item["name"] for item in supervisors], ["Supervisor", "Other"])
        self.assertEqual(self.get_register(supervisor=str(self.other.id)).data["count"], 3)

    def test_search_combines_task_description_worker_and_project_with_other_filters(self):
        for search in ["cabinetry", "Oak", "Joinery", self.project.name]:
            with self.subTest(search=search):
                response = self.get_register(search=search, project=str(self.project.id), work_status="NOT_STARTED", approval_status="APPROVED", priority="MEDIUM")
                self.assertEqual(response.data["count"], 1)
                self.assertEqual(response.data["results"][0]["id"], str(self.task.id))
                self.assertEqual(response.data["results"][0]["description"], "Oak finishing scope")
                self.assertEqual(response.data["results"][0]["project_name"], self.project.name)

    def test_date_ranges_and_overdue_exclude_completed_cancelled_and_pending_tasks(self):
        response = self.get_register(overdue="true", page_size=100)
        self.assertEqual(response.data["count"], 2)
        self.assertTrue(all(row["is_overdue"] for row in response.data["results"]))
        response = self.get_register(start_from=str(self.today - timedelta(days=10)), start_to=str(self.today - timedelta(days=10)), end_from=str(self.today - timedelta(days=1)), end_to=str(self.today - timedelta(days=1)))
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(self.task.id))

    def test_all_sort_modes_and_pagination_are_stable(self):
        for sort in ["order", "newest", "oldest", "start_date", "end_date", "priority", "title"]:
            with self.subTest(sort=sort):
                first = self.get_register(sort=sort, page_size=2)
                second = self.get_register(sort=sort, page_size=2, page=2)
                self.assertEqual(first.status_code, 200)
                self.assertEqual(second.status_code, 200)
                self.assertEqual(len({row["id"] for row in [*first.data["results"], *second.data["results"]]}), 4)
        priority = self.get_register(sort="priority", page_size=100)
        self.assertEqual(priority.data["results"][0]["id"], str(self.outside.id))
        ordered = self.get_register(sort="order", page_size=100)
        self.assertEqual([row["project_name"] for row in ordered.data["results"]], sorted(row["project_name"] for row in ordered.data["results"]))

    def test_invalid_filters_are_validation_errors(self):
        for params in [{"project": "invalid"}, {"supervisor": "invalid"}, {"work_status": "OVERDUE"}, {"priority": "INVALID"}, {"sort": "invalid"}, {"start_from": "not-a-date"}, {"end_from": "2026-10-28", "end_to": "2026-10-01"}, {"overdue": "invalid"}, {"search": "x" * 201}]:
            with self.subTest(params=params):
                self.assertEqual(self.get_register(**params).status_code, 400)

    def test_anonymous_inactive_and_invalid_role_flags_are_denied_and_register_is_read_only(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.register_url).status_code, 401)
        for user, flag in [(self.admin, "is_staff"), (self.admin, "is_active"), (self.supervisor, "is_staff")]:
            previous = getattr(user, flag)
            setattr(user, flag, not previous)
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.register_url).status_code, 403)
            setattr(user, flag, previous)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(self.register_url, {}).status_code, 405)
        self.assertFalse(ActivityLog.objects.exists())
        self.assertFalse(TaskHistory.objects.exists())

    def test_serialization_query_count_does_not_grow_per_task(self):
        self.client.force_authenticate(self.admin)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(self.register_url, {"page_size": 100})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 6)
        self.assertLessEqual(len(queries), 8)
