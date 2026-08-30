/**
 * Major city-end interchanges offered as one-tap choices when picking a station.
 *
 * The City Loop stations (Melbourne Central, Parliament, Flagstaff) are absent
 * because static data generation keeps one canonical alignment per line and
 * drops the loop variants, so they have no station entry to select.
 */
export const CBD_QUICK_PICK_STATION_IDS: readonly string[] = [
  "flinders-street",
  "southern-cross",
  "north-melbourne",
  "richmond",
];

/** Pre-filled origin when a commuter has not chosen one. */
export const DEFAULT_ORIGIN_STATION_ID = "flinders-street";
