from uuid import UUID

from django.core.exceptions import (
    ValidationError as DjangoValidationError,
)
from django.db import transaction

from rest_framework.exceptions import ValidationError

from .models import ActivityLog

# =====================================================
# ACTIVITY LOG CREATION
# =====================================================


def create_activity_log(
    *,
    actor,
    action,
    entity_type,
    entity_id=None,
    description,
    metadata=None,
):
    """
    Create an ActivityLog record.

    Call this service from the successful business
    operation, preferably inside its transaction.

    Do not accept these fields directly from
    a client-facing activity API.
    """

    if entity_id is not None:
        try:
            entity_id = UUID(str(entity_id))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"entity_id": "A valid UUID is required."})

    if not action or not action.strip():
        raise ValidationError({"action": "An action is required."})

    if not entity_type or not entity_type.strip():
        raise ValidationError({"entity_type": "An entity type is required."})

    if not description or not description.strip():
        raise ValidationError({"description": "A description is required."})

    log = ActivityLog(
        actor=actor,
        action=action.strip(),
        entity_type=entity_type.strip(),
        entity_id=entity_id,
        description=description.strip(),
        metadata=metadata if metadata is not None else {},
    )

    try:
        log.full_clean()
    except DjangoValidationError as exc:
        if hasattr(exc, "message_dict"):
            raise ValidationError(exc.message_dict)
        raise ValidationError(exc.messages)

    log.save()

    return log


# =====================================================
# ACTIVITY LOG QUERYSET
# =====================================================


def admin_activity_logs(user):
    """
    Only authorized Admins can retrieve
    Activity Log records.
    """

    authorized_admin = (
        user.is_authenticated
        and user.is_active
        and user.role == "ADMIN"
        and user.is_staff
    )

    if not authorized_admin:
        return ActivityLog.objects.none()

    return ActivityLog.objects.select_related("actor").order_by(
        "-created_at",
        "-id",
    )
