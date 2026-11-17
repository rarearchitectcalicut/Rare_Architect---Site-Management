from datetime import date
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from projects.models import Project, ProjectCategory
from .models import DailyReport


class AdminDailyReportRegisterTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username="register-admin", first_name="Admin", phone="+919111110001", email="admin-register@test.com", role="ADMIN", is_staff=True)
        cls.first = User.objects.create_user(username="first-supervisor", first_name="First", phone="+919111110002", email="first-register@test.com", role="SUPERVISOR")
        cls.second = User.objects.create_user(username="second-supervisor", first_name="Second", phone="+919111110003", email="second-register@test.com", role="SUPERVISOR")
        category = ProjectCategory.objects.create(name="Register category")
        cls.alpha = Project.objects.create(name="Alpha Residence", category=category, created_by=cls.admin)
        cls.beta = Project.objects.create(name="Beta Studio", category=category, created_by=cls.admin)
        cls.empty = Project.objects.create(name="Gamma Court", category=category, created_by=cls.admin)
        cls.old = DailyReport.objects.create(project=cls.alpha, reported_by=cls.first, report_date=date(2026, 11, 1), work_summary="Foundation inspected", status="SUBMITTED", submitted_at=timezone.now())
        cls.new = DailyReport.objects.create(project=cls.beta, reported_by=cls.second, report_date=date(2026, 11, 2), work_summary="Blockwork measured", status="SUBMITTED", submitted_at=timezone.now())
        cls.draft = DailyReport.objects.create(project=cls.alpha, reported_by=cls.first, report_date=date(2026, 11, 3), work_summary="Private draft", status="DRAFT")

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = reverse("reports:admin-daily-report-list")

    def test_all_projects_are_listed_without_exposing_drafts(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual([row["id"] for row in response.data["results"]], [str(self.new.id), str(self.old.id)])
        self.assertEqual(response.data["summary"]["submitted"], 2)
        self.assertNotIn("drafts", response.data["summary"])
        self.assertEqual(response.data["summary_scope"], "all_visible_reports")
        self.assertCountEqual([row["project_id"] for row in response.data["projects"]], [self.alpha.id, self.beta.id, self.empty.id])
        self.assertEqual(self.client.get(self.url, {"project": str(self.empty.id)}).data["count"], 0)
        self.assertEqual(self.client.get(self.url, {"status": "DRAFT"}).data["count"], 0)

    def test_server_filters_search_dates_and_ordering(self):
        for query in [{"project": str(self.beta.id)}, {"reported_by": str(self.second.id)}, {"search": "Beta"}, {"search": "second-supervisor"}, {"date_from": "2026-11-02", "date_to": "2026-11-02"}]:
            response = self.client.get(self.url, query)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual([row["id"] for row in response.data["results"]], [str(self.new.id)])
            self.assertEqual(response.data["summary"]["submitted"], 2)
        self.assertEqual(self.client.get(self.url, {"sort": "oldest"}).data["results"][0]["id"], str(self.old.id))

    def test_pagination_and_query_validation(self):
        response = self.client.get(self.url, {"page_size": 1})
        self.assertEqual(response.data["count"], 2)
        self.assertIsNotNone(response.data["next"])
        page_two = self.client.get(self.url, {"page_size": 1, "page": 2})
        self.assertNotEqual(response.data["results"][0]["id"], page_two.data["results"][0]["id"])
        self.assertEqual(self.client.get(self.url, {"project": "invalid"}).status_code, 400)
        self.assertEqual(self.client.get(self.url, {"date_from": "2026-11-20", "date_to": "2026-11-01"}).status_code, 400)

    def test_admin_only_read_only_and_mandatory_password_rules(self):
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 405)
        self.client.force_authenticate(self.first)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.admin.must_change_password = True
        self.admin.save(update_fields=["must_change_password"])
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.url).status_code, [401, 403])
        self.assertEqual(DailyReport.objects.count(), 3)
