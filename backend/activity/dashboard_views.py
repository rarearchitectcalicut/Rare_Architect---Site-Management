from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .supervisor_queues import get_supervisor_action_items
from users.permissions import MustChangePasswordPermission

from .dashboard_services import (
    get_admin_dashboard_summary,
    get_supervisor_dashboard_summary,
)
from .dashboard_queues import get_admin_dashboard_review_queue

# =====================================================
# ADMIN DASHBOARD SUMMARY
# =====================================================


class AdminDashboardSummaryView(generics.GenericAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get(self, request):
        summary = get_admin_dashboard_summary(
            user=request.user,
        )

        return Response(
            summary,
            status=status.HTTP_200_OK,
        )


# =====================================================
# SUPERVISOR DASHBOARD SUMMARY
# =====================================================


class SupervisorDashboardSummaryView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get(self, request):
        summary = get_supervisor_dashboard_summary(
            user=request.user,
        )

        return Response(
            summary,
            status=status.HTTP_200_OK,
        )


# =====================================================
# ADMIN DASHBOARD REVIEW QUEUE
# =====================================================


class AdminDashboardReviewQueueView(generics.GenericAPIView):

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get(self, request):
        data = get_admin_dashboard_review_queue(
            user=request.user,
        )

        return Response(
            data,
            status=status.HTTP_200_OK,
        )


# =====================================================
# SUPERVISOR DASHBOARD ACTION ITEMS
# =====================================================


class SupervisorDashboardActionItemsView(generics.GenericAPIView):
    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
    ]

    def get(self, request):
        data = get_supervisor_action_items(
            user=request.user,
        )

        return Response(
            data,
            status=status.HTTP_200_OK,
        )
