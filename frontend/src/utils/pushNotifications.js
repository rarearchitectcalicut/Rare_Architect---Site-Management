import { pushApi } from "../api/pushApi";

let generation = 0;
const base = import.meta.env.BASE_URL || "/";

function bounded(promise, ms = 8000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Device notification setup timed out. Reopen RARE and retry.")), ms);
    })]).finally(() => clearTimeout(timer));
}

export function pushSupport() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const installed = navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
    if (ios && !installed) return "On iPhone or iPad, use Share → Add to Home Screen, open RARE from its icon, then enable notifications here (iOS/iPadOS 16.4 or later).";
    if (!window.isSecureContext) return "Device notifications require a secure HTTPS connection.";
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "This browser does not support device notifications. Your in-app notifications remain available.";
    return "";
}

async function registration(wait = true) {
    if (!("serviceWorker" in navigator)) return null;
    const current = await bounded(navigator.serviceWorker.getRegistration(base));
    if (!current && !wait) return null;
    if (!current) throw new Error("Install or update RARE first, then reopen it and retry.");
    const ready = wait ? await bounded(navigator.serviceWorker.ready) : current;
    if (ready.scope !== current.scope || !ready.active) throw new Error("RARE's service worker is not ready. Reopen the app and retry.");
    return ready;
}

function online() {
    if (!navigator.onLine) throw new Error("Connect to the internet and retry. Device settings have not been saved.");
}

export function applicationServerKey(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) throw new Error("Device notifications are not configured correctly.");
    const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
    const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
    if (bytes.length !== 65 || bytes[0] !== 4) throw new Error("Device notifications are not configured correctly.");
    return bytes;
}

export async function currentPushState() {
    online();
    const worker = await registration();
    const subscription = await bounded(worker.pushManager.getSubscription());
    if (!subscription) return { enabled: false, hasSubscription: false };
    const state = await pushApi.status(subscription.endpoint);
    return { enabled: state.enabled === true && Notification.permission === "granted", hasSubscription: true };
}

export async function enableDevicePush() {
    const reason = pushSupport();
    if (reason) throw new Error(reason);
    online();
    const version = ++generation;
    // Called only by the button handler, before awaiting network/SW readiness.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in your device/browser settings, then retry.");
    const worker = await registration();
    const { public_key } = await pushApi.publicKey();
    const key = applicationServerKey(public_key);
    if (version !== generation) throw new Error("Notification setup was cancelled.");
    let subscription = await bounded(worker.pushManager.getSubscription());
    let created = false;
    try {
        if (subscription?.options?.applicationServerKey) {
            const existingKey = new Uint8Array(subscription.options.applicationServerKey);
            if (existingKey.length !== key.length || existingKey.some((value, index) => value !== key[index])) {
                throw new Error("The notification key changed. Disable notifications on this device, then enable them again.");
            }
        }
        if (!subscription) {
            subscription = await bounded(worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
            created = true;
        }
        if (version !== generation) throw new Error("Notification setup was cancelled.");
        await pushApi.register(subscription.toJSON());
        if (version !== generation) throw new Error("Notification setup was cancelled.");
        return { enabled: true, hasSubscription: true };
    } catch (error) {
        if (created || version !== generation) {
            // Revoke even if the server stored the row but the response was lost.
            await Promise.allSettled([pushApi.remove(subscription?.endpoint), bounded(subscription?.unsubscribe(), 3000)]);
        }
        throw error;
    }
}

export async function disableDevicePush({ localOnly = false } = {}) {
    const version = ++generation; // Cancel an enable action still waiting on permission/network.
    const worker = await registration(false);
    if (!worker?.pushManager) return;
    const subscription = await bounded(worker.pushManager.getSubscription(), 3000);
    if (!subscription || version !== generation) return;
    // Unsubscribe even if server revocation is offline or authentication expired.
    const results = await Promise.allSettled([
        localOnly ? Promise.resolve() : pushApi.remove(subscription.endpoint),
        bounded(subscription.unsubscribe(), 3000),
    ]);
    if (results.some((item) => item.status === "rejected") || results[1].value === false) {
        throw new Error("Device cleanup could not be fully confirmed. Reconnect and retry; browser permission can also be revoked in device settings.");
    }
}

export function pushError(error) {
    if (error?.response?.status === 401) return "Your session expired. Sign in again to manage device notifications.";
    if (error?.response?.status === 403) return "Your account cannot change this setting. Complete any required password change and retry.";
    if (error?.response?.status === 503) return "Device notifications are not configured yet. Contact your administrator.";
    const detail = error?.response?.data?.detail;
    return typeof detail === "string" ? detail : error?.message || "Unable to update device notifications. Please retry.";
}
