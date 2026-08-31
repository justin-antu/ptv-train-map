/**
 * Melbourne service-day time arithmetic, shared by the Node scripts that build
 * the data artifacts and by the browser that degrades to them.
 */

export const MELBOURNE_TIMEZONE = "Australia/Melbourne";

/** Milliseconds Melbourne is ahead of UTC at a given instant (accounts for DST). */
function melbourneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MELBOURNE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asIfUtc - instant.getTime();
}

/**
 * Converts a GTFS service-day time to a UTC instant.
 *
 * `minutesAfterMidnight` may exceed 1440: GTFS expresses an after-midnight call
 * as e.g. 25:10:00 so it stays attached to the service day it belongs to. The
 * offset is resolved twice because the first guess can land on the wrong side
 * of a DST boundary, and the second pass converges.
 */
export function melbourneServiceTimeToUtc(serviceDate: string, minutesAfterMidnight: number): Date {
  const [year, month, day] = serviceDate.split("-").map(Number);
  const wallClockMs = Date.UTC(year, month - 1, day) + Math.round(minutesAfterMidnight * 60_000);
  let instant = new Date(wallClockMs - 10 * 3_600_000);
  for (let pass = 0; pass < 2; pass += 1) {
    instant = new Date(wallClockMs - melbourneOffsetMs(instant));
  }
  return instant;
}

/** The Melbourne calendar date at `date`, as `YYYY-MM-DD`. */
export function melbourneDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MELBOURNE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Minutes after the Melbourne service-day midnight for `date`, on that date's own service day. */
export function melbourneMinutesOfDay(date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MELBOURNE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return get("hour") * 60 + get("minute");
}
