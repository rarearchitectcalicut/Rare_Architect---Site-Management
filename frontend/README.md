# RARE frontend and mobile installation

RARE remains a responsive React website. Its production build also includes an installable PWA manifest and a plugin-generated service worker. Project data, editing, uploads and submissions require an internet connection.

## Build and local checks

Use Node `^20.19.0 || >=22.12.0`, as required by Vite 8. Validated with Node 24.21.0, Vite 8.3.4 and vite-plugin-pwa 2.0.0. Install with `npm ci`.
Set `VITE_API_BASE_URL` to the existing Django API URL, including `/api/v1/` and its trailing slash. All `VITE_` variables are public; do not include secrets. During local development, a loopback API URL on port `8000` is routed through Vite's `/api` proxy so phones and other LAN devices reach Django on the development host rather than their own `localhost`. Production builds retain the configured URL.

The frontend defaults to `/`. For subdirectory hosting, set `VITE_BASE_PATH` to an absolute pathname with a trailing slash (for example `/rare/`) at build time. Vite assets, BrowserRouter, manifest URLs and the worker navigation allowlist follow this path. Keep that path stable after users install the app.

```sh
npm run lint
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Test the production preview: service workers are disabled during development. Localhost supports desktop worker checks; a phone accessing a LAN IP needs trusted HTTPS. Vite preview is a local test server, not a production server.

## Caching, authentication and updates

- `vite-plugin-pwa` generates `dist/sw.js` and its Workbox dependency. There is no custom worker or background sync queue. The worker precaches an explicit list of public HTML, built JS/CSS/fonts, logo, manifest and icons. The decorative login background loads from the network.
- `runtimeCaching` is empty. API requests, approvals, protected images, document previews/downloads and uploads always go to the network. No API response or private file is stored in service-worker Cache Storage.
- Only known React navigation paths receive the cached public HTML shell. `/api/v1/`, media paths, Django `/admin/` and its model/login pages are not SPA fallbacks. Project/task detail paths use existing UUID identifiers.
- Authentication, sessionStorage tokens, role guards, API payloads and logout are unchanged. Logout clears the existing session and unmounts protected views. Remaining PWA caches contain public assets only. Existing protected file endpoints send `Cache-Control: private, no-store`; preserve these headers through proxies/CDNs.
- Updates wait for **Update RARE** and the existing confirmation dialog. An open form, dialog or editable control blocks the action: save, wait for uploads, close the editor and use the dashboard. A worker activated by another window never automatically reloads this one. Update checks run hourly while visible and when returning to the app or reconnecting. Closing every RARE window also lets a waiting worker activate.
- Network loss or a failed API connection displays an app status alert. No writes are queued or automatically replayed offline. A lost response may follow a successful server write: check the record before resubmitting.

The four added icons resize the existing approved `public/rare-logo.png` on the existing beige brand color. The maskable variant keeps the entire logo inside the central 80% safe circle. No replacement branding was introduced.

## Production hosting requirements

1. Serve `dist/` over trusted HTTPS. Serve `sw.js` as JavaScript, the manifest as `application/manifest+json`, and icons as `image/png`. These files must return 200 without login redirects under the configured frontend base.
2. Send `Cache-Control: no-cache` for `index.html`, `sw.js`, the manifest and Workbox worker files. Content-hashed `assets/` files can use `public, max-age=31536000, immutable`. Deploy a complete release atomically; retain prior hashed assets long enough for open windows to finish their work. Never rewrite a missing asset or worker request to HTML.
3. Keep API and protected-file traffic out of CDN/proxy caches; send `Cache-Control: private, no-store` for authenticated API responses. Never expose Django `private_documents` or `private_media` directories as public static files. Preserve backend authorization checks.
4. Return public `index.html` for direct React routes, including Admin and Supervisor deep links. Worker fallbacks do not replace server routing on first visits. APIs, Django Admin and missing assets keep real status codes.

There is no production hosting configuration in this repository. React `/admin/dashboard`, `/admin/projects/...`, etc. overlap Django's `/admin/` prefix. Choose one of these arrangements:

- **Separate origins:** serve frontend SPA routes from the frontend host; keep Django Admin and `/api/v1/` on the backend host. Keep existing API URL and CORS settings consistent. A frontend-only Nginx example appears below.
- **Shared origin:** explicitly route known React paths (see the allowlist in `vite.config.js`), including UUID detail paths, to `index.html`. Route remaining `/admin/` requests and `/api/v1/` to Django. Put these rules ahead of a generic SPA fallback. Sending every `/admin/` request to either React or Django breaks one of the applications.

Example for a **frontend-only origin at `/`**, after configuring TLS and the backend origin separately:

```nginx
root /srv/rare/frontend/dist;
index index.html;

location ~ ^/(?:sw\.js|workbox-[^/]+\.js|manifest\.webmanifest|index\.html)$ {
    add_header Cache-Control "no-cache" always;
    try_files $uri =404;
}
location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
}
location ~* \.(?:png|jpe?g|svg|ico|webmanifest|js|css|woff2?)$ {
    try_files $uri =404;
}
location / {
    try_files $uri $uri/ /index.html;
}
```

Adapt locations and the filesystem root for subdirectory hosting. Do not apply this frontend-only example to a shared Django origin unchanged.

## Install on phones

- **Android:** open the HTTPS RARE frontend URL in Chrome. From its menu choose **Install app** or **Add to Home screen**, then confirm. Launch from the home-screen icon; RARE should open without the browser address bar.
- **iPhone:** open the HTTPS RARE frontend URL in Safari. Tap **Share > Add to Home Screen > Add** (enable **Open as Web App** if offered). Launch the new icon. Sign in normally; installed-app storage can differ from browser storage.

Both modes use the same responsive UI and backend permissions. Installation does not grant offline editing or change session persistence.

## Release verification

Checks for this change: existing lint/build/test commands, manifest/icon inspection, generated-worker cache/route checks and root/subdirectory builds. Existing lint and bundle-size warnings remain. Dependency installation reported four low-severity audit findings; existing dependency versions were preserved.

Browser automation stopped because Windows browser URL verification failed. No actual Android or iPhone was connected. Verify these on deployed HTTPS:

| Check | Expected result |
| --- | --- |
| Manifest/icons | Correct name, base, standalone display; maskable crop retains the logo |
| Worker | Active registration under frontend base; no registration errors |
| Android/iPhone | Installation succeeds; home-screen launch uses standalone mode |
| Admin/Supervisor | Authorized dashboard and UUID deep links load directly and after refresh; wrong roles stay blocked |
| Django Admin | Admin index, login and model pages reach Django on the configured backend origin |
| Login/logout | Session restore, expiry, refresh and logout work; logged-out protected views are inaccessible |
| Private files | Authorized preview/download works; unauthorized requests fail; no private URLs in Cache Storage |
| Uploads | Task/project/report uploads work; disconnect errors are visible without queued replay |
| Daily Reports | Save/correction/submission work; a waiting update preserves an open editor |
| Two-version update | Deploy changed frontend; cancel/confirm update; no unsolicited reload in either of two windows |
| Network loss | Clear connectivity error; no offline saves/submissions; reconnect and explicitly retry |
| Cache security | Only public assets in Cache Storage after private data use and logout |

The 82 existing frontend tests cover authentication refresh, role-specific navigation, private document requests/uploads and Daily Report workflows. They do not replace authenticated end-to-end testing against the deployed backend.
