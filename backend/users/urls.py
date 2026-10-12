from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    SupervisorListCreateView,
    PhoneLoginView,
    LogoutView,
    CurrentUserView,
    ChangePasswordView,
)

app_name = "users"

urlpatterns = [
    path("auth/login/", PhoneLoginView.as_view(), name="login"),
    path(
        "auth/refresh/",
        TokenRefreshView.as_view(),
        name="token-refresh",
    ),
    path(
        "users/supervisors/",
        SupervisorListCreateView.as_view(),
        name="supervisor-create",
    ),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/me/", CurrentUserView.as_view(), name="current-user"),
    path(
        "auth/change-password/",
        ChangePasswordView.as_view(),
        name="change-password",
    ),
]
