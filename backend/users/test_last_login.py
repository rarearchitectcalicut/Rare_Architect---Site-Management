from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient


class LastLoginTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="last_login", first_name="Login", email="login@example.com",
            phone="+919900008001", password="test-login-password",
        )
        self.client = APIClient()
        self.now = timezone.now()

    def login(self, **values):
        return self.client.post("/api/v1/auth/login/", {
            "phone": self.user.phone, "password": "test-login-password", **values,
        }, format="json")

    def test_successful_login_records_current_login_for_both_roles(self):
        for role in ("ADMIN", "SUPERVISOR"):
            with self.subTest(role=role):
                self.user.role = role
                self.user.is_staff = role == "ADMIN"
                self.user.last_login = self.now - timedelta(days=1)
                self.user.save()
                with patch("django.contrib.auth.models.timezone.now", return_value=self.now):
                    response = self.login()
                self.assertEqual(response.status_code, 200, response.data)
                self.user.refresh_from_db()
                self.assertEqual(self.user.last_login, self.now)

    def test_failed_and_inactive_logins_do_not_update_timestamp(self):
        self.user.last_login = self.now - timedelta(days=1)
        self.user.save()
        for values in ({"password": "wrong"}, {"phone": "+919900008999"}):
            self.assertEqual(self.login(**values).status_code, 400)
            self.user.refresh_from_db()
            self.assertEqual(self.user.last_login, self.now - timedelta(days=1))
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.login().status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.last_login, self.now - timedelta(days=1))

    def test_profile_exposes_nullable_read_only_last_login_for_both_roles(self):
        for role in ("ADMIN", "SUPERVISOR"):
            self.user.role = role
            self.user.save()
            self.client.force_authenticate(self.user)
            self.assertIsNone(self.client.get("/api/v1/auth/me/").data["last_login"])
            response = self.client.patch("/api/v1/auth/me/", {
                "last_login": self.now.isoformat(),
            }, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            self.user.refresh_from_db()
            self.assertIsNone(self.user.last_login)

    def test_refresh_and_profile_fetch_preserve_last_login(self):
        response = self.login()
        self.user.refresh_from_db()
        timestamp = self.user.last_login
        response = self.client.post("/api/v1/auth/refresh/", {"refresh": response.data["refresh"]})
        self.assertEqual(response.status_code, 200, response.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        profile = self.client.get("/api/v1/auth/me/")
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(timezone.datetime.fromisoformat(profile.data["last_login"].replace("Z", "+00:00")), timestamp)
        self.user.refresh_from_db()
        self.assertEqual(self.user.last_login, timestamp)
