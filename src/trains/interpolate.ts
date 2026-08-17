import type { LiveRun, StationStatic } from "../shared/types";
import { cumulativeDistances, nearestDistanceAlong, pointAtDistance } from "./polylineGeo";

export interface TrainPosition {
  runRef: string;
  destinationName: string;
  lon: number;
  lat: number;
  /** 0 = at fromStation, 1 = at toStation (or exactly at a station if from === to). */
  progress: number;
  fromStationId: string;
  toStationId: string;
}

export interface InterpolationContext {
  /** Distance (metres) along `polyline` for each station, keyed by station id. */
  stationDistances: Map<string, number>;
  cumDist: number[];
  polyline: [number, number][];
}

export function buildInterpolationContext(
  stations: StationStatic[],
  polyline: [number, number][],
): InterpolationContext {
  const cumDist = cumulativeDistances(polyline);
  const stationDistances = new Map<string, number>();
  for (const station of stations) {
    stationDistances.set(station.id, nearestDistanceAlong(polyline, cumDist, [station.lon, station.lat]));
  }
  return { stationDistances, cumDist, polyline };
}

export interface InterpolationOptions {
  /** How long after a run's last known predicted stop we keep showing it there before hiding it. */
  staleAfterMs: number;
  /** How long before a run's first known predicted stop we start showing it waiting at that station. */
  showBeforeFirstStopMs: number;
}

/**
 * Computes the current geographic position of every "in progress" train run, by
 * finding which pair of consecutive predicted stop-times bracket `now`, then
 * interpolating along the track polyline (not a straight line) between those two
 * stations' projected positions.
 *
 * This is a simplification appropriate for v1: it assumes a run's predicted stop
 * times, sorted chronologically, correspond to the physical station order along
 * the line. This holds for all-stops services; express/limited-stops services
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

    const firstTime = Date.parse(stops[0].timeUtc);
    const lastTime = Date.parse(stops[stops.length - 1].timeUtc);

    if (now < firstTime) {
      if (firstTime - now <= options.showBeforeFirstStopMs) {
        const station = stationsById.get(stops[0].stationId);
        if (station) {
          positions.push({
            runRef: run.runRef,
            destinationName: run.destinationName,
            lon: station.lon,
            lat: station.lat,
            progress: 0,
            fromStationId: station.id,
            toStationId: station.id,
          });
        }
      }
      continue;
    }

    if (now > lastTime) {
      if (now - lastTime <= options.staleAfterMs) {
        const station = stationsById.get(stops[stops.length - 1].stationId);
        if (station) {
          positions.push({
            runRef: run.runRef,
            destinationName: run.destinationName,
            lon: station.lon,
            lat: station.lat,
            progress: 1,
            fromStationId: station.id,
            toStationId: station.id,
          });
        }
      }
      continue;
    }

    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      const tA = Date.parse(a.timeUtc);
      const tB = Date.parse(b.timeUtc);
      if (now >= tA && now <= tB) {
        const stationA = stationsById.get(a.stationId);
        const stationB = stationsById.get(b.stationId);
        if (!stationA || !stationB) break;

        const progress = tB === tA ? 1 : (now - tA) / (tB - tA);
        const distA = context.stationDistances.get(stationA.id);
        const distB = context.stationDistances.get(stationB.id);

        let lon: number;
        let lat: number;
        if (distA === undefined || distB === undefined) {
          // Fallback: straight-line interpolation if a station wasn't found on the polyline.
          lon = stationA.lon + (stationB.lon - stationA.lon) * progress;
          lat = stationA.lat + (stationB.lat - stationA.lat) * progress;
        } else {
          const targetDist = distA + (distB - distA) * progress;
          [lon, lat] = pointAtDistance(context.polyline, context.cumDist, targetDist);
        }

        positions.push({
          runRef: run.runRef,
          destinationName: run.destinationName,
          lon,
          lat,
          progress,
          fromStationId: stationA.id,
          toStationId: stationB.id,
        });
        break;
      }
    }
  }

  return positions;
}
