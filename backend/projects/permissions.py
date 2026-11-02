from rest_framework.permissions import BasePermission, SAFE_METHODS
from users.permissions import IsAdminRole
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from .models import Project


def lock_project_for_work(project_id):
    """Serialize operational writes with project cancellation inside a transaction."""
    project = get_object_or_404(Project.objects.select_for_update(), pk=project_id)
    if project.status == Project.Status.CANCELLED:
        raise ValidationError({"project": "This project has been cancelled. Existing records remain available for reference."})
    return project


class IsAdminOrReadOnly(BasePermission):
    """
    Authenticated users may read.
    Only Admin users may create, update or delete.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True

        return IsAdminRole().has_permission(request, view)
