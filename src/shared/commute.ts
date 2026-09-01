import { melbourneMinutesOfDay, MELBOURNE_TIMEZONE } from "./melbourneTime";

/**
 * Major city-end interchanges offered as one-tap choices when picking a station.
 * City Loop stations are real commute ends even when a line's drawn polyline
 * uses a direct alignment and marks them off-canonical.
 */
export const CBD_QUICK_PICK_STATION_IDS: readonly string[] = [
  "flinders-street",
  "southern-cross",
  "melbourne-central",
  "parliament",
  "flagstaff",
  "north-melbourne",
  "richmond",
];

/** Outbound is home → work. Inbound is the return. */
export type CommuteDirection = "outbound" | "inbound";

export type CommutePeriod = "morning" | "evening" | "weekend";

/**
 * After 4am and before 1pm Melbourne time, a weekday commuter is going to work.
 * Before 4am is still last night's inbound. Weekends use the same clock but
 * are labelled separately so the chrome does not pretend it is a work day.
 */
const OUTBOUND_FROM_MINUTES = 4 * 60;
const OUTBOUND_UNTIL_MINUTES = 13 * 60;

export function commutePeriodAt(now = new Date()): { period: CommutePeriod; suggestedDirection: CommuteDirection } {
  const weekday = new Intl.DateTimeFormat("en-AU", {
    timeZone: MELBOURNE_TIMEZONE,
    weekday: "short",
  }).format(now);
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const minutes = melbourneMinutesOfDay(now);
  const suggestedDirection: CommuteDirection =
    minutes >= OUTBOUND_FROM_MINUTES && minutes < OUTBOUND_UNTIL_MINUTES ? "outbound" : "inbound";

  if (isWeekend) return { period: "weekend", suggestedDirection };
  return { period: suggestedDirection === "outbound" ? "morning" : "evening", suggestedDirection };
}
