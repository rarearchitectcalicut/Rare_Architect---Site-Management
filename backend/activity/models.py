import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

# =====================================================
# ACTIVITY LOG MODEL
# =====================================================


class ActivityLog(models.Model):

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    # ---------------------------------------------
    # WHO PERFORMED THE ACTION
    # ---------------------------------------------

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activity_logs",
    )

    # ---------------------------------------------
    # ACTION DETAILS
    # ---------------------------------------------

    action = models.CharField(
        max_length=100,
    )

    entity_type = models.CharField(
        max_length=100,
    )

    entity_id = models.UUIDField(
        null=True,
        blank=True,
    )

    description = models.TextField()

    metadata = models.JSONField(
        default=dict,
        blank=True,
    )

    # ---------------------------------------------
    # TIMESTAMP
    # ---------------------------------------------

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    # ---------------------------------------------
    # MODEL META
    # ---------------------------------------------

    class Meta:

        ordering = [
            "-created_at",
            "-id",
        ]

        indexes = [
            models.Index(
                fields=["created_at"],
                name="activity_created_idx",
            ),
            models.Index(
                fields=["entity_type", "entity_id"],
                name="activity_entity_idx",
            ),
            models.Index(
                fields=["actor", "created_at"],
                name="activity_actor_date_idx",
            ),
        ]

        constraints = [
            models.CheckConstraint(
                condition=~Q(action=""),
                name="activity_action_not_empty",
            ),
            models.CheckConstraint(
                condition=~Q(entity_type=""),
                name="activity_entity_not_empty",
            ),
        ]

    def __str__(self):
        return f"{self.action} - " f"{self.entity_type} - " f"{self.created_at}"
