from datetime import date
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from projects.models import Project, ProjectCategory, ProjectSupervisor
from .models import DailyReport


class SupervisorDailyReportRegisterTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username="super-register-admin", first_name="Admin", phone="+919111118001", email="super-register-admin@test.com", role="ADMIN", is_staff=True)
        cls.user = User.objects.create_user(username="register-owner", first_name="Owner", phone="+919111118002", email="register-owner@test.com", role="SUPERVISOR")
        cls.other = User.objects.create_user(username="register-other", first_name="Other", phone="+919111118003", email="register-other@test.com", role="SUPERVISOR")
        category = ProjectCategory.objects.create(name="Supervisor register category")
        cls.alpha = Project.objects.create(name="Alpha Residence", category=category, created_by=cls.admin)
        cls.beta = Project.objects.create(name="Beta Studio", category=category, created_by=cls.admin)
        cls.revoked = Project.objects.create(name="Private former assignment", category=category, created_by=cls.admin)
        cls.empty = Project.objects.create(name="Empty assigned site", category=category, created_by=cls.admin)
        for project in [cls.alpha, cls.beta, cls.empty]:
            ProjectSupervisor.objects.create(project=project, supervisor=cls.user, assigned_by=cls.admin)
        cls.submitted = DailyReport.objects.create(project=cls.alpha, reported_by=cls.user, report_date=date(2026, 11, 1), work_summary="Foundation inspected", status="SUBMITTED", submitted_at=timezone.now())
        cls.draft = DailyReport.objects.create(project=cls.beta, reported_by=cls.user, report_date=date(2026, 11, 2), work_summary="Roof draft", status="DRAFT")
        DailyReport.objects.create(project=cls.alpha, reported_by=cls.other, report_date=date(2026, 11, 3), status="SUBMITTED", submitted_at=timezone.now())
        DailyReport.objects.create(project=cls.alpha, reported_by=cls.other, report_date=date(2026, 11, 4), status="DRAFT")
        DailyReport.objects.create(project=cls.revoked, reported_by=cls.user, report_date=date(2026, 11, 5), status="DRAFT")

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = reverse("reports:supervisor-daily-report-list")

    def test_own_reports_only_with_assigned_project_options_and_scoped_totals(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual([row["id"] for row in response.data["results"]], [str(self.draft.id), str(self.submitted.id)])
        self.assertEqual(response.data["summary"], {"total": 2, "drafts": 1, "submitted": 1, "pending_work": 0})
        self.assertEqual(response.data["summary_scope"], "my_reports_in_assigned_projects")
        self.assertCountEqual([row["project_id"] for row in response.data["projects"]], [self.alpha.id, self.beta.id, self.empty.id])
        self.assertEqual(len(response.data["reporters"]), 1)
        self.assertEqual(self.client.get(self.url, {"project": str(self.revoked.id)}).data["count"], 0)
        self.assertEqual(self.client.get(self.url, {"reported_by": str(self.other.id)}).data["count"], 0)
        self.assertEqual(self.client.get(self.url, {"project": str(self.empty.id)}).data["count"], 0)

    def test_project_search_status_dates_and_sort_filters(self):
        for query in [{"project": str(self.beta.id)}, {"status": "DRAFT"}, {"search": "Beta"}, {"search": "Roof"}, {"date_from": "2026-11-02", "date_to": "2026-11-02"}]:
            response = self.client.get(self.url, query)
            self.assertEqual(response.status_code, 200)
            self.assertEqual([row["id"] for row in response.data["results"]], [str(self.draft.id)])
            self.assertEqual(response.data["summary"]["total"], 2)
        self.assertEqual(self.client.get(self.url, {"sort": "oldest"}).data["results"][0]["id"], str(self.submitted.id))
        self.assertEqual(self.client.get(self.url, {"status": "SUBMITTED"}).data["results"][0]["id"], str(self.submitted.id))

    def test_pagination_validation_and_revoked_assignment(self):
        response = self.client.get(self.url, {"page_size": 1})
        self.assertEqual(response.data["count"], 2)
        self.assertIsNotNone(response.data["next"])
        self.assertEqual(self.client.get(self.url, {"page_size": 1, "page": 2}).data["results"][0]["id"], str(self.submitted.id))
        for query in [{"project": "invalid"}, {"status": "invalid"}, {"date_from": "2026-11-10", "date_to": "2026-11-01"}]:
            self.assertEqual(self.client.get(self.url, query).status_code, 400)
        ProjectSupervisor.objects.filter(project=self.beta, supervisor=self.user).delete()
        self.assertEqual(self.client.get(self.url).data["count"], 1)

    def test_role_password_and_read_only_restrictions(self):
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 405)
        self.assertEqual(self.client.delete(self.url).status_code, 405)
        self.user.must_change_password = True
        self.user.save(update_fields=["must_change_password"])
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.url).status_code, [401, 403])
