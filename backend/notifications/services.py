from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
import logging
import uuid
from django.contrib.auth import get_user_model
from .models import Notification


logger = logging.getLogger(__name__)
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
):
    """
    Create one notification per active recipient.

    Call through schedule_notifications() from
    business workflows that use transactions.
    """

    User = get_user_model()

    recipients = User.objects.filter(
        id__in=set(recipient_ids),
        is_active=True,
    ).values_list("id", flat=True)

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
# SCHEDULE NOTIFICATIONS AFTER DATABASE COMMIT
# =====================================================


def schedule_notifications(
    *,
    recipient_ids,
    notification_type,
    title,
    message,
    reference_type="",
    reference_id=None,
):
    """
    Schedule notification creation after the
    business transaction commits successfully.

    Notifications are not created if the
    enclosing transaction rolls back.
    """

    recipients = tuple(set(recipient_ids))

    if not recipients:
        return

    # Validate reference before registering callback.
    if reference_id is not None:
        reference_id = uuid.UUID(str(reference_id))

    def send_after_commit():
        try:
            create_notifications(
                recipient_ids=recipients,
                notification_type=notification_type,
                title=title,
                message=message,
                reference_type=reference_type,
                reference_id=reference_id,
            )
        except Exception:
            logger.exception(
                "Failed to create %s notifications " "for %s:%s",
                notification_type,
                reference_type,
                reference_id,
            )

    transaction.on_commit(
        send_after_commit,
        robust=True,
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

