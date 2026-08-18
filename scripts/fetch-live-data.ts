/**
 * Fetches live/predicted departures from the PTV Timetable API for every
 * in-scope Metro Trains Melbourne line (see scripts/lib/lines.ts) and writes
 * a compact combined snapshot to public/data/network-live.json.
 *
 * The `.github/workflows/refresh-data.yml` schedule runs this command multiple
 * times per job and commits each changed snapshot. Local usage:
 *
 *   PTV_DEV_ID=... PTV_API_KEY=... npm run fetch:live-data
 *
 * The request and response shapes (route_type=0 for train, the
 * /v3/routes, /v3/stops/route/{id}/route_type/{type},
 * /v3/departures/route_type/{type}/stop/{id}/route/{id}, and
 * /v3/disruptions/route/{id} endpoints, and field names like
 * estimated_departure_utc/scheduled_departure_utc and disruption_id/title/
 * disruption_type) match the live Swagger documentation and API responses.
 *
 * Bounded concurrency limits load while processing approximately 280
 * line/station departure requests. The 16 disruption requests run concurrently
 * with departure jobs.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Local runs load credentials from `.env`. CI injects repository secrets.
const dotEnvPath = path.resolve(".env");
if (existsSync(dotEnvPath)) {
  process.loadEnvFile(dotEnvPath);
}

import { mapWithConcurrency } from "./lib/concurrency.ts";
import {
  getDeparturesForStop,
  getDisruptionsForRoute,
  getRoutes,
  getStopsForRoute,
  ROUTE_TYPE_TRAIN,
  type PtvCredentials,
  type PtvDisruption,
} from "./lib/ptvClient.ts";
import type { LineDisruption, LiveRun, LiveRunStop, LiveSnapshot, NetworkStaticData, StationStatic } from "../src/shared/types.ts";

const STATIC_DATA_PATH = path.resolve("public/data/network-static.json");
const OUTPUT_PATH = path.resolve("public/data/network-live.json");
// Twelve results provide enough run context to connect stations across longer
// direct and one-interchange journeys without increasing the request count.
const MAX_RESULTS_PER_STOP = Number(process.env.MAX_RESULTS_PER_STOP ?? 12);
const FETCH_CONCURRENCY = Number(process.env.FETCH_CONCURRENCY ?? 8);

function normalizeStationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+railway station$|\s+station$/i, "")
    .trim();
}

function readCredentials(): PtvCredentials {
  const devId = process.env.PTV_DEV_ID;
  const apiKey = process.env.PTV_API_KEY;
  if (!devId || !apiKey) {
    throw new Error(
      "Missing PTV_DEV_ID and/or PTV_API_KEY environment variables. " +
        "Set them locally (see .env.example) or as GitHub Actions secrets to run this script.",
    );
  }
  return { devId, apiKey };
}

/** One /v3/routes call resolves every in-scope line's PTV route_id at once (matched by exact name). */
async function resolveRouteIds(lineNames: string[], credentials: PtvCredentials): Promise<Map<string, number>> {
  const routes = await getRoutes(ROUTE_TYPE_TRAIN, credentials);
  const byName = new Map(routes.map((r) => [r.route_name.trim().toLowerCase(), r.route_id]));

  const resolved = new Map<string, number>();
  for (const name of lineNames) {
    const routeId = byName.get(name.trim().toLowerCase());
    if (routeId === undefined) {
      console.warn(`Warning: could not resolve a PTV route_id for line "${name}" among ${routes.length} train routes returned by /v3/routes.`);
      continue;
    }
    resolved.set(name, routeId);
  }
  return resolved;
}

async function resolveStationStopIds(
  routeId: number,
  stations: StationStatic[],
  credentials: PtvCredentials,
): Promise<Map<string, number>> {
  const ptvStops = await getStopsForRoute(routeId, ROUTE_TYPE_TRAIN, credentials);
  const byNormalizedName = new Map(ptvStops.map((s) => [normalizeStationName(s.stop_name), s.stop_id]));

  const resolved = new Map<string, number>();
  for (const station of stations) {
    const stopId = byNormalizedName.get(normalizeStationName(station.name));
    if (stopId !== undefined) resolved.set(station.id, stopId);
  }
  return resolved;
}

interface DepartureJob {
  lineId: string;
  lineName: string;
  routeId: number;
  stationId: string;
  stopId: number;
}

function toLineDisruption(d: PtvDisruption): LineDisruption {
  return {
    id: d.disruption_id,
    title: d.title,
    url: d.url,
    disruptionType: d.disruption_type,
    disruptionStatus: d.disruption_status,
    fromDateUtc: d.from_date,
    toDateUtc: d.to_date,
  };
}

/**
 * Fetches current disruptions for every line with a resolved route_id, one
 * request per line (~16 total — negligible next to the ~280 departure
 * requests below). A disruption can list multiple routes, so results are
 * deduplicated by disruption_id per line.
 */
async function fetchDisruptionsByLine(
  lines: { id: string; name: string; routeId: number | undefined }[],
  credentials: PtvCredentials,
): Promise<Record<string, LineDisruption[]>> {
  const result: Record<string, LineDisruption[]> = {};

  await mapWithConcurrency(
    lines.filter((l): l is { id: string; name: string; routeId: number } => l.routeId !== undefined),
    FETCH_CONCURRENCY,
    async (line) => {
      try {
        const disruptions = await getDisruptionsForRoute(line.routeId, credentials);
        const relevant = disruptions.filter((d) => d.routes.some((r) => r.route_id === line.routeId));
        if (relevant.length === 0) return;

        const byId = new Map<number, LineDisruption>();
        for (const d of relevant) byId.set(d.disruption_id, toLineDisruption(d));
        result[line.id] = [...byId.values()];
      } catch (err) {
        console.warn(`Warning: failed to fetch disruptions for ${line.name} line (route_id ${line.routeId}):`, err);
      }
    },
  );

  return result;
}

async function fetchSnapshot(): Promise<LiveSnapshot> {
  const credentials = readCredentials();
  const staticData: NetworkStaticData = JSON.parse(await readFile(STATIC_DATA_PATH, "utf8"));
  const stationsById = new Map(staticData.stations.map((s) => [s.id, s]));

  const routeIdByLineName = await resolveRouteIds(
    staticData.lines.map((l) => l.name),
    credentials,
  );

  const lineResults: LiveSnapshot["lines"] = [];
  const jobs: DepartureJob[] = [];

  // Resolve each line's PTV stop_ids concurrently (one /v3/stops/route/... call per line).
  await mapWithConcurrency(staticData.lines, FETCH_CONCURRENCY, async (line) => {
    const routeId = routeIdByLineName.get(line.name);
    lineResults.push({ id: line.id, ptvRouteId: routeId ?? null });
    if (routeId === undefined) return;

    const lineStations = line.stationIds
      .map((id) => stationsById.get(id))
      .filter((s): s is StationStatic => s !== undefined);

    let stopIdByStation: Map<string, number>;
    try {
      stopIdByStation = await resolveStationStopIds(routeId, lineStations, credentials);
    } catch (err) {
      console.warn(`Warning: failed to resolve stops for ${line.name} line (route_id ${routeId}):`, err);
      return;
    }

    for (const station of lineStations) {
      const stopId = stopIdByStation.get(station.id);
      if (stopId === undefined) {
        console.warn(`Warning: could not resolve a PTV stop_id for station "${station.name}" (${station.id}) on the ${line.name} line`);
        continue;
      }
      jobs.push({ lineId: line.id, lineName: line.name, routeId, stationId: station.id, stopId });
    }
  });

  console.log(`Fetching departures for ${jobs.length} (line, station) pairs across ${staticData.lines.length} lines (concurrency ${FETCH_CONCURRENCY})...`);

  const disruptionsByLinePromise = fetchDisruptionsByLine(
    staticData.lines.map((line) => ({ id: line.id, name: line.name, routeId: routeIdByLineName.get(line.name) })),
    credentials,
  );

  const runs = new Map<string, LiveRun>();

  await mapWithConcurrency(jobs, FETCH_CONCURRENCY, async (job) => {
    try {
      const { departures, runs: runSummaries } = await getDeparturesForStop(
        ROUTE_TYPE_TRAIN,
        job.stopId,
        job.routeId,
        MAX_RESULTS_PER_STOP,
        credentials,
      );

      for (const departure of departures) {
        const timeUtc = departure.estimated_departure_utc ?? departure.scheduled_departure_utc;
        if (!timeUtc || !departure.scheduled_departure_utc) continue;

        const stop: LiveRunStop = {
          stationId: job.stationId,
          timeUtc,
          isEstimate: Boolean(departure.estimated_departure_utc),
          scheduledTimeUtc: departure.scheduled_departure_utc,
        };

        const key = `${job.lineId}:${departure.run_ref}`;
        const existing = runs.get(key);
        if (existing) {
          existing.stops.push(stop);
        } else {
          runs.set(key, {
            runRef: departure.run_ref,
            lineId: job.lineId,
            directionId: departure.direction_id,
            destinationName: runSummaries[departure.run_ref]?.destination_name ?? "Unknown",
            stops: [stop],
          });
        }
      }
    } catch (err) {
      console.warn(`Warning: failed to fetch departures for ${job.stationId} on ${job.lineName} line (stop_id ${job.stopId}):`, err);
    }
  });

  for (const run of runs.values()) {
    run.stops.sort((a, b) => Date.parse(a.timeUtc) - Date.parse(b.timeUtc));
  }

  const disruptionsByLine = await disruptionsByLinePromise;

  return {
    generatedAtUtc: new Date().toISOString(),
    lines: lineResults,
    disruptionsByLine,
    runs: [...runs.values()],
  };
}

async function main() {
  const snapshot = await fetchSnapshot();
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  const perLineCounts = new Map<string, number>();
  for (const run of snapshot.runs) perLineCounts.set(run.lineId, (perLineCounts.get(run.lineId) ?? 0) + 1);
  console.log(`Wrote ${snapshot.runs.length} run(s) across ${perLineCounts.size} lines to ${OUTPUT_PATH} (generated at ${snapshot.generatedAtUtc})`);
  for (const [lineId, count] of [...perLineCounts.entries()].sort()) {
    console.log(`  ${lineId}: ${count} run(s)`);
  }
  const disruptionLines = Object.keys(snapshot.disruptionsByLine ?? {});
  const disruptionCount = Object.values(snapshot.disruptionsByLine ?? {}).reduce((sum, ds) => sum + ds.length, 0);
  console.log(`Found ${disruptionCount} current disruption(s) across ${disruptionLines.length} line(s): ${disruptionLines.sort().join(", ") || "(none)"}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
