/**
 * Read-only reconnaissance against the Victorian GTFS-Realtime metro feeds.
 *
 * Two unknowns decide the shape of the live data layer, and neither can be
 * answered from documentation:
 *
 *   1. What fraction of trips in the trip-updates feed also appear in
 *      vehicle-positions? This decides whether real GPS can be the primary
 *      source for the map or only an enrichment over interpolation.
 *   2. What fraction of realtime `trip_id`s resolve against the trip ids already
 *      shipped in `public/data/network-timetable.json`? This decides whether
 *      exact matching suffices or the version-segment fallback is load-bearing.
 *
 * Writes nothing. Usage:
 *
 *   VIC_GTFS_R_KEY=... npx tsx scripts/spike-gtfsr.ts
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const dotEnvPath = path.resolve(".env");
if (existsSync(dotEnvPath)) {
  process.loadEnvFile(dotEnvPath);
}

import {
  fetchTripUpdates,
  fetchVehiclePositions,
  readGtfsRealtimeKey,
  tripIdWithoutVersion,
} from "./lib/gtfsRealtime.ts";
import type { NetworkTimetableData } from "../src/shared/types.ts";

const TIMETABLE_PATH = path.resolve("public/data/network-timetable.json");

function percent(part: number, whole: number): string {
  if (whole === 0) return "n/a";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function ageDescription(timestampSeconds: number | null): string {
  if (timestampSeconds === null) return "no header timestamp";
  const ageSeconds = Math.round(Date.now() / 1000 - timestampSeconds);
  return `${ageSeconds}s old (${new Date(timestampSeconds * 1000).toISOString()})`;
}

async function main() {
  const key = readGtfsRealtimeKey();

  const [tripUpdates, vehiclePositions] = await Promise.all([
    fetchTripUpdates(key),
    fetchVehiclePositions(key),
  ]);

  console.log("=== Feed freshness ===");
  console.log(`trip-updates      : ${tripUpdates.entities.length} entities, ${ageDescription(tripUpdates.timestampSeconds)}`);
  console.log(`vehicle-positions : ${vehiclePositions.entities.length} entities, ${ageDescription(vehiclePositions.timestampSeconds)}`);

  const tripUpdateIds = new Set(tripUpdates.entities.map((t) => t.tripId).filter((id): id is string => id !== null));
  const vehicleTripIds = new Set(vehiclePositions.entities.map((v) => v.tripId).filter((id): id is string => id !== null));
  const withGps = [...tripUpdateIds].filter((id) => vehicleTripIds.has(id));
  const gpsOnly = [...vehicleTripIds].filter((id) => !tripUpdateIds.has(id));

  console.log("\n=== Unknown 1: vehicle-position fleet coverage ===");
  console.log(`distinct trip_id in trip-updates      : ${tripUpdateIds.size}`);
  console.log(`distinct trip_id in vehicle-positions : ${vehicleTripIds.size}`);
  console.log(`trip-updates trips carrying GPS       : ${withGps.length} (${percent(withGps.length, tripUpdateIds.size)})`);
  console.log(`GPS trips with no trip update         : ${gpsOnly.length}`);
  console.log(
    vehiclePositions.entities.filter((v) => v.bearing !== null).length
      + ` of ${vehiclePositions.entities.length} positions publish a bearing`,
  );

  console.log("\n=== Unknown 2: trip_id match rate against the shipped timetable ===");
  if (!existsSync(TIMETABLE_PATH)) {
    console.log(`(skipped — ${TIMETABLE_PATH} not present)`);
  } else {
    const timetable: NetworkTimetableData = JSON.parse(await readFile(TIMETABLE_PATH, "utf8"));
    const scheduleTripIds = new Set<string>();
    for (const line of timetable.lines) {
      for (const direction of line.directions) {
        for (const service of direction.services) scheduleTripIds.add(service.id);
      }
    }
    const scheduleByVersionlessId = new Map<string, string[]>();
    for (const id of scheduleTripIds) {
      const base = tripIdWithoutVersion(id);
      const siblings = scheduleByVersionlessId.get(base) ?? [];
      siblings.push(id);
      scheduleByVersionlessId.set(base, siblings);
    }

    let exact = 0;
    let viaVersionFallback = 0;
    const unmatched: string[] = [];
    for (const id of tripUpdateIds) {
      if (scheduleTripIds.has(id)) exact += 1;
      else if (scheduleByVersionlessId.has(tripIdWithoutVersion(id))) viaVersionFallback += 1;
      else unmatched.push(id);
    }

    const multiVersion = [...scheduleByVersionlessId.values()].filter((siblings) => siblings.length > 1);
    console.log(`timetable trip ids                    : ${scheduleTripIds.size} (dates ${timetable.availableDates[0]}…${timetable.availableDates.at(-1)})`);
    console.log(`  of which share a versionless base   : ${multiVersion.length} groups (${percent(multiVersion.length, scheduleByVersionlessId.size)} of bases)`);
    console.log(`realtime ids matched exactly          : ${exact} (${percent(exact, tripUpdateIds.size)})`);
    console.log(`realtime ids matched via version base : ${viaVersionFallback} (${percent(viaVersionFallback, tripUpdateIds.size)})`);
    console.log(`realtime ids unmatched                : ${unmatched.length} (${percent(unmatched.length, tripUpdateIds.size)})`);
    if (unmatched.length > 0) console.log(`  sample: ${unmatched.slice(0, 5).join(", ")}`);
  }

  console.log("\n=== Field availability (informs the parser's presence checks) ===");
  const allStopUpdates = tripUpdates.entities.flatMap((t) => t.stopUpdates);
  const published = allStopUpdates.filter((s) => !s.isPropagated);
  console.log(`stop_time_update entries              : ${allStopUpdates.length} (${published.length} published, ${allStopUpdates.length - published.length} propagated)`);
  console.log(`  with an explicit departure delay    : ${published.filter((s) => s.departureDelaySeconds !== null).length}`);
  console.log(`  with a departure delay of exactly 0 : ${published.filter((s) => s.departureDelaySeconds === 0).length}`);
  console.log(`  with an absolute departure time     : ${published.filter((s) => s.departureTimeSeconds !== null).length}`);
  console.log(`  carrying a platform-level stop_id   : ${published.filter((s) => s.stopId !== null).length}`);
  console.log(`  marked skipped                      : ${allStopUpdates.filter((s) => s.relationship === "skipped").length}`);

  const byRelationship = new Map<string, number>();
  for (const trip of tripUpdates.entities) {
    byRelationship.set(trip.relationship, (byRelationship.get(trip.relationship) ?? 0) + 1);
  }
  console.log(`trip schedule_relationship            : ${[...byRelationship].map(([k, v]) => `${k}=${v}`).join(", ")}`);

  const contiguous = tripUpdates.entities.filter((t) => {
    const sequences = t.stopUpdates.map((s) => s.stopSequence).filter((s): s is number => s !== null);
    return sequences.length > 1 && sequences.every((value, index) => index === 0 || value === sequences[index - 1] + 1);
  });
  console.log(`trips with a contiguous stop sequence : ${contiguous.length} of ${tripUpdates.entities.length}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
