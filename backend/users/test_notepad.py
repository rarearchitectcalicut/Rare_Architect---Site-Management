from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import PersonalNotepad


class PersonalNotepadTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username="note-admin", first_name="Admin", phone="+919111119001", email="note-admin@test.com", role="ADMIN", is_staff=True)
        cls.supervisor = User.objects.create_user(username="note-supervisor", first_name="Supervisor", phone="+919111119002", email="note-supervisor@test.com", role="SUPERVISOR")

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("users:personal-notepad")

    def test_both_roles_can_save_and_reload_exact_text_including_blank_notes(self):
        for user in [self.admin, self.supervisor]:
            self.client.force_authenticate(user)
            initial = self.client.get(self.url)
            self.assertEqual(initial.status_code, 200)
            self.assertEqual(initial.data["content"], "")
            self.assertIn("no-store", initial["Cache-Control"])
            text = "  Site reminder\n\nCheck dimensions ✅  "
            saved = self.client.put(self.url, {"content": text, "revision": 0}, format="json")
            self.assertEqual(saved.status_code, 200)
            self.assertEqual(saved.data["content"], text)
            self.assertEqual(saved.data["revision"], 1)
            self.assertEqual(self.client.get(self.url).data["content"], text)
            self.assertEqual(self.client.put(self.url, {"content": "", "revision": 1}, format="json").data["content"], "")

    def test_notes_are_private_even_when_caller_supplies_another_user_id(self):
        PersonalNotepad.objects.create(user=self.supervisor, content="Supervisor private note")
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.url, {"user": str(self.supervisor.id)}).data["content"], "")
        self.assertEqual(self.client.put(self.url, {"user": str(self.supervisor.id), "content": "Admin own text", "revision": 0}, format="json").status_code, 200)
        self.assertEqual(PersonalNotepad.objects.get(user=self.supervisor).content, "Supervisor private note")
        self.assertEqual(PersonalNotepad.objects.get(user=self.admin).content, "Admin own text")

    def test_stale_revision_cannot_overwrite_saved_notes(self):
        self.client.force_authenticate(self.admin)
        self.client.put(self.url, {"content": "Device one", "revision": 0}, format="json")
        conflict = self.client.put(self.url, {"content": "Device two", "revision": 0}, format="json")
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.data["current"]["content"], "Device one")
        self.assertEqual(conflict.data["current"]["revision"], 1)
        self.assertEqual(self.client.get(self.url).data["content"], "Device one")
        self.assertEqual(self.client.put(self.url, {"content": "Explicit resolution", "revision": 1}, format="json").status_code, 200)

    def test_validation_authentication_and_password_restrictions(self):
        self.assertIn(self.client.get(self.url).status_code, [401, 403])
        self.client.force_authenticate(self.supervisor)
        for body in [{"content": "x"}, {"revision": 0}, {"content": None, "revision": 0}, {"content": "x" * 20001, "revision": 0}, {"content": "x", "revision": -1}]:
            self.assertEqual(self.client.put(self.url, body, format="json").status_code, 400)
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 405)
        self.assertEqual(self.client.delete(self.url).status_code, 405)
        self.supervisor.must_change_password = True
        self.supervisor.save(update_fields=["must_change_password"])
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.put(self.url, {"content": "x", "revision": 0}, format="json").status_code, 403)
