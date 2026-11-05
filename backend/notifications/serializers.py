from rest_framework import serializers

from .models import Notification

# =====================================================
# NOTIFICATION DETAIL SERIALIZER
# =====================================================


class NotificationSerializer(serializers.ModelSerializer):
    event = serializers.CharField(read_only=True, default="", allow_null=True)
    project_id = serializers.UUIDField(read_only=True, allow_null=True, default=None)

    class Meta:
        model = Notification

        fields = (
            "id",
            "notification_type",
            "event",
            "project_id",
            "title",
            "message",
            "reference_type",
            "reference_id",
            "is_read",
            "read_at",
            "created_at",
        )

        read_only_fields = fields
