import base64
import json
import uuid
from unittest.mock import Mock, patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase, override_settings
from pywebpush import WebPushException
from rest_framework.test import APIClient

from .models import Notification, PushSubscription
from .push import MAX_PUSH_ATTEMPTS, PUSH_TIMEOUT, PushSession, send_notification_pushes
from .services import create_notifications


def encoded(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


PUBLIC_KEY = encoded(ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(
    serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint,
))
KEYS = {"p256dh": PUBLIC_KEY, "auth": encoded(b"test-auth-secret")}
PUSH_SETTINGS = {
    "SECURE_SSL_REDIRECT": False,
    "WEB_PUSH_VAPID_PRIVATE_KEY": "test-private-never-send",
    "WEB_PUSH_VAPID_PUBLIC_KEY": PUBLIC_KEY,
    "WEB_PUSH_VAPID_SUBJECT": "mailto:push@example.com",
}


@override_settings(**PUSH_SETTINGS)
class PushTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="push-one", first_name="One", email="push-one@example.com", phone="+919900007001")
        self.other = User.objects.create_user(username="push-two", first_name="Two", email="push-two@example.com", phone="+919900007002", role="ADMIN", is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = "/api/v1/notifications/push/subscription/"
        self.key_url = "/api/v1/notifications/push/public-key/"

    def payload(self, suffix="device"):
        return {"endpoint": f"https://fcm.googleapis.com/fcm/send/{suffix}", "keys": dict(KEYS), "expirationTime": None}

    def subscribe(self, user=None, suffix="device"):
        payload = self.payload(suffix)
        return PushSubscription.objects.create(user=user or self.user, endpoint=payload["endpoint"], **payload["keys"])

    def notify(self, recipients=None):
        return create_notifications(recipient_ids=recipients or [self.user.pk], notification_type="SYSTEM",
                                    title="Secret project title", message="Secret private details")

    def test_authentication_and_password_change_restrictions(self):
        for authenticated, expected in ((False, 401), (True, 403)):
            self.user.must_change_password = True
            self.user.save(update_fields=["must_change_password"])
            self.client.force_authenticate(self.user if authenticated else None)
            for method, url, data in (("get", self.key_url, None), ("post", self.url, self.payload()),
                                      ("delete", self.url, self.payload()), ("post", self.url + "status/", self.payload())):
                response = getattr(self.client, method)(url, data, format="json")
                self.assertEqual(response.status_code, expected)
        self.assertFalse(PushSubscription.objects.exists())

    def test_public_key_is_the_only_key_returned_and_not_cached(self):
        response = self.client.get(self.key_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"public_key": PUBLIC_KEY})
        self.assertEqual(response["Cache-Control"], "no-store")
        with override_settings(WEB_PUSH_VAPID_PRIVATE_KEY=""):
            self.assertEqual(self.client.get(self.key_url).status_code, 503)

    def test_repeat_registration_is_idempotent_and_supports_multiple_devices(self):
        for _ in range(2):
            self.assertEqual(self.client.post(self.url, self.payload(), format="json").data, {"enabled": True})
        first = PushSubscription.objects.get()
        original_updated_at = first.updated_at
        self.assertEqual(self.client.post(self.url, self.payload("second"), format="json").status_code, 200)
        self.assertEqual(PushSubscription.objects.filter(user=self.user).count(), 2)
        self.client.post(self.url, self.payload(), format="json")
        first.refresh_from_db()
        self.assertEqual(first.updated_at, original_updated_at)

    def test_owner_is_taken_from_authentication_not_payload(self):
        payload = {**self.payload(), "user": str(self.other.pk)}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(PushSubscription.objects.get().user, self.user)
        self.assertEqual(set(response.data), {"enabled"})

    def test_delete_and_status_are_private_and_owner_scoped(self):
        subscription = self.subscribe(self.other)
        self.assertEqual(self.client.post(self.url + "status/", self.payload(), format="json").data, {"enabled": False})
        self.assertEqual(self.client.delete(self.url, self.payload(), format="json").status_code, 204)
        self.assertTrue(PushSubscription.objects.filter(pk=subscription.pk).exists())
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(self.url + "status/", self.payload(), format="json").data, {"enabled": True})
        for _ in range(2):
            self.assertEqual(self.client.delete(self.url, self.payload(), format="json").status_code, 204)
        self.assertFalse(PushSubscription.objects.exists())
        self.assertEqual(self.client.get(self.url).status_code, 405)

    def test_switching_accounts_reassigns_one_endpoint_and_changes_revision(self):
        subscription = self.subscribe()
        previous = subscription.revision
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(self.url, self.payload(), format="json").status_code, 200)
        self.assertEqual(PushSubscription.objects.count(), 1)
        subscription.refresh_from_db()
        self.assertEqual(subscription.user_id, self.other.pk)
        self.assertNotEqual(subscription.revision, previous)
        self.client.force_authenticate(self.user)
        self.client.delete(self.url, self.payload(), format="json")
        self.assertTrue(PushSubscription.objects.filter(pk=subscription.pk).exists())

    def test_cross_account_reassignment_requires_matching_device_keys(self):
        subscription = self.subscribe()
        self.client.force_authenticate(self.other)
        payload = self.payload()
        payload["keys"]["auth"] = encoded(b"different-secret")
        self.assertEqual(self.client.post(self.url, payload, format="json").status_code, 400)
        subscription.refresh_from_db()
        self.assertEqual(subscription.user_id, self.user.pk)

    def test_payload_size_and_content_type_are_bounded(self):
        self.assertEqual(self.client.post(self.url, json.dumps({"padding": "a" * 4097}), content_type="application/json").status_code, 413)
        self.assertEqual(self.client.post(self.url, "bad json", content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post(self.url, {"endpoint": self.payload()["endpoint"]}).status_code, 415)

    def test_invalid_endpoints_fail_closed(self):
        endpoints = ["http://fcm.googleapis.com/fcm/send/token", "https://127.0.0.1/token", "https://[::1]/token",
                     "https://localhost/token", "https://169.254.169.254/latest/meta-data/", "https://fcm.googleapis.com.evil.test/fcm/send/token",
                     "https://fcm.googleapis.com:444/fcm/send/token", "https://user:password@fcm.googleapis.com/fcm/send/token",
                     "https://fcm.googleapis.com/fcm/send/token?url=https://evil.test", "https://web.push.apple.com/token#fragment",
                     "https://fcm.googleapis.com/../token", "https://web.push.apple.com/%2e%2e/token", "https://example.com/token"]
        for endpoint in endpoints:
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self.client.post(self.url, {**self.payload(), "endpoint": endpoint}, format="json").status_code, 400)
        self.assertFalse(PushSubscription.objects.exists())

    def test_supported_apple_mozilla_and_google_endpoints(self):
        for endpoint in ["https://web.push.apple.com/Q-test/token", "https://updates.push.services.mozilla.com/wpush/v2/test-token", "https://fcm.googleapis.com/wp/token"]:
            self.assertEqual(self.client.post(self.url, {**self.payload(), "endpoint": endpoint}, format="json").status_code, 200)

    def test_invalid_keys_and_missing_fields_are_rejected(self):
        for keys in [{}, {"p256dh": "a", "auth": KEYS["auth"]}, {"p256dh": encoded(b"\x04" + b"\x00" * 64), "auth": KEYS["auth"]},
                     {**KEYS, "auth": "unsafe+/=="}, {**KEYS, "auth": encoded(b"too short")}, {**KEYS, "p256dh": "A" * 300}]:
            self.assertEqual(self.client.post(self.url, {**self.payload(), "keys": keys}, format="json").status_code, 400)
        self.assertFalse(PushSubscription.objects.exists())

    def test_device_limit_preserves_existing_device_registration(self):
        for index in range(10):
            self.subscribe(suffix=f"device-{index}")
        self.assertEqual(self.client.post(self.url, self.payload("extra"), format="json").status_code, 400)
        self.assertEqual(self.client.post(self.url, self.payload("device-0"), format="json").status_code, 200)

    @patch("notifications.services.send_notification_pushes")
    def test_commit_schedules_actual_created_ids_and_deduplicates_recipient_input(self, send):
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            self.assertEqual(self.notify([self.user.pk, self.user.pk]), 1)
            send.assert_not_called()
        self.assertEqual(len(callbacks), 1)
        notification = Notification.objects.get()
        send.assert_called_once_with(((notification.id, self.user.pk),))

    @patch("notifications.services.send_notification_pushes")
    def test_rollback_discards_database_notification_and_push(self, send):
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            with self.assertRaises(RuntimeError), transaction.atomic():
                self.notify()
                raise RuntimeError("business operation failed")
        self.assertEqual(callbacks, [])
        self.assertFalse(Notification.objects.exists())
        send.assert_not_called()

    @patch("notifications.push.webpush")
    def test_delivery_uses_recipient_devices_only_and_generic_payload(self, send):
        mine = self.subscribe()
        self.subscribe(self.other, "other")
        with self.captureOnCommitCallbacks(execute=True):
            self.notify()
        send.assert_called_once()
        kwargs = send.call_args.kwargs
        self.assertEqual(kwargs["subscription_info"]["endpoint"], mine.endpoint)
        self.assertEqual(kwargs["timeout"], PUSH_TIMEOUT)
        self.assertIsInstance(kwargs["requests_session"], PushSession)
        payload = json.loads(kwargs["data"])
        self.assertEqual(set(payload), {"id", "title", "body", "destination"})
        self.assertEqual(payload["destination"], "supervisor/notifications")
        self.assertNotIn("Secret", kwargs["data"])
        self.assertNotIn(KEYS["auth"], kwargs["data"])
        self.assertNotIn(PUSH_SETTINGS["WEB_PUSH_VAPID_PRIVATE_KEY"], kwargs["data"])
        self.assertEqual(Notification.objects.count(), 1)

    @patch("notifications.push.webpush")
    def test_same_notification_is_never_attempted_twice(self, send):
        self.subscribe()
        with self.captureOnCommitCallbacks(execute=True):
            self.notify()
        notification = Notification.objects.get()
        send_notification_pushes(((notification.id, notification.recipient_id),))
        self.assertEqual(send.call_count, 1)
        notification.refresh_from_db()
        self.assertIsNotNone(notification.push_attempted_at)

    def test_expired_cleanup_only_for_404_and_410(self):
        for status in (404, 410, 400, 401, 403, 429, 500):
            with self.subTest(status=status):
                PushSubscription.objects.all().delete()
                subscription = self.subscribe()
                error = WebPushException("SECRET endpoint/auth must not be logged", response=Mock(status_code=status))
                with patch("notifications.push.webpush", side_effect=error), self.assertLogs("notifications.push") as logs:
                    with self.captureOnCommitCallbacks(execute=True):
                        self.notify()
                self.assertEqual(PushSubscription.objects.filter(pk=subscription.pk).exists(), status not in (404, 410))
                self.assertNotIn("SECRET", " ".join(logs.output))

    @patch("notifications.push.webpush", side_effect=RuntimeError("SECRET private material"))
    def test_unexpected_delivery_failure_cannot_break_successful_notification(self, send):
        self.subscribe()
        with self.assertLogs("notifications.push") as logs, self.captureOnCommitCallbacks(execute=True):
            self.notify()
        self.assertEqual(Notification.objects.count(), 1)
        self.assertNotIn("SECRET", " ".join(logs.output))

    @patch("notifications.push.webpush")
    def test_sender_has_total_attempt_bound(self, send):
        for index in range(MAX_PUSH_ATTEMPTS + 2):
            self.subscribe(suffix=str(index))
        with self.captureOnCommitCallbacks(execute=True):
            self.notify()
        self.assertEqual(send.call_count, MAX_PUSH_ATTEMPTS)

    @patch("notifications.push.webpush")
    def test_inactive_password_change_and_reassigned_devices_are_not_sent(self, send):
        subscription = self.subscribe()
        with self.captureOnCommitCallbacks(execute=False):
            self.notify()
        subscription.user = self.other
        subscription.revision = uuid.uuid4()
        subscription.save()
        notification = Notification.objects.get()
        send_notification_pushes(((notification.id, self.user.pk),))
        send.assert_not_called()
        self.user.is_active = False
        self.user.save()
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.notify(), 0)

    @patch("notifications.push.webpush")
    def test_disabled_configuration_preserves_in_app_notification(self, send):
        self.subscribe()
        with override_settings(WEB_PUSH_VAPID_PRIVATE_KEY=""), self.captureOnCommitCallbacks(execute=True):
            self.notify()
        send.assert_not_called()
        self.assertEqual(Notification.objects.count(), 1)

    def test_outbound_session_disables_redirects_and_environment_proxies(self):
        with PushSession() as session, patch("requests.Session.request") as request:
            session.post(self.payload()["endpoint"], timeout=PUSH_TIMEOUT)
            self.assertFalse(session.trust_env)
            self.assertFalse(request.call_args.kwargs["allow_redirects"])
            with self.assertRaises(ValueError):
                session.post("https://127.0.0.1/token")

    @patch("notifications.push.webpush")
    def test_password_change_restriction_is_rechecked_before_delivery(self, send):
        self.subscribe()
        with self.captureOnCommitCallbacks(execute=False):
            self.notify()
        self.user.must_change_password = True
        self.user.save(update_fields=["must_change_password"])
        notification = Notification.objects.get()
        send_notification_pushes(((notification.id, self.user.pk),))
        send.assert_not_called()

    def test_expired_response_cannot_delete_a_reassigned_subscription(self):
        subscription = self.subscribe()

        def reassigned(**kwargs):
            PushSubscription.objects.filter(pk=subscription.pk).update(user=self.other, revision=uuid.uuid4())
            raise WebPushException("Expired", response=Mock(status_code=410))

        with patch("notifications.push.webpush", side_effect=reassigned), self.assertLogs("notifications.push"), self.captureOnCommitCallbacks(execute=True):
            self.notify()
        subscription.refresh_from_db()
        self.assertEqual(subscription.user_id, self.other.pk)

    @patch("notifications.push.webpush")
    def test_sender_stops_when_elapsed_budget_is_exhausted(self, send):
        self.subscribe()
        with patch("notifications.push.time.monotonic", side_effect=[0, 1, 10]), self.assertLogs("notifications.push"), self.captureOnCommitCallbacks(execute=True):
            self.notify()
        send.assert_not_called()
