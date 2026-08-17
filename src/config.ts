/** Static, non-secret app config. Safe to bundle into the browser build. */

export const LINE_ID = "lilydale";
export const LINE_NAME = "Lilydale";

/**
 * Official PTV network-map colour for the Burnley group (Alamein, Belgrave, Glen
 * Waverley and Lilydale lines) — dark blue.
 *
 * Source: PTV Metro Service Guidelines colour palette document (PTVH2977 MSG 2018
 * "2.4 Colour", released via a Right To Know FOI request):
 * https://www.righttoknow.org.au/request/5149/response/13973/attach/html/4/PTVH2977%20MSG%202018%202.4%20Colour%20v10%20PA%20v2.pdf.html
 * ("Belgrave, Lilydale, Alamein and Glen Waverley lines" — PMS 2945, hex 152C6B).
 *
 * Cross-checked against the Wikipedia "Module:Adjacent stations/Metro Trains
 * Melbourne" line-colour table (which several community PTV projects, including
 * the mini-melbourne-3d family of repos, source their palette from), which lists
 * the same value for Lilydale/Alamein/Belgrave/Glen Waverley: #152C6B.
 */
export const LINE_COLOR = "#152C6B";

/** Path to the committed, rarely-changing station/polyline data (see scripts/generate-static-data.ts). */
export const STATIC_DATA_URL = "/data/lilydale-static.json";

/** Path to the frequently-refreshed live departures snapshot (see scripts/fetch-live-data.ts). */
export const LIVE_DATA_URL = "/data/lilydale-live.json";

/** How often the browser re-polls the live JSON file for a fresh snapshot. */
export const LIVE_POLL_INTERVAL_MS = 30_000;

/**
 * How far beyond a run's last known predicted stop we keep showing/holding it
 * before treating it as stale and hiding it from the map.
 */
export const RUN_STALE_AFTER_MS = 3 * 60_000;

/** How long before a run's first known stop we start showing it "waiting at platform". */
export const RUN_SHOW_BEFORE_FIRST_STOP_MS = 3 * 60_000;
