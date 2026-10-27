from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from threading import Barrier
from unittest import skipUnless

from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection, connections
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from projects.models import Project, ProjectCategory, ProjectSupervisor
from tasks.models import Task, TaskHistory
from tasks.services import create_timeline_reorder_request, approve_timeline_reorder_request
from .models import DailyReport, DailyTaskWork, DelayReport
from .services import create_delay_report, verify_daily_task_work, approve_delay_report, approve_delay_extension, reject_delay_extension
from .progress import calculate_task_progress


@skipUnless(connection.vendor == "postgresql", "Row-lock concurrency checks require PostgreSQL")
class ApprovalConcurrencyTests(TransactionTestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(username="admin", first_name="Admin", phone="+919111111111", email="admin@test.com", role="ADMIN", is_staff=True)
        self.supervisor = User.objects.create_user(username="supervisor", first_name="Supervisor", phone="+919222222222", email="supervisor@test.com", role="SUPERVISOR")
        category = ProjectCategory.objects.create(name="Residential")
        self.project = Project.objects.create(name="Concurrent decisions", category=category, created_by=self.admin)
        ProjectSupervisor.objects.create(project=self.project, supervisor=self.supervisor, assigned_by=self.admin)
        self.task = Task.objects.create(project=self.project, created_by=self.supervisor, title="Measured task", approval_status="APPROVED", display_order=1, end_date=date(2026, 10, 30), measurement_method="QUANTITY", planned_quantity=Decimal("100"), measurement_unit="SQM")

    def race(self, operations):
        barrier = Barrier(len(operations))
        def run(operation):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                operation()
                return "accepted"
            except ValidationError:
                return "rejected"
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=len(operations)) as executor:
            futures = [executor.submit(run, operation) for operation in operations]
            return [future.result(timeout=20) for future in futures]

    def test_concurrent_work_verification_cannot_exceed_the_approved_baseline(self):
        entries = []
        for _ in range(2):
            report = DailyReport.objects.create(project=self.project, reported_by=self.supervisor, report_date=date(2026, 10, 23), work_summary="Measured work", status="SUBMITTED", submitted_at=timezone.now())
            entries.append(DailyTaskWork.objects.create(daily_report=report, task=self.task, work_description="Measured work", quantity_completed_today=Decimal("60")))
        results = self.race([lambda entry=entry: verify_daily_task_work(entry_id=entry.id, admin_user=self.admin) for entry in entries])
        self.assertCountEqual(results, ["accepted", "rejected"])
        self.assertEqual(calculate_task_progress(self.task)["verified_quantity"], "60.000")

    def test_concurrent_duplicate_extension_submission_creates_only_one_request(self):
        def submit():
            create_delay_report(task_id=self.task.id, supervisor=self.supervisor, data={"delay_type": "WEATHER", "reason": "Heavy rain", "extension_requested": True, "requested_end_date": "2026-11-10"})
        self.assertCountEqual(self.race([submit, submit]), ["accepted", "rejected"])
        self.assertEqual(DelayReport.objects.filter(extension_status="PENDING").count(), 1)

    def test_concurrent_timeline_decisions_apply_only_once(self):
        second = Task.objects.create(project=self.project, created_by=self.supervisor, title="Second task", approval_status="APPROVED", display_order=2)
        request = create_timeline_reorder_request(project=self.project, supervisor=self.supervisor, task_ids=[second.id, self.task.id], reason="Sequence")
        def approve():
            approve_timeline_reorder_request(request_id=request.id, admin_user=self.admin)
        self.assertCountEqual(self.race([approve, approve]), ["accepted", "rejected"])
        self.task.refresh_from_db(); second.refresh_from_db()
        self.assertEqual([self.task.display_order, second.display_order], [2, 1])


    def extension_request(self):
        report = create_delay_report(task_id=self.task.pk, supervisor=self.supervisor, data={"delay_type": "WEATHER", "reason": "Heavy rain", "extension_requested": True, "requested_end_date": "2026-11-10"})
        approve_delay_report(report_id=report.pk, admin_user=self.admin)
        return report

    def test_concurrent_extension_approvals_change_deadline_exactly_once(self):
        report = self.extension_request()
        def approve():
            approve_delay_extension(report_id=report.pk, admin_user=self.admin)
        self.assertCountEqual(self.race([approve, approve]), ["accepted", "rejected"])
        self.task.refresh_from_db(); report.refresh_from_db()
        self.assertEqual(self.task.end_date, date(2026, 11, 10))
        self.assertEqual(report.extension_status, "APPROVED")
        self.assertEqual(TaskHistory.objects.filter(task=self.task, action="EXTENSION_APPROVED").count(), 1)

    def test_concurrent_extension_approval_and_rejection_preserve_one_decision(self):
        report = self.extension_request()
        results = self.race([
            lambda: approve_delay_extension(report_id=report.pk, admin_user=self.admin),
            lambda: reject_delay_extension(report_id=report.pk, admin_user=self.admin, admin_comment="Keep deadline"),
        ])
        self.assertCountEqual(results, ["accepted", "rejected"])
        self.task.refresh_from_db(); report.refresh_from_db()
        expected = date(2026, 11, 10) if report.extension_status == "APPROVED" else date(2026, 10, 30)
        self.assertEqual(self.task.end_date, expected)
        self.assertEqual(report.status, "APPROVED")
        self.assertEqual(TaskHistory.objects.filter(task=self.task, action__in=["EXTENSION_APPROVED", "EXTENSION_REJECTED"]).count(), 1)
