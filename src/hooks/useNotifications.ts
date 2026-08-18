import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveRun, StationStatic } from "../shared/types";
import { upcomingStopsForStation } from "../data/departures";

const NOTIFY_STORAGE_KEY = "wimt:notifyEnabled";
/** Notification lead time before a train's predicted arrival. */
const NOTIFY_THRESHOLD_MS = 2 * 60_000;

function loadNotifyEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIFY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveNotifyEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFY_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore write failures.
  }
}

export interface NotificationsController {
  enabled: boolean;
  message: string;
  /** Must be called from the notification toggle's direct user gesture. */
  toggle(): Promise<void>;
}

/**
 * Fires an opt-in browser notification when the favourite station's soonest
 * train is within `NOTIFY_THRESHOLD_MS`. Notifications are strictly opt-in:
 * `Notification.requestPermission()` is only ever called from `toggle()`,
 * which must only be invoked by the toggle control's direct user gesture.
 */
export function useNotifications(
  favouriteId: string | null,
  station: StationStatic | undefined,
  runs: LiveRun[],
): NotificationsController {
  const [enabled, setEnabled] = useState(loadNotifyEnabled);
  const [message, setMessage] = useState("");
  const notifiedRunKeysRef = useRef(new Set<string>());

  const stateRef = useRef({ enabled, station, runs });
  stateRef.current = { enabled, station, runs };

  useEffect(() => {
    notifiedRunKeysRef.current.clear();
  }, [favouriteId]);

  useEffect(() => {
    // Reflect revoked browser permission without prompting again.
    const granted = typeof Notification !== "undefined" && Notification.permission === "granted";
    if (enabled && !granted) {
      setEnabled(false);
      saveNotifyEnabled(false);
    }
  }, [enabled]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const { enabled: isEnabled, station: currentStation, runs: currentRuns } = stateRef.current;
      if (!isEnabled || !currentStation) return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

      const now = Date.now();
      const stops = upcomingStopsForStation(currentStation, currentRuns, now);
      const currentKeys = new Set(stops.map((s) => `${s.lineId}:${s.runRef}`));
      for (const key of [...notifiedRunKeysRef.current]) {
        if (!currentKeys.has(key)) notifiedRunKeysRef.current.delete(key);
      }
      for (const s of stops) {
        const key = `${s.lineId}:${s.runRef}`;
        const remainingMs = Date.parse(s.timeUtc) - now;
        if (remainingMs <= NOTIFY_THRESHOLD_MS && remainingMs > -30_000 && !notifiedRunKeysRef.current.has(key)) {
          notifiedRunKeysRef.current.add(key);
          new Notification(`Train approaching ${currentStation.name}`, {
            tag: `wimt-${key}`,
          });
        }
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const toggle = useCallback(async () => {
    if (enabled) {
      setEnabled(false);
      saveNotifyEnabled(false);
      setMessage("");
      return;
    }
    if (typeof Notification === "undefined") {
      setMessage("Notifications aren't supported in this browser.");
      return;
    }
    // Browser permission requests require the toggle's direct user gesture.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setEnabled(false);
      saveNotifyEnabled(false);
      setMessage("Notifications blocked — enable them in your browser settings to use this.");
      return;
    }
    setEnabled(true);
    saveNotifyEnabled(true);
    setMessage("");
  }, [enabled]);

  return { enabled, message, toggle };
}
