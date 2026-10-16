from rest_framework.permissions import BasePermission


class IsSupervisorRole(BasePermission):
    message = "Only Supervisors can create tasks."

    def has_permission(self, request, view):
        user = request.user

        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.role == "SUPERVISOR"
            and not user.is_staff
        )
