from rest_framework.permissions import BasePermission



class IsAdminRole(BasePermission):
    
    message = "Only Admin can allowed to do this action"
    
    def has_permission(self, request, view):
        user = request.user
        
        return bool(
            user 
            and user.is_authenticated
            and user.is_active
            and user.role == "ADMIN"
            and user.is_staff
        )