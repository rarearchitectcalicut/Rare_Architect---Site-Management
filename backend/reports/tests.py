from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase
from django.db import connection, connections, close_old_connections
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from io import BytesIO
from PIL import Image
from uuid import uuid4
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from notifications.models import Notification
from projects.models import Project, ProjectCategory, ProjectSupervisor
from tasks.models import Task, TaskHistory
from tasks.services import reject_task, resubmit_task, create_timeline_reorder_request
from .models import DailyReport, DailyTaskWork, DelayReport
from .progress import calculate_task_progress
from .models import DailyReportAttachment
from activity.models import ActivityLog
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.files.storage import FileSystemStorage
from tempfile import TemporaryDirectory
from unittest.mock import patch


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


    def review_work(self, entry, decision="verify", note="Measured on site"):
        response = self.client.post(reverse(f"reports:daily-task-work-{decision}", args=[entry.id]), {"verification_note": note}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        return response

    def test_progress_uses_submitted_verified_work_and_accumulates(self):
        self.assertEqual(calculate_task_progress(self.task)["progress_percentage"], "0.00")
        self.review_work(self.work("25"))
        self.assertEqual(calculate_task_progress(self.task)["progress_percentage"], "25.00")
        self.review_work(self.work("15"))
        self.work("10")  # Pending
        self.review_work(self.work("10"), "reject", "Not measured")
        draft = self.work("10", submitted=False)
        DailyTaskWork.objects.filter(pk=draft.pk).update(verification_status="VERIFIED", verified_by=self.admin, verified_at=timezone.now())
        progress = calculate_task_progress(self.task)
        self.assertEqual(progress["verified_quantity"], "40.000")
        self.assertEqual(progress["progress_percentage"], "40.00")
        self.task.work_status = "COMPLETED"
        self.task.save(update_fields=["work_status"])
        self.assertEqual(calculate_task_progress(self.task), progress)

    def test_progress_is_consistent_in_register_project_list_and_details(self):
        self.review_work(self.work("25"))
        detail = self.client.get(reverse("tasks:task-detail", args=[self.task.pk])).data["progress"]
        for url in [reverse("tasks:task-register"), reverse("tasks:project-task-list-create", args=[self.project.pk])]:
            for user in [self.admin, self.supervisor]:
                self.client.force_authenticate(user)
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["results"][0]["progress"], detail)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(reverse("tasks:task-detail", args=[self.task.pk])).status_code, 404)

    def test_progress_batch_query_count_is_constant(self):
        from tasks.serializers import TaskListSerializer
        tasks = [self.task]
        for index in range(20):
            tasks.append(Task.objects.create(project=self.project, created_by=self.supervisor, title=f"Batch {index}", approval_status="APPROVED"))
        with self.assertNumQueries(1):
            rows = TaskListSerializer(tasks, many=True).data
        self.assertEqual(len(rows), 21)
        self.assertTrue(all(row["progress"]["progress_percentage"] == "0.00" for row in rows))

    def test_completion_progress_requires_verified_claim_and_does_not_set_status(self):
        self.task.measurement_method = "COMPLETION_ONLY"
        self.task.planned_quantity = None
        self.task.measurement_unit = None
        self.task.work_status = "COMPLETED"
        self.task.save()
        entry = self.work()
        entry.quantity_completed_today = None
        entry.completion_claimed = True
        entry.save()
        self.assertEqual(calculate_task_progress(self.task)["progress_percentage"], "0.00")
        self.task.work_status = "IN_PROGRESS"
        self.task.save(update_fields=["work_status"])
        self.review_work(entry)
        self.assertEqual(calculate_task_progress(self.task)["progress_percentage"], "100.00")
        self.task.refresh_from_db()
        self.assertEqual(self.task.work_status, "IN_PROGRESS")
        other = self.work()
        other.quantity_completed_today = None
        other.completion_claimed = True
        other.save()
        self.assertEqual(self.client.post(reverse("reports:daily-task-work-verify", args=[other.pk]), {}, format="json").status_code, 400)

    def test_unavailable_progress_and_legacy_oververified_quantity(self):
        from .progress import verified_work_totals
        totals = verified_work_totals([self.task.pk])
        self.task.approval_status = "PENDING"
        self.assertIsNone(calculate_task_progress(self.task, totals)["progress_percentage"])
        self.task.approval_status = "APPROVED"
        for quantity, unit in [(None, "SQM"), (Decimal("0"), "SQM"), (Decimal("100"), None)]:
            self.task.planned_quantity, self.task.measurement_unit = quantity, unit
            self.assertIsNone(calculate_task_progress(self.task, totals)["progress_percentage"])
        self.task.planned_quantity, self.task.measurement_unit = Decimal("100"), "SQM"
        self.assertIsNone(calculate_task_progress(self.task, {self.task.pk: {"quantity": Decimal("101")}})["progress_percentage"])

    def test_corrected_work_counts_only_after_verification(self):
        original = self.work("25")
        self.review_work(original, "reject", "Wrong measurement")
        corrected = self.work("20")
        corrected.correction_of = original
        corrected.save()
        self.assertEqual(calculate_task_progress(self.task)["progress_percentage"], "0.00")
        self.review_work(corrected)
        self.assertEqual(calculate_task_progress(self.task)["progress_percentage"], "20.00")
        original.refresh_from_db()
        self.assertEqual(original.verification_note, "Wrong measurement")

    def test_unified_daily_work_decisions_filters_pagination_and_privacy(self):
        original = self.work("25")
        self.review_work(original, "reject", "Original rejection")
        corrected = self.work("20")
        corrected.correction_of = original
        corrected.save()
        self.review_work(corrected)
        self.work()  # Pending is never a decision
        draft = self.work(submitted=False)
        DailyTaskWork.objects.filter(pk=draft.pk).update(verification_status="REJECTED", verified_by=self.admin, verified_at=timezone.now())
        url = reverse("tasks:task-decision-list")
        query = {"scope": "all", "type": "work", "project": self.project.pk, "task": self.task.pk, "reviewer": self.admin.pk, "sort": "oldest", "page_size": 1}
        response = self.client.get(url, query)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 2)
        row = response.data["results"][0]
        self.assertEqual(row["decision_id"], str(original.pk))
        self.assertEqual(row["decision_note"], "Original rejection")
        self.assertEqual(row["reviewer_name"], self.admin.username)
        self.assertIsNotNone(row["decision_date"])
        second = self.client.get(url, {**query, "page": 2})
        self.assertEqual(second.data["results"][0]["decision_id"], str(corrected.pk))
        for status in ["VERIFIED", "REJECTED"]:
            filtered = self.client.get(url, {**query, "status": status})
            self.assertEqual(filtered.data["count"], 1)
        for extra in [{"project": self.other_project.pk}, {"reviewer": self.supervisor.pk}, {"date_to": "2000-01-01"}, {"search": "no matching task"}, {"reviewer_search": "unmatched"}, {"task_search": "unmatched"}, {"category": uuid4()}]:
            self.assertEqual(self.client.get(url, {**query, **extra}).data["count"], 0)
        for extra in [{"task": "invalid"}, {"reviewer": "invalid"}, {"date_from": "2026-10-27", "date_to": "2026-10-01"}, {"sort": "invalid"}, {"status": "PENDING"}]:
            self.assertEqual(self.client.get(url, {**query, **extra}).status_code, 400)
        self.assertEqual(self.client.post(url, query).status_code, 405)
        self.client.force_authenticate(self.supervisor)
        self.assertEqual(self.client.get(url, query).status_code, 403)

    def test_daily_work_history_recovers_baseline_at_rejection(self):
        original = self.work("25")
        self.review_work(original, "reject", "Remeasure")
        from tasks.services import create_task_change_request, approve_task_change_request
        request = create_task_change_request(task_id=self.task.pk, supervisor=self.supervisor,
                                            new_values={"measurement_unit": "METER", "planned_quantity": "200"}, reason="Revised baseline")
        approve_task_change_request(change_request_id=request.pk, admin_user=self.admin)
        response = self.client.get(reverse("reports:daily-task-work-detail", args=[original.pk]))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["measurement_unit"], "METER")
        self.assertEqual(response.data["reviewed_baseline"]["measurement_unit"], "SQM")
        self.assertEqual(Decimal(response.data["reviewed_baseline"]["planned_quantity"]), Decimal("100"))
        self.assertEqual(response.data["verification_note"], "Remeasure")

    def test_unified_history_preserves_all_existing_decision_types(self):
        from tasks.models import TaskChangeRequest
        pending = Task.objects.create(project=self.project, created_by=self.supervisor, title="Review scope")
        reject_task(task_id=pending.pk, admin_user=self.admin, reason="Correct scope")
        for change_type in ["EDIT", "ORDER_CHANGE"]:
            TaskChangeRequest.objects.create(task=self.task, change_type=change_type, requested_by=self.supervisor, reason="Reorder", status="APPROVED", reviewed_by=self.admin, reviewed_at=timezone.now(), old_values={}, new_values={})
        delay = self.delay()
        self.post_decision("delay-report-approve", delay)
        self.post_decision("delay-extension-reject", delay, "Keep deadline")
        self.review_work(self.work())
        response = self.client.get(reverse("tasks:task-decision-list"), {"scope": "all", "page_size": 100})
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data["results"]
        self.assertEqual(len(rows), 6)
        self.assertEqual({row["decision_type"] for row in rows}, {"tasks", "changes", "timeline", "delay", "extension", "work"})
        self.assertEqual(next(row for row in rows if row["decision_type"] == "tasks")["decision_note"], "Correct scope")

    def test_delay_creation_validation_and_no_scheduling_side_effects(self):
        url = reverse("reports:task-delay-report-create", args=[self.task.pk])
        self.client.force_authenticate(self.supervisor)
        for invalid in [{"delay_type": "INVALID"}, {"reason": " "}, {"reason": "x" * 201}, {"extension_requested": True}, {"requested_end_date": "2026-11-01"}, {"extension_requested": True, "requested_end_date": "2026-10-30"}, {"expected_completion_date": "2026-09-30"}]:
            response = self.client.post(url, {"delay_type": "WEATHER", "reason": "Rain", **invalid}, format="json")
            self.assertEqual(response.status_code, 400, response.data)
        for delay_type in DelayReport.DelayType.values:
            response = self.client.post(url, {"delay_type": delay_type, "reason": "Valid delay", "extension_requested": False, "requested_end_date": None}, format="json")
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(response.data["status"], "PENDING")
            self.assertIsNone(response.data["extension_status"])
            self.assertTrue(response.data["deadline_history"]["submission_deadline_recorded"])
            self.assertEqual(response.data["deadline_history"]["deadline_at_submission"], "2026-10-30")
        self.task.refresh_from_db()
        self.assertEqual(self.task.work_status, "NOT_STARTED")
        self.assertEqual(self.task.end_date, date(2026, 10, 30))
        self.assertEqual(calculate_task_progress(self.task)["progress_percentage"], "0.00")

    def test_delay_read_and_create_permissions_remain_project_scoped(self):
        report = self.delay()
        url = reverse("reports:delay-report-detail", args=[report.pk])
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get(reverse("reports:delay-report-list")).data["summary"]["total"], 0)
        create_url = reverse("reports:task-delay-report-create", args=[self.task.pk])
        self.assertEqual(self.client.post(create_url, {"delay_type": "WEATHER", "reason": "Rain"}).status_code, 404)
        for user, flag in [(self.admin, "is_staff"), (self.supervisor, "is_active"), (self.supervisor, "is_staff")]:
            original = getattr(user, flag)
            setattr(user, flag, not original)
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(url).status_code, 403)
            self.assertEqual(self.client.get(reverse("reports:delay-report-list")).status_code, 403)
            setattr(user, flag, original)

    def test_delay_register_pagination_filters_and_complete_summary(self):
        report = self.delay()
        self.post_decision("delay-report-approve", report)
        self.post_decision("delay-extension-reject", report, "Keep deadline")
        second = DelayReport.objects.create(task=self.task, reported_by=self.supervisor, delay_type="WEATHER", reason="Rain blocking access")
        third = DelayReport.objects.create(task=self.task, reported_by=self.supervisor, delay_type="OTHER", reason="Rejected explanation", status="REJECTED", reviewed_by=self.admin, reviewed_at=timezone.now())
        url = reverse("reports:delay-report-list")
        response = self.client.get(url, {"project": self.project.pk, "page_size": 1, "sort": "oldest"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(response.data["summary"], {"total": 3, "pending": 1, "approved": 1, "rejected": 1, "pending_extensions": 0, "approved_extensions": 0})
        self.assertEqual(response.data["results"][0]["id"], str(report.pk))
        checks = [({"search": "Rain access"}, second.pk), ({"delay_type": "OTHER"}, third.pk), ({"status": "APPROVED"}, report.pk), ({"extension_requested": "true", "extension_status": "REJECTED"}, report.pk)]
        for filters, expected in checks:
            filtered = self.client.get(url, filters)
            self.assertEqual(filtered.data["count"], 1)
            self.assertEqual(filtered.data["results"][0]["id"], str(expected))
            self.assertEqual(filtered.data["summary"]["total"], 3)
        self.assertEqual(self.client.get(url, {"extension_requested": "false"}).data["count"], 2)
        self.assertEqual(self.client.get(url, {"date_to": "2000-01-01"}).data["count"], 0)
        self.assertEqual(self.client.get(url, {"project_search": "unmatched"}).data["count"], 0)
        for invalid in [{"extension_requested": "invalid"}, {"sort": "priority"}, {"date_from": "invalid"}, {"date_from": "2026-10-27", "date_to": "2026-10-01"}]:
            self.assertEqual(self.client.get(url, invalid).status_code, 400)

    def test_pending_delay_queue_includes_separate_extensions_after_report_decision(self):
        report = self.delay()
        url = reverse("reports:delay-report-list")
        self.assertEqual(self.client.get(url, {"pending_only": True}).data["count"], 1)
        self.post_decision("delay-report-reject", report, "Not accepted")
        response = self.client.get(url, {"pending_only": True})
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["extension_status"], "PENDING")
        self.assertEqual(self.post_decision("delay-extension-approve", report).status_code, 400)
        self.assertEqual(self.post_decision("delay-extension-reject", report, "No extension").status_code, 200)
        self.assertEqual(self.client.get(url, {"pending_only": True}).data["count"], 0)
        self.assertEqual(self.post_decision("delay-extension-reject", report, "Repeat").status_code, 400)
        self.task.refresh_from_db()
        self.assertEqual(self.task.end_date, date(2026, 10, 30))

    def test_extension_rejects_stale_submission_even_if_requested_date_is_later(self):
        report = self.delay()
        self.post_decision("delay-report-approve", report)
        Task.objects.filter(pk=self.task.pk).update(end_date=date(2026, 11, 5))
        response = self.post_decision("delay-extension-approve", report)
        self.assertEqual(response.status_code, 400)
        self.assertIn("changed after", response.data["requested_end_date"])
        self.task.refresh_from_db(); report.refresh_from_db()
        self.assertEqual(self.task.end_date, date(2026, 11, 5))
        self.assertEqual(report.extension_status, "PENDING")
        self.assertFalse(TaskHistory.objects.filter(task=self.task, action="EXTENSION_APPROVED").exists())

    def test_extension_dates_history_notifications_and_task_progress_stay_independent(self):
        self.review_work(self.work())
        before = calculate_task_progress(self.task)
        report = self.delay()
        self.post_decision("delay-report-approve", report)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_decision("delay-extension-approve", report, "Allow delivery time")
        self.assertEqual(response.status_code, 200, response.data)
        history = response.data["deadline_history"]
        self.assertEqual(history["previous_approved_deadline"], "2026-10-30")
        self.assertEqual(history["new_approved_deadline"], "2026-11-10")
        self.task.refresh_from_db()
        self.assertEqual(self.task.start_date, date(2026, 10, 1))
        self.assertEqual(self.task.work_status, "NOT_STARTED")
        self.assertEqual(calculate_task_progress(self.task), before)
        self.assertTrue(Notification.objects.filter(recipient=self.supervisor, notification_type="EXTENSION_REQUEST").exists())
        self.client.force_authenticate(self.supervisor)
        detail = self.client.get(reverse("reports:delay-report-detail", args=[report.pk]))
        self.assertEqual(detail.data["extension_admin_comment"], "Allow delivery time")
        self.assertEqual(detail.data["extension_reviewed_by_name"], self.admin.username)
        self.assertIsNotNone(detail.data["extension_reviewed_at"])
        timeline = self.client.get(reverse("tasks:project-timeline", args=[self.project.pk]))
        self.assertEqual(timeline.status_code, 200)
        self.assertEqual(timeline.data["tasks"][0]["end_date"], "2026-11-10")
        task = self.client.get(reverse("tasks:task-detail", args=[self.task.pk]))
        self.assertEqual(task.data["end_date"], "2026-11-10")
        self.assertEqual(task.data["progress"], before)

    def test_delay_task_picker_is_paginated_and_uses_actual_eligibility(self):
        report = self.delay()
        for status in ["COMPLETED", "CANCELLED", "IN_PROGRESS"]:
            Task.objects.create(project=self.project, created_by=self.supervisor, title=status, approval_status="APPROVED", work_status=status)
        Task.objects.create(project=self.project, created_by=self.supervisor, title="Pending", approval_status="PENDING")
        self.client.force_authenticate(self.supervisor)
        response = self.client.get(reverse("tasks:task-register"), {"project": self.project.pk, "delay_eligible": True, "page_size": 1})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 2)
        page = self.client.get(reverse("tasks:task-register"), {"project": self.project.pk, "delay_eligible": True, "search": "Plastering"})
        self.assertTrue(page.data["results"][0]["has_pending_extension"])
        self.task.work_status = "COMPLETED"
        self.task.save(update_fields=["work_status"])
        self.assertEqual(self.client.post(reverse("reports:task-delay-report-create", args=[self.task.pk]), {"delay_type": "WEATHER", "reason": "Rain"}).status_code, 400)

    def test_legacy_delay_without_submission_snapshot_is_explicitly_unavailable(self):
        report = DelayReport.objects.create(task=self.task, reported_by=self.supervisor, delay_type="WEATHER", reason="Legacy rain")
        response = self.client.get(reverse("reports:delay-report-detail", args=[report.pk]))
        self.assertFalse(response.data["deadline_history"]["submission_deadline_recorded"])
        self.assertIsNone(response.data["deadline_history"]["deadline_at_submission"])

    def test_delay_register_audit_queries_are_batched(self):
        for index in range(20):
            DelayReport.objects.create(task=self.task, reported_by=self.supervisor, delay_type="WEATHER", reason=f"Rain {index}")
        with self.assertNumQueries(4):
            response = self.client.get(reverse("reports:delay-report-list"), {"page_size": 100})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 20)



@skipUnless(connection.vendor == "postgresql", "Report row-lock tests require PostgreSQL")
class DailyReportDeleteConcurrencyTests(TransactionTestCase):
    def setUp(self):
        ApprovalWorkflowTests.setUpTestData.__func__(self)

    def test_submit_and_delete_can_only_commit_one_transition(self):
        report = DailyReport.objects.create(project=self.project, reported_by=self.supervisor, report_date=date(2026, 10, 26), work_summary="Site diary")
        barrier = Barrier(2)
        actor_id, report_id = self.supervisor.id, report.id

        def act(action):
            close_old_connections()
            try:
                actor = get_user_model().objects.get(pk=actor_id)
                client = APIClient(); client.force_authenticate(actor)
                barrier.wait(timeout=10)
                if action == "submit":
                    return client.post(reverse("reports:daily-report-submit", args=[report_id]), {}).status_code
                return client.delete(reverse("reports:daily-report-detail", args=[report_id])).status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            submit = executor.submit(act, "submit")
            delete = executor.submit(act, "delete")
            statuses = (submit.result(timeout=20), delete.result(timeout=20))
        self.assertIn(statuses, [(200, 400), (404, 204)])
        if statuses[0] == 200:
            report.refresh_from_db()
            self.assertEqual(report.status, "SUBMITTED")
            self.assertFalse(ActivityLog.objects.filter(action="DAILY_REPORT_DELETED").exists())
        else:
            self.assertFalse(DailyReport.objects.filter(pk=report_id).exists())
            self.assertFalse(ActivityLog.objects.filter(action="DAILY_REPORT_SUBMITTED").exists())

    def test_concurrent_correction_draft_retries_create_one_report(self):
        source = DailyReport.objects.create(project=self.project, reported_by=self.supervisor, report_date=date(2026, 10, 26), work_summary="Source", status="SUBMITTED", submitted_at=timezone.now())
        DailyTaskWork.objects.create(daily_report=source, task=self.task, work_description="Rejected", quantity_completed_today=25, verification_status="REJECTED", verified_by=self.admin, verified_at=timezone.now(), verification_note="Remeasure")
        actor_id, project_id, source_id, draft_id = self.supervisor.id, self.project.id, source.id, uuid4()
        barrier = Barrier(2)

        def create():
            close_old_connections()
            try:
                client = APIClient(); client.force_authenticate(get_user_model().objects.get(pk=actor_id))
                barrier.wait(timeout=10)
                response = client.post(reverse("reports:project-daily-report-list-create", args=[project_id]), {"source_report": str(source_id), "client_id": str(draft_id), "report_date": "2026-10-26"}, format="json")
                return response.status_code, response.data.get("id")
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as executor:
            first, second = executor.submit(create), executor.submit(create)
            self.assertEqual(first.result(timeout=20), (201, str(draft_id)))
            self.assertEqual(second.result(timeout=20), (201, str(draft_id)))
        self.assertEqual(DailyReport.objects.filter(status="DRAFT").count(), 1)
        self.assertEqual(ActivityLog.objects.filter(action="DAILY_REPORT_CREATED", entity_id=draft_id).count(), 1)


class DailyReportsWorkspaceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ApprovalWorkflowTests.setUpTestData.__func__(cls)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.supervisor)

    def create_report(self, **fields):
        response = self.client.post(reverse("reports:project-daily-report-list-create", args=[self.project.id]), {"report_date": "2026-10-26", **fields}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return DailyReport.objects.get(id=response.data["id"])

    def add_work(self, report, **fields):
        response = self.client.post(reverse("reports:daily-task-work-list-create", args=[report.id]), {"task": str(self.task.id), "work_description": "Measured plastering", "quantity_completed_today": "25", **fields}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return DailyTaskWork.objects.get(id=response.data["id"])

    def submit(self, report):
        return self.client.post(reverse("reports:daily-report-submit", args=[report.id]), {}, format="json")

    def rejected_source(self):
        report = self.create_report(work_summary="Original diary", site_notes="Original site notes", weather_condition="RAINY", issues="Safety observation", next_day_plan="Continue work")
        entry = self.add_work(report)
        self.assertEqual(self.submit(report).status_code, 200)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(reverse("reports:daily-task-work-reject", args=[entry.id]), {"verification_note": "Remeasure the wall"}).status_code, 200)
        self.client.force_authenticate(self.supervisor)
        return report, entry

    def test_correction_source_eligibility_ownership_and_independent_retry_safe_draft(self):
        source, entry = self.rejected_source()
        url = reverse("reports:project-daily-report-list-create", args=[self.project.id])
        detail = self.client.get(reverse("reports:daily-report-detail", args=[source.id]))
        self.assertEqual(detail.data["correction_summary"]["eligible_count"], 1)
        self.assertEqual(detail.data["correction_summary"]["entries"][0]["verification_note"], "Remeasure the wall")
        listed = self.client.get(url).data["results"][0]
        self.assertEqual(listed["correction_summary"]["rejected_count"], 1)
        client_id = str(uuid4())
        payload = {"source_report": str(source.id), "client_id": client_id, "report_date": "2026-10-25", "work_summary": "Reviewed copied diary", "site_notes": source.site_notes}
        for _ in range(2):
            response = self.client.post(url, payload, format="json")
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(response.data["id"], client_id)
        draft = DailyReport.objects.get(pk=client_id)
        self.assertEqual(draft.report_date, date(2026, 10, 25))
        self.assertEqual(draft.work_entries.count(), 0)
        self.assertEqual(draft.attachments.count(), 0)
        self.assertEqual(DailyReport.objects.count(), 2)
        self.assertEqual(ActivityLog.objects.filter(action="DAILY_REPORT_CREATED", entity_id=client_id).count(), 1)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(reverse("reports:daily-report-detail", args=[draft.id])).status_code, 404)
        self.assertEqual(self.client.post(url, {**payload, "client_id": str(uuid4())}, format="json").status_code, 403)
        self.client.force_authenticate(self.other)
        ProjectSupervisor.objects.create(project=self.project, supervisor=self.other, assigned_by=self.admin)
        self.assertEqual(self.client.post(url, {**payload, "client_id": str(uuid4())}, format="json").status_code, 403)
        self.client.force_authenticate(self.supervisor)
        self.assertEqual(self.client.patch(reverse("reports:daily-report-detail", args=[draft.id]), {"source_report": str(source.id)}, format="json").status_code, 400)
        source.refresh_from_db(); entry.refresh_from_db()
        self.assertEqual(source.work_summary, "Original diary")
        self.assertEqual(source.status, "SUBMITTED")
        self.assertEqual(entry.verification_status, "REJECTED")

    def test_correction_prefill_rejects_drafts_no_rejections_and_foreign_projects(self):
        draft = self.create_report(work_summary="No rejected work")
        url = reverse("reports:project-daily-report-list-create", args=[self.project.id])
        payload = {"report_date": "2026-10-26", "source_report": str(draft.id)}
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 400)
        self.submit(draft)
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 400)
        source, entry = self.rejected_source()
        ProjectSupervisor.objects.create(project=self.other_project, supervisor=self.supervisor, assigned_by=self.admin)
        self.assertEqual(self.client.post(reverse("reports:project-daily-report-list-create", args=[self.other_project.id]), {**payload, "source_report": str(source.id)}, format="json").status_code, 403)
        Task.objects.filter(pk=entry.task_id).update(work_status="CANCELLED")
        self.assertEqual(self.client.post(url, {**payload, "source_report": str(source.id)}, format="json").status_code, 400)

    def test_multiple_corrections_exclude_verified_pending_and_preserve_progress(self):
        source, rejected = self.rejected_source()
        completion_task = Task.objects.create(project=self.project, created_by=self.supervisor, title="Inspection", approval_status="APPROVED", measurement_method="COMPLETION_ONLY", completion_criteria="Signed inspection")
        rejected_completion = DailyTaskWork.objects.create(daily_report=source, task=completion_task, work_description="Original inspection", completion_claimed=True, verification_status="REJECTED", verified_by=self.admin, verified_at=timezone.now(), verification_note="Provide inspection evidence")
        verified_task = Task.objects.create(project=self.project, created_by=self.supervisor, title="Verified paint", approval_status="APPROVED", measurement_method="QUANTITY", planned_quantity=100, measurement_unit="SQM")
        verified = DailyTaskWork.objects.create(daily_report=source, task=verified_task, work_description="Accepted work", quantity_completed_today=10, verification_status="VERIFIED", verified_by=self.admin, verified_at=timezone.now())
        pending_task = Task.objects.create(project=self.project, created_by=self.supervisor, title="Pending work", approval_status="APPROVED", measurement_method="COMPLETION_ONLY")
        pending = DailyTaskWork.objects.create(daily_report=source, task=pending_task, work_description="Pending measurement", completion_claimed=True)
        draft = self.create_report(source_report=str(source.id), client_id=str(uuid4()), work_summary=source.work_summary)
        corrections = []
        for original, values in [(rejected, {"quantity_completed_today": "20"}), (rejected_completion, {"completion_claimed": True})]:
            url = reverse("reports:daily-task-work-correct", args=[original.id])
            payload = {"new_daily_report": str(draft.id), "work_description": "Corrected measurement", **values}
            response = self.client.post(url, payload, format="json")
            self.assertEqual(response.status_code, 201, response.data)
            retry = self.client.post(url, payload, format="json")
            self.assertEqual(retry.status_code, 201, retry.data)
            self.assertEqual(retry.data["id"], response.data["id"])
            corrections.append(response.data["id"])
            other_draft = self.create_report()
            self.assertEqual(self.client.post(url, {**payload, "new_daily_report": str(other_draft.id)}, format="json").status_code, 400)
        self.assertEqual(draft.work_entries.count(), 2)
        summary = self.client.get(reverse("reports:daily-report-detail", args=[source.id])).data["correction_summary"]
        self.assertEqual(summary["eligible_count"], 0)
        self.assertTrue(all(row["correction_report"]["status"] == "DRAFT" for row in summary["entries"]))
        self.assertEqual(calculate_task_progress(verified_task)["verified_quantity"], "10.000")
        for reference in [verified, pending]:
            response = self.client.post(reverse("reports:daily-task-work-correct", args=[reference.id]), {"new_daily_report": str(draft.id), "work_description": "Illegal correction", "completion_claimed": True}, format="json")
            self.assertEqual(response.status_code, 400)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(reverse("reports:daily-work-queue")).data["count"], 4)
        self.client.force_authenticate(self.supervisor)
        self.assertEqual(self.submit(draft).status_code, 200)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(reverse("reports:daily-work-queue"), {"status": "PENDING"}).data["count"], 3)
        row = self.client.get(reverse("reports:daily-task-work-detail", args=[corrections[0]])).data
        self.assertEqual(row["original_work"]["quantity_completed_today"], "25.000")
        self.assertEqual(row["original_work"]["verification_note"], "Remeasure the wall")
        self.assertEqual(self.client.post(reverse("reports:daily-task-work-verify", args=[corrections[0]]), {}).status_code, 200)
        self.assertEqual(calculate_task_progress(self.task)["verified_quantity"], "20.000")
        self.assertEqual(calculate_task_progress(verified_task)["verified_quantity"], "10.000")
        rejected.refresh_from_db(); pending.refresh_from_db(); source.refresh_from_db()
        self.assertEqual(rejected.verification_status, "REJECTED")
        self.assertEqual(pending.verification_status, "PENDING")
        self.assertEqual(source.status, "SUBMITTED")

    def test_confirmed_site_rows_are_retry_safe_and_partial_draft_can_be_deleted(self):
        source, original = self.rejected_source()
        draft = self.create_report(source_report=str(source.id), client_id=str(uuid4()))
        for name, payload, relation in [("daily-manpower-list-create", {"trade": "MASON", "worker_count": 2, "client_id": str(uuid4())}, "manpower_entries"), ("daily-material-list-create", {"material_name": "Cement", "entry_type": "USED", "quantity": "2", "unit": "bags", "client_id": str(uuid4())}, "material_entries")]:
            url = reverse(f"reports:{name}", args=[draft.id])
            first = self.client.post(url, payload, format="json")
            second = self.client.post(url, payload, format="json")
            self.assertEqual(first.status_code, 201, first.data)
            self.assertEqual(second.status_code, 201, second.data)
            self.assertEqual(first.data["id"], second.data["id"])
            self.assertEqual(getattr(draft, relation).count(), 1)
        self.assertEqual(self.client.post(reverse("reports:daily-material-list-create", args=[draft.id]), {"material_name": "Invalid", "quantity": -1}, format="json").status_code, 400)
        self.assertEqual(self.client.get(reverse("reports:daily-report-detail", args=[draft.id])).status_code, 200)
        self.assertEqual(self.client.delete(reverse("reports:daily-report-detail", args=[draft.id])).status_code, 204)
        self.assertTrue(DailyReport.objects.filter(pk=source.id).exists())
        self.assertTrue(DailyTaskWork.objects.filter(pk=original.id, verification_status="REJECTED").exists())
        replay = self.client.post(reverse("reports:project-daily-report-list-create", args=[self.project.id]), {"source_report": str(source.id), "client_id": str(draft.id), "report_date": "2026-10-26"}, format="json")
        self.assertEqual(replay.status_code, 400)
        self.assertFalse(DailyReport.objects.filter(pk=draft.id).exists())

    def test_correction_original_evidence_is_not_copied_and_upload_retry_is_safe(self):
        source, _ = self.rejected_source()
        field = DailyReportAttachment._meta.get_field("file")
        with TemporaryDirectory() as root, patch.object(field, "storage", FileSystemStorage(location=root)):
            original = source.attachments.create(original_filename="original.pdf", file_size=16, uploaded_by=self.supervisor)
            original.file.save("original.pdf", SimpleUploadedFile("original.pdf", b"%PDF-1.4\nOriginal"))
            draft = self.create_report(source_report=str(source.id), client_id=str(uuid4()))
            self.assertEqual(draft.attachments.count(), 0)
            client_id = str(uuid4())
            for _ in range(2):
                response = self.client.post(reverse("reports:daily-report-attachment-upload", args=[draft.id]), {"client_id": client_id, "file": SimpleUploadedFile("new.pdf", b"%PDF-1.4\nNew evidence", content_type="application/pdf")}, format="multipart")
                self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(draft.attachments.count(), 1)
            new = draft.attachments.get()
            self.assertNotEqual(new.file.name, original.file.name)
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(self.client.delete(reverse("reports:daily-report-detail", args=[draft.id])).status_code, 204)
            self.assertFalse(new.file.storage.exists(new.file.name))
            self.assertTrue(original.file.storage.exists(original.file.name))
            self.assertTrue(DailyReportAttachment.objects.filter(pk=original.id).exists())

    def test_draft_privacy_covers_all_nested_resources_counts_and_reporters(self):
        report = self.create_report(work_summary="Private diary")
        work = self.add_work(report)
        manpower = report.manpower_entries.create(trade="MASON", worker_count=2)
        material = report.material_entries.create(material_name="Cement", entry_type="USED")
        attachment = report.attachments.create(file="private.pdf", original_filename="private.pdf", file_size=10, uploaded_by=self.supervisor)
        list_url = reverse("reports:project-daily-report-list-create", args=[self.project.id])
        paths = [("daily-report-detail", report.id), ("daily-task-work-detail", work.id), ("daily-manpower-detail", manpower.id), ("daily-material-detail", material.id), ("daily-report-attachment-detail", attachment.id), ("daily-report-attachment-download", attachment.id)]
        paths += [(name, report.id) for name in ["daily-task-work-list-create", "daily-manpower-list-create", "daily-material-list-create", "daily-report-attachment-upload"]]
        self.assertEqual(self.client.get(list_url).data["count"], 1)
        self.assertEqual(self.client.get(reverse("reports:daily-report-detail", args=[report.id])).status_code, 200)
        ProjectSupervisor.objects.create(project=self.project, supervisor=self.other, assigned_by=self.admin)
        for user in [self.admin, self.other]:
            self.client.force_authenticate(user)
            listing = self.client.get(list_url)
            self.assertEqual(listing.data["count"], 0)
            self.assertEqual(listing.data["summary"]["total"], 0)
            self.assertEqual(listing.data["reporters"], [])
            if user == self.admin:
                self.assertNotIn("drafts", listing.data["summary"])
            for name, pk in paths:
                self.assertEqual(self.client.get(reverse(f"reports:{name}", args=[pk]), {"preview": 1}).status_code, 404, name)
            self.assertEqual(self.client.delete(reverse("reports:daily-report-detail", args=[report.id])).status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(reverse("reports:daily-task-work-verify", args=[work.id]), {}).status_code, 400)
        self.client.force_authenticate(self.supervisor)
        self.assertEqual(self.submit(report).status_code, 200)
        for user in [self.admin, self.other]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(list_url).data["count"], 1)
            self.assertEqual(self.client.get(reverse("reports:daily-task-work-detail", args=[work.id])).status_code, 200)

    def test_own_draft_deletion_removes_children_and_private_files_after_commit(self):
        report = self.create_report(work_summary="Draft evidence")
        work = self.add_work(report)
        report.manpower_entries.create(trade="MASON", worker_count=2)
        report.material_entries.create(material_name="Sand", entry_type="REQUIRED")
        field = DailyReportAttachment._meta.get_field("file")
        with TemporaryDirectory() as root, patch.object(field, "storage", FileSystemStorage(location=root)):
            response = self.client.post(reverse("reports:daily-report-attachment-upload", args=[report.id]), {"file": SimpleUploadedFile("draft.pdf", b"%PDF-1.4\nDraft", content_type="application/pdf"), "task_work": str(work.id)}, format="multipart")
            self.assertEqual(response.status_code, 201)
            attachment = DailyReportAttachment.objects.get(pk=response.data["id"])
            storage, name = attachment.file.storage, attachment.file.name
            with self.captureOnCommitCallbacks(execute=True) as callbacks:
                response = self.client.delete(reverse("reports:daily-report-detail", args=[report.id]))
                self.assertEqual(response.status_code, 204)
                self.assertTrue(storage.exists(name))
            self.assertEqual(len(callbacks), 1)
            self.assertFalse(storage.exists(name))
            self.assertFalse(DailyReport.objects.filter(pk=report.id).exists())
            self.assertFalse(DailyTaskWork.objects.filter(pk=work.id).exists())
            self.assertTrue(Task.objects.filter(pk=self.task.id).exists())
            self.assertTrue(ActivityLog.objects.filter(action="DAILY_REPORT_DELETED", entity_id=report.id).exists())

    def test_submitted_admin_inactive_and_unassigned_deletion_are_blocked(self):
        report = self.create_report(work_summary="Site diary")
        url = reverse("reports:daily-report-detail", args=[report.id])
        self.supervisor.is_active = False
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.supervisor.is_active = True
        ProjectSupervisor.objects.filter(project=self.project, supervisor=self.supervisor).delete()
        self.assertEqual(self.client.delete(url).status_code, 404)
        ProjectSupervisor.objects.create(project=self.project, supervisor=self.supervisor, assigned_by=self.admin)
        self.assertEqual(self.submit(report).status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 400)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(url).status_code, 403)
        self.assertTrue(DailyReport.objects.filter(pk=report.id).exists())

    def test_delete_audit_failure_rolls_back_children_and_preserves_files(self):
        report = self.create_report(work_summary="Draft")
        work = self.add_work(report)
        attachment = report.attachments.create(file="preserved.pdf", original_filename="preserved.pdf", file_size=10, uploaded_by=self.supervisor)
        with patch("reports.services.create_activity_log", side_effect=RuntimeError("Audit unavailable")), patch.object(attachment.file.storage, "delete") as remove:
            with self.captureOnCommitCallbacks(execute=True):
                with self.assertRaises(RuntimeError):
                    self.client.delete(reverse("reports:daily-report-detail", args=[report.id]))
            remove.assert_not_called()
        self.assertTrue(DailyReport.objects.filter(pk=report.id).exists())
        self.assertTrue(DailyTaskWork.objects.filter(pk=work.id).exists())
        self.assertTrue(DailyReportAttachment.objects.filter(pk=attachment.id).exists())

    def test_previews_verify_mime_inline_allowlist_and_keep_download(self):
        report = self.create_report(work_summary="Evidence")
        field = DailyReportAttachment._meta.get_field("file")
        picture = BytesIO(); Image.new("RGB", (4, 3), "white").save(picture, format="PNG")
        with TemporaryDirectory() as root, patch.object(field, "storage", FileSystemStorage(location=root)):
            for filename, content, mime in [("image.png", picture.getvalue(), "image/png"), ("evidence.pdf", b"%PDF-1.4\nEvidence", "application/pdf")]:
                response = self.client.post(reverse("reports:daily-report-attachment-upload", args=[report.id]), {"file": SimpleUploadedFile(filename, content, content_type=mime)}, format="multipart")
                self.assertEqual(response.status_code, 201, response.data)
                url = reverse("reports:daily-report-attachment-download", args=[response.data["id"]])
                for preview in [False, True]:
                    stream = self.client.get(url, {"preview": 1} if preview else {})
                    self.assertEqual(stream["Content-Type"], mime)
                    self.assertTrue(stream["Content-Disposition"].startswith("inline" if preview else "attachment"))
                    self.assertEqual(stream["X-Content-Type-Options"], "nosniff")
                    self.assertEqual(b"".join(stream.streaming_content), content)
                self.client.force_authenticate(self.admin)
                self.assertEqual(self.client.get(url, {"preview": 1}).status_code, 404)
                self.client.force_authenticate(self.supervisor)
            self.submit(report)
            self.client.force_authenticate(self.admin)
            stream = self.client.get(url, {"preview": 1})
            self.assertEqual(stream.status_code, 200)
            self.assertIn("inline", stream["Content-Disposition"])
            b"".join(stream.streaming_content)
            # Unknown legacy files and misleading image names never render inline.
            for filename in ["legacy.docx", "fake.png"]:
                self.client.force_authenticate(self.supervisor)
                draft = self.create_report()
                attachment = draft.attachments.create(original_filename=filename, file_size=10, uploaded_by=self.supervisor)
                attachment.file.save(filename, SimpleUploadedFile(filename, b"<html>unsafe</html>"))
                stream = self.client.get(reverse("reports:daily-report-attachment-download", args=[attachment.id]), {"preview": 1})
                self.assertEqual(stream["Content-Type"], "application/octet-stream")
                self.assertIn("attachment", stream["Content-Disposition"])
                b"".join(stream.streaming_content)

    def test_blank_drafts_multiple_reports_same_date_and_explanatory_no_work_submission(self):
        first, second = self.create_report(), self.create_report()
        self.assertNotEqual(first.id, second.id)
        self.assertEqual(first.work_summary, "")
        self.assertEqual(self.submit(first).status_code, 400)
        response = self.client.patch(reverse("reports:daily-report-detail", args=[first.id]), {"work_summary": "No work due to heavy rain", "weather_condition": "HEAVY_RAIN"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.submit(first).status_code, 200)
        first.refresh_from_db(); self.task.refresh_from_db()
        self.assertEqual(first.status, "SUBMITTED")
        self.assertEqual(self.task.work_status, "NOT_STARTED")

    def test_full_draft_records_become_read_only_after_submission(self):
        report = self.create_report(work_summary="Plastering on first floor")
        work = self.add_work(report)
        manpower_url = reverse("reports:daily-manpower-list-create", args=[report.id])
        materials_url = reverse("reports:daily-material-list-create", args=[report.id])
        self.assertEqual(self.client.post(manpower_url, {"trade": "MASON", "contractor_name": "Site contractor", "worker_count": 3, "hours_worked": "8", "remarks": "Wall work"}, format="json").status_code, 201)
        self.assertEqual(self.client.post(materials_url, {"material_name": "Cement", "entry_type": "USED", "quantity": "10", "unit": "bags"}, format="json").status_code, 201)
        self.assertEqual(self.submit(report).status_code, 200)
        for url, payload in [(reverse("reports:daily-report-detail", args=[report.id]), {"work_summary": "Changed evidence"}), (reverse("reports:daily-task-work-detail", args=[work.id]), {"work_description": "Changed measurement"})]:
            self.assertEqual(self.client.patch(url, payload, format="json").status_code, 400)
        self.assertEqual(self.client.post(manpower_url, {"trade": "MASON", "worker_count": 1}, format="json").status_code, 400)
        self.assertEqual(self.client.post(materials_url, {"material_name": "Sand", "entry_type": "REQUIRED"}, format="json").status_code, 400)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(manpower_url).data["count"], 1)
        self.assertEqual(self.client.get(materials_url).data["count"], 1)

    def test_project_register_has_complete_totals_filters_and_distinct_pending_work_count(self):
        draft = self.create_report(work_summary="Draft wall work")
        self.add_work(draft)
        submitted = self.create_report(work_summary="Submitted concrete work")
        self.add_work(submitted)
        self.submit(submitted)
        url = reverse("reports:project-daily-report-list-create", args=[self.project.id])
        response = self.client.get(url, {"page_size": 1, "status": "DRAFT", "search": "wall", "date_from": "2026-10-26", "date_to": "2026-10-26", "reported_by": self.supervisor.id})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["summary"], {"total": 2, "drafts": 1, "submitted": 1, "pending_work": 1})
        self.assertEqual(response.data["results"][0]["work_counts"], {"pending": 1, "verified": 0, "rejected": 0})
        first = self.client.get(url, {"page_size": 1, "sort": "oldest"})
        second = self.client.get(url, {"page_size": 1, "sort": "oldest", "page": 2})
        self.assertNotEqual(first.data["results"][0]["id"], second.data["results"][0]["id"])
        self.assertIsNotNone(first.data["next"])
        for params in [{"status": "APPROVED"}, {"date_from": "bad"}, {"date_from": "2026-10-26", "date_to": "2026-10-25"}, {"reported_by": "bad"}]:
            self.assertEqual(self.client.get(url, params).status_code, 400)

    def test_permissions_block_cross_project_work_and_other_supervisor_draft_edits(self):
        report = self.create_report(work_summary="Site work")
        foreign = Task.objects.create(project=self.other_project, created_by=self.other, title="Other task", approval_status="APPROVED", measurement_method="COMPLETION_ONLY")
        response = self.client.post(reverse("reports:daily-task-work-list-create", args=[report.id]), {"task": str(foreign.id), "work_description": "Foreign work", "completion_claimed": True}, format="json")
        self.assertEqual(response.status_code, 400)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(reverse("reports:project-daily-report-list-create", args=[self.project.id])).status_code, 404)
        ProjectSupervisor.objects.create(project=self.project, supervisor=self.other, assigned_by=self.admin)
        self.assertEqual(self.client.get(reverse("reports:daily-report-detail", args=[report.id])).status_code, 404)
        self.assertEqual(self.client.patch(reverse("reports:daily-report-detail", args=[report.id]), {"work_summary": "Not my draft"}, format="json").status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(reverse("reports:daily-report-detail", args=[report.id]), {"work_summary": "Admin rewrite"}, format="json").status_code, 404)

    def test_submitted_entry_verification_and_audited_correction_preserve_original(self):
        report = self.create_report(work_summary="Plastering")
        entry = self.add_work(report)
        self.submit(report)
        verify = reverse("reports:daily-task-work-verify", args=[entry.id])
        reject = reverse("reports:daily-task-work-reject", args=[entry.id])
        self.assertEqual(self.client.post(verify, {}, format="json").status_code, 403)
        self.assertEqual(self.client.post(reject, {"verification_note": "Not authorized"}, format="json").status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(reject, {}, format="json").status_code, 400)
        self.assertEqual(self.client.post(reject, {"verification_note": "Remeasure on site"}, format="json").status_code, 200)
        self.assertEqual(calculate_task_progress(self.task)["verified_quantity"], "0.000")
        self.client.force_authenticate(self.supervisor)
        draft = self.create_report(work_summary="Corrected site measurements")
        correction = self.client.post(reverse("reports:daily-task-work-correct", args=[entry.id]), {"new_daily_report": str(draft.id), "work_description": "Corrected plastering", "quantity_completed_today": "20"}, format="json")
        self.assertEqual(correction.status_code, 201, correction.data)
        original = self.client.get(reverse("reports:daily-task-work-detail", args=[entry.id]))
        self.assertEqual(original.data["verification_status"], "REJECTED")
        self.assertEqual(original.data["verification_note"], "Remeasure on site")
        self.assertEqual(original.data["correction_id"], correction.data["id"])
        self.client.force_authenticate(self.admin)
        self.assertIsNone(self.client.get(reverse("reports:daily-task-work-detail", args=[entry.id])).data["correction_id"])
        self.client.force_authenticate(self.supervisor)
        # Deleting a correction draft must preserve the rejected source entry.
        self.assertEqual(self.client.delete(reverse("reports:daily-report-detail", args=[draft.id])).status_code, 204)
        self.assertTrue(DailyTaskWork.objects.filter(pk=entry.id, verification_status="REJECTED").exists())
        draft = self.create_report(work_summary="Corrected site measurements")
        correction = self.client.post(reverse("reports:daily-task-work-correct", args=[entry.id]), {"new_daily_report": str(draft.id), "work_description": "Corrected plastering", "quantity_completed_today": "20"}, format="json")
        self.assertEqual(correction.status_code, 201, correction.data)
        self.assertEqual(self.submit(draft).status_code, 200)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(reverse("reports:daily-task-work-verify", args=[correction.data["id"]]), {"verification_note": "Measured"}, format="json").status_code, 200)
        self.assertEqual(calculate_task_progress(self.task)["verified_quantity"], "20.000")
        self.task.refresh_from_db()
        self.assertEqual(self.task.work_status, "NOT_STARTED")
        self.assertTrue(ActivityLog.objects.filter(action="DAILY_TASK_WORK_CORRECTED").exists())

    def test_private_attachments_upload_download_and_submitted_evidence_lock(self):
        report = self.create_report(work_summary="Site photographs and evidence")
        entry = self.add_work(report)
        field = DailyReportAttachment._meta.get_field("file")
        with TemporaryDirectory() as root, patch.object(field, "storage", FileSystemStorage(location=root)):
            url = reverse("reports:daily-report-attachment-upload", args=[report.id])
            response = self.client.post(url, {"file": SimpleUploadedFile("evidence.pdf", b"%PDF-1.4\nSite evidence", content_type="application/pdf"), "task_work": str(entry.id), "caption": "Measured wall"}, format="multipart")
            self.assertEqual(response.status_code, 201, response.data)
            self.assertNotIn("file", response.data)
            self.assertEqual(str(response.data["task_work"]), str(entry.id))
            download = reverse("reports:daily-report-attachment-download", args=[response.data["id"]])
            file_response = self.client.get(download)
            self.assertEqual(file_response.status_code, 200)
            self.assertIn(b"Site evidence", b"".join(file_response.streaming_content))
            self.submit(report)
            remove = reverse("reports:daily-report-attachment-detail", args=[response.data["id"]])
            self.assertEqual(self.client.delete(remove).status_code, 400)
            self.client.force_authenticate(self.other)
            self.assertEqual(self.client.get(download).status_code, 404)
            self.client.force_authenticate(None)
            self.assertEqual(self.client.get(download).status_code, 401)
