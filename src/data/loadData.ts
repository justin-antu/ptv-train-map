import { LIVE_DATA_URL, STATIC_DATA_URL } from "../config";
import type { LiveSnapshot, StaticLineData } from "../shared/types";
import { generateDemoSnapshot } from "./demoData";

export async function loadStaticData(): Promise<StaticLineData> {
  const res = await fetch(STATIC_DATA_URL);
  if (!res.ok) {
    throw new Error(`Failed to load static line data (${res.status} ${res.statusText})`);
  }
  return (await res.json()) as StaticLineData;
}

function isValidLiveSnapshot(value: unknown): value is LiveSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as LiveSnapshot).runs) &&
    typeof (value as LiveSnapshot).generatedAtUtc === "string"
  );
}

/**
 * Loads the latest live snapshot. Falls back to a clearly-labeled synthetic demo
 * snapshot if the live JSON file doesn't exist yet, fails to fetch, or is malformed
 * — this keeps local dev and the very first Pages deploy (before any cron run has
 * happened) showing a sensible, moving map instead of a blank/broken page.
 */
export async function loadLiveOrDemoSnapshot(
  staticData: StaticLineData,
): Promise<{ snapshot: LiveSnapshot; isDemo: boolean }> {
  try {
    const res = await fetch(`${LIVE_DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      const data: unknown = await res.json();
      if (isValidLiveSnapshot(data)) {
        return { snapshot: data, isDemo: Boolean(data.isDemo) };
      }
    }
  } catch {
    // Network error, no such file yet, etc. — fall through to demo data below.
  }
  return { snapshot: generateDemoSnapshot(staticData), isDemo: true };
}

/**
 * Polls for fresh live data every `intervalMs`, calling `onUpdate` each time
 * (including immediately on the first successful/fallback load).
 */
export function pollLiveData(
  staticData: StaticLineData,
  intervalMs: number,
  onUpdate: (snapshot: LiveSnapshot, isDemo: boolean) => void,
): () => void {
  let cancelled = false;

  async function tick() {
    const { snapshot, isDemo } = await loadLiveOrDemoSnapshot(staticData);
    if (!cancelled) onUpdate(snapshot, isDemo);
  }

  void tick();
  const handle = window.setInterval(() => void tick(), intervalMs);
  return () => {
    cancelled = true;
    window.clearInterval(handle);
  };
}
