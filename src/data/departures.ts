import {
  effectiveStopTimeUtc,
  stopDelayMinutes,
  type LineStatic,
  type LiveRun,
  type LiveRunStatus,
  type LiveRunStop,
  type StationStatic,
} from "../shared/types";

/** One still-upcoming call at a particular station, with delay already resolved. */
export interface UpcomingStop {
  lineId: string;
  runRef: string;
  /** The time to show and sort by: the prediction when one exists, else the timetable. */
  timeUtc: string;
  scheduledTimeUtc: string;
  /** Absent when the feed published no prediction for this call. */
  estimatedTimeUtc?: string;
  /** Minutes late (0 or negative = on time/early), or null when there is no prediction to compare. */
  delayMin: number | null;
}

/**
 * Minutes late at a call, or `null` when the feed published no prediction.
 *
 * The distinction matters: `null` means "we do not know", which the UI must say
 * out loud, whereas `0` means the operator is actively predicting on time.
 */
export function delayMinutesFor(stop: LiveRunStop): number | null {
  return stopDelayMinutes(stop);
}

/** The time a call will actually be shown and sorted at. */
export function stopTimeFor(stop: LiveRunStop): string {
  return effectiveStopTimeUtc(stop);
}

/**
 * Returns upcoming calls at `station`, sorted chronologically.
 * Station cards reduce the result per line; the favourite board retains the
 * next stops across all lines.
 */
export function upcomingStopsForStation(station: StationStatic, runs: LiveRun[], now: number): UpcomingStop[] {
  const results: UpcomingStop[] = [];
  for (const run of runs) {
    if (run.status === "cancelled") continue;
    // Match the exact stop carried by live data rather than pre-filtering by
    // StationStatic.lineIds. That static list can lag route changes (notably
    // Metro Tunnel services), while a run containing this stop is definitive.
    for (const stop of run.stops) {
      if (stop.stationId !== station.id || stop.isSkipped) continue;
      const timeUtc = effectiveStopTimeUtc(stop);
      const t = Date.parse(timeUtc);
      if (!Number.isFinite(t) || t < now) continue;
      results.push({
        lineId: run.lineId,
        runRef: run.runRef,
        timeUtc,
        scheduledTimeUtc: stop.scheduledTimeUtc,
        estimatedTimeUtc: stop.estimatedTimeUtc,
        delayMin: stopDelayMinutes(stop),
      });
    }
  }
  return results.sort((a, b) => Date.parse(a.timeUtc) - Date.parse(b.timeUtc));
}

/** One onward call, used to describe a service's stopping pattern. */
export interface OnwardStop {
  stationId: string;
  scheduledTimeUtc: string;
  estimatedTimeUtc?: string;
  isSkipped?: boolean;
}

/** An upcoming departure with everything a board row needs to describe itself. */
export interface DepartureRow extends UpcomingStop {
  /** The station this row is a departure *from* (see StationStatic.id). */
  stationId: string;
  directionId: number;
  destinationName: string;
  status: LiveRunStatus;
  isCancelled: boolean;
  /** True when this particular call carries a real-time prediction. */
  isRealtime: boolean;
  /** True when the prediction was carried forward from an earlier call rather than published here. */
  isPropagated: boolean;
  /** Scheduled platform, when the schedule declares one. */
  platform?: string;
  /** Calls after this station, in order. Empty when the service terminates here. */
  onwardStops: OnwardStop[];
}

export interface DepartureFilters {
  /** Keep only services that later call at this station (see StationStatic.id). */
  destinationStationId?: string | null;
  /** Keep only services on this line (see LineStatic.id). */
  lineId?: string | null;
}

/**
 * Upcoming departures at `station` with run context attached.
 *
 * `destinationStationId` is a genuine filter rather than a label: a rail
 * departure board's job is to answer "which of these trains gets me there",
 * and every mature board (National Rail's `filterCrs`, NS, SBB) treats the
 * destination as a predicate over the stopping pattern.
 */
export function departureRowsForStation(
  station: StationStatic,
  runs: LiveRun[],
  now: number,
  filters: DepartureFilters = {},
): DepartureRow[] {
  const rows: DepartureRow[] = [];

  for (const run of runs) {
    if (filters.lineId && run.lineId !== filters.lineId) continue;

    const index = run.stops.findIndex((stop) => stop.stationId === station.id);
    if (index < 0) continue;

    const stop = run.stops[index];
    if (stop.isSkipped) continue;

    const timeUtc = effectiveStopTimeUtc(stop);
    const t = Date.parse(timeUtc);
    if (!Number.isFinite(t) || t < now) continue;

    const onwardStops = run.stops.slice(index + 1).map((onward) => ({
      stationId: onward.stationId,
      scheduledTimeUtc: onward.scheduledTimeUtc,
      estimatedTimeUtc: onward.estimatedTimeUtc,
      isSkipped: onward.isSkipped,
    }));

    if (filters.destinationStationId && !reachesDestination(onwardStops, filters.destinationStationId)) {
      continue;
    }

    rows.push({
      lineId: run.lineId,
      runRef: run.runRef,
      stationId: station.id,
      directionId: run.directionId,
      timeUtc,
      scheduledTimeUtc: stop.scheduledTimeUtc,
      estimatedTimeUtc: stop.estimatedTimeUtc,
      delayMin: stopDelayMinutes(stop),
      destinationName: run.destinationName,
      status: run.status,
      isCancelled: run.status === "cancelled",
      isRealtime: stop.estimatedTimeUtc !== undefined,
      isPropagated: stop.isPropagated === true,
      platform: stop.platform,
      onwardStops,
    });
  }

  return rows.sort((a, b) => Date.parse(a.timeUtc) - Date.parse(b.timeUtc));
}

/**
 * Flagstaff, Melbourne Central and Parliament are often skipped on the
 * afternoon inbound — those trains run direct to Flinders Street. A commute
 * that ends at a loop station still wants the city-bound service.
 */
const CITY_LOOP_ONLY_IDS = new Set(["flagstaff", "melbourne-central", "parliament"]);
const CITY_ACCESS_IDS = new Set([
  "parliament",
  "melbourne-central",
  "flagstaff",
  "southern-cross",
  "flinders-street",
]);

const CITY_STATION_NAMES: Record<string, string> = {
  "parliament": "Parliament",
  "melbourne-central": "Melbourne Central",
  "flagstaff": "Flagstaff",
  "southern-cross": "Southern Cross",
  "flinders-street": "Flinders Street",
};

export function reachesDestination(onwardStops: readonly OnwardStop[], destinationStationId: string): boolean {
  if (onwardStops.some((onward) => onward.stationId === destinationStationId && !onward.isSkipped)) return true;
  if (!CITY_LOOP_ONLY_IDS.has(destinationStationId)) return false;
  return onwardStops.some((onward) => !onward.isSkipped && CITY_ACCESS_IDS.has(onward.stationId));
}

export function arrivalForDestination(
  onwardStops: readonly OnwardStop[],
  destinationStationId?: string | null,
): { timeUtc: string; viaStationId?: string; viaStationName?: string } | null {
  const served = destinationStationId
    ? onwardStops.find((onward) => onward.stationId === destinationStationId && !onward.isSkipped)
    : onwardStops.filter((onward) => !onward.isSkipped).at(-1);
  if (served) return { timeUtc: served.estimatedTimeUtc ?? served.scheduledTimeUtc };
  if (!destinationStationId || !CITY_LOOP_ONLY_IDS.has(destinationStationId)) return null;
  const via = onwardStops.find((onward) => !onward.isSkipped && CITY_ACCESS_IDS.has(onward.stationId));
  if (!via) return null;
  return {
    timeUtc: via.estimatedTimeUtc ?? via.scheduledTimeUtc,
    viaStationId: via.stationId,
    viaStationName: CITY_STATION_NAMES[via.stationId] ?? via.stationId,
  };
}

/** Minutes late at which a departure is called out as delayed, matching `DelayBadge`. */
export const DELAYED_THRESHOLD_MIN = 3;

export interface DepartureStatus {
  label: string;
  tone: "success" | "warning" | "muted" | "destructive";
}

/**
 * The status shown *beside* the scheduled time, never in place of it. A rider
 * comparing the board against a printed or remembered timetable needs the
 * scheduled time to stay put; the expected time is the thing that moves.
 */
export function departureStatus(row: Pick<DepartureRow, "delayMin" | "isRealtime" | "isCancelled">): DepartureStatus {
  if (row.isCancelled) return { label: "Cancelled", tone: "destructive" };
  if (!row.isRealtime) return { label: "Scheduled", tone: "muted" };
  if (row.delayMin !== null && row.delayMin >= DELAYED_THRESHOLD_MIN) {
    return { label: `Delayed ${row.delayMin} min`, tone: "warning" };
  }
  return { label: "On time", tone: "success" };
}

/**
 * A sentence describing where a service goes, in place of a bare count of
 * remaining stops. "Calling at 9 more stops" tells a rider nothing about
 * whether their station is one of them.
 *
 * The bare word "Express" is deliberately never used on its own — on this
 * network it carries no consistent meaning, so it is always qualified with the
 * station the service runs express *to*.
 */
export function describeStoppingPattern(
  row: Pick<DepartureRow, "onwardStops" | "destinationName" | "lineId">,
  stationNamesById: Map<string, string>,
  line: LineStatic | undefined,
  originStationId: string,
): string {
  const calls = row.onwardStops.filter((stop) => !stop.isSkipped);
  if (calls.length === 0) return "Terminates here";

  const nameOf = (stationId: string) => stationNamesById.get(stationId) ?? stationId;
  const finalName = nameOf(calls[calls.length - 1].stationId);

  // Without the line's station order there is nothing to compare the pattern
  // against, so fall back to naming the first and last calls.
  const order = line?.stationIds;
  if (!order) {
    return calls.length === 1 ? `Runs direct to ${finalName}` : `Calling at ${nameOf(calls[0].stationId)} … ${finalName}`;
  }

  const positionOf = new Map(order.map((stationId, index) => [stationId, index]));
  const originIndex = positionOf.get(originStationId);
  const finalIndex = positionOf.get(calls[calls.length - 1].stationId);
  if (originIndex === undefined || finalIndex === undefined) {
    return `Calling at ${calls.length} station${calls.length === 1 ? "" : "s"}, ending at ${finalName}`;
  }

  const step = finalIndex >= originIndex ? 1 : -1;
  const expected: string[] = [];
  for (let i = originIndex + step; i !== finalIndex + step; i += step) expected.push(order[i]);

  const actual = calls.map((stop) => stop.stationId);
  if (expected.length === actual.length && expected.every((stationId, i) => stationId === actual[i])) {
    return `Stops all stations to ${finalName}`;
  }

  // Find where the service rejoins the all-stations pattern: the longest
  // suffix of its calls that matches the line's own consecutive order.
  let suffix = 0;
  while (
    suffix < actual.length
    && expected[expected.length - 1 - suffix] === actual[actual.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const firstCallName = nameOf(actual[0]);
  if (suffix >= actual.length - 1 && actual.length > 1) {
    return `Express to ${firstCallName}, then all stations to ${finalName}`;
  }
  if (suffix > 1) {
    const rejoinName = nameOf(actual[actual.length - suffix]);
    return `Limited stops to ${rejoinName}, then all stations to ${finalName}`;
  }
  return `Limited stops · ${actual.length} station${actual.length === 1 ? "" : "s"} to ${finalName}`;
}

/** Reduces an already-sorted (soonest first) stop list to just the soonest one per line. */
export function soonestPerLine(stops: readonly UpcomingStop[]): UpcomingStop[] {
  const seen = new Set<string>();
  const result: UpcomingStop[] = [];
  for (const stop of stops) {
    if (seen.has(stop.lineId)) continue;
    seen.add(stop.lineId);
    result.push(stop);
  }
  return result;
}

/**
 * Formats a predicted ISO time as a short countdown. "min" rather than "mins":
 * the singular abbreviation is what every tested transit board settles on,
 * because it reads identically at one and at forty.
 */
export function formatEta(timeUtc: string, now: number): string {
  const diffMs = Date.parse(timeUtc) - now;
  if (diffMs <= 30_000) return "Due";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins} min`;
  return new Date(timeUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** A spoken-sentence form of the countdown, for the row's accessible name. */
export function spokenEta(timeUtc: string, now: number): string {
  const diffMs = Date.parse(timeUtc) - now;
  if (diffMs <= 30_000) return "due now";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  return `at ${new Date(timeUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
