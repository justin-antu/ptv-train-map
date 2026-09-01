import { useCallback, useState } from "react";

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export interface PushNotificationsController {
  supported: boolean;
  enabled: boolean;
  message: string;
  /** Real background alerts. No-ops honestly when VAPID is not configured. */
  toggle(): Promise<void>;
}

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Web Push opt-in. Foreground-only Notification is not offered — that is how
 * people miss trains. Without a VAPID public key this explains itself.
 */
export function usePushNotifications(): PushNotificationsController {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  const toggle = useCallback(async () => {
    if (enabled) {
      setEnabled(false);
      setMessage("");
      return;
    }
    if (!supported) {
      setMessage("This browser cannot receive background alerts.");
      return;
    }
    if (!VAPID) {
      setMessage("Background alerts need the hosted push service. They are not available on this install yet.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setMessage("Alerts blocked — enable them in the browser if you want a tap before the train.");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID),
    });
    const response = await fetch(`${import.meta.env.BASE_URL}api/push-subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    if (!response.ok) {
      setMessage("Could not save this device for alerts.");
      return;
    }
    setEnabled(true);
    setMessage("");
  }, [enabled, supported]);

  return { supported, enabled, message, toggle };
}
