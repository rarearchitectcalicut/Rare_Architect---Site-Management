from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
import uuid
from django.db.models import Q
from django.contrib.auth import get_user_model
from .models import Notification


# =====================================================
# USER NOTIFICATION QUERYSET
# =====================================================


def user_notifications(user):
    """
    Return notifications belonging only
    to the authenticated active user.
    """

    if not user.is_authenticated or not user.is_active:
        return Notification.objects.none()

    return Notification.objects.filter(recipient=user)


# =====================================================
# MARK ONE NOTIFICATION AS READ
# =====================================================


@transaction.atomic
def mark_notification_read(*, notification_id, user):
    notification = get_object_or_404(
        user_notifications(user).select_for_update(),
        pk=notification_id,
    )

    # Idempotent: reading an already-read notification
    # does not overwrite the original read timestamp.
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = timezone.now()

        notification.save(
            update_fields=[
                "is_read",
                "read_at",
            ]
        )

    return notification


# =====================================================
# MARK ALL USER NOTIFICATIONS AS READ
# =====================================================


@transaction.atomic
def mark_all_notifications_read(*, user):
    """
    Bulk-update only the current user's
    unread notifications.

    Returns the number of rows updated.
    """

    return (
        user_notifications(user)
        .filter(is_read=False)
        .update(
            is_read=True,
            read_at=timezone.now(),
        )
    )


# =====================================================
# NOTIFICATION CREATION SERVICE
# =====================================================


def create_notifications(
    *,
    recipient_ids,
    notification_type,
    title,
    message,
    reference_type="",
    reference_id=None,
    project_id=None,
):
    """
    Create one notification per active recipient.

    Called inside the existing atomic business workflows.
    """

    User = get_user_model()

    recipients = User.objects.filter(
        id__in=set(recipient_ids),
        is_active=True,
    )
    if project_id is not None:
        recipients = recipients.filter(
            Q(role="ADMIN", is_staff=True) |
            Q(role="SUPERVISOR", is_staff=False, project_assignments__project_id=project_id)
        )
    recipients = recipients.values_list("id", flat=True).distinct()

    notifications = [
        Notification(
            recipient_id=user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            reference_type=reference_type,
            reference_id=reference_id,
        )
        for user_id in recipients
    ]

    if notifications:
        Notification.objects.bulk_create(notifications)

    return len(notifications)


# =====================================================
# CREATE TRANSACTIONAL DATABASE NOTIFICATIONS
# =====================================================


def schedule_notifications(
    *,
    recipient_ids,
    notification_type,
    title,
    message,
    reference_type="",
    reference_id=None,
    project_id=None,
):
    """Create database notifications in the caller's transaction.

    Business workflows are atomic, so notification failures roll back the whole
    operation instead of losing feedback after a successful commit.
    """
    if reference_id is not None:
        reference_id = uuid.UUID(str(reference_id))
    return create_notifications(
        recipient_ids=recipient_ids, notification_type=notification_type,
        title=title, message=message, reference_type=reference_type,
        reference_id=reference_id, project_id=project_id,
    )


# =====================================================
# ACTIVE ADMIN RECIPIENTS
# =====================================================


def get_active_admin_ids():
    """
    Return UUIDs of users authorized as Admins.
    """

    User = get_user_model()

    return list(
        User.objects.filter(
            role="ADMIN",
            is_active=True,
            is_staff=True,
        ).values_list("id", flat=True)
    )

