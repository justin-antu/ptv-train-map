import { effectiveStopTimeUtc, type LiveRun, type NetworkStaticData, type StationStatic } from "../shared/types";
import { delayMinutesFor } from "../data/departures";
import { cumulativeDistances, nearestDistanceAlong, pointAtDistance } from "./polylineGeo";

/**
 * How old a GPS fix may be before the marker falls back to interpolation. The
 * vehicle-positions feed refreshes about every 30 seconds, so a fix older than
 * this means the train has stopped reporting rather than stopped moving.
 */
export const GPS_FIX_MAX_AGE_MS = 3 * 60_000;

export interface TrainPosition {
  runRef: string;
  lineId: string;
  destinationName: string;
  lon: number;
  lat: number;
  /**
   * `gps` when the coordinates are a real vehicle fix from the realtime feed,
   * `interpolated` when they are a guess between two timetabled calls. The map
   * distinguishes the two, because an interpolated marker can be confidently
   * wrong in a way a rider should be able to see.
   */
  source: "gps" | "interpolated";
  /** Degrees clockwise from true north. Only ever present on a GPS fix. */
  bearing?: number;
  /** 0 = at fromStation, 1 = at toStation (or exactly at a station if from === to). */
  progress: number;
  fromStationId: string;
  toStationId: string;
  /**
   * Minutes late at the run's next (or current, if waiting/arrived) call.
   * 0 or negative means on time/early. Rounded to the nearest minute, and 0
   * when the feed published no prediction to measure against.
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
  /** Display grace period after a run's last predicted stop. */
  staleAfterMs: number;
  /** Display lead time before a run's first predicted stop. */
  showBeforeFirstStopMs: number;
}

interface ParsedRunTimes {
  firstMs: number;
  lastMs: number;
  stopMs: number[];
}

/**
 * Caches each run's parsed (epoch-ms) stop times, keyed by the run object
 * itself. Parsing every timestamp on each animation tick scales with the full
 * snapshot rather than the visible train count. The `WeakMap` requires no
 * manual invalidation because each live-data refresh creates new run objects.
 */
const parsedTimesCache = new WeakMap<LiveRun, ParsedRunTimes>();

function getParsedTimes(run: LiveRun): ParsedRunTimes {
  let parsed = parsedTimesCache.get(run);
  if (!parsed) {
    const stopMs = run.stops.map((s) => Date.parse(effectiveStopTimeUtc(s)));
    parsed = { firstMs: stopMs[0], lastMs: stopMs[stopMs.length - 1], stopMs };
    parsedTimesCache.set(run, parsed);
  }
  return parsed;
}

/**
 * Counts runs that currently render a marker, including the waiting and
 * recently arrived grace windows. Future departures in the snapshot are
 * excluded. Cached stop times make this suitable for each live-data refresh.
 */
export function countActiveRuns(runs: LiveRun[], now: number, options: InterpolationOptions): number {
  let count = 0;
  for (const run of runs) {
    if (run.stops.length === 0 || run.status === "cancelled") continue;
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
 * Chronological predicted stops are assumed to follow physical station order.
 * Limited-stop services cross skipped sections without intermediate timing.
 */
export function computeTrainPositions(
  runs: LiveRun[],
  stationsById: Map<string, StationStatic>,
  context: InterpolationContext,
  now: number,
  options: InterpolationOptions,
): TrainPosition[] {
  const positions: TrainPosition[] = [];

  /**
   * A real fix always beats a guess, but the interpolated bracket is still
   * computed: it supplies the from/to stations the popup names, which a bare
   * coordinate cannot.
   */
  const withBestPosition = (run: LiveRun, interpolated: TrainPosition): TrainPosition => {
    const fix = run.position;
    if (!fix) return interpolated;
    const observedAt = Date.parse(fix.observedAtUtc);
    if (!Number.isFinite(observedAt) || now - observedAt > GPS_FIX_MAX_AGE_MS) return interpolated;
    return { ...interpolated, lon: fix.lon, lat: fix.lat, bearing: fix.bearing, source: "gps" };
  };

  for (const run of runs) {
    const stops = run.stops;
    if (stops.length === 0 || run.status === "cancelled") continue;

    const lineContext = context.get(run.lineId);
    if (!lineContext) continue;

    const { firstMs: firstTime, lastMs: lastTime, stopMs } = getParsedTimes(run);

    if (now < firstTime) {
      if (firstTime - now <= options.showBeforeFirstStopMs) {
        const station = stationsById.get(stops[0].stationId);
        if (station) {
          positions.push(
            withBestPosition(run, {
              runRef: run.runRef,
              lineId: run.lineId,
              destinationName: run.destinationName,
              lon: station.lon,
              lat: station.lat,
              source: "interpolated",
              progress: 0,
              fromStationId: station.id,
              toStationId: station.id,
              delayMin: delayMinutesFor(stops[0]) ?? 0,
            }),
          );
        }
      }
      continue;
    }

    if (now > lastTime) {
      if (now - lastTime <= options.staleAfterMs) {
        const lastStop = stops[stops.length - 1];
        const station = stationsById.get(lastStop.stationId);
        if (station) {
          positions.push(
            withBestPosition(run, {
              runRef: run.runRef,
              lineId: run.lineId,
              destinationName: run.destinationName,
              lon: station.lon,
              lat: station.lat,
              source: "interpolated",
              progress: 1,
              fromStationId: station.id,
              toStationId: station.id,
              delayMin: delayMinutesFor(lastStop) ?? 0,
            }),
          );
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
          // Missing station geometry falls back to straight-line interpolation.
          // Emit a warning because this path is not constrained to the track.
          console.warn(
            `[interpolate] station missing from line "${run.lineId}"'s distance map (falling back to straight-line lerp): ${stationA.id}=${distA}, ${stationB.id}=${distB}`,
          );
          lon = stationA.lon + (stationB.lon - stationA.lon) * progress;
          lat = stationA.lat + (stationB.lat - stationA.lat) * progress;
        } else {
          const targetDist = distA + (distB - distA) * progress;
          [lon, lat] = pointAtDistance(lineContext.polyline, lineContext.cumDist, targetDist);
        }

        positions.push(
          withBestPosition(run, {
            runRef: run.runRef,
            lineId: run.lineId,
            destinationName: run.destinationName,
            lon,
            lat,
            source: "interpolated",
            progress,
            fromStationId: stationA.id,
            toStationId: stationB.id,
            delayMin: delayMinutesFor(b) ?? 0,
          }),
        );
        break;
      }
    }
  }

  return positions;
}
