import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveRun, StationStatic } from "../shared/types";
import { upcomingStopsForStation } from "../data/departures";

const NOTIFY_STORAGE_KEY = "wimt:notifyEnabled";
/** How soon before a train's predicted arrival we fire a notification, per the spec's "~2 minutes". */
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
  /** Only ever called from a direct user gesture (the toggle's own click) — never automatically. */
  toggle(): Promise<void>;
}

/**
 * Fires an opt-in browser notification when the favourite station's soonest
 * train is within `NOTIFY_THRESHOLD_MS`. Notifications are strictly opt-in:
 * `Notification.requestPermission()` is only ever called from `toggle()`,
 * which callers must only invoke from a direct user gesture on the toggle
 * control itself, never automatically on load.
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
    // Passively reflect reality (e.g. the user revoked the permission in
    // browser settings since last visit) rather than re-prompting.
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
    // Only ever requested here, in direct response to the toggle's own click — never on page load.
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
