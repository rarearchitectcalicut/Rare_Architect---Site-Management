import base64

from rest_framework import serializers

from .models import Notification
from .push import decode_key, validate_endpoint

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


class PushEndpointSerializer(serializers.Serializer):
    endpoint = serializers.CharField(max_length=2048, trim_whitespace=False)

    def validate_endpoint(self, value):
        try:
            return validate_endpoint(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error)) from None


class PushKeysSerializer(serializers.Serializer):
    p256dh = serializers.CharField(max_length=88, trim_whitespace=False)
    auth = serializers.CharField(max_length=24, trim_whitespace=False)

    def validate(self, attrs):
        for name, size in (("p256dh", 65), ("auth", 16)):
            try:
                attrs[name] = base64.urlsafe_b64encode(decode_key(attrs[name], size)).decode().rstrip("=")
            except ValueError as error:
                raise serializers.ValidationError({name: str(error)}) from None
        return attrs


class PushSubscriptionSerializer(PushEndpointSerializer):
    keys = PushKeysSerializer()
    expirationTime = serializers.FloatField(required=False, allow_null=True, min_value=0)
