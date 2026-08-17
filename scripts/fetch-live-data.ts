/**
 * Fetches live/predicted Lilydale line departures from the PTV Timetable API
 * and writes a compact snapshot to public/data/lilydale-live.json.
 *
 * Run by the `.github/workflows/refresh-data.yml` scheduled workflow (which
 * loops this a few times per run, a minute or so apart, and commits the result
 * each time — see that workflow file for the freshness strategy). Can also be
 * run locally for testing against a real PTV Timetable API key:
 *
 *   PTV_DEV_ID=... PTV_API_KEY=... npm run fetch:live-data
 *
 * IMPORTANT: this script needs a real PTV_DEV_ID / PTV_API_KEY to do anything
 * useful. The exact request/response shapes used here (route_type=0 for train,
 * the /v3/routes, /v3/stops/route/{id}/route_type/{type} and
 * /v3/departures/route_type/{type}/stop/{id}/route/{id} endpoints, and field
 * names like estimated_departure_utc) were verified against the live Swagger
 * docs (https://timetableapi.ptv.vic.gov.au/swagger/ui/index) and the
 * unofficial reference docs (https://stevage.github.io/PTV-API-doc/) while
 * building this — but since this environment doesn't have a real API key, full
 * end-to-end correctness (e.g. exact behaviour under real quota/rate limits)
 * can only be confirmed once real secrets are in place.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getDeparturesForStop,
  getRoutes,
  getStopsForRoute,
  ROUTE_TYPE_TRAIN,
  type PtvCredentials,
} from "./lib/ptvClient.ts";
import type { LiveRun, LiveRunStop, LiveSnapshot, StaticLineData } from "../src/shared/types.ts";

const STATIC_DATA_PATH = path.resolve("public/data/lilydale-static.json");
const OUTPUT_PATH = path.resolve("public/data/lilydale-live.json");
const MAX_RESULTS_PER_STOP = Number(process.env.MAX_RESULTS_PER_STOP ?? 6);

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

async function resolveLilydaleRouteId(credentials: PtvCredentials): Promise<number> {
  const routes = await getRoutes(ROUTE_TYPE_TRAIN, credentials);
  const match = routes.find((r) => r.route_name.trim().toLowerCase() === "lilydale");
  if (!match) {
    throw new Error(
      `Could not find a "Lilydale" route among ${routes.length} train routes returned by /v3/routes.`,
    );
  }
  return match.route_id;
}

async function resolveStationStopIds(
  routeId: number,
  stations: StaticLineData["stations"],
  credentials: PtvCredentials,
): Promise<Map<string, number>> {
  const ptvStops = await getStopsForRoute(routeId, ROUTE_TYPE_TRAIN, credentials);
  const byNormalizedName = new Map(ptvStops.map((s) => [normalizeStationName(s.stop_name), s.stop_id]));

  const resolved = new Map<string, number>();
  for (const station of stations) {
    const stopId = byNormalizedName.get(normalizeStationName(station.name));
    if (stopId === undefined) {
      console.warn(`Warning: could not resolve a PTV stop_id for station "${station.name}" (${station.id})`);
      continue;
    }
    resolved.set(station.id, stopId);
  }
  return resolved;
}

async function fetchSnapshot(): Promise<LiveSnapshot> {
  const credentials = readCredentials();
  const staticData: StaticLineData = JSON.parse(await readFile(STATIC_DATA_PATH, "utf8"));

  const routeId = await resolveLilydaleRouteId(credentials);
  const stopIdsByStation = await resolveStationStopIds(routeId, staticData.stations, credentials);

  const runs = new Map<string, LiveRun>();

  for (const station of staticData.stations) {
    const stopId = stopIdsByStation.get(station.id);
    if (stopId === undefined) continue;

    try {
      const { departures, runs: runSummaries } = await getDeparturesForStop(
        ROUTE_TYPE_TRAIN,
        stopId,
        routeId,
        MAX_RESULTS_PER_STOP,
        credentials,
      );

      for (const departure of departures) {
        const timeUtc = departure.estimated_departure_utc ?? departure.scheduled_departure_utc;
        if (!timeUtc) continue;

        const stop: LiveRunStop = {
          stationId: station.id,
          timeUtc,
          isEstimate: Boolean(departure.estimated_departure_utc),
        };

        const existing = runs.get(departure.run_ref);
        if (existing) {
          existing.stops.push(stop);
        } else {
          runs.set(departure.run_ref, {
            runRef: departure.run_ref,
            directionId: departure.direction_id,
            destinationName: runSummaries[departure.run_ref]?.destination_name ?? "Unknown",
            stops: [stop],
          });
        }
      }
    } catch (err) {
      console.warn(`Warning: failed to fetch departures for ${station.name} (stop_id ${stopId}):`, err);
    }
  }

  for (const run of runs.values()) {
    run.stops.sort((a, b) => Date.parse(a.timeUtc) - Date.parse(b.timeUtc));
  }

  return {
    generatedAtUtc: new Date().toISOString(),
    line: { id: staticData.line.id, ptvRouteId: routeId },
    runs: [...runs.values()],
  };
}

async function main() {
  const snapshot = await fetchSnapshot();
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${snapshot.runs.length} run(s) to ${OUTPUT_PATH} (generated at ${snapshot.generatedAtUtc})`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
