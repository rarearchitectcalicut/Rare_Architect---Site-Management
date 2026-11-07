import io
import uuid

from django.contrib.auth import get_user_model
from django.db import transaction
from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.permissions import MustChangePasswordPermission
from .models import PushSubscription
from .push import decode_key, push_configured
from .serializers import PushEndpointSerializer, PushSubscriptionSerializer


class PayloadTooLarge(APIException):
    status_code = 413
    default_detail = "Push subscription payload exceeds 4096 bytes."


class PushJSONParser(JSONParser):
    def parse(self, stream, media_type=None, parser_context=None):
        payload = stream.read(4097)
        if len(payload) > 4096:
            raise PayloadTooLarge()
        return super().parse(io.BytesIO(payload), media_type, parser_context)


class PushAPIView(APIView):
    permission_classes = [IsAuthenticated, MustChangePasswordPermission]
    parser_classes = [PushJSONParser]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response


class PushPublicKeyView(PushAPIView):
    def get(self, request):
        try:
            if not push_configured():
                raise ValueError
            decode_key(settings.WEB_PUSH_VAPID_PUBLIC_KEY, 65)
        except ValueError:
            return Response({"detail": "Device notifications are not configured."}, status=503)
        return Response({"public_key": settings.WEB_PUSH_VAPID_PUBLIC_KEY})


class PushSubscriptionView(PushAPIView):
    @transaction.atomic
    def post(self, request):
        serializer = PushSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        # Serialize per-account device limits, including simultaneous requests.
        get_user_model().objects.select_for_update().get(pk=request.user.pk)
        subscription = PushSubscription.objects.select_for_update().filter(endpoint=data["endpoint"]).first()
        if (not subscription or subscription.user_id != request.user.pk) and PushSubscription.objects.filter(user=request.user).count() >= 10:
            raise ValidationError({"detail": "Ten devices are already enabled. Disable another device first."})
        # get_or_create handles concurrent registration of the same unique endpoint.
        if subscription is None:
            subscription, created = PushSubscription.objects.select_for_update().get_or_create(
                endpoint=data["endpoint"], defaults={"user": request.user, **data["keys"]},
            )
        else:
            created = False
        if not created:
            keys = data["keys"]
            if subscription.user_id != request.user.pk and (subscription.p256dh != keys["p256dh"] or subscription.auth != keys["auth"]):
                raise ValidationError({"detail": "Unable to register this device subscription."})
            if subscription.user_id != request.user.pk or subscription.p256dh != keys["p256dh"] or subscription.auth != keys["auth"]:
                subscription.user = request.user
                subscription.p256dh = keys["p256dh"]
                subscription.auth = keys["auth"]
                subscription.revision = uuid.uuid4()
                subscription.save(update_fields=["user", "p256dh", "auth", "revision", "updated_at"])
        return Response({"enabled": True}, status=status.HTTP_200_OK)

    def delete(self, request):
        serializer = PushEndpointSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PushSubscription.objects.filter(user=request.user, endpoint=serializer.validated_data["endpoint"]).delete()
        # Idempotent and intentionally does not disclose whether another owner exists.
        return Response(status=status.HTTP_204_NO_CONTENT)


class PushSubscriptionStatusView(PushAPIView):
    def post(self, request):
        serializer = PushEndpointSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({"enabled": PushSubscription.objects.filter(
            user=request.user, endpoint=serializer.validated_data["endpoint"],
        ).exists()})
