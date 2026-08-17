/** Static, non-secret app config. Safe to bundle into the browser build. */

export const APP_TITLE = "Dude, where's my train?";
export const NETWORK_SUBTITLE = "Metro Trains Melbourne";

// import.meta.env.BASE_URL is Vite's configured base path (see vite.config.ts) —
// "/" in local dev, but "/ptv-train-map/" in the GitHub Pages production build.
// Data URLs must be built from it rather than hardcoded as root-absolute paths,
// otherwise they 404 once deployed under the Pages project subpath.
const BASE_URL = import.meta.env.BASE_URL;

/** Path to the committed, rarely-changing station/polyline data for every in-scope line (see scripts/generate-static-data.ts). */
export const STATIC_DATA_URL = `${BASE_URL}data/network-static.json`;

/** Path to the frequently-refreshed live departures snapshot, covering every in-scope line (see scripts/fetch-live-data.ts). */
export const LIVE_DATA_URL = `${BASE_URL}data/network-live.json`;

/** How often the browser re-polls the live JSON file for a fresh snapshot. */
export const LIVE_POLL_INTERVAL_MS = 30_000;

/**
 * How far beyond a run's last known predicted stop we keep showing/holding it
 * before treating it as stale and hiding it from the map.
 */
export const RUN_STALE_AFTER_MS = 3 * 60_000;

/** How long before a run's first known stop we start showing it "waiting at platform". */
export const RUN_SHOW_BEFORE_FIRST_STOP_MS = 3 * 60_000;
