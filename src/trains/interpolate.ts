import type { LiveRun, NetworkStaticData, StationStatic } from "../shared/types";
import { delayMinutesFor } from "../data/departures";
import { cumulativeDistances, nearestDistanceAlong, pointAtDistance } from "./polylineGeo";

export interface TrainPosition {
  runRef: string;
  lineId: string;
  destinationName: string;
  lon: number;
  lat: number;
  /** 0 = at fromStation, 1 = at toStation (or exactly at a station if from === to). */
  progress: number;
  fromStationId: string;
  toStationId: string;
  /**
   * Minutes late at the run's next (or current, if waiting/arrived) predicted
   * stop, derived from that stop's `timeUtc - scheduledTimeUtc`. 0 or negative
   * means on time/early. Rounded to the nearest minute.
   */
  delayMin: number;
}

/** Per-line geometry needed to interpolate along that line's own polyline/station positions. */
interface LineInterpolationContext {
  /** Distance (metres) along this line's polyline for each of its stations, keyed by station id. */
  stationDistances: Map<string, number>;
  cumDist: number[];
  polyline: [number, number][];
}

/** Maps line id -> that line's interpolation geometry. A shared station (e.g. Flinders Street) has a different distance-along-track per line, so this must stay keyed per line rather than globally. */
export type InterpolationContext = Map<string, LineInterpolationContext>;

export function buildInterpolationContext(staticData: NetworkStaticData): InterpolationContext {
  const stationsById = new Map(staticData.stations.map((s) => [s.id, s]));
  const context: InterpolationContext = new Map();

  for (const line of staticData.lines) {
    const cumDist = cumulativeDistances(line.polyline);
    const stationDistances = new Map<string, number>();
    for (const stationId of line.stationIds) {
      const station = stationsById.get(stationId);
      if (!station) continue;
      stationDistances.set(stationId, nearestDistanceAlong(line.polyline, cumDist, [station.lon, station.lat]));
    }
    context.set(line.id, { stationDistances, cumDist, polyline: line.polyline });
  }
  return context;
}

export interface InterpolationOptions {
  /** How long after a run's last known predicted stop we keep showing it there before hiding it. */
  staleAfterMs: number;
  /** How long before a run's first known predicted stop we start showing it waiting at that station. */
  showBeforeFirstStopMs: number;
}

interface ParsedRunTimes {
  firstMs: number;
  lastMs: number;
  stopMs: number[];
}

/**
 * Caches each run's parsed (epoch-ms) stop times, keyed by the run object
 * itself. `Date.parse()`-ing every stop's ISO timestamp on every call was a
 * real, measurable cost: this is scanned once per animation-loop tick (see
 * `MapView`) across every known run (hundreds, even though only a handful
 * are ever "in progress" at once), so re-parsing from scratch every tick
 * scaled with total schedule size, not with what's actually on screen. A
 * `WeakMap` keyed on the run object needs no manual invalidation — a fresh
 * `runs` array (from each ~30s live-data poll) contains new run objects, so
 * old entries simply become unreachable and are garbage collected.
 */
const parsedTimesCache = new WeakMap<LiveRun, ParsedRunTimes>();

function getParsedTimes(run: LiveRun): ParsedRunTimes {
  let parsed = parsedTimesCache.get(run);
  if (!parsed) {
    const stopMs = run.stops.map((s) => Date.parse(s.timeUtc));
    parsed = { firstMs: stopMs[0], lastMs: stopMs[stopMs.length - 1], stopMs };
    parsedTimesCache.set(run, parsed);
  }
  return parsed;
}

/**
 * Counts how many runs would currently render a marker (mid-route, or
 * within the "waiting"/"just arrived" grace windows) — i.e. trains actually
 * in service right now, as opposed to `runs.length`, which also includes
 * every other upcoming scheduled service the live snapshot happens to have
 * fetched ahead of time (up to ~12 departures per station, which can span
 * hours for infrequent lines). Cheap enough to call on every live-data poll
 * (no polyline geometry needed, just the cached parsed stop times).
 */
export function countActiveRuns(runs: LiveRun[], now: number, options: InterpolationOptions): number {
  let count = 0;
  for (const run of runs) {
    if (run.stops.length === 0) continue;
    const { firstMs, lastMs } = getParsedTimes(run);
    if (now < firstMs) {
      if (firstMs - now <= options.showBeforeFirstStopMs) count++;
    } else if (now > lastMs) {
      if (now - lastMs <= options.staleAfterMs) count++;
    } else {
      count++;
    }
  }
  return count;
}

/**
 * Computes the current geographic position of every "in progress" train run
 * across every line, by finding which pair of consecutive predicted stop-times
 * bracket `now`, then interpolating along that run's line's track polyline
 * (not a straight line) between those two stations' projected positions.
 *
 * This is a simplification appropriate for v1: it assumes a run's predicted stop
 * times, sorted chronologically, correspond to the physical station order along
 * its line. This holds for all-stops services; express/limited-stops services
 * that skip stations may show the train "teleporting" across the skipped gap
 * rather than slowing down, since we have no predicted time for the skipped stop.
 */
export function computeTrainPositions(
  runs: LiveRun[],
  stationsById: Map<string, StationStatic>,
  context: InterpolationContext,
  now: number,
  options: InterpolationOptions,
): TrainPosition[] {
  const positions: TrainPosition[] = [];

  for (const run of runs) {
    const stops = run.stops;
    if (stops.length === 0) continue;

    const lineContext = context.get(run.lineId);
    if (!lineContext) continue;

    const { firstMs: firstTime, lastMs: lastTime, stopMs } = getParsedTimes(run);

    if (now < firstTime) {
      if (firstTime - now <= options.showBeforeFirstStopMs) {
        const station = stationsById.get(stops[0].stationId);
        if (station) {
          positions.push({
            runRef: run.runRef,
            lineId: run.lineId,
            destinationName: run.destinationName,
            lon: station.lon,
            lat: station.lat,
            progress: 0,
            fromStationId: station.id,
            toStationId: station.id,
            delayMin: delayMinutesFor(stops[0]),
          });
        }
      }
      continue;
    }

    if (now > lastTime) {
      if (now - lastTime <= options.staleAfterMs) {
        const lastStop = stops[stops.length - 1];
        const station = stationsById.get(lastStop.stationId);
        if (station) {
          positions.push({
            runRef: run.runRef,
            lineId: run.lineId,
            destinationName: run.destinationName,
            lon: station.lon,
            lat: station.lat,
            progress: 1,
            fromStationId: station.id,
            toStationId: station.id,
            delayMin: delayMinutesFor(lastStop),
          });
        }
      }
      continue;
    }

    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      const tA = stopMs[i];
      const tB = stopMs[i + 1];
      if (now >= tA && now <= tB) {
        const stationA = stationsById.get(a.stationId);
        const stationB = stationsById.get(b.stationId);
        if (!stationA || !stationB) break;

        const progress = tB === tA ? 1 : (now - tA) / (tB - tA);
        const distA = lineContext.stationDistances.get(stationA.id);
        const distB = lineContext.stationDistances.get(stationB.id);

        let lon: number;
        let lat: number;
        if (distA === undefined || distB === undefined) {
          // Fallback: straight-line interpolation if a station wasn't found on the
          // polyline. This should be rare/never in practice (every station in a
          // line's own stationIds gets a distance in buildInterpolationContext) —
          // warn loudly if it ever happens, since unlike the polyline-following
          // path above, a straight-line lerp between two stations isn't bounded
          // to the track and can visibly cut across land/water for stations that
          // are far apart.
          console.warn(
            `[interpolate] station missing from line "${run.lineId}"'s distance map (falling back to straight-line lerp): ${stationA.id}=${distA}, ${stationB.id}=${distB}`,
          );
          lon = stationA.lon + (stationB.lon - stationA.lon) * progress;
          lat = stationA.lat + (stationB.lat - stationA.lat) * progress;
        } else {
          const targetDist = distA + (distB - distA) * progress;
          [lon, lat] = pointAtDistance(lineContext.polyline, lineContext.cumDist, targetDist);
        }

        positions.push({
          runRef: run.runRef,
          lineId: run.lineId,
          destinationName: run.destinationName,
          lon,
          lat,
          progress,
          fromStationId: stationA.id,
          toStationId: stationB.id,
          delayMin: delayMinutesFor(b),
        });
        break;
      }
    }
  }

  return positions;
}
