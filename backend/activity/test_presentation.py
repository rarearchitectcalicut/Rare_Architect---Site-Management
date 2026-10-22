from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase

from activity.models import ActivityLog
from activity.presentation import activity_details
from activity.serializers import ActivityLogSerializer


class ActivityPresentationTests(SimpleTestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User(id=uuid4(), first_name="Aksha", last_name="Rao", username="admin", role="ADMIN")
        self.supervisor = User(id=uuid4(), first_name="Ravi", last_name="Kumar", username="ravi", role="SUPERVISOR")

    def log(self, **kwargs):
        values = dict(actor=self.admin, action="USER_CREATED", entity_type="USER",
                      entity_id=self.supervisor.id, description="Supervisor account created.", metadata={})
        return ActivityLog(**{**values, **kwargs})

    @patch("users.models.User.objects.in_bulk")
    def test_legacy_activity_resolves_full_names_in_one_query(self, users):
        users.return_value = {self.supervisor.id: self.supervisor}
        logs = [self.log(), self.log(action="USER_PASSWORD_RESET")]
        entries = ActivityLogSerializer(logs, many=True).data
        self.assertEqual(entries[0]["actor_name"], "Aksha Rao")
        self.assertEqual(entries[0]["subject_name"], "Ravi Kumar")
        self.assertEqual(entries[0]["summary"], "Created Supervisor Ravi Kumar's account.")
        self.assertEqual(entries[1]["summary"], "Reset Supervisor Ravi Kumar's password.")
        users.assert_called_once_with({self.supervisor.id})

    def test_snapshots_survive_renames_and_deleted_accounts(self):
        log = self.log(actor=None, metadata={
            "actor_name": "Original Admin", "actor_role": "ADMIN",
            "subject_name": "Original Supervisor", "subject_role": "SUPERVISOR",
        })
        data = ActivityLogSerializer(log).data
        self.assertEqual(data["actor_name"], "Original Admin")
        self.assertEqual(data["subject_name"], "Original Supervisor")
        self.assertIn("Original Supervisor", data["summary"])

    @patch("projects.models.Project.objects.in_bulk")
    @patch("users.models.User.objects.in_bulk")
    def test_assignment_identifies_supervisor_and_project(self, users, projects):
        project_id = uuid4()
        users.return_value = {self.supervisor.id: self.supervisor}
        projects.return_value = {project_id: SimpleNamespace(name="Lake House")}
        log = self.log(action="SUPERVISOR_ASSIGNED", entity_type="PROJECT", entity_id=project_id,
                       metadata={"supervisor_id": str(self.supervisor.id)})
        data = ActivityLogSerializer(log).data
        self.assertEqual(data["summary"], "Assigned Supervisor Ravi Kumar to Lake House.")
        self.assertEqual(data["project_name"], "Lake House")

    @patch("users.models.User.objects.in_bulk", return_value={})
    def test_missing_historical_user_and_invalid_metadata_are_tolerated(self, users):
        log = self.log(actor=None, metadata={"supervisor_id": "invalid"})
        data = activity_details([log])[str(log.id)]
        self.assertEqual(data["actor_name"], "System / unavailable user")
        self.assertIsNone(data["subject_name"])
        self.assertIn("Unavailable user", data["summary"])

    def test_username_is_used_when_full_name_is_empty(self):
        self.admin.first_name = self.admin.last_name = ""
        log = self.log(entity_type="SYSTEM", entity_id=None)
        data = activity_details([log])[str(log.id)]
        self.assertEqual(data["actor_name"], "admin")
