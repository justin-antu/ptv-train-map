/**
 * Regenerates public/data/network-static.json from the static Melbourne GTFS
 * schedule feed, for every in-scope Metro Trains Melbourne line (see
 * scripts/lib/lines.ts). V/Line data is excluded.
 *
 * Regenerate after station or alignment changes. The committed artifact avoids
 * downloading and processing the approximately 250 MB feed at build or runtime.
 *
 * Usage:
 *   1. Download the Victorian GTFS schedule zip from
 *      https://opendata.transport.vic.gov.au/dataset/gtfs-schedule
 *      (direct link at the time of writing:
 *      https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip)
 *   2. Unzip it, then unzip folder "2" (the "Metropolitan Train" operational
 *      branch)'s google_transit.zip into a directory such as gtfs-download/metro-train/
 *   3. Run: GTFS_DIR=gtfs-download/metro-train npm run generate:static-data
 *      (GTFS_DIR defaults to gtfs-download/metro-train if not set)
 *
 * shapes.txt and stop_times.txt are approximately 50–90 MB each. Every GTFS
 * file is streamed once across all lines to keep processing proportional to
 * feed size rather than line count.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { streamCsv } from "./lib/csv.ts";
import { IN_SCOPE_LINE_NAMES, lineIdFromName } from "./lib/lines.ts";
import type { LineStatic, NetworkStaticData, StationStatic } from "../src/shared/types.ts";

const GTFS_DIR = process.env.GTFS_DIR ?? path.resolve("gtfs-download/metro-train");
const OUTPUT_PATH = path.resolve("public/data/network-static.json");

function slugify(name: string): string {
  return lineIdFromName(name);
}

interface StopTimeEntry {
  stopId: string;
  sequence: number;
}

interface RouteInfo {
  routeId: string;
  color: string;
}

/** Pass 1: routes.txt — resolve {routeId, color} for each in-scope line name (excludes Replacement Bus / City Circle / etc. by exact-name match). */
async function loadRouteInfo(): Promise<Map<string, RouteInfo>> {
  const byName = new Map<string, RouteInfo>();
  await streamCsv(path.join(GTFS_DIR, "routes.txt"), (row) => {
    if ((IN_SCOPE_LINE_NAMES as readonly string[]).includes(row.route_short_name)) {
      byName.set(row.route_short_name, { routeId: row.route_id, color: `#${row.route_color}` });
    }
  });
  const missing = IN_SCOPE_LINE_NAMES.filter((n) => !byName.has(n));
  if (missing.length > 0) {
    throw new Error(`Could not find these lines in routes.txt: ${missing.join(", ")}`);
  }
  return byName;
}

/** Pass 2: stops.txt — small file (~400KB), load every stop into memory once. */
async function loadAllStops(): Promise<Map<string, { name: string; lat: number; lon: number }>> {
  const info = new Map<string, { name: string; lat: number; lon: number }>();
  await streamCsv(path.join(GTFS_DIR, "stops.txt"), (row) => {
    info.set(row.stop_id, {
      name: row.stop_name.replace(/\s+Railway Station$|\s+Station$/i, "").trim(),
      lat: Number(row.stop_lat),
      lon: Number(row.stop_lon),
    });
  });
  return info;
}

/** Pass 3: trips.txt — for each in-scope route, collect its trip_id -> shape_id map. */
async function loadTripsPerRoute(routeIds: Set<string>): Promise<Map<string, Map<string, string>>> {
  const perRoute = new Map<string, Map<string, string>>();
  for (const routeId of routeIds) perRoute.set(routeId, new Map());

  await streamCsv(path.join(GTFS_DIR, "trips.txt"), (row) => {
    const tripsForRoute = perRoute.get(row.route_id);
    if (tripsForRoute) tripsForRoute.set(row.trip_id, row.shape_id);
  });

  for (const [routeId, trips] of perRoute) {
    if (trips.size === 0) throw new Error(`No trips found for route_id ${routeId}`);
  }
  return perRoute;
}

/** Pass 4: stream stop_times.txt once and retain required trip IDs. */
async function loadStopTimesForTrips(neededTripIds: Set<string>): Promise<Map<string, StopTimeEntry[]>> {
  const tripStops = new Map<string, StopTimeEntry[]>();
  await streamCsv(path.join(GTFS_DIR, "stop_times.txt"), (row) => {
    if (!neededTripIds.has(row.trip_id)) return;
    const list = tripStops.get(row.trip_id) ?? [];
    list.push({ stopId: row.stop_id, sequence: Number(row.stop_sequence) });
    tripStops.set(row.trip_id, list);
  });
  return tripStops;
}

/** Pass 5: stream shapes.txt once and retain the selected shape for each line. */
async function loadShapesById(neededShapeIds: Set<string>): Promise<Map<string, [number, number][]>> {
  const rawPoints = new Map<string, { lat: number; lon: number; sequence: number }[]>();
  await streamCsv(path.join(GTFS_DIR, "shapes.txt"), (row) => {
    if (!neededShapeIds.has(row.shape_id)) return;
    const list = rawPoints.get(row.shape_id) ?? [];
    list.push({ lat: Number(row.shape_pt_lat), lon: Number(row.shape_pt_lon), sequence: Number(row.shape_pt_sequence) });
    rawPoints.set(row.shape_id, list);
  });

  const result = new Map<string, [number, number][]>();
  for (const [shapeId, points] of rawPoints) {
    points.sort((a, b) => a.sequence - b.sequence);
    result.set(
      shapeId,
      points.map((p): [number, number] => [p.lon, p.lat]),
    );
  }
  return result;
}

/**
 * The map represents each line with its primary direct alignment. Select the
 * longest trip that excludes City Loop-only stations, falling back to the
 * longest overall trip when no direct variant exists.
 *
 * Flagstaff, Melbourne Central, and Parliament identify City Loop variants.
 * Southern Cross is excluded because it belongs to several direct alignments.
 *
 * Metro Tunnel stations remain part of the primary alignment for the Sunbury,
 * Cranbourne, and Pakenham lines.
 */
const CITY_LOOP_ONLY_STOP_NAME_PATTERN = /flagstaff|melbourne central|parliament/i;

function findCanonicalTripStops(
  tripIds: Iterable<string>,
  tripStops: Map<string, StopTimeEntry[]>,
  stopNames: Map<string, { name: string }>,
  lineName: string,
): { tripId: string; stops: StopTimeEntry[] } {
  let bestDirectTripId = "";
  let bestDirect: StopTimeEntry[] = [];
  let bestOverallTripId = "";
  let bestOverall: StopTimeEntry[] = [];

  for (const tripId of tripIds) {
    const stops = tripStops.get(tripId);
    if (!stops || stops.length === 0) continue;
    if (stops.length > bestOverall.length) {
      bestOverall = stops;
      bestOverallTripId = tripId;
    }

    const viaLoop = stops.some((s) => CITY_LOOP_ONLY_STOP_NAME_PATTERN.test(stopNames.get(s.stopId)?.name ?? ""));
    if (!viaLoop && stops.length > bestDirect.length) {
      bestDirect = stops;
      bestDirectTripId = tripId;
    }
  }

  if (bestDirect.length === 0) {
    if (bestOverall.length === 0) {
      throw new Error(`No stop_times entries found for any trip on the ${lineName} line`);
    }
    console.warn(`  (!) ${lineName}: no non-City-Loop trip variant found; using longest trip including the loop`);
    return { tripId: bestOverallTripId, stops: [...bestOverall].sort((a, b) => a.sequence - b.sequence) };
  }
  return { tripId: bestDirectTripId, stops: [...bestDirect].sort((a, b) => a.sequence - b.sequence) };
}

async function main() {
  console.log(`Reading GTFS Metropolitan Train feed from ${GTFS_DIR}`);

  const routeInfoByName = await loadRouteInfo();
  console.log(`Resolved ${routeInfoByName.size} in-scope line routes from routes.txt`);

  const routeIds = new Set([...routeInfoByName.values()].map((r) => r.routeId));
  const tripsPerRoute = await loadTripsPerRoute(routeIds);

  const neededTripIds = new Set<string>();
  for (const trips of tripsPerRoute.values()) for (const tripId of trips.keys()) neededTripIds.add(tripId);
  console.log(`Found ${neededTripIds.size} trips across all in-scope routes`);

  const tripStops = await loadStopTimesForTrips(neededTripIds);
  const allStops = await loadAllStops();

  const lines: LineStatic[] = [];
  const stationsBySlug = new Map<string, StationStatic>();
  const neededShapeIds = new Set<string>();
  const chosenTripAndStopsByLine = new Map<string, { tripId: string; stops: StopTimeEntry[] }>();

  for (const lineName of IN_SCOPE_LINE_NAMES) {
    const routeInfo = routeInfoByName.get(lineName);
    if (!routeInfo) continue; // Guard retained for type narrowing after validation.
    const tripShapeId = tripsPerRoute.get(routeInfo.routeId)!;

    const { tripId, stops: bestStops } = findCanonicalTripStops(tripShapeId.keys(), tripStops, allStops, lineName);

    const shapeId = tripShapeId.get(tripId);
    if (!shapeId) throw new Error(`Trip ${tripId} (line ${lineName}) has no shape_id`);
    neededShapeIds.add(shapeId);
    chosenTripAndStopsByLine.set(lineName, { tripId, stops: bestStops });
    console.log(`  ${lineName}: using trip ${tripId} (${bestStops.length} stops, shape ${shapeId})`);
  }

  const shapesById = await loadShapesById(neededShapeIds);

  for (const lineName of IN_SCOPE_LINE_NAMES) {
    const routeInfo = routeInfoByName.get(lineName)!;
    const { tripId, stops } = chosenTripAndStopsByLine.get(lineName)!;
    const shapeId = tripsPerRoute.get(routeInfo.routeId)!.get(tripId)!;
    const polyline = shapesById.get(shapeId);
    if (!polyline || polyline.length === 0) throw new Error(`No shape points found for shape_id ${shapeId} (line ${lineName})`);

    const lineId = lineIdFromName(lineName);
    const stationIds: string[] = [];

    for (const stop of stops) {
      const info = allStops.get(stop.stopId);
      if (!info) throw new Error(`Missing stop info for stop_id ${stop.stopId} (line ${lineName})`);
      const slug = slugify(info.name);

      let station = stationsBySlug.get(slug);
      if (!station) {
        station = { id: slug, name: info.name, lat: info.lat, lon: info.lon, gtfsStopId: stop.stopId, lineIds: [] };
        stationsBySlug.set(slug, station);
      }
      if (!station.lineIds.includes(lineId)) station.lineIds.push(lineId);
      stationIds.push(slug);
    }

    lines.push({
      id: lineId,
      name: lineName,
      color: routeInfo.color,
      gtfsRouteId: routeInfo.routeId,
      stationIds,
      polyline,
    });
  }

  const output: NetworkStaticData = {
    lines,
    stations: [...stationsBySlug.values()],
    generatedAt: new Date().toISOString(),
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${lines.length} lines, ${output.stations.length} unique stations to ${OUTPUT_PATH}`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
