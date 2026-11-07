"""Bounded, best-effort Web Push. Replace with an outbox worker before scaling."""
import base64
import json
import logging
import re
import time
from urllib.parse import urlsplit

import requests
from cryptography.hazmat.primitives.asymmetric import ec
from django.conf import settings
from django.utils import timezone
from pywebpush import WebPushException, webpush

from .models import Notification, PushSubscription

logger = logging.getLogger(__name__)
MAX_PUSH_ATTEMPTS = 10
PUSH_BUDGET_SECONDS = 6
PUSH_TIMEOUT = (2, 2)

# Exact vendor-owned hosts, no wildcard domains, custom ports, queries or redirects.
# Unsupported providers fail closed until their endpoint pattern is reviewed.
PUSH_ENDPOINTS = {
    "fcm.googleapis.com": r"/(?:fcm/send|wp)/[A-Za-z0-9_\-:.]+",
    "updates.push.services.mozilla.com": r"/(?:wpush/v[12]|push/v1)/[A-Za-z0-9_\-=]+",
    "web.push.apple.com": r"/[A-Za-z0-9_\-/=]+",
}


def validate_endpoint(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 2048:
        raise ValueError("Unsupported push endpoint.")
    try:
        url = urlsplit(value)
        pattern = PUSH_ENDPOINTS.get(url.hostname)
        if (url.scheme != "https" or not pattern or url.username or url.password
                or url.port not in (None, 443) or url.query or url.fragment
                or url.netloc not in (url.hostname, f"{url.hostname}:443")
                or not re.fullmatch(pattern, url.path)):
            raise ValueError
    except (ValueError, AttributeError):
        raise ValueError("Unsupported push endpoint.") from None
    return value


def decode_key(value, size):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+={0,2}", value):
        raise ValueError("Invalid subscription key.")
    try:
        decoded = base64.b64decode(value.rstrip("=") + "=" * (-len(value.rstrip("=")) % 4), altchars=b"-_", validate=True)
        if len(decoded) != size:
            raise ValueError
        if size == 65:
            ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), decoded)
        return decoded
    except (ValueError, TypeError):
        raise ValueError("Invalid subscription key.") from None


def push_configured():
    subject = settings.WEB_PUSH_VAPID_SUBJECT
    return bool(settings.WEB_PUSH_VAPID_PRIVATE_KEY and settings.WEB_PUSH_VAPID_PUBLIC_KEY
                and (subject.startswith("mailto:") or subject.startswith("https://")))


class PushSession(requests.Session):
    def __init__(self):
        super().__init__()
        self.trust_env = False

    def request(self, method, url, **kwargs):
        validate_endpoint(url)
        kwargs["allow_redirects"] = False
        return super().request(method, url, **kwargs)


def send_notification_pushes(created):
    """Use only IDs/recipients from bulk_create; never recalculate recipients.

    A DB claim prevents a second callback from resending a notification. The
    budget and attempt cap intentionally drop excess work; there is no retry.
    """
    if not push_configured():
        return
    deadline = time.monotonic() + PUSH_BUDGET_SECONDS
    attempts = 0
    try:
        with PushSession() as session:
            for notification_id, recipient_id in created:
                if attempts >= MAX_PUSH_ATTEMPTS or time.monotonic() >= deadline:
                    logger.warning("Push batch budget exhausted; remaining in-app notifications are preserved.")
                    return
                notification = Notification.objects.select_related("recipient").filter(
                    id=notification_id, recipient_id=recipient_id,
                    recipient__is_active=True, recipient__must_change_password=False,
                ).first()
                if not notification or not Notification.objects.filter(
                    id=notification_id, push_attempted_at__isnull=True,
                ).update(push_attempted_at=timezone.now()):
                    continue
                subscriptions = PushSubscription.objects.filter(
                    user_id=recipient_id, updated_at__lte=notification.created_at,
                ).order_by("created_at", "id")[:MAX_PUSH_ATTEMPTS]
                # Generic lock-screen content only. SW maps this to an existing route.
                payload = json.dumps({"id": str(notification.id), "title": "RARE",
                                      "body": "You have a new notification in RARE.",
                                      "destination": "admin/notifications" if notification.recipient.role == "ADMIN" else "supervisor/notifications"})
                for subscription in subscriptions:
                    if attempts >= MAX_PUSH_ATTEMPTS or time.monotonic() >= deadline:
                        logger.warning("Push batch budget exhausted; remaining in-app notifications are preserved.")
                        return
                    if not PushSubscription.objects.filter(
                        id=subscription.id, user_id=recipient_id, revision=subscription.revision,
                        user__is_active=True, user__must_change_password=False,
                    ).exists():
                        continue
                    attempts += 1
                    try:
                        webpush(
                            subscription_info={"endpoint": subscription.endpoint, "keys": {
                                "p256dh": subscription.p256dh, "auth": subscription.auth}},
                            data=payload,
                            vapid_private_key=settings.WEB_PUSH_VAPID_PRIVATE_KEY,
                            vapid_claims={"sub": settings.WEB_PUSH_VAPID_SUBJECT},
                            timeout=PUSH_TIMEOUT, ttl=300, requests_session=session,
                        )
                    except WebPushException as error:
                        status = getattr(error.response, "status_code", None)
                        if status in (404, 410):
                            PushSubscription.objects.filter(
                                id=subscription.id, user_id=recipient_id,
                                revision=subscription.revision,
                            ).delete()
                        # Exception strings / responses may contain endpoint secrets.
                        logger.warning("Push attempt failed (HTTP %s).", status or "unavailable")
                    except Exception:
                        logger.warning("Push attempt failed; in-app notification preserved.")
    except Exception:
        # Includes DB and configuration failures after the business transaction committed.
        logger.warning("Push batch failed; in-app notifications preserved.")
