import type { CommuteDirection } from "../hooks/useCommutePreferences";

export const COMMUTE_DIRECTIONS: readonly CommuteDirection[] = ["toCity", "fromCity"];

export const COMMUTE_DIRECTION_LABELS: Record<CommuteDirection, string> = {
  toCity: "To city",
  fromCity: "From city",
};

export const COMMUTE_DIRECTION_HINTS: Record<CommuteDirection, string> = {
  toCity: "Where you board heading into the city",
  fromCity: "Where you board heading home",
};

export function otherDirection(direction: CommuteDirection): CommuteDirection {
  return direction === "toCity" ? "fromCity" : "toCity";
}

/**
 * Major city-end interchanges offered as one-tap choices for the from-city leg.
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

/** Pre-filled from-city station when a commuter has not chosen one. */
export const DEFAULT_FROM_CITY_STATION_ID = "flinders-street";

/**
 * The leg a commuter most likely wants on opening the app: into the city in the
 * morning, back out afterwards. Uses the device clock, which is Melbourne time
 * for the commuters this serves.
 */
export function defaultCommuteDirection(now: Date = new Date()): CommuteDirection {
  return now.getHours() < 12 ? "toCity" : "fromCity";
}
