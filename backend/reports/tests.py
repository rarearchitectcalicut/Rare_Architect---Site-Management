from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from notifications.models import Notification
from projects.models import Project, ProjectCategory, ProjectSupervisor
from tasks.models import Task, TaskHistory
from tasks.services import reject_task, resubmit_task, create_timeline_reorder_request
from .models import DailyReport, DailyTaskWork, DelayReport
from .progress import calculate_task_progress


class ApprovalWorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username="admin", first_name="Admin", phone="+919111111111", email="admin@test.com", role="ADMIN", is_staff=True)
        cls.supervisor = User.objects.create_user(username="supervisor", first_name="Supervisor", phone="+919222222222", email="supervisor@test.com", role="SUPERVISOR")
        cls.other = User.objects.create_user(username="other", first_name="Other", phone="+919333333333", email="other@test.com", role="SUPERVISOR")
        category = ProjectCategory.objects.create(name="Residential")
        cls.project = Project.objects.create(name="Assigned project", category=category, created_by=cls.admin)
        cls.other_project = Project.objects.create(name="Other project", category=category, created_by=cls.admin)
        ProjectSupervisor.objects.create(project=cls.project, supervisor=cls.supervisor, assigned_by=cls.admin)
        ProjectSupervisor.objects.create(project=cls.other_project, supervisor=cls.other, assigned_by=cls.admin)
        cls.task = Task.objects.create(project=cls.project, created_by=cls.supervisor, title="Plastering", approval_status="APPROVED", start_date=date(2026, 10, 1), end_date=date(2026, 10, 30), measurement_method="QUANTITY", planned_quantity=Decimal("100"), measurement_unit="SQM")

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def delay(self):
        self.client.force_authenticate(self.supervisor)
        response = self.client.post(reverse("reports:task-delay-report-create", args=[self.task.id]), {
            "delay_type": "MATERIAL_DELAY", "reason": "Material delivery delayed",
            "extension_requested": True, "requested_end_date": "2026-11-10",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["reported_by_name"], "supervisor")
        self.client.force_authenticate(self.admin)
        return DelayReport.objects.get(pk=response.data["id"])

    def post_decision(self, name, report, comment="Reviewed"):
        return self.client.post(reverse(f"reports:{name}", args=[report.id]), {"admin_comment": comment}, format="json")

    def work(self, quantity="25", submitted=True):
        report = DailyReport.objects.create(project=self.project, reported_by=self.supervisor, report_date=date(2026, 10, 23), work_summary="Plastered walls", status="SUBMITTED" if submitted else "DRAFT", submitted_at=timezone.now() if submitted else None)
        return DailyTaskWork.objects.create(daily_report=report, task=self.task, work_description="Wall plastering", quantity_completed_today=Decimal(quantity))

    def test_delay_approval_does_not_approve_extension_or_change_deadline(self):
        report = self.delay()
        self.assertEqual(self.post_decision("delay-report-approve", report).status_code, 200)
        report.refresh_from_db(); self.task.refresh_from_db()
        self.assertEqual(report.status, "APPROVED")
        self.assertEqual(report.extension_status, "PENDING")
        self.assertEqual(self.task.end_date, date(2026, 10, 30))

    def test_extension_requires_approved_report_and_is_a_separate_audited_decision(self):
        report = self.delay()
        self.assertEqual(self.post_decision("delay-extension-approve", report).status_code, 400)
        self.post_decision("delay-report-approve", report)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_decision("delay-extension-approve", report)
        self.assertEqual(response.status_code, 200, response.data)
        self.task.refresh_from_db(); report.refresh_from_db()
        self.assertEqual(self.task.end_date, date(2026, 11, 10))
        self.assertEqual(report.extension_reviewed_by, self.admin)
        self.assertTrue(TaskHistory.objects.filter(task=self.task, action="EXTENSION_APPROVED").exists())
        self.assertTrue(Notification.objects.filter(recipient=self.supervisor, notification_type="EXTENSION_REQUEST").exists())
        self.assertEqual(self.post_decision("delay-extension-approve", report).status_code, 400)

    def test_extension_rejection_preserves_deadline_and_report_decision(self):
        report = self.delay()
        self.post_decision("delay-report-approve", report)
        self.assertEqual(self.post_decision("delay-extension-reject", report, "Keep agreed deadline").status_code, 200)
        report.refresh_from_db(); self.task.refresh_from_db()
        self.assertEqual(report.status, "APPROVED")
        self.assertEqual(report.extension_status, "REJECTED")
        self.assertEqual(self.task.end_date, date(2026, 10, 30))

    def test_duplicate_pending_extension_is_rejected(self):
        self.delay()
        self.client.force_authenticate(self.supervisor)
        response = self.client.post(reverse("reports:task-delay-report-create", args=[self.task.id]), {"delay_type": "WEATHER", "reason": "Rain", "extension_requested": True, "requested_end_date": "2026-11-15"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(DelayReport.objects.count(), 1)

    def test_rejections_require_reasons(self):
        report = self.delay()
        for name in ["delay-report-reject", "delay-extension-reject"]:
            self.assertEqual(self.post_decision(name, report, "   ").status_code, 400)
        entry = self.work()
        response = self.client.post(reverse("reports:daily-task-work-reject", args=[entry.id]), {"verification_note": " "}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_supervisor_cannot_review_delays_or_daily_work(self):
        report = self.delay(); entry = self.work()
        self.client.force_authenticate(self.supervisor)
        for name in ["delay-report-approve", "delay-report-reject", "delay-extension-approve", "delay-extension-reject"]:
            self.assertEqual(self.post_decision(name, report).status_code, 403)
        self.assertEqual(self.client.post(reverse("reports:daily-task-work-verify", args=[entry.id]), {}, format="json").status_code, 403)
        self.assertEqual(self.client.get(reverse("reports:daily-work-queue")).status_code, 403)

    def test_project_scoping_and_invalid_filter_values(self):
        self.delay()
        self.client.force_authenticate(self.other)
        response = self.client.get(reverse("reports:delay-report-list"), {"project": self.project.id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(self.client.post(reverse("reports:task-delay-report-create", args=[self.task.id]), {"delay_type": "WEATHER", "reason": "Rain"}, format="json").status_code, 404)
        self.client.force_authenticate(self.admin)
        for query in [{"project": "invalid"}, {"extension_status": "INVALID"}, {"delay_type": "INVALID"}]:
            self.assertEqual(self.client.get(reverse("reports:delay-report-list"), query).status_code, 400)

    def test_work_queue_excludes_drafts_and_exposes_report_context(self):
        self.work(submitted=False)
        entry = self.work()
        response = self.client.get(reverse("reports:daily-work-queue"), {"status": "PENDING", "project": self.project.id})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["id"], str(entry.id))
        self.assertEqual(row["project_name"], "Assigned project")
        self.assertEqual(row["reported_by_name"], "supervisor")
        self.assertEqual(row["planned_quantity"], "100.000")
        self.assertEqual(self.client.get(reverse("reports:daily-work-queue"), {"status": "INVALID"}).status_code, 400)

    def test_only_verified_work_contributes_and_over_verification_is_rejected(self):
        entry = self.work("25")
        self.assertEqual(calculate_task_progress(self.task)["verified_quantity"], "0.000")
        url = reverse("reports:daily-task-work-verify", args=[entry.id])
        self.assertEqual(self.client.post(url, {"verification_note": "Measured on site"}, format="json").status_code, 200)
        self.assertEqual(calculate_task_progress(self.task)["verified_quantity"], "25.000")
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 400)
        excessive = self.work("80")
        self.assertEqual(self.client.post(reverse("reports:daily-task-work-verify", args=[excessive.id]), {}, format="json").status_code, 400)
        self.assertEqual(calculate_task_progress(self.task)["verified_quantity"], "25.000")

    def test_rejected_work_is_read_only_and_does_not_count(self):
        entry = self.work()
        url = reverse("reports:daily-task-work-reject", args=[entry.id])
        self.assertEqual(self.client.post(url, {"verification_note": "Evidence missing"}, format="json").status_code, 200)
        self.assertEqual(calculate_task_progress(self.task)["verified_quantity"], "0.000")
        self.assertEqual(self.client.post(url, {"verification_note": "Again"}, format="json").status_code, 400)

    def test_task_decision_history_survives_supervisor_resubmission(self):
        pending = Task.objects.create(project=self.project, created_by=self.supervisor, title="Pending scope")
        reject_task(task_id=pending.id, admin_user=self.admin, reason="Correct scope")
        resubmit_task(task_id=pending.id, supervisor=self.supervisor, validated_data={"title": "Corrected scope", "resubmission_note": "Scope corrected"})
        response = self.client.get(reverse("tasks:task-decision-list"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["details"]["reason"], "Correct scope")
        self.client.force_authenticate(self.supervisor)
        self.assertEqual(self.client.get(reverse("tasks:task-decision-list")).status_code, 403)

    def timeline_request(self):
        self.task.display_order = 1
        self.task.save(update_fields=["display_order"])
        second = Task.objects.create(project=self.project, created_by=self.supervisor, title="Painting", approval_status="APPROVED", display_order=2)
        request = create_timeline_reorder_request(project=self.project, supervisor=self.supervisor, task_ids=[second.id, self.task.id], reason="Access sequence")
        return request, second

    def test_timeline_api_rejects_without_mutating_order_and_records_reason(self):
        request, second = self.timeline_request()
        url = reverse("tasks:timeline-change-reject", args=[request.id])
        self.assertEqual(self.client.post(url, {"admin_comment": ""}, format="json").status_code, 400)
        self.assertEqual(self.client.post(url, {"admin_comment": "Keep original access order"}, format="json").status_code, 200)
        self.task.refresh_from_db(); second.refresh_from_db(); request.refresh_from_db()
        self.assertEqual([self.task.display_order, second.display_order], [1, 2])
        self.assertEqual(request.status, "REJECTED")
        self.assertEqual(request.admin_comment, "Keep original access order")

    def test_timeline_approval_is_admin_only_atomic_and_not_repeatable(self):
        request, second = self.timeline_request()
        url = reverse("tasks:timeline-change-approve", args=[request.id])
        self.client.force_authenticate(self.supervisor)
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 200)
        self.task.refresh_from_db(); second.refresh_from_db()
        self.assertEqual([self.task.display_order, second.display_order], [2, 1])
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 400)

    def test_stale_timeline_approval_does_not_partially_apply(self):
        request, second = self.timeline_request()
        Task.objects.create(project=self.project, created_by=self.supervisor, title="New approved task", approval_status="APPROVED", display_order=3)
        response = self.client.post(reverse("tasks:timeline-change-approve", args=[request.id]), {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.task.refresh_from_db(); second.refresh_from_db(); request.refresh_from_db()
        self.assertEqual([self.task.display_order, second.display_order], [1, 2])
        self.assertEqual(request.status, "PENDING")
