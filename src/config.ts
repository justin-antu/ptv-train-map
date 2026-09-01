/** Static, non-secret app config. Safe to bundle into the browser build. */

export const APP_TITLE = "Dude, where's my train?";
export const APP_SHORT_TITLE = "Where's my train?";
export const NETWORK_SUBTITLE = "Metro Trains Melbourne";

// Vite provides "/" locally and the configured GitHub Pages project path in
// production. Derive data URLs from this value to preserve subpath deployment.
const BASE_URL = import.meta.env.BASE_URL;

/** Path to the committed, rarely-changing station/polyline data for every in-scope line (see scripts/generate-static-data.ts). */
export const STATIC_DATA_URL = `${BASE_URL}data/network-static.json`;

/** Path to the frequently-refreshed live departures snapshot, covering every in-scope line (see scripts/fetch-live-data.ts). */
export const LIVE_DATA_URL = `${BASE_URL}data/network-live.json`;

/** Daily scheduled service matrix generated server-side from the official Victorian GTFS feed. */
export const TIMETABLE_DATA_URL = `${BASE_URL}data/network-timetable.json`;

/** How often the browser re-polls the live JSON file for a fresh snapshot. */
export const LIVE_POLL_INTERVAL_MS = 30_000;

/**
 * Age at which the live snapshot is called out as stale on the commute board.
 * The refresh loop publishes every four minutes, so this allows two missed
 * fetches before warning that departures may no longer be accurate.
 */
export const LIVE_DATA_STALE_AFTER_MS = 12 * 60_000;

/** The masthead dot stays green until the feed has been silent this long. */
export const LIVE_DATA_DEAD_AFTER_MS = 24 * 60 * 60_000;

/**
 * Display grace period after a run's last predicted stop.
 */
export const RUN_STALE_AFTER_MS = 3 * 60_000;

/** Display lead time before a run's first predicted stop. */
export const RUN_SHOW_BEFORE_FIRST_STOP_MS = 3 * 60_000;

/**
 * Minimum real time between train-position recomputes/marker updates.
 * Ten updates per second preserve city-scale motion while reducing scans and
 * marker DOM updates across the full live snapshot.
 */
export const TRAIN_UPDATE_INTERVAL_MS = 100;
