/**
 * Regenerates public/data/lilydale-static.json from the static Melbourne GTFS
 * schedule feed.
 *
 * This only needs to be re-run when PTV significantly changes the Lilydale
 * line's stations or alignment (rare) — the resulting JSON is committed to the
 * repo so the app never needs to re-download/re-process the (~250MB) GTFS feed
 * at build or runtime.
 *
 * Usage:
 *   1. Download the Victorian GTFS schedule zip from
 *      https://opendata.transport.vic.gov.au/dataset/gtfs-schedule
 *      (direct link at the time of writing:
 *      https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip)
 *   2. Unzip it, then unzip folder "2" (the "Metropolitan Train" operational
 *      branch)'s google_transit.zip into some directory, e.g. gtfs-download/metro-train/
 *   3. Run: GTFS_DIR=gtfs-download/metro-train npm run generate:static-data
 *      (GTFS_DIR defaults to gtfs-download/metro-train if not set)
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { streamCsv } from "./lib/csv.ts";
import { LINE_COLOR, LINE_ID, LINE_NAME } from "../src/config.ts";
import type { StationStatic, StaticLineData } from "../src/shared/types.ts";

const GTFS_DIR = process.env.GTFS_DIR ?? path.resolve("gtfs-download/metro-train");
const OUTPUT_PATH = path.resolve("public/data/lilydale-static.json");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface StopTimeEntry {
  stopId: string;
  sequence: number;
}

async function findLilydaleRouteId(): Promise<string> {
  let routeId: string | null = null;
  await streamCsv(path.join(GTFS_DIR, "routes.txt"), (row) => {
    const isBusReplacement = /bus/i.test(row.route_long_name) || /bus/i.test(row.route_short_name);
    if (row.route_short_name === "Lilydale" && !isBusReplacement) {
      routeId = row.route_id;
    }
  });
  if (!routeId) throw new Error("Could not find the Lilydale rail route in routes.txt");
  return routeId;
}

async function findTripsForRoute(routeId: string): Promise<Map<string, string>> {
  const tripShapeId = new Map<string, string>();
  await streamCsv(path.join(GTFS_DIR, "trips.txt"), (row) => {
    if (row.route_id === routeId) {
      tripShapeId.set(row.trip_id, row.shape_id);
    }
  });
  if (tripShapeId.size === 0) throw new Error(`No trips found for route_id ${routeId}`);
  return tripShapeId;
}

/**
 * Some Lilydale services run via the underground City Loop (Flinders Street ->
 * Southern Cross -> Flagstaff -> Melbourne Central -> Parliament -> Richmond ->
 * ...), while most run the direct way (Flinders Street -> Richmond -> ...). The
 * official PTV network map (and this app) represents the Lilydale line as the
 * direct alignment — the loop stations are shared infrastructure used by most
 * of Melbourne's lines, not specific to Lilydale. So among full-length trips, we
 * pick the longest one that *excludes* those loop-only stations.
 */
const CITY_LOOP_ONLY_STOP_NAME_PATTERN = /southern cross|flagstaff|melbourne central|parliament/i;

async function findCanonicalTripStops(
  tripIds: Set<string>,
): Promise<{ tripId: string; stops: StopTimeEntry[] }> {
  const tripStops = new Map<string, StopTimeEntry[]>();
  await streamCsv(path.join(GTFS_DIR, "stop_times.txt"), (row) => {
    if (tripIds.has(row.trip_id)) {
      const list = tripStops.get(row.trip_id) ?? [];
      list.push({ stopId: row.stop_id, sequence: Number(row.stop_sequence) });
      tripStops.set(row.trip_id, list);
    }
  });

  const allStopIds = new Set<string>();
  for (const stops of tripStops.values()) for (const s of stops) allStopIds.add(s.stopId);
  const stopNames = await loadStopInfo(allStopIds);

  let bestTripId: string | null = null;
  let bestStops: StopTimeEntry[] = [];
  for (const [tripId, stops] of tripStops) {
    const viaLoop = stops.some((s) => CITY_LOOP_ONLY_STOP_NAME_PATTERN.test(stopNames.get(s.stopId)?.name ?? ""));
    if (viaLoop) continue;
    if (stops.length > bestStops.length) {
      bestTripId = tripId;
      bestStops = stops;
    }
  }
  if (!bestTripId) throw new Error("Could not find any direct (non-City-Loop) Lilydale trip with stop_times entries");
  bestStops.sort((a, b) => a.sequence - b.sequence);
  return { tripId: bestTripId, stops: bestStops };
}

async function loadStopInfo(
  stopIds: Set<string>,
): Promise<Map<string, { name: string; lat: number; lon: number }>> {
  const info = new Map<string, { name: string; lat: number; lon: number }>();
  await streamCsv(path.join(GTFS_DIR, "stops.txt"), (row) => {
    if (stopIds.has(row.stop_id)) {
      info.set(row.stop_id, {
        name: row.stop_name.replace(/\s+Railway Station$|\s+Station$/i, "").trim(),
        lat: Number(row.stop_lat),
        lon: Number(row.stop_lon),
      });
    }
  });
  return info;
}

async function loadShapePolyline(shapeId: string): Promise<[number, number][]> {
  const points: { lat: number; lon: number; sequence: number }[] = [];
  await streamCsv(path.join(GTFS_DIR, "shapes.txt"), (row) => {
    if (row.shape_id === shapeId) {
      points.push({
        lat: Number(row.shape_pt_lat),
        lon: Number(row.shape_pt_lon),
        sequence: Number(row.shape_pt_sequence),
      });
    }
  });
  if (points.length === 0) throw new Error(`No shape points found for shape_id ${shapeId}`);
  points.sort((a, b) => a.sequence - b.sequence);
  return points.map((p): [number, number] => [p.lon, p.lat]);
}

async function main() {
  console.log(`Reading GTFS Metropolitan Train feed from ${GTFS_DIR}`);

  const routeId = await findLilydaleRouteId();
  console.log(`Found Lilydale route_id: ${routeId}`);

  const tripShapeId = await findTripsForRoute(routeId);
  console.log(`Found ${tripShapeId.size} Lilydale trips`);

  const { tripId, stops } = await findCanonicalTripStops(new Set(tripShapeId.keys()));
  console.log(`Using trip ${tripId} as the canonical full-length service (${stops.length} stops)`);

  const shapeId = tripShapeId.get(tripId);
  if (!shapeId) throw new Error(`Trip ${tripId} has no shape_id`);

  const stopInfo = await loadStopInfo(new Set(stops.map((s) => s.stopId)));
  const polyline = await loadShapePolyline(shapeId);
  console.log(`Collected ${polyline.length} shape points for shape_id ${shapeId}`);

  let orderedStopIds = stops.map((s) => s.stopId);
  let orderedPolyline = polyline;

  const firstStopName = stopInfo.get(orderedStopIds[0])?.name ?? "";
  if (!/flinders/i.test(firstStopName)) {
    // The chosen trip ran Lilydale -> Flinders Street; flip both lists so our
    // canonical order always starts at Flinders Street (sequence 0).
    orderedStopIds = [...orderedStopIds].reverse();
    orderedPolyline = [...orderedPolyline].reverse();
  }

  const usedSlugs = new Set<string>();
  const stations: StationStatic[] = orderedStopIds.map((stopId, index) => {
    const info = stopInfo.get(stopId);
    if (!info) throw new Error(`Missing stop info for stop_id ${stopId}`);
    let slug = slugify(info.name);
    while (usedSlugs.has(slug)) slug = `${slug}-alt`;
    usedSlugs.add(slug);
    return {
      id: slug,
      name: info.name,
      lat: info.lat,
      lon: info.lon,
      sequence: index,
      gtfsStopId: stopId,
    };
  });

  const output: StaticLineData = {
    line: {
      id: LINE_ID,
      name: LINE_NAME,
      color: LINE_COLOR,
      gtfsRouteId: routeId,
    },
    stations,
    polyline: orderedPolyline,
    generatedAt: new Date().toISOString(),
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${stations.length} stations and ${orderedPolyline.length} polyline points to ${OUTPUT_PATH}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
