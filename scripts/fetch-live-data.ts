/**
 * Builds public/data/network-live.json: every Metro Trains Melbourne service
 * running today, with real-time predictions and vehicle positions layered over
 * the published timetable.
 *
 * This used to reconstruct trips by polling PTV's /v3/departures once per
 * (line, station) pair — roughly 300 requests, from which trip identity,
 * stopping pattern and destination all had to be inferred. It now takes three
 * requests: two GTFS-Realtime feeds for the deltas, and one PTV call for
 * service disruptions (which GTFS-R service alerts state far more tersely than
 * PTV's own prose).
 *
 * The timetable the browser already ships is the spine. Realtime only supplies
 * what changed, so a service with no realtime data still appears — correctly
 * labelled as scheduled rather than silently missing.
 *
 * Usage:
 *   VIC_GTFS_R_KEY=... PTV_DEV_ID=... PTV_API_KEY=... npm run fetch:live-data
 *
 * `--schedule-only` skips both remote calls and emits a timetable-only snapshot,
 * which is what CI falls back to when the realtime key is unavailable.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Local runs load credentials from `.env`. CI injects repository secrets.
const dotEnvPath = path.resolve(".env");
if (existsSync(dotEnvPath)) {
  process.loadEnvFile(dotEnvPath);
}

import {
  fetchTripUpdates,
  fetchVehiclePositions,
  tripIdWithoutVersion,
  type RealtimeTripUpdate,
  type RealtimeVehiclePosition,
} from "./lib/gtfsRealtime.ts";
import { getCurrentTrainDisruptions, getRoutes, ROUTE_TYPE_TRAIN, type PtvCredentials, type PtvDisruption } from "./lib/ptvClient.ts";
import { lineIdFromName } from "./lib/lines.ts";
import { melbourneDateString, melbourneServiceTimeToUtc } from "./lib/timetable.ts";
import type {
  LineDisruption,
  LiveRun,
  LiveRunStop,
  LiveSnapshot,
  NetworkStaticData,
  NetworkTimetableData,
} from "../src/shared/types.ts";

const STATIC_DATA_PATH = path.resolve("public/data/network-static.json");
const TIMETABLE_PATH = path.resolve("public/data/network-timetable.json");
const OUTPUT_PATH = path.resolve("public/data/network-live.json");

/**
 * Services more than this far in the past are dropped. A little history keeps
 * the "just left" marker grace period and the map's arrival animation working.
 */
const KEEP_PAST_MS = 20 * 60_000;
/** Services beyond this horizon are dropped; the timetable view covers the rest. */
const KEEP_FUTURE_MS = 4 * 60 * 60_000;

/**
 * Above this share of unmatched realtime trips, the shipped timetable has
 * almost certainly drifted out of date relative to the realtime feed and needs
 * regenerating. Logged as an error annotation rather than a hard failure: a
 * degraded snapshot still beats no snapshot.
 */
const UNMATCHED_TRIP_ALARM_RATIO = 0.25;

const scheduleOnly = process.argv.includes("--schedule-only");

/** One timetabled service, flattened out of the per-direction column layout. */
interface ScheduledTrip {
  tripId: string;
  lineId: string;
  directionId: number;
  origin: string;
  destination: string;
  /** Bit N set means the service runs on `availableDates[N]`. */
  dateMask: number;
  calls: { stationId: string; minutes: number }[];
}

interface ScheduleIndex {
  availableDates: string[];
  byTripId: Map<string, ScheduledTrip>;
  /** Same trips keyed by their id with the trailing version segment removed. */
  byVersionlessId: Map<string, ScheduledTrip[]>;
}

function buildScheduleIndex(timetable: NetworkTimetableData): ScheduleIndex {
  const byTripId = new Map<string, ScheduledTrip>();
  const byVersionlessId = new Map<string, ScheduledTrip[]>();

  for (const line of timetable.lines) {
    for (const direction of line.directions) {
      const directionId = Number(direction.id);
      for (const service of direction.services) {
        const calls: ScheduledTrip["calls"] = [];
        service.times.forEach((minutes, column) => {
          if (minutes === null) return;
          calls.push({ stationId: direction.stationIds[column], minutes });
        });
        if (calls.length < 2) continue;
        calls.sort((a, b) => a.minutes - b.minutes);

        const trip: ScheduledTrip = {
          tripId: service.id,
          lineId: line.id,
          directionId: Number.isFinite(directionId) ? directionId : 0,
          origin: service.origin,
          destination: service.destination,
          dateMask: service.dateMask,
          calls,
        };
        byTripId.set(trip.tripId, trip);
        const base = tripIdWithoutVersion(trip.tripId);
        const siblings = byVersionlessId.get(base) ?? [];
        siblings.push(trip);
        byVersionlessId.set(base, siblings);
      }
    }
  }

  return { availableDates: timetable.availableDates, byTripId, byVersionlessId };
}

function gtfsDateToIso(startDate: string | null): string | null {
  if (!startDate || startDate.length !== 8) return null;
  return `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(6, 8)}`;
}

function runsOn(trip: ScheduledTrip, dateIndex: number): boolean {
  return dateIndex >= 0 && (trip.dateMask & (1 << dateIndex)) !== 0;
}

/**
 * Resolves a realtime `trip_id` to a timetabled service.
 *
 * Victorian GTFS republishes the same logical service under several
 * version-numbered ids partitioned by date window, so an exact match against a
 * schedule snapshot taken on another day frequently misses. When it does, the
 * version segment is dropped and the sibling that actually runs on the trip's
 * own `start_date` is preferred — matching on the calendar rather than on the
 * id is what makes the fallback safe.
 */
function resolveScheduledTrip(index: ScheduleIndex, tripId: string, serviceDate: string | null): ScheduledTrip | null {
  const dateIndex = serviceDate ? index.availableDates.indexOf(serviceDate) : -1;

  const exact = index.byTripId.get(tripId);
  if (exact && (dateIndex < 0 || runsOn(exact, dateIndex))) return exact;

  const siblings = index.byVersionlessId.get(tripIdWithoutVersion(tripId));
  if (!siblings || siblings.length === 0) return exact ?? null;
  if (dateIndex >= 0) {
    const active = siblings.find((candidate) => runsOn(candidate, dateIndex));
    if (active) return active;
  }
  return exact ?? siblings[0];
}

/** Predictions for one trip, keyed by the station they apply to. */
interface StationPrediction {
  delaySeconds: number | null;
  absoluteTimeSeconds: number | null;
  isPropagated: boolean;
  isSkipped: boolean;
  /** Resolved from the realtime entry's platform-level stop_id, when it had one. */
  platform?: string;
}

/**
 * Maps a trip update's stop entries onto the scheduled calls.
 *
 * `stop_id` is preferred where the feed supplies it, because it is
 * unambiguous — Metro publishes platform-level ids that resolve straight to a
 * station. `stop_sequence` is the fallback, matched positionally against the
 * scheduled calls, which holds as long as the realtime producer and the
 * schedule agree on the trip's pattern.
 */
function predictionsByStation(
  update: RealtimeTripUpdate,
  trip: ScheduledTrip,
  stops: GtfsStopIndex,
): Map<string, StationPrediction> {
  const predictions = new Map<string, StationPrediction>();

  for (const stopUpdate of update.stopUpdates) {
    let stationId: string | undefined;
    if (stopUpdate.stopId) stationId = stops.stationIdByStopId.get(stopUpdate.stopId);
    if (!stationId && stopUpdate.stopSequence !== null) {
      // GTFS stop_sequence is 1-based and, for these feeds, contiguous over the
      // trip's own calls.
      stationId = trip.calls[stopUpdate.stopSequence - 1]?.stationId;
    }
    if (!stationId) continue;

    predictions.set(stationId, {
      delaySeconds: stopUpdate.departureDelaySeconds ?? stopUpdate.arrivalDelaySeconds,
      absoluteTimeSeconds: stopUpdate.departureTimeSeconds ?? stopUpdate.arrivalTimeSeconds,
      isPropagated: stopUpdate.isPropagated,
      isSkipped: stopUpdate.relationship === "skipped",
      // The realtime entry names the platform the train will actually use,
      // which is the number a rider needs and is not always the scheduled one.
      platform: stopUpdate.stopId ? stops.platformByStopId.get(stopUpdate.stopId) : undefined,
    });
  }

  return predictions;
}

function buildRun(
  trip: ScheduledTrip,
  serviceDate: string,
  update: RealtimeTripUpdate | undefined,
  position: RealtimeVehiclePosition | undefined,
  stops_: GtfsStopIndex,
): LiveRun {
  const predictions = update ? predictionsByStation(update, trip, stops_) : new Map<string, StationPrediction>();
  let sawPrediction = false;

  /**
   * The last known delay, carried forward across calls the feed said nothing
   * about.
   *
   * Metro publishes a partial slice of each trip — measured against this feed,
   * the median trip update covers 43% of its own calls and 54% of trips have
   * outright holes in the middle of the slice they do publish. Reading only the
   * published entries therefore reports a train as on time at most of the
   * stations someone might be waiting at, while the entries either side of the
   * gap both say it is running late. GTFS-Realtime's own semantics are that a
   * delay persists until superseded, so it is carried until the next explicit
   * entry and flagged, never silently presented as a first-hand prediction.
   */
  let carriedDelayMs: number | null = null;

  const stops: LiveRunStop[] = trip.calls.map((call) => {
    const scheduled = melbourneServiceTimeToUtc(serviceDate, call.minutes);
    const stop: LiveRunStop = {
      stationId: call.stationId,
      scheduledTimeUtc: scheduled.toISOString(),
    };

    const prediction = predictions.get(call.stationId);

    if (!prediction) {
      // Nothing forward of the last published call is invented, and nothing
      // before the first one is back-filled: a carry only exists once the feed
      // has actually said something about this trip.
      if (carriedDelayMs !== null) {
        stop.estimatedTimeUtc = new Date(scheduled.getTime() + carriedDelayMs).toISOString();
        stop.isPropagated = true;
      }
      return stop;
    }

    if (prediction.platform) stop.platform = prediction.platform;

    if (prediction.isSkipped) {
      // Skipping one station says nothing about the next, so the carry is left
      // untouched rather than reset or propagated as a further skip.
      stop.isSkipped = true;
      sawPrediction = true;
      return stop;
    }

    // An absolute time is the producer's own answer and is preferred; a delay
    // is a delta the consumer has to apply to the schedule itself. A delay of
    // exactly zero is a real "on time" prediction, not a missing value.
    if (prediction.absoluteTimeSeconds !== null) {
      const estimated = prediction.absoluteTimeSeconds * 1000;
      stop.estimatedTimeUtc = new Date(estimated).toISOString();
      carriedDelayMs = estimated - scheduled.getTime();
    } else if (prediction.delaySeconds !== null) {
      carriedDelayMs = prediction.delaySeconds * 1000;
      stop.estimatedTimeUtc = new Date(scheduled.getTime() + carriedDelayMs).toISOString();
    } else if (carriedDelayMs !== null) {
      stop.estimatedTimeUtc = new Date(scheduled.getTime() + carriedDelayMs).toISOString();
      stop.isPropagated = true;
      return stop;
    } else {
      return stop;
    }

    if (prediction.isPropagated) stop.isPropagated = true;
    sawPrediction = true;
    return stop;
  });

  const cancelled = update?.relationship === "canceled" || update?.relationship === "deleted";

  const run: LiveRun = {
    runRef: trip.tripId,
    lineId: trip.lineId,
    directionId: trip.directionId,
    destinationName: trip.destination,
    status: cancelled ? "cancelled" : sawPrediction ? "updated" : "scheduled",
    isRealtime: sawPrediction || cancelled,
    stops,
  };

  if (position && position.timestampSeconds !== null) {
    run.position = {
      lat: position.lat,
      lon: position.lon,
      observedAtUtc: new Date(position.timestampSeconds * 1000).toISOString(),
    };
    if (position.bearing !== null) run.position.bearing = position.bearing;
  }

  return run;
}

/** Platform-level GTFS stop ids resolved to stations and platform numbers. */
interface GtfsStopIndex {
  stationIdByStopId: Map<string, string>;
  platformByStopId: Map<string, string>;
}

/**
 * Builds a run for a service the timetable does not contain.
 *
 * Roughly one in fifteen trips in the peak feed is `ADDED` — a genuine train
 * carrying genuine passengers that exists only in the realtime feed. These were
 * previously dropped, so they were missing from the board and the map while
 * simultaneously inflating the unmatched-trip alarm.
 *
 * An added trip has no timetable to compare against, so its advertised time is
 * its scheduled time: there is no delay to report, and claiming one would be
 * inventing a baseline that was never published.
 */
function buildAddedRun(
  update: RealtimeTripUpdate,
  lineId: string,
  stops_: GtfsStopIndex,
  stationNameById: Map<string, string>,
): LiveRun | null {
  const stops: LiveRunStop[] = [];

  for (const stopUpdate of update.stopUpdates) {
    const stationId = stopUpdate.stopId ? stops_.stationIdByStopId.get(stopUpdate.stopId) : undefined;
    const timeSeconds = stopUpdate.departureTimeSeconds ?? stopUpdate.arrivalTimeSeconds;
    if (!stationId || timeSeconds === null) continue;

    const timeUtc = new Date(timeSeconds * 1000).toISOString();
    const stop: LiveRunStop = { stationId, scheduledTimeUtc: timeUtc, estimatedTimeUtc: timeUtc };
    const platform = stopUpdate.stopId ? stops_.platformByStopId.get(stopUpdate.stopId) : undefined;
    if (platform) stop.platform = platform;
    if (stopUpdate.relationship === "skipped") stop.isSkipped = true;
    stops.push(stop);
  }

  if (stops.length < 2) return null;
  stops.sort((a, b) => Date.parse(a.scheduledTimeUtc) - Date.parse(b.scheduledTimeUtc));

  const lastStop = stops.at(-1)!;
  return {
    runRef: update.tripId ?? `added:${lineId}:${stops[0].scheduledTimeUtc}`,
    lineId,
    directionId: update.directionId ?? 0,
    destinationName: stationNameById.get(lastStop.stationId) ?? lastStop.stationId,
    status: "added",
    isRealtime: true,
    stops,
  };
}

function readPtvCredentials(): PtvCredentials | null {
  const devId = process.env.PTV_DEV_ID;
  const apiKey = process.env.PTV_API_KEY;
  return devId && apiKey ? { devId, apiKey } : null;
}

function toLineDisruption(disruption: PtvDisruption, knownStationIds: Set<string>): LineDisruption {
  // PTV names stations as "Box Hill Station"; the app's ids are slugs of the
  // bare name, which is what generate-static-data.ts also strips down to.
  const stationIds = (disruption.stops ?? [])
    .map((stop) => lineIdFromName(stop.stop_name.replace(/\s+(Railway\s+)?Station$/i, "").trim()))
    .filter((id) => knownStationIds.has(id));

  return {
    id: disruption.disruption_id,
    title: disruption.title,
    description: disruption.description?.trim() || undefined,
    url: disruption.url,
    disruptionType: disruption.disruption_type,
    disruptionStatus: disruption.disruption_status,
    displayOnBoard: disruption.display_on_board,
    colour: disruption.colour,
    stationIds: stationIds.length > 0 ? [...new Set(stationIds)] : undefined,
    fromDateUtc: disruption.from_date,
    toDateUtc: disruption.to_date,
  };
}

/**
 * One /v3/disruptions call, then fanned out over the routes each disruption
 * already names. Requires resolving PTV's route ids to line ids, which is the
 * only remaining reason this script talks to /v3/routes.
 */
async function fetchDisruptionsByLine(
  credentials: PtvCredentials,
  staticData: NetworkStaticData,
): Promise<Record<string, LineDisruption[]>> {
  const routes = await getRoutes(ROUTE_TYPE_TRAIN, credentials);
  const knownLineIds = new Set(staticData.lines.map((line) => line.id));
  const lineIdByRouteId = new Map<number, string>();
  for (const route of routes) {
    const lineId = lineIdFromName(route.route_name.trim());
    if (knownLineIds.has(lineId)) lineIdByRouteId.set(route.route_id, lineId);
  }

  const knownStationIds = new Set(staticData.stations.map((station) => station.id));
  const disruptions = await getCurrentTrainDisruptions(credentials);

  const byLine: Record<string, LineDisruption[]> = {};
  for (const disruption of disruptions) {
    const mapped = toLineDisruption(disruption, knownStationIds);
    for (const route of disruption.routes ?? []) {
      const lineId = lineIdByRouteId.get(route.route_id);
      if (!lineId) continue;
      const list = (byLine[lineId] ??= []);
      if (!list.some((existing) => existing.id === mapped.id)) list.push(mapped);
    }
  }
  return byLine;
}

async function main() {
  const staticData: NetworkStaticData = JSON.parse(await readFile(STATIC_DATA_PATH, "utf8"));
  const timetable: NetworkTimetableData = JSON.parse(await readFile(TIMETABLE_PATH, "utf8"));
  const index = buildScheduleIndex(timetable);

  const stops: GtfsStopIndex = { stationIdByStopId: new Map(), platformByStopId: new Map() };
  for (const [stopId, ref] of Object.entries(staticData.gtfsStops ?? {})) {
    stops.stationIdByStopId.set(stopId, ref.stationId);
    if (ref.platformCode) stops.platformByStopId.set(stopId, ref.platformCode);
  }
  if (stops.stationIdByStopId.size === 0) {
    console.warn(
      "network-static.json carries no gtfsStops index, so realtime stop entries can only be matched positionally " +
        "and no platform numbers will be published. Regenerate it with scripts/generate-static-data.ts.",
    );
  }

  const today = melbourneDateString();
  const todayIndex = index.availableDates.indexOf(today);
  if (todayIndex < 0) {
    throw new Error(
      `The shipped timetable covers ${index.availableDates[0]}…${index.availableDates.at(-1)}, which does not include today (${today}). ` +
        "Run the refresh-timetable workflow before fetching live data.",
    );
  }

  let tripUpdates: RealtimeTripUpdate[] = [];
  let vehiclePositions: RealtimeVehiclePosition[] = [];
  let feedTimestampSeconds: number | null = null;

  if (!scheduleOnly && process.env.VIC_GTFS_R_KEY) {
    const key = process.env.VIC_GTFS_R_KEY;
    const [updates, positions] = await Promise.all([fetchTripUpdates(key), fetchVehiclePositions(key)]);
    tripUpdates = updates.entities;
    vehiclePositions = positions.entities;
    feedTimestampSeconds = updates.timestampSeconds;
    console.log(`GTFS-Realtime: ${tripUpdates.length} trip update(s), ${vehiclePositions.length} vehicle position(s).`);
  } else {
    console.warn(
      scheduleOnly
        ? "Running in --schedule-only mode: emitting timetable times with no real-time layer."
        : "VIC_GTFS_R_KEY is not set: emitting timetable times with no real-time layer.",
    );
  }

  const updateByTripId = new Map<string, RealtimeTripUpdate>();
  for (const update of tripUpdates) {
    if (update.tripId) updateByTripId.set(update.tripId, update);
  }
  const positionByTripId = new Map<string, RealtimeVehiclePosition>();
  for (const position of vehiclePositions) {
    if (position.tripId) positionByTripId.set(position.tripId, position);
  }

  const lineIdByRouteId = new Map<string, string>();
  for (const line of staticData.lines) {
    if (line.gtfsRouteId) lineIdByRouteId.set(line.gtfsRouteId, line.id);
  }
  const stationNameById = new Map(staticData.stations.map((station) => [station.id, station.name]));

  // Realtime trips first, so a service running today under an id the shipped
  // timetable does not carry still surfaces, and so the unmatched rate is
  // measured against what the operator says is running.
  const runsByTripId = new Map<string, LiveRun>();
  let unmatched = 0;
  let added = 0;

  for (const update of tripUpdates) {
    if (!update.tripId) continue;
    const serviceDate = gtfsDateToIso(update.startDate) ?? today;
    const trip = resolveScheduledTrip(index, update.tripId, serviceDate);

    if (!trip) {
      // An ADDED trip has no timetable entry by definition, so failing to match
      // one is the expected outcome rather than evidence of a stale timetable.
      // Counting these as unmatched pinned the canary near its alarm threshold
      // and made it incapable of signalling the drift it exists to catch.
      const lineId = update.routeId ? lineIdByRouteId.get(update.routeId) : undefined;
      if (update.relationship === "added" && lineId) {
        const run = buildAddedRun(update, lineId, stops, stationNameById);
        if (run) {
          runsByTripId.set(run.runRef, run);
          added += 1;
          continue;
        }
      }
      if (update.relationship !== "added") unmatched += 1;
      continue;
    }

    runsByTripId.set(trip.tripId, buildRun(trip, serviceDate, update, positionByTripId.get(update.tripId), stops));
  }

  // Then everything else the timetable says runs today, marked as scheduled.
  for (const trip of index.byTripId.values()) {
    if (runsByTripId.has(trip.tripId) || !runsOn(trip, todayIndex)) continue;
    runsByTripId.set(trip.tripId, buildRun(trip, today, undefined, undefined, stops));
  }

  const nowMs = Date.now();
  const runs = [...runsByTripId.values()].filter((run) => {
    const last = run.stops.at(-1);
    const first = run.stops[0];
    if (!first || !last) return false;
    return Date.parse(last.scheduledTimeUtc) >= nowMs - KEEP_PAST_MS
      && Date.parse(first.scheduledTimeUtc) <= nowMs + KEEP_FUTURE_MS;
  });

  const credentials = readPtvCredentials();
  let disruptionsByLine: Record<string, LineDisruption[]> = {};
  if (credentials) {
    try {
      disruptionsByLine = await fetchDisruptionsByLine(credentials, staticData);
    } catch (error) {
      console.warn("Warning: failed to fetch PTV disruptions:", error);
    }
  } else {
    console.warn("PTV_DEV_ID / PTV_API_KEY are not set: the snapshot will carry no service disruptions.");
  }

  const snapshot: LiveSnapshot = {
    generatedAtUtc: new Date().toISOString(),
    feedTimestampUtc: feedTimestampSeconds !== null ? new Date(feedTimestampSeconds * 1000).toISOString() : undefined,
    isScheduleOnly: tripUpdates.length === 0 ? true : undefined,
    disruptionsByLine,
    runs,
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot)}\n`, "utf8");

  const realtimeCount = runs.filter((run) => run.isRealtime).length;
  const cancelledCount = runs.filter((run) => run.status === "cancelled").length;
  const addedCount = runs.filter((run) => run.status === "added").length;
  const gpsCount = runs.filter((run) => run.position).length;
  const platformCount = runs.filter((run) => run.stops.some((stop) => stop.platform)).length;
  console.log(
    `Wrote ${runs.length} run(s) to ${OUTPUT_PATH}: ${realtimeCount} with real-time data, ` +
      `${gpsCount} with a GPS fix, ${platformCount} with a platform, ${cancelledCount} cancelled, ${addedCount} added.`,
  );
  if (added > 0) console.log(`Reconstructed ${added} added service(s) that the timetable does not contain.`);

  // The unmatched rate is this pipeline's staleness canary. It climbs when the
  // GTFS schedule is republished with new trip ids and the shipped timetable
  // has not caught up, which manifests to a rider as trains simply missing.
  // ADDED trips are excluded: they never match by design, so counting them
  // would hold the rate permanently near the alarm threshold.
  const matchable = tripUpdates.filter((update) => update.relationship !== "added").length;
  const unmatchedRatio = matchable > 0 ? unmatched / matchable : 0;
  const unmatchedSummary = `${unmatched} of ${matchable} timetabled realtime trip(s) matched no service (${(unmatchedRatio * 100).toFixed(1)}%)`;
  if (unmatchedRatio >= UNMATCHED_TRIP_ALARM_RATIO) {
    console.error(`::error::${unmatchedSummary}. The shipped timetable is probably out of date — rerun refresh-timetable.`);
  } else if (unmatched > 0) {
    console.log(unmatchedSummary);
  }

  const disruptionCount = Object.values(disruptionsByLine).reduce((sum, list) => sum + list.length, 0);
  console.log(`Found ${disruptionCount} current disruption(s) across ${Object.keys(disruptionsByLine).length} line(s).`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
