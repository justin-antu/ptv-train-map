import type { LiveRun, StationStatic } from "../shared/types";

export interface TripLeg {
  lineId: string;
  runRef: string;
  fromStationId: string;
  toStationId: string;
  departTimeUtc: string;
  arriveTimeUtc: string;
  /** Delay (minutes) already accrued at boarding, from the same timeUtc/scheduledTimeUtc diff used everywhere else. */
  delayMin: number;
}

export interface TripOption {
  /** One leg for a direct trip, two for a one-interchange trip. */
  legs: TripLeg[];
  departTimeUtc: string;
  arriveTimeUtc: string;
}

export type TripPlanResult =
  | { kind: "same-station" }
  | { kind: "direct"; options: TripOption[] }
  | { kind: "interchange"; interchangeName: string; options: TripOption[] }
  | { kind: "no-route"; nearestInterchangeName: string | null };

const MAX_OPTIONS = 4;
/** Minimum time between arriving at the interchange and the connecting departure — real schedules should clear this easily, but it rules out a "connection" that's really just missed by seconds. */
const MIN_TRANSFER_BUFFER_MS = 60_000;
/** The network's busiest interchange (12 of 16 lines) — tried first since it's usually both a valid and a sensible connection, before falling back to a generic search. */
const PREFERRED_INTERCHANGE_ID = "flinders-street";

function delayMinutesFor(stop: { timeUtc: string; scheduledTimeUtc: string }): number {
  return Math.round((Date.parse(stop.timeUtc) - Date.parse(stop.scheduledTimeUtc)) / 60_000);
}

/**
 * Every upcoming direct run (on a line serving both stations) from `origin`
 * to `destination`, soonest first. Correctness of direction/order falls
 * naturally out of using each run's own real predicted stop times (already
 * chronologically sorted per run) rather than assuming anything about the
 * line's static topology — this also means express runs that skip one of
 * the two stations are automatically excluded, since they simply won't have
 * a stop entry for the skipped station.
 */
function findDirectLegs(origin: StationStatic, destination: StationStatic, runs: readonly LiveRun[], now: number, limit: number): TripLeg[] {
  const sharedLines = new Set(origin.lineIds.filter((l) => destination.lineIds.includes(l)));
  if (sharedLines.size === 0) return [];

  const legs: TripLeg[] = [];
  for (const run of runs) {
    if (!sharedLines.has(run.lineId)) continue;
    const fromStop = run.stops.find((s) => s.stationId === origin.id);
    const toStop = run.stops.find((s) => s.stationId === destination.id);
    if (!fromStop || !toStop) continue;
    const departMs = Date.parse(fromStop.timeUtc);
    const arriveMs = Date.parse(toStop.timeUtc);
    if (departMs < now || arriveMs <= departMs) continue;
    legs.push({
      lineId: run.lineId,
      runRef: run.runRef,
      fromStationId: origin.id,
      toStationId: destination.id,
      departTimeUtc: fromStop.timeUtc,
      arriveTimeUtc: toStop.timeUtc,
      delayMin: delayMinutesFor(fromStop),
    });
  }
  legs.sort((a, b) => Date.parse(a.departTimeUtc) - Date.parse(b.departTimeUtc));
  return legs.slice(0, limit);
}

/**
 * Finds a single station that could serve as a one-interchange connection
 * between two stations with no shared line — i.e. a station served by at
 * least one of `origin`'s lines *and* at least one of `destination`'s lines.
 * Flinders Street is tried first (it alone connects 12 of the network's 16
 * lines, so it's very often the natural answer and a familiar one for
 * Melbourne commuters); otherwise every station is scanned and the one
 * covering the most lines overall is preferred, as a reasonable proxy for
 * "well-connected hub" without any real routing/graph search.
 */
export function findInterchangeStation(origin: StationStatic, destination: StationStatic, stations: readonly StationStatic[]): StationStatic | null {
  const originLines = new Set(origin.lineIds);
  const destLines = new Set(destination.lineIds);
  const qualifies = (s: StationStatic) =>
    s.id !== origin.id && s.id !== destination.id && s.lineIds.some((l) => originLines.has(l)) && s.lineIds.some((l) => destLines.has(l));

  const preferred = stations.find((s) => s.id === PREFERRED_INTERCHANGE_ID);
  if (preferred && qualifies(preferred)) return preferred;

  let best: StationStatic | null = null;
  for (const s of stations) {
    if (!qualifies(s)) continue;
    if (!best || s.lineIds.length > best.lineIds.length) best = s;
  }
  return best;
}

/**
 * Plans a simple trip between two stations using only already-loaded static
 * + live data (no server-side routing call). Same-line trips are handled
 * exactly; trips needing a change of line use a single-interchange heuristic
 * (see findInterchangeStation) rather than full multi-hop pathfinding — a
 * deliberate v1 simplification per the product brief.
 */
export function planTrip(origin: StationStatic, destination: StationStatic, stations: readonly StationStatic[], runs: readonly LiveRun[], now: number): TripPlanResult {
  if (origin.id === destination.id) return { kind: "same-station" };

  const directLegs = findDirectLegs(origin, destination, runs, now, MAX_OPTIONS);
  if (directLegs.length > 0) {
    return { kind: "direct", options: directLegs.map((leg) => ({ legs: [leg], departTimeUtc: leg.departTimeUtc, arriveTimeUtc: leg.arriveTimeUtc })) };
  }

  const interchange = findInterchangeStation(origin, destination, stations);
  if (!interchange) return { kind: "no-route", nearestInterchangeName: null };

  const leg1Options = findDirectLegs(origin, interchange, runs, now, MAX_OPTIONS * 3);
  const options: TripOption[] = [];
  for (const leg1 of leg1Options) {
    const [leg2] = findDirectLegs(interchange, destination, runs, Date.parse(leg1.arriveTimeUtc) + MIN_TRANSFER_BUFFER_MS, 1);
    if (!leg2) continue;
    options.push({ legs: [leg1, leg2], departTimeUtc: leg1.departTimeUtc, arriveTimeUtc: leg2.arriveTimeUtc });
    if (options.length >= MAX_OPTIONS) break;
  }

  if (options.length === 0) return { kind: "no-route", nearestInterchangeName: interchange.name };
  options.sort((a, b) => Date.parse(a.arriveTimeUtc) - Date.parse(b.arriveTimeUtc));
  return { kind: "interchange", interchangeName: interchange.name, options };
}
