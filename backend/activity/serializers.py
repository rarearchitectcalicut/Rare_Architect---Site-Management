from rest_framework import serializers

from .models import ActivityLog

# =====================================================
# ACTIVITY LOG READ-ONLY SERIALIZER
# =====================================================


class ActivityLogSerializer(serializers.ModelSerializer):

    actor_name = serializers.CharField(
        source="actor.name",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = ActivityLog

        fields = (
            "id",
            "actor",
            "actor_name",
            "action",
            "entity_type",
            "entity_id",
            "description",
            "metadata",
            "created_at",
        )

        read_only_fields = fields
