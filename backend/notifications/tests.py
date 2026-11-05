from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError

from activity.models import ActivityLog
from projects.models import Project, ProjectCategory, ProjectSupervisor
from tasks.models import Task, TaskHistory
from tasks.services import approve_task, reject_task, resubmit_task
from .models import Notification


class WorkflowNotificationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(username="notifyadmin", first_name="Admin", email="notifyadmin@test.com", phone="+919900000001", role="ADMIN", is_staff=True)
        self.supervisor = User.objects.create_user(username="notifysupervisor", first_name="Supervisor", email="notifysupervisor@test.com", phone="+919900000002")
        self.other = User.objects.create_user(username="notifyother", first_name="Other", email="notifyother@test.com", phone="+919900000003")
        self.project = Project.objects.create(name="Villa", category=ProjectCategory.objects.create(name="Notification category"), created_by=self.admin, start_date=date(2026, 10, 1), end_date=date(2026, 11, 2))
        ProjectSupervisor.objects.create(project=self.project, supervisor=self.supervisor, assigned_by=self.admin)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.project_url = f"/api/v1/projects/{self.project.pk}/"
        self.list_url = "/api/v1/notifications/"

    def task(self):
        return Task.objects.create(project=self.project, created_by=self.supervisor, title="Site work")

    def test_assignment_notifies_only_new_supervisors_and_retries_are_idempotent(self):
        url = self.project_url + "assign-supervisors/"
        payload = {"supervisor_ids": [str(self.supervisor.pk), str(self.other.pk)]}
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 201)
        notification = Notification.objects.get()
        self.assertEqual(notification.recipient_id, self.other.pk)
        self.assertEqual(notification.reference_id, self.project.pk)
        self.assertIn("Villa", notification.message)
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 201)
        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(ActivityLog.objects.filter(action="SUPERVISOR_ASSIGNED").count(), 1)

    def test_schedule_changes_notify_assigned_active_supervisors_only_once(self):
        ProjectSupervisor.objects.create(project=self.project, supervisor=self.other, assigned_by=self.admin)
        self.other.is_active = False
        self.other.save(update_fields=["is_active"])
        response = self.client.patch(self.project_url, {"end_date": "2026-11-08"}, format="json")
        self.assertEqual(response.status_code, 200)
        notification = Notification.objects.get()
        self.assertEqual(notification.recipient_id, self.supervisor.pk)
        self.assertIn("02 November 2026", notification.message)
        self.assertIn("08 November 2026", notification.message)
        for payload in [{"end_date": "2026-11-08"}, {"location": "Corrected address"}]:
            self.assertEqual(self.client.patch(self.project_url, payload, format="json").status_code, 200)
        self.assertEqual(Notification.objects.count(), 1)
        self.client.force_authenticate(self.supervisor)
        listing = self.client.get(self.list_url)
        self.assertEqual(listing.data["results"][0]["event"], "PROJECT_DATES_CHANGED")

    def test_cancellation_notifies_once_and_failed_transition_creates_nothing(self):
        payload = {"status": "CANCELLED", "cancellation_reason": "Client decision"}
        with patch("projects.views.create_notifications", side_effect=RuntimeError("Notification unavailable")):
            with self.assertRaises(RuntimeError):
                self.client.patch(self.project_url, payload, format="json")
        self.project.refresh_from_db()
        self.assertEqual(self.project.status, "ACTIVE")
        self.assertFalse(Notification.objects.exists())
        self.assertFalse(ActivityLog.objects.exists())
        self.assertEqual(self.client.patch(self.project_url, payload, format="json").status_code, 200)
        self.assertEqual(self.client.patch(self.project_url, payload, format="json").status_code, 400)
        self.assertEqual(Notification.objects.count(), 1)
        self.client.force_authenticate(self.supervisor)
        listing = self.client.get(self.list_url, {"include_counts": "true", "page_size": 1})
        self.assertEqual(listing.data["results"][0]["event"], "PROJECT_CANCELLED")
        self.assertEqual(listing.data["results"][0]["project_id"], str(self.project.pk))
        self.assertEqual(self.client.get(self.project_url).status_code, 200)

    def test_notifications_and_read_operations_are_recipient_scoped(self):
        mine = Notification.objects.create(recipient=self.supervisor, notification_type="SYSTEM", title="Mine", message="Personal")
        foreign = Notification.objects.create(recipient=self.other, notification_type="SYSTEM", title="Private", message="Other user")
        for index in range(11):
            Notification.objects.create(recipient=self.supervisor, notification_type="SYSTEM", title=f"Mine {index}", message="Personal")
        self.client.force_authenticate(self.supervisor)
        with self.assertNumQueries(3):
            listing = self.client.get(self.list_url, {"page_size": 1, "include_counts": "true"})
        self.assertEqual(listing.data["count"], 12)
        self.assertEqual(listing.data["unread_count"], 12)
        self.assertEqual(len(listing.data["results"]), 1)
        self.assertNotIn("Private", str(listing.data))
        self.assertEqual(self.client.post(f"{self.list_url}{foreign.pk}/read/").status_code, 404)
        response = self.client.post(f"{self.list_url}{mine.pk}/read/")
        self.assertEqual(response.data["unread_count"], 11)
        first_read = response.data["read_at"]
        self.assertEqual(self.client.post(f"{self.list_url}{mine.pk}/read/").data["read_at"], first_read)
        response = self.client.post(self.list_url + "read-all/")
        self.assertEqual(response.data["unread_count"], 0)
        self.assertEqual(response.data["updated_count"], 11)
        foreign.refresh_from_db()
        self.assertFalse(foreign.is_read)

    def test_decision_comments_and_notification_events_survive_resubmission(self):
        task = self.task()
        reject_task(task_id=task.pk, admin_user=self.admin, reason="Correct the quantities")
        rejected = Notification.objects.get(recipient=self.supervisor)
        rejected.title = "An edited display title"
        rejected.save(update_fields=["title"])
        resubmit_task(task_id=task.pk, supervisor=self.supervisor, validated_data={"title": "Corrected site work", "resubmission_note": "Quantities checked"})
        approve_task(task_id=task.pk, admin_user=self.admin, comment="Approved after checking")
        with self.assertRaises(ValidationError):
            approve_task(task_id=task.pk, admin_user=self.admin, comment="Duplicate")
        self.client.force_authenticate(self.supervisor)
        response = self.client.get(f"/api/v1/tasks/{task.pk}/history/", {"decisions_only": "true"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        decisions = response.data["results"]
        self.assertEqual(decisions[0]["details"]["comment"], "Approved after checking")
        self.assertEqual(decisions[1]["details"]["reason"], "Correct the quantities")
        self.assertEqual(decisions[0]["actor_name"], self.admin.username)
        self.assertTrue(decisions[0]["created_at"])
        listing = self.client.get(self.list_url)
        events = {str(row["id"]): row["event"] for row in listing.data["results"]}
        self.assertEqual(events[str(rejected.pk)], "TASK_REJECTED")
        self.assertIn("TASK_APPROVED", events.values())
        self.assertEqual(Notification.objects.filter(recipient=self.supervisor).count(), 2)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/v1/tasks/{task.pk}/history/").status_code, 404)

    def test_failed_notification_rolls_back_task_approval_and_history(self):
        task = self.task()
        with patch("notifications.services.create_notifications", side_effect=RuntimeError("Notification unavailable")):
            with self.assertRaises(RuntimeError):
                approve_task(task_id=task.pk, admin_user=self.admin, comment="Approve")
        task.refresh_from_db()
        self.assertEqual(task.approval_status, "PENDING")
        self.assertFalse(task.history.exists())
        self.assertFalse(ActivityLog.objects.exists())
        self.assertFalse(Notification.objects.exists())

    def test_authorized_task_decision_history_includes_edit_and_extension_feedback(self):
        task = self.task()
        for action, details in [
            ("EDIT_REJECTED", {"reason": "Keep the approved scope"}),
            ("EXTENSION_APPROVED", {"admin_comment": "Delivery time approved"}),
            ("CREATED", {}),
        ]:
            TaskHistory.objects.create(task=task, actor=self.admin, action=action, details=details)
        self.client.force_authenticate(self.supervisor)
        response = self.client.get(f"/api/v1/tasks/{task.pk}/history/", {"decisions_only": "true"})
        self.assertEqual(response.data["count"], 2)
        self.assertEqual({row["action"] for row in response.data["results"]}, {"EDIT_REJECTED", "EXTENSION_APPROVED"})

    def test_removed_supervisor_receives_no_new_task_decision_details(self):
        task = self.task()
        ProjectSupervisor.objects.filter(project=self.project, supervisor=self.supervisor).delete()
        approve_task(task_id=task.pk, admin_user=self.admin, comment="Approve")
        self.assertFalse(Notification.objects.filter(recipient=self.supervisor).exists())
