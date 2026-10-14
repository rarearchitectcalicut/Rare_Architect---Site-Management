from rest_framework.permissions import BasePermission, SAFE_METHODS
from users.permissions import IsAdminRole


class IsAdminOrReadOnly(BasePermission):
    """
    Authenticated users may read.
    Only Admin users may create, update or delete.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True

        return IsAdminRole().has_permission(request, view)
