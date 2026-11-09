from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db import connection
from django.test import TestCase
from unittest import skipUnless
from rest_framework.test import APIClient

from notifications.models import Notification
from projects.models import Project, ProjectCategory, ProjectSupervisor
from .models import Task, TaskHistory
from .services import complete_task


class TaskCompletionNotificationTests(TestCase):
    def setUp(self):
        def user(name, **values):
            return get_user_model().objects.create_user(
                username=name, first_name=name, email=f"{name}@example.com",
                phone=f"+91990000{get_user_model().objects.count():04d}", **values,
            )
        self.admin = user("admin", role="ADMIN", is_staff=True)
        self.other_admin = user("other_admin", role="ADMIN", is_staff=True)
        user("inactive_admin", role="ADMIN", is_staff=True, is_active=False)
        user("nonstaff_admin", role="ADMIN", is_staff=False)
        self.supervisor = user("supervisor", role="SUPERVISOR")
        self.outsider = user("outsider", role="SUPERVISOR")
        user("staff_supervisor", role="SUPERVISOR", is_staff=True)
        self.project = Project.objects.create(
            name="Site", category=ProjectCategory.objects.create(name="Residential"),
            created_by=self.admin,
        )
        ProjectSupervisor.objects.create(
            project=self.project, supervisor=self.supervisor, assigned_by=self.admin,
        )
        self.task = Task.objects.create(
            project=self.project, created_by=self.supervisor, title="Finish work",
            approval_status="APPROVED", work_status="IN_PROGRESS",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.supervisor)
        self.url = f"/api/v1/tasks/{self.task.pk}/complete/"

    def notifications(self):
        return Notification.objects.filter(reference_id=self.task.pk)

    def test_completion_notifies_only_authorized_active_admins_and_schedules_push(self):
        with patch("notifications.services.send_notification_pushes") as push:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(self.url, {}, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                push.assert_not_called()
            push.assert_called_once()
        self.task.refresh_from_db()
        self.assertEqual(self.task.work_status, "COMPLETED")
        self.assertSetEqual(set(self.notifications().values_list("recipient_id", flat=True)),
                            {self.admin.pk, self.other_admin.pk})
        notification = self.notifications().first()
        self.assertEqual(notification.reference_type, "TASK")
        self.assertEqual(notification.title, "Task completed")
        self.assertFalse(notification.is_read)
        self.assertEqual(self.task.history.filter(action="COMPLETED").count(), 1)

    def test_repeated_completion_does_not_duplicate_notifications(self):
        self.assertEqual(self.client.post(self.url, {}).status_code, 200)
        self.assertEqual(self.client.post(self.url, {}).status_code, 400)
        self.assertEqual(self.notifications().count(), 2)

    @skipUnless(connection.vendor == "postgresql", "Notification event queries require PostgreSQL JSON lookups")
    def test_admin_notification_listing_identifies_completion_event_and_project(self):
        self.assertEqual(self.client.post(self.url, {}).status_code, 200)
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/notifications/", {"unread": "true"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data["results"]), 1)
        notification = response.data["results"][0]
        self.assertEqual(notification["event"], "TASK_COMPLETED")
        self.assertEqual(str(notification["project_id"]), str(self.project.pk))
        self.assertEqual(notification["reference_id"], str(self.task.pk))

    def test_invalid_transitions_have_no_notifications(self):
        for approval, status in [("PENDING", "IN_PROGRESS"), ("REJECTED", "IN_PROGRESS"),
                                 ("APPROVED", "CANCELLED"), ("APPROVED", "COMPLETED")]:
            with self.subTest(approval=approval, status=status):
                Task.objects.filter(pk=self.task.pk).update(approval_status=approval, work_status=status)
                self.assertEqual(self.client.post(self.url, {}).status_code, 400)
                self.assertFalse(self.notifications().exists())

    def test_unauthorized_supervisor_and_admin_cannot_complete(self):
        for user in (self.outsider, self.admin):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post(self.url, {}).status_code, 403)
        self.assertFalse(self.notifications().exists())

    def test_outer_rollback_removes_task_change_notifications_and_push(self):
        with patch("notifications.services.send_notification_pushes") as push:
            with self.captureOnCommitCallbacks(execute=True):
                with self.assertRaises(RuntimeError):
                    with transaction.atomic():
                        complete_task(task_id=self.task.pk, user=self.supervisor)
                        self.assertEqual(self.notifications().count(), 2)
                        raise RuntimeError("Rollback completion")
            push.assert_not_called()
        self.task.refresh_from_db()
        self.assertEqual(self.task.work_status, "IN_PROGRESS")
        self.assertFalse(self.notifications().exists())
        self.assertFalse(TaskHistory.objects.filter(task=self.task, action="COMPLETED").exists())

    def test_notification_failure_rolls_back_completion(self):
        with patch("notifications.services.Notification.objects.bulk_create", side_effect=RuntimeError):
            with self.assertRaises(RuntimeError):
                complete_task(task_id=self.task.pk, user=self.supervisor)
        self.task.refresh_from_db()
        self.assertEqual(self.task.work_status, "IN_PROGRESS")
        self.assertFalse(self.notifications().exists())

    def test_push_failure_does_not_undo_completion_or_in_app_notifications(self):
        with patch("notifications.services.send_notification_pushes", side_effect=RuntimeError("Push unavailable")):
            with self.assertLogs("django.test", level="ERROR"):
                with self.captureOnCommitCallbacks(execute=True):
                    complete_task(task_id=self.task.pk, user=self.supervisor)
        self.task.refresh_from_db()
        self.assertEqual(self.task.work_status, "COMPLETED")
        self.assertEqual(self.notifications().count(), 2)
