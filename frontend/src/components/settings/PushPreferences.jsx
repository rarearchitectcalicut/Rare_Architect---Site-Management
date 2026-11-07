import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, RefreshCw } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { currentPushState, disableDevicePush, enableDevicePush, pushError, pushSupport } from "../../utils/pushNotifications";

export default function PushPreferences() {
    const { user } = useAuth();
    const [state, setState] = useState(null);
    const [changing, setChanging] = useState("");
    const [revision, setRevision] = useState(0);
    const inFlight = useRef(false);
    const alive = useRef(null);
    const unsupported = pushSupport();
    const key = `${user.id}:${revision}`;
    const current = state?.key === key ? state : null;
    const busy = !unsupported && (!current || changing === key);
    const { enabled = false, hasSubscription = false, error = "", notice = "" } = current || {};

    useEffect(() => {
        alive.current = key;
        let cancelled = false;
        if (unsupported) return () => { alive.current = null; };
        currentPushState().then((value) => { if (!cancelled) setState({ key, ...value }); })
            .catch((failure) => { if (!cancelled) setState({ key, error: pushError(failure) }); });
        return () => { cancelled = true; alive.current = null; };
    }, [key, unsupported]);

    async function change(enable) {
        if (inFlight.current) return;
        inFlight.current = true;
        setChanging(key);
        setState({ ...current, key, error: "", notice: "" });
        try {
            // Invoke enable synchronously from the click to retain iOS user activation.
            const value = enable ? await enableDevicePush() : await disableDevicePush();
            if (alive.current === key) {
                setState({ key, ...(value || { enabled: false, hasSubscription: false }),
                    notice: enable ? "Notifications enabled for this account on this device." : "Notifications disabled on this device." });
            }
        } catch (failure) {
            if (alive.current === key) setState({ ...current, key, error: pushError(failure) });
        } finally {
            inFlight.current = false;
            if (alive.current === key) setChanging("");
        }
    }

    return <section aria-labelledby="device-notifications-title" aria-busy={busy} className="rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7">
        <div className="flex items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#716658]"><Bell size={23} aria-hidden="true" /></span><div className="min-w-0"><h2 id="device-notifications-title" className="text-lg font-bold text-[#211E1A]">Device notifications</h2><p className="mt-1 text-sm text-[#716658]">Receive a private, generic alert when a new RARE notification is created. This setting applies to this device; your in-app notifications are always available.</p></div></div>
        {unsupported ? <p role="status" className="mt-5 rounded-xl bg-[#F8F4EE] p-4 text-sm text-[#716658]">{unsupported}</p> : <>
            <p role="status" className="mt-5 text-sm font-semibold text-[#514538]">{busy ? "Checking or updating device notifications…" : error ? "Device notification status could not be confirmed." : enabled ? "Enabled for this account on this device" : "Not enabled for this account on this device"}</p>
            {typeof Notification !== "undefined" && Notification.permission === "denied" && <p className="mt-2 text-sm text-[#94651D]">Notifications are blocked. Allow RARE notifications in your browser or device settings before enabling them here.</p>}
            <div className="mt-4 flex flex-wrap gap-3">
                {!enabled && <button type="button" disabled={busy || Notification.permission === "denied"} onClick={() => change(true)} className="rare-button rare-button-primary"><Bell size={18} aria-hidden="true" />Enable Notifications</button>}
                {(enabled || hasSubscription || error) && <button type="button" disabled={busy} onClick={() => change(false)} className="rare-button rare-button-secondary"><BellOff size={18} aria-hidden="true" />Disable Notifications</button>}
                <button type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)} className="rare-button rare-button-secondary"><RefreshCw size={18} aria-hidden="true" />Check status</button>
            </div>
        </>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-xl bg-[#E7F2E8] p-4 text-sm text-[#296F40]">{notice}</p>}
    </section>;
}
