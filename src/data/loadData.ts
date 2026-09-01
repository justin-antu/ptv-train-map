import { LIVE_DATA_URL, STATIC_DATA_URL, TIMETABLE_DATA_URL } from "../config";
import type { LiveSnapshot, NetworkStaticData } from "../shared/types";

export async function loadStaticData(): Promise<NetworkStaticData> {
  const res = await fetch(STATIC_DATA_URL);
  if (!res.ok) {
    throw new Error(`Failed to load static network data (${res.status} ${res.statusText})`);
  }
  return (await res.json()) as NetworkStaticData;
}

/**
 * Fills the service worker's runtime caches on the very first visit.
 *
 * A newly installed worker does not control the page that installed it, so the
 * startup fetches for the station and timetable data bypass its routes
 * entirely. Without this the app would only survive going offline from the
 * *second* visit onwards — and the first tunnel is as dark as any other.
 *
 * Re-requesting is close to free: Pages sends `max-age=600`, so the HTTP cache
 * answers both without touching the network, and the guard means it only ever
 * happens once.
 */
export async function warmOfflineCache(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("caches" in window)) return;
  await navigator.serviceWorker.ready;

  // `ready` only promises an *active* worker, not one that has claimed this
  // page; until it has, a fetch from here bypasses its routes exactly like the
  // startup ones did. `clientsClaim` fires shortly after activation.
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
      window.setTimeout(resolve, 5_000);
    });
    if (!navigator.serviceWorker.controller) return;
  }

  for (const url of [STATIC_DATA_URL, TIMETABLE_DATA_URL]) {
    // `caches.match` searches every cache, so this stays correct regardless of
    // what the Workbox routes in vite.config.ts happen to name theirs.
    if (await caches.match(url)) continue;
    await fetch(url).catch(() => undefined);
  }
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
    // No cache-busting query string: it made every poll a distinct URL, so the
    // service worker could never serve the last snapshot in a tunnel. Pages
    // sends `max-age=600` though, so "no-cache" is still needed to force a
    // revalidation — it just allows a 304 instead of refetching 1.4MB.
    const res = await fetch(LIVE_DATA_URL, { cache: "no-cache" });
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
 * Polls for fresh live data every `intervalMs`, reporting only successes.
 *
 * A failed fetch is deliberately not reported. Reception drops constantly on a
 * moving train, and surfacing every blip as "no data" discarded the delays,
 * cancellations and disruptions that were true seconds earlier — the moment a
 * rider needs them most. What is already held is kept instead, and
 * `describeFreshness` ages it and says so once it stops being trustworthy.
 *
 * Polling also stops while the page is hidden. A backgrounded tab was fetching
 * and parsing the entire network snapshot every thirty seconds for nobody, on
 * the mobile data of someone who had put their phone away.
 */
export function pollLiveData(intervalMs: number, onUpdate: (snapshot: LiveSnapshot) => void): () => void {
  let cancelled = false;
  let handle: number | undefined;

  async function tick() {
    const snapshot = await loadLiveSnapshot();
    if (!cancelled && snapshot) onUpdate(snapshot);
  }

  function start() {
    if (cancelled || handle !== undefined) return;
    // Fetches at once rather than waiting out an interval, so returning to the
    // app shows current times immediately instead of up to 30s-old ones.
    void tick();
    handle = window.setInterval(() => void tick(), intervalMs);
  }

  function stop() {
    if (handle === undefined) return;
    window.clearInterval(handle);
    handle = undefined;
  }

  function onVisibilityChange() {
    if (document.hidden) stop();
    else start();
  }

  if (!document.hidden) start();
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    cancelled = true;
    stop();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
