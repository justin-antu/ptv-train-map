/**
 * Client for the Victorian GTFS-Realtime feeds (Metropolitan Train branch).
 *
 * Three feeds replace what used to be ~300 PTV `/v3/departures` polls: trip
 * updates carry per-stop predictions and cancellations, vehicle positions carry
 * real GPS, and service alerts are available but unused (PTV's `/v3/disruptions`
 * has richer prose for the alerts UI).
 *
 * Register for a key at https://opendata.transport.vic.gov.au and set
 * `VIC_GTFS_R_KEY`. Note the auth header is `KeyID` — the published OpenAPI
 * document still advertises the Azure API Management `Ocp-Apim-Subscription-Key`
 * header, which the live gateway rejects with 401.
 *
 * This Node-only module holds a secret and must not be imported by browser code.
 */
import bindings from "gtfs-realtime-bindings";

// gtfs-realtime-bindings@2.2.0 is CommonJS with no `exports` map, so under
// `"type": "module"` Node gives us the whole module object as the default
// import; named imports are not statically analysable.
const { transit_realtime: transit } = bindings;

const BASE_URL = "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro";

export const GTFS_REALTIME_FEEDS = {
  tripUpdates: `${BASE_URL}/trip-updates`,
  vehiclePositions: `${BASE_URL}/vehicle-positions`,
  serviceAlerts: `${BASE_URL}/service-alerts`,
} as const;

export type GtfsRealtimeFeedName = keyof typeof GTFS_REALTIME_FEEDS;

export class GtfsRealtimeError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly feed: GtfsRealtimeFeedName,
    public readonly body: string,
  ) {
    super(`GTFS-Realtime request failed: ${status} ${statusText} for ${feed}\n${body}`);
    this.name = "GtfsRealtimeError";
  }
}

export function readGtfsRealtimeKey(): string {
  const key = process.env.VIC_GTFS_R_KEY;
  if (!key) {
    throw new Error(
      "Missing VIC_GTFS_R_KEY environment variable. Register at https://opendata.transport.vic.gov.au, " +
        "then set it locally (see .env.example) or as a GitHub Actions secret.",
    );
  }
  return key;
}

/** How a realtime update relates to the published timetable. */
export type ScheduleRelationship = "scheduled" | "added" | "unscheduled" | "canceled" | "duplicated" | "deleted";

const TRIP_SCHEDULE_RELATIONSHIP: Record<number, ScheduleRelationship> = {
  0: "scheduled",
  1: "added",
  2: "unscheduled",
  3: "canceled",
  4: "duplicated",
  5: "deleted",
};

/** How a realtime update relates to one scheduled call within a trip. */
export type StopScheduleRelationship = "scheduled" | "skipped" | "no_data" | "unscheduled";

const STOP_SCHEDULE_RELATIONSHIP: Record<number, StopScheduleRelationship> = {
  0: "scheduled",
  1: "skipped",
  2: "no_data",
  3: "unscheduled",
};

export interface RealtimeStopUpdate {
  /** GTFS `stop_sequence`, when the producer supplies it. */
  stopSequence: number | null;
  /** Platform-level GTFS `stop_id`, when the producer supplies it. */
  stopId: string | null;
  relationship: StopScheduleRelationship;
  /** Seconds late (negative = early) at arrival, or null when not published. */
  arrivalDelaySeconds: number | null;
  /** Absolute POSIX arrival time in seconds, or null when not published. */
  arrivalTimeSeconds: number | null;
  departureDelaySeconds: number | null;
  departureTimeSeconds: number | null;
  /**
   * True when this entry carried no delay or time of its own and inherited the
   * preceding call's delay. Callers should treat these as weaker predictions.
   */
  isPropagated: boolean;
}

export interface RealtimeTripUpdate {
  /** GTFS `trip_id`, including the feed's version segment. Absent for some added trips. */
  tripId: string | null;
  routeId: string | null;
  directionId: number | null;
  /** GTFS service date as `YYYYMMDD`; the calendar day whose timetable this trip belongs to. */
  startDate: string | null;
  /** GTFS `start_time` as `HH:MM:SS`, present mainly on frequency-based or added trips. */
  startTime: string | null;
  relationship: ScheduleRelationship;
  vehicleId: string | null;
  vehicleLabel: string | null;
  /** POSIX seconds at which the producer last refreshed this trip. */
  timestampSeconds: number | null;
  stopUpdates: RealtimeStopUpdate[];
}

export interface RealtimeVehiclePosition {
  tripId: string | null;
  routeId: string | null;
  directionId: number | null;
  startDate: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  lat: number;
  lon: number;
  /** Degrees clockwise from true north, when published. */
  bearing: number | null;
  /** POSIX seconds at which this position was measured. */
  timestampSeconds: number | null;
  /** Current stop sequence and status, when published. */
  currentStopSequence: number | null;
  currentStatus: "incoming_at" | "stopped_at" | "in_transit_to" | null;
}

export interface RealtimeFeed<T> {
  /** POSIX seconds from the feed header, i.e. how fresh the producer says it is. */
  timestampSeconds: number | null;
  entities: T[];
}

const VEHICLE_STOP_STATUS: Record<number, NonNullable<RealtimeVehiclePosition["currentStatus"]>> = {
  0: "incoming_at",
  1: "stopped_at",
  2: "in_transit_to",
};

/**
 * Protobuf getters cannot distinguish an absent optional scalar from one
 * explicitly set to its default, so every optional numeric field is read
 * through a presence check rather than truthiness. A `delay` of 0 means "on
 * time" and must not collapse to "unknown".
 */
function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  // protobufjs represents 64-bit fields as Long objects when they exceed the
  // safe integer range; `toNumber` is safe for POSIX seconds.
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    const asNumber = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  return null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function fetchFeedMessage(feed: GtfsRealtimeFeedName, key: string, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(GTFS_REALTIME_FEEDS[feed], {
      headers: {
        // Not `Ocp-Apim-Subscription-Key`, despite the published spec.
        KeyID: key,
        Accept: "application/x-google-protobuf",
      },
    });

    if (res.ok) {
      const buffer = new Uint8Array(await res.arrayBuffer());
      return transit.FeedMessage.decode(buffer);
    }

    const body = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new GtfsRealtimeError(res.status, res.statusText, feed, body);
    }
    const retryAfterSeconds = Number(res.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 1000 * 2 ** (attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Unreachable GTFS-Realtime retry state");
}

/**
 * Most metro trip updates publish a non-contiguous subset of their calls — a
 * handful of upcoming stops rather than the whole pattern. A consumer that
 * reads only the published entries under-reports delay at every intervening
 * station, so the last known delay is carried forward until the next explicit
 * entry supersedes it.
 *
 * A `skipped` call is not carried forward: skipping one station says nothing
 * about the next, and propagating it would invent cancellations.
 */
function propagateStopUpdates(updates: RealtimeStopUpdate[]): RealtimeStopUpdate[] {
  let carriedArrivalDelay: number | null = null;
  let carriedDepartureDelay: number | null = null;

  return updates.map((update) => {
    if (update.relationship === "skipped" || update.relationship === "no_data") {
      return update;
    }

    const hasOwnPrediction =
      update.arrivalDelaySeconds !== null
      || update.departureDelaySeconds !== null
      || update.arrivalTimeSeconds !== null
      || update.departureTimeSeconds !== null;

    if (hasOwnPrediction) {
      // An absolute time without a delay still refreshes the trip's state, but
      // there is no delta to carry, so only explicit delays update the carry.
      if (update.arrivalDelaySeconds !== null) carriedArrivalDelay = update.arrivalDelaySeconds;
      if (update.departureDelaySeconds !== null) carriedDepartureDelay = update.departureDelaySeconds;
      return update;
    }

    if (carriedArrivalDelay === null && carriedDepartureDelay === null) return update;
    return {
      ...update,
      arrivalDelaySeconds: carriedArrivalDelay,
      departureDelaySeconds: carriedDepartureDelay ?? carriedArrivalDelay,
      isPropagated: true,
    };
  });
}

export async function fetchTripUpdates(key: string): Promise<RealtimeFeed<RealtimeTripUpdate>> {
  const message = await fetchFeedMessage("tripUpdates", key);
  const entities: RealtimeTripUpdate[] = [];

  for (const entity of message.entity ?? []) {
    const update = entity.tripUpdate;
    if (!update) continue;
    const trip = update.trip;

    const stopUpdates: RealtimeStopUpdate[] = (update.stopTimeUpdate ?? []).map((stop) => ({
      stopSequence: optionalNumber(stop.stopSequence),
      stopId: optionalString(stop.stopId),
      relationship: STOP_SCHEDULE_RELATIONSHIP[stop.scheduleRelationship ?? 0] ?? "scheduled",
      arrivalDelaySeconds: optionalNumber(stop.arrival?.delay),
      arrivalTimeSeconds: optionalNumber(stop.arrival?.time),
      departureDelaySeconds: optionalNumber(stop.departure?.delay),
      departureTimeSeconds: optionalNumber(stop.departure?.time),
      isPropagated: false,
    }));

    stopUpdates.sort((a, b) => (a.stopSequence ?? Number.MAX_SAFE_INTEGER) - (b.stopSequence ?? Number.MAX_SAFE_INTEGER));

    entities.push({
      tripId: optionalString(trip?.tripId),
      routeId: optionalString(trip?.routeId),
      directionId: optionalNumber(trip?.directionId),
      startDate: optionalString(trip?.startDate),
      startTime: optionalString(trip?.startTime),
      relationship: TRIP_SCHEDULE_RELATIONSHIP[trip?.scheduleRelationship ?? 0] ?? "scheduled",
      vehicleId: optionalString(update.vehicle?.id),
      vehicleLabel: optionalString(update.vehicle?.label),
      timestampSeconds: optionalNumber(update.timestamp),
      stopUpdates: propagateStopUpdates(stopUpdates),
    });
  }

  return { timestampSeconds: optionalNumber(message.header?.timestamp), entities };
}

export async function fetchVehiclePositions(key: string): Promise<RealtimeFeed<RealtimeVehiclePosition>> {
  const message = await fetchFeedMessage("vehiclePositions", key);
  const entities: RealtimeVehiclePosition[] = [];

  for (const entity of message.entity ?? []) {
    const vehicle = entity.vehicle;
    const lat = optionalNumber(vehicle?.position?.latitude);
    const lon = optionalNumber(vehicle?.position?.longitude);
    // A position entity without coordinates cannot be plotted, and (0, 0) is a
    // real point in the Gulf of Guinea rather than a null island sentinel here.
    if (!vehicle || lat === null || lon === null) continue;

    entities.push({
      tripId: optionalString(vehicle.trip?.tripId),
      routeId: optionalString(vehicle.trip?.routeId),
      directionId: optionalNumber(vehicle.trip?.directionId),
      startDate: optionalString(vehicle.trip?.startDate),
      vehicleId: optionalString(vehicle.vehicle?.id),
      vehicleLabel: optionalString(vehicle.vehicle?.label),
      lat,
      lon,
      bearing: optionalNumber(vehicle.position?.bearing),
      timestampSeconds: optionalNumber(vehicle.timestamp),
      currentStopSequence: optionalNumber(vehicle.currentStopSequence),
      currentStatus: vehicle.currentStatus != null ? (VEHICLE_STOP_STATUS[vehicle.currentStatus] ?? null) : null,
    });
  }

  return { timestampSeconds: optionalNumber(message.header?.timestamp), entities };
}

/**
 * Strips the version segment from a Victorian metro `trip_id`.
 *
 * Ids look like `02-ALM--1-T2-2302`: route number, route code, an empty field,
 * a **feed version**, the calendar's service id, and the trip number. The same
 * logical service is republished under several version numbers partitioned by
 * date window — measured against the 2026-08-28 Metropolitan Train feed, 9,465
 * of 20,709 distinct versionless bases (45.7%) carry more than one — so an
 * exact match between a realtime id and a schedule snapshot taken on a
 * different day frequently misses.
 *
 * Dropping the version gives a stable key for a second-chance lookup, which
 * callers must then disambiguate by service date rather than by id alone.
 */
export function tripIdWithoutVersion(tripId: string): string {
  const segments = tripId.split("-");
  // Anything not shaped like the above is returned untouched rather than
  // mangled: a wrong "base" would silently match unrelated services.
  if (segments.length < 6 || !/^\d+$/.test(segments[3])) return tripId;
  return [...segments.slice(0, 3), ...segments.slice(4)].join("-");
}
