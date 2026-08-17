/**
 * Generates the next eight Melbourne calendar days of scheduled Metro service.
 *
 * Complete stop patterns come from the official Victorian GTFS Schedule feed.
 * PTV v3 is intentionally used only once to verify the current 16 route names:
 * its route-runs endpoint is efficient, but obtaining full stop times still
 * requires one /pattern request per run (many thousands for eight days).
 *
 * The output is written atomically, so a failed/empty generation never removes
 * the last known-good public/data/network-timetable.json artifact.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import type { PtvCredentials } from "./lib/ptvClient.ts";
import {
  generateTimetable,
  melbourneDateRange,
  writeTimetableAtomically,
} from "./lib/timetable.ts";

const dotEnvPath = path.resolve(".env");
if (existsSync(dotEnvPath)) process.loadEnvFile(dotEnvPath);

function credentialsFromEnvironment(): PtvCredentials | undefined {
  const devId = process.env.PTV_DEV_ID;
  const apiKey = process.env.PTV_API_KEY;
  return devId && apiKey ? { devId, apiKey } : undefined;
}

async function main() {
  const gtfsDir = process.env.GTFS_DIR ?? path.resolve("gtfs-download/metro-train");
  const outputPath = process.env.TIMETABLE_OUTPUT ?? path.resolve("public/data/network-timetable.json");
  const dates = melbourneDateRange();
  console.log(`Generating scheduled timetable for ${dates[0]} through ${dates.at(-1)} (${dates.length} Melbourne dates)`);

  const data = await generateTimetable({
    gtfsDir,
    outputPath,
    dates,
    credentials: credentialsFromEnvironment(),
  });
  await writeTimetableAtomically(data, outputPath);

  const serviceCount = data.lines.reduce(
    (sum, line) => sum + line.directions.reduce((directionSum, direction) => directionSum + direction.services.length, 0),
    0,
  );
  const datedServiceCount = data.lines.reduce(
    (sum, line) => sum + line.directions.reduce(
      (directionSum, direction) => directionSum + direction.services.reduce(
        (serviceSum, service) => serviceSum + service.dateMask.toString(2).replaceAll("0", "").length,
        0,
      ),
      0,
    ),
    0,
  );
  console.log(`Wrote ${data.lines.length} lines, ${serviceCount} unique services and ${datedServiceCount} dated operations to ${outputPath}`);
  console.log(`PTV route metadata: ${data.source.ptvRouteMetadata}; warnings: ${data.source.warnings.length}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
