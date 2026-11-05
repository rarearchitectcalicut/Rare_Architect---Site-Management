from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase


User = get_user_model()


class CurrentUserProfileTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="supervisor",
            email="supervisor@example.com",
            phone="+919876543210",
            password="profile-test-password",
            first_name="Original",
            must_change_password=True,
        )
        self.url = reverse("users:current-user")
        self.client.force_authenticate(self.user)

    def test_patch_updates_profile_and_preserves_other_fields(self):
        payload = {
            "first_name": "Updated",
            "last_name": "Name",
            "username": "updated",
            "email": "Updated@Example.com",
            "phone": "+919876543211",
        }
        response = self.client.patch(self.url, payload, format="json")
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        for field, value in {**payload, "email": "updated@example.com"}.items():
            self.assertEqual(getattr(self.user, field), value)
            self.assertEqual(response.data[field], value)
        self.assertEqual(self.user.role, User.Role.SUPERVISOR)
        self.assertTrue(self.user.must_change_password)
        self.assertTrue(self.user.check_password("profile-test-password"))
        self.assertEqual(self.client.get(self.url).data, response.data)

    def test_partial_update_cannot_change_account_permissions(self):
        response = self.client.patch(self.url, {
            "last_name": "Changed",
            "role": "ADMIN",
            "is_staff": True,
            "is_superuser": True,
            "must_change_password": False,
            "password": "replacement-password",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.last_name, "Changed")
        self.assertEqual(self.user.first_name, "Original")
        self.assertEqual(self.user.role, User.Role.SUPERVISOR)
        self.assertFalse(self.user.is_staff)
        self.assertFalse(self.user.is_superuser)
        self.assertTrue(self.user.must_change_password)
        self.assertTrue(self.user.check_password("profile-test-password"))

    def test_duplicate_profile_identifiers_return_validation_errors(self):
        other = User.objects.create_user(
            username="other", email="other@example.com", phone="+919876543212",
            password="other-test-password", first_name="Other",
        )
        for field, value in {
            "username": "OTHER", "email": "OTHER@example.com", "phone": other.phone,
        }.items():
            with self.subTest(field=field):
                response = self.client.patch(self.url, {field: value}, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
        other.refresh_from_db()
        self.assertEqual(other.username, "other")

    def test_invalid_profile_values_return_validation_errors(self):
        for field, value in {"phone": "invalid", "email": "invalid", "first_name": ""}.items():
            with self.subTest(field=field):
                response = self.client.patch(self.url, {field: value}, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_unauthenticated_patch_is_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.patch(self.url, {"first_name": "Changed"}, format="json")
        self.assertEqual(response.status_code, 401)
