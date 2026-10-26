from datetime import datetime, timezone

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import ActivityLog


class ActivityListTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(
            phone="+919100000001", username="activity_admin", email="activity@example.com",
            first_name="Audit", last_name="Reviewer", role="ADMIN", is_staff=True,
        )
        cls.supervisor = User.objects.create_user(
            phone="+919100000002", username="activity_supervisor", email="supervisor@example.com",
            first_name="Site", role="SUPERVISOR",
        )
        cls.old = ActivityLog.objects.create(
            actor=cls.admin, action="PROJECT_UPDATED", entity_type="PROJECT",
            description="Updated foundation schedule.", metadata={"project_name": "Courtyard House"},
        )
        cls.new = ActivityLog.objects.create(
            actor=None, action="USER_CREATED", entity_type="USER",
            description="Created a supervisor account.",
            metadata={"actor_name": "Former Admin", "subject_name": "Ravi Kumar", "subject_role": "SUPERVISOR"},
        )
        ActivityLog.objects.filter(pk=cls.old.pk).update(created_at=datetime(2026, 10, 20, 23, 59, tzinfo=timezone.utc))
        ActivityLog.objects.filter(pk=cls.new.pk).update(created_at=datetime(2026, 10, 21, 0, 0, tzinfo=timezone.utc))

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_paginated_newest_first_feed(self):
        response = self.client.get("/api/v1/activity/", {"page_size": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(response.data["results"][0]["id"], str(self.new.id))
        self.assertIsNotNone(response.data["next"])
        second = self.client.get("/api/v1/activity/", {"page_size": 1, "page": 2})
        self.assertEqual(second.data["results"][0]["id"], str(self.old.id))

    def test_searches_description_actor_and_historical_names_across_pages(self):
        for query, expected in [("foundation", self.old), ("Audit", self.old), ("Courtyard", self.old), ("Former Admin", self.new), ("Ravi", self.new)]:
            with self.subTest(query=query):
                response = self.client.get("/api/v1/activity/", {"search": query, "page_size": 1})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["count"], 1)
                self.assertEqual(response.data["results"][0]["id"], str(expected.id))

    def test_inclusive_utc_date_range(self):
        response = self.client.get("/api/v1/activity/", {"date_from": "2026-10-20", "date_to": "2026-10-20"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(self.old.id))

    def test_invalid_search_dates_and_references_are_rejected(self):
        for params in [{"date_from": "2026-02-30"}, {"date_to": "invalid"}, {"date_from": "2026-10-22", "date_to": "2026-10-20"}, {"search": "x" * 201}, {"actor": "invalid"}, {"entity_id": "invalid"}]:
            with self.subTest(params=params):
                self.assertEqual(self.client.get("/api/v1/activity/", params).status_code, 400)

    def test_filters_combine_and_empty_results_are_valid(self):
        response = self.client.get("/api/v1/activity/", {"entity_type": "PROJECT", "action": "PROJECT_UPDATED", "actor": str(self.admin.id), "search": "foundation"})
        self.assertEqual(response.data["count"], 1)
        response = self.client.get("/api/v1/activity/", {"entity_type": "TASK"})
        self.assertEqual(response.data["count"], 0)

    def test_access_is_admin_only_and_read_only(self):
        self.assertEqual(self.client.post("/api/v1/activity/", {}).status_code, 405)
        self.client.force_authenticate(self.supervisor)
        self.assertEqual(self.client.get("/api/v1/activity/").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/v1/activity/").status_code, 401)
