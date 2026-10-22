from rest_framework import serializers

from .models import ActivityLog
from .presentation import activity_details

# =====================================================
# ACTIVITY LOG READ-ONLY SERIALIZER
# =====================================================


class ActivityLogListSerializer(serializers.ListSerializer):
    def to_representation(self, data):
        logs = list(data.all() if hasattr(data, "all") else data)
        self.context["activity_details"] = activity_details(logs)
        return super().to_representation(logs)


class ActivityLogSerializer(serializers.ModelSerializer):

    actor_id = serializers.UUIDField(read_only=True, allow_null=True)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        details = self.context.get("activity_details", {}).get(str(instance.id))
        if details is None:
            details = activity_details([instance])[str(instance.id)]
        return {**data, **details}

    class Meta:
        model = ActivityLog
        list_serializer_class = ActivityLogListSerializer

        fields = (
            "id",
            "actor",
            "actor_id",
            "action",
            "entity_type",
            "entity_id",
            "description",
            "metadata",
            "created_at",
        )

        read_only_fields = fields
