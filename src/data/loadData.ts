import { LIVE_DATA_URL, STATIC_DATA_URL } from "../config";
import type { LiveSnapshot, NetworkStaticData } from "../shared/types";

export async function loadStaticData(): Promise<NetworkStaticData> {
  const res = await fetch(STATIC_DATA_URL);
  if (!res.ok) {
    throw new Error(`Failed to load static network data (${res.status} ${res.statusText})`);
  }
  return (await res.json()) as NetworkStaticData;
}

function isValidLiveSnapshot(value: unknown): value is LiveSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as LiveSnapshot;
  if (!Array.isArray(snapshot.runs) || typeof snapshot.generatedAtUtc !== "string") return false;
  // A snapshot written before the schedule-spine rewrite carries `timeUtc`
  // stops and no `status`. Rejecting it here routes the app to the timetable
  // fallback instead of rendering rows whose times are all `undefined`.
  return snapshot.runs.length === 0 || typeof snapshot.runs[0].status === "string";
}

/**
 * Loads the latest live snapshot, or `null` when there isn't a usable one.
 *
 * Callers degrade to the shipped GTFS timetable rather than to invented data,
 * so a missing or malformed file costs accuracy but never correctness.
 */
export async function loadLiveSnapshot(): Promise<LiveSnapshot | null> {
  try {
    const res = await fetch(`${LIVE_DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      const data: unknown = await res.json();
      if (isValidLiveSnapshot(data)) return data;
    }
  } catch {
    // Network error, or no such file on a first deploy.
  }
  return null;
}

/**
 * Polls for fresh live data every `intervalMs`, calling `onUpdate` each time
 * (including immediately on the first load).
 */
export function pollLiveData(intervalMs: number, onUpdate: (snapshot: LiveSnapshot | null) => void): () => void {
  let cancelled = false;

  async function tick() {
    const snapshot = await loadLiveSnapshot();
    if (!cancelled) onUpdate(snapshot);
  }

  void tick();
  const handle = window.setInterval(() => void tick(), intervalMs);
  return () => {
    cancelled = true;
    window.clearInterval(handle);
  };
}
