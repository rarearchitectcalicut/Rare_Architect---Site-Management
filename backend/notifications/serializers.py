from rest_framework import serializers

from .models import Notification

# =====================================================
# NOTIFICATION DETAIL SERIALIZER
# =====================================================


class NotificationSerializer(serializers.ModelSerializer):

    class Meta:
        model = Notification

        fields = (
            "id",
            "notification_type",
            "title",
            "message",
            "reference_type",
            "reference_id",
            "is_read",
            "read_at",
            "created_at",
        )

        read_only_fields = fields
