# RARE device push notifications

Implemented on `feature/pwa-push-notifications`. No production environment files, deployments, commits, merges or pushes were changed. The existing untracked audit document and root file are preserved.

## Architecture and delivery limits

`create_notifications()` still filters authorized active recipients and bulk-creates the existing in-app notifications. A `transaction.on_commit(..., robust=True)` callback receives those exact notification IDs and recipient IDs. Rollbacks discard the callback. `schedule_notifications()` and the business workflows remain intact; no signals or duplicate in-app notifications are introduced.

This initial sender is **best effort and synchronous after commit**, not a durable queue. Each notification has an internal atomic `push_attempted_at` claim to prevent a second callback from sending it again. The sender checks a six-second scheduling budget, caps a batch at ten HTTP attempts, and uses two-second connect/read timeouts with no retries or redirects. An in-flight request can finish after the scheduling budget; these are Requests socket timeouts, not a hard process-wide wall-clock deadline. Excess devices/recipients are intentionally skipped. A crash after the claim can lose push delivery, including remaining devices for that notification. Distinct in-app notification IDs are not deduplicated across unrelated business operations; existing workflow idempotency remains responsible for creation retries.

Delivery failures never roll back committed business data. Confirmed HTTP 404/410 removes the expired subscription only if its owner and revision still match. Other failures retain subscriptions and log only a generic outcome/status code, without exception strings, endpoints, authentication keys, response bodies or VAPID material. Notifications contain only an ID, generic RARE title/body, and a fixed notifications-page destination. Private project details, credentials and documents are excluded.

Render Free can sleep, restart or terminate work, and there is no background retry infrastructure here. **Do not treat this as guaranteed delivery.** Before relying on push operationally, use a transactional outbox plus a separate worker, per-device delivery records, retry/backoff, monitoring, and an explicit deduplication policy. The existing in-app register remains authoritative.

## APIs and database migration

All paths are under `/api/v1/notifications/push/`. JWT authentication and `MustChangePasswordPermission` apply; responses use `Cache-Control: no-store`.

| Method/path | Request | Response |
| --- | --- | --- |
| `GET public-key/` | None | `{ "public_key": "<public VAPID key>" }`; 503 when unavailable |
| `POST subscription/` | Browser `PushSubscription.toJSON()`: `endpoint`, `keys.p256dh`, `keys.auth`, optional `expirationTime` | `{ "enabled": true }` |
| `DELETE subscription/` | `{ "endpoint": "<current device endpoint>" }` | 204; idempotent and owner-scoped |
| `POST subscription/status/` | `{ "endpoint": "<current device endpoint>" }` | `{ "enabled": true/false }` for this account only |

JSON request bodies are capped at 4096 bytes (413 when exceeded); other content types are unsupported. Endpoints are HTTPS, at most 2048 characters, on an exact vendor-owned host with a reviewed path. Custom ports other than 443, credentials, query strings, fragments, IP/localhost endpoints and percent-encoded paths are rejected. Accepted hosts: `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`. Requests do not follow redirects or inherit environment proxy settings. Unsupported providers fail closed and require a code review before adding a host/path; there is no arbitrary endpoint override environment variable.

The P-256 key must decode to a valid 65-byte curve point; the auth secret must decode to 16 bytes. Keys are normalized to base64url. Subscription authentication data and endpoints are stored only server-side and are not listed through these APIs. Treat database access/backups as sensitive. Each account can have up to ten devices. A unique endpoint has exactly one owner; account switching with the same endpoint requires matching browser keys and changes its revision. One user cannot remove or inspect another user's association. Notifications created before a device was registered/reassigned are not replayed to it.

Migration: `backend/notifications/migrations/0002_notification_push_attempted_at_pushsubscription.py`. It adds `PushSubscription` and the internal notification claim timestamp. It does not expose that timestamp in the existing notification serializer.

## Configuration

Install the pinned dependency from `backend/requirements.txt`: `pywebpush==2.3.0`. Set these **backend-only** environment variables through the authorized hosting secret manager:

| Variable | Value |
| --- | --- |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Base64url encoded P-256 private key (raw 32 bytes or DER), or an existing secured PEM file path |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | Matching uncompressed 65-byte P-256 public key, base64url encoded |
| `WEB_PUSH_VAPID_SUBJECT` | A real contact such as `mailto:ops@your-domain.example` or an HTTPS contact URL |

Generate a pair once in a trusted local terminal, using the project virtual environment and this Python snippet. Store the output securely; do not commit it. **This implementation did not generate or configure production keys.**

```python
import base64
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

key = ec.generate_private_key(ec.SECP256R1())
encode = lambda value: base64.urlsafe_b64encode(value).decode().rstrip("=")
print("WEB_PUSH_VAPID_PRIVATE_KEY=" + encode(key.private_numbers().private_value.to_bytes(32, "big")))
print("WEB_PUSH_VAPID_PUBLIC_KEY=" + encode(key.public_key().public_bytes(
    serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint,
)))
```

Keep the pair stable. Key rotation requires existing devices to Disable Notifications, then Enable Notifications again. The frontend rejects reuse of a subscription created with a different application-server key. No frontend VAPID environment variable is needed: the authenticated public-key API supplies it.

## Service worker and settings

The existing `generateSW` worker imports `public/push-events.js` using Workbox `importScripts`. The installed Workbox schema explicitly supports this extension for push listeners ([Workbox option definition](https://github.com/GoogleChrome/workbox/blob/v7/packages/workbox-build/src/types.ts)). No second service worker is registered. `App.jsx`, prompt-based manual update confirmation, `skipWaiting: false`, `clientsClaim: false`, precaching rules, navigation allowlist and the empty runtime API cache remain unchanged.

The push listener always displays generic content, including for malformed payloads. Notification IDs become notification tags to coalesce repeated display of the same record. Click destinations are restricted to the existing Admin/Supervisor notifications routes within the worker scope, with the app root as a safe fallback. An app window is navigated/focused when available; otherwise a safe app window opens. Existing route guards and backend authorization still control access. Clicks do not mark records read automatically.

Both actual Settings pages show `PushPreferences`. It checks support, HTTPS, installation and current browser/server association without prompting. Enable Notifications requests permission directly from the button interaction, waits for the existing worker, retrieves the public key and registers the browser subscription through the existing Axios client. Disable Notifications attempts both owner-scoped server removal and browser unsubscribe. Settings show blocked, offline, unavailable and expired-session errors without claiming success. Use **Check status** to refresh permission/association state after changing device settings.

Explicit logout attempts server revocation and browser unsubscribe before clearing authentication. Expired authentication also triggers local browser unsubscribe. Failures never prevent local logout. Pending enable operations are cancelled across cleanup. If offline cleanup cannot complete, a stale server row may remain until a later 404/410; a failed browser unsubscribe can leave generic alerts possible until device/browser permission is revoked. Cleanup is not durably retried after the endpoint/browser state is lost. A push already accepted by a vendor before logout cannot be recalled. Accounts on shared devices should explicitly sign out; this change does not introduce a cross-tab authentication/session synchronization system or silently associate devices at login.

## Automated validation

Final results: **38 Django tests passed** (`notifications` and `users`); **141 frontend tests passed**; production build and generated-worker verification passed; Django system/migration checks, `pip check` and whitespace checks passed. Lint exits successfully with 40 warnings in existing code and no warning in the new push files. The build retains its large-bundle warning.

Tests use a PostgreSQL **test database** and mocked outgoing push calls; no real push-service request is made. Existing settings enable HTTPS redirects outside DEBUG, so the local test invocation overrides `SECURE_SSL_REDIRECT=False` in process memory only:

```powershell
# From backend
venv/Scripts/python.exe -m pip install -r requirements.txt
venv/Scripts/python.exe manage.py makemigrations --check --dry-run
venv/Scripts/python.exe manage.py check
venv/Scripts/python.exe -c "import os; os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings'); from django.conf import settings; settings.SECURE_SSL_REDIRECT=False; from django.core.management import execute_from_command_line; execute_from_command_line(['manage.py','test','notifications','users','--noinput'])"

# From frontend
npm.cmd test
npm.cmd run lint
npm.cmd run build
node scripts/verify-push-build.mjs

# From repository root
git diff --check
```

Coverage includes authentication/password restrictions, ownership, multiple devices, repeat registration, reassignment, payload/endpoint/key rejection, request-size limits, rollback/commit behavior, private payloads/logs, at-most-once attempts, device cleanup and bounded send attempts. Frontend tests cover user-gesture permission requests, iPhone instructions, local/server state, offline/denied permission, account/logout races, key rotation, cleanup failure, malicious click URLs, existing-window focus, generic malformed pushes and local logout even when remote operations fail.

The build verification script evaluates the **generated** worker with mocked Workbox/browser primitives. It verifies imported push handlers, public precaching, restricted navigation fallback, no automatic skip-waiting/client claim, and preserved explicit `SKIP_WAITING` handling. This is not a browser lifecycle or device delivery test. Lint retains unrelated existing warnings; Vite retains the large-bundle warning.

## Changed files

| Files | Purpose |
| --- | --- |
| `backend/notifications/models.py`, `migrations/0002_notification_push_attempted_at_pushsubscription.py` | Device ownership, unique endpoints, revisions, timestamps and one-attempt notification claim |
| `backend/notifications/push.py`, `services.py` | Validated/bounded sender and post-commit integration into existing bulk creation |
| `backend/notifications/serializers.py`, `push_views.py`, `urls.py` | Authenticated public-key/register/remove/status APIs, validation and bounded JSON parsing |
| `backend/config/settings.py`, `backend/requirements.txt` | Backend-only VAPID configuration and pinned `pywebpush` dependency |
| `backend/notifications/test_push.py` | Focused API, privacy, ownership, transaction and mocked delivery tests |
| `frontend/public/push-events.js`, `frontend/vite.config.js` | Push/click handlers imported by the existing generated worker |
| `frontend/src/api/pushApi.js`, `frontend/src/utils/pushNotifications.js` | Existing authenticated-client requests, support/permission/subscription state and cleanup |
| `frontend/src/components/settings/PushPreferences.jsx`, `frontend/src/pages/admin/Settings.jsx`, `frontend/src/pages/supervisor/Settings.jsx` | Shared per-device preferences for both roles |
| `frontend/src/context/AuthContext.jsx` | Best-effort logout revocation and expired-session browser cleanup |
| `frontend/tests/push-notifications.test.js`, `frontend/scripts/verify-push-build.mjs` | Subscription/auth/click tests and generated-worker/update verification |
| `docs/pwa-push-notifications.md` | Configuration, limitations, device test plan and pre-merge steps |

## iPhone acceptance test

Use a staging HTTPS frontend/backend with the migration applied and matching VAPID variables configured. iOS/iPadOS 16.4+ supports Web Push for Home Screen web apps ([WebKit guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).

1. Open RARE, use Share → Add to Home Screen, then launch it from the Home Screen icon. Apply any existing RARE update prompt after saving work so the new push handler is active.
2. Sign in to an authorized Admin or Supervisor account; complete any required temporary-password change. Open Settings. Confirm no permission prompt appears before tapping Enable Notifications.
3. Tap Enable Notifications, allow the native prompt, and confirm the enabled status. Repeat on a second device/account as needed.
4. From another authorized account, perform an existing workflow that creates an in-app notification for this recipient, such as assigning that Supervisor or submitting a task for Admin review. Confirm the ordinary in-app notification is created once.
5. Background/lock the iPhone. Confirm the generic RARE alert appears without project/document details. Tap it and verify the existing notifications screen opens with normal authorization.
6. Disable Notifications and repeat the workflow: in-app notifications should still appear, with no new push to this device. Test sign-out, a second account on the same device, permission denied, reconnect/retry and the manual RARE update flow. Existing delivered OS notifications may remain visible after disabling.

## Android acceptance test

1. In a supported browser such as Chrome, open the staging HTTPS site, install the PWA, open it and apply the normal saved-work update prompt.
2. Sign in, open Settings, and tap Enable Notifications. Allow the permission prompt; Android/browser-level notification settings must also permit RARE alerts.
3. Repeat the two-account workflow/background/lock-screen/click tests above. Test both devices receiving the same account's notification, then disable one device and confirm the other still receives alerts.
4. Test logout/account switching, blocked permissions, offline enable/disable failures and stale subscriptions. Check that authenticated APIs/documents remain uncached and manual PWA updates still wait for user confirmation.

**Real iPhone/Android delivery has not been tested in this workspace.** Do not merge based solely on the mock and build checks.

## Before merging to main

1. Review the isolated branch diff, migration, endpoint host policy, generic payload and logout cleanup. Preserve unrelated files. No commit or push is authorized by this implementation request.
2. Run the checks above against the deployment's pinned dependency set/PostgreSQL version; review warnings and migration plan. Install dependencies and apply the migration to the authorized staging database, not production.
3. Generate/store a matching stable VAPID pair and real contact subject in staging through the authorized secret manager. Deploy the branch only when separately authorized. Serve both `sw.js` and `push-events.js` over HTTPS; confirm the generated worker loads and the manual update is accepted.
4. Complete and record real iPhone and Android tests for both roles, multiple devices, account switching, logout, denial/offline recovery, notification navigation, existing approvals/reports and PWA update prompting. Ensure no private text/credentials appear in device notifications or logs.
5. Decide whether the documented best-effort ten-attempt/six-second sender is acceptable for the intended testing rollout. Implement a transactional outbox/worker before requiring durable production delivery.
6. Obtain explicit approval to commit/push/merge and a separate migration/deployment plan for production secrets and worker capacity. This work does not merge or deploy `main`.
