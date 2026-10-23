from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory, force_authenticate

from .views import TaskApprovalListView


class TaskApprovalQueueTests(SimpleTestCase):
    def queryset_for(self, params):
        view = TaskApprovalListView()
        view.request = SimpleNamespace(query_params=params)
        return view.get_queryset()

    @patch("tasks.views.Task.objects.filter")
    def test_pending_queue_remains_the_default(self, task_filter):
        self.queryset_for({})
        task_filter.assert_called_once_with(approval_status="PENDING")

    @patch("tasks.views.Task.objects.filter")
    def test_admin_can_request_rejected_tasks(self, task_filter):
        self.queryset_for({"status": "REJECTED"})
        task_filter.assert_called_once_with(approval_status="REJECTED")

    @patch("tasks.views.Task.objects.filter")
    def test_invalid_status_is_rejected_before_querying(self, task_filter):
        with self.assertRaises(ValidationError):
            self.queryset_for({"status": "INVALID"})
        task_filter.assert_not_called()

    def test_supervisor_cannot_access_rejected_task_queue(self):
        request = APIRequestFactory().get("/task-approvals/", {"status": "REJECTED"})
        user = get_user_model()(id=uuid4(), role="SUPERVISOR", is_active=True, is_staff=False)
        force_authenticate(request, user=user)
        self.assertEqual(TaskApprovalListView.as_view()(request).status_code, 403)
