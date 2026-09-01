import { existsSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { streamCsv } from "./csv.ts";
import { getRoutes, ROUTE_TYPE_TRAIN, type PtvCredentials } from "./ptvClient.ts";
import { IN_SCOPE_LINE_NAMES, lineIdFromName } from "./lines.ts";
import type {
  NetworkTimetableData,
  TimetableDirection,
  TimetableLine,
  TimetablePattern,
  TimetableService,
} from "../../src/shared/types.ts";

export {
  MELBOURNE_TIMEZONE,
  melbourneDateString,
  melbourneServiceTimeToUtc,
} from "../../src/shared/melbourneTime.ts";
import { MELBOURNE_TIMEZONE, melbourneDateString } from "../../src/shared/melbourneTime.ts";

interface TripInfo {
  id: string;
  routeId: string;
  serviceId: string;
  directionId: string;
  headsign: string;
  activeDates: string[];
}

export interface RawStopTime {
  stopId: string;
  sequence: number;
  minutes: number;
}

export interface GtfsStopRecord {
  id: string;
  name: string;
  lat: number;
  lon: number;
  locationType: string;
  parentStation: string;
  /** GTFS `platform_code`, e.g. "3". Absent on stations and on stops that declare none. */
  platformCode?: string;
}

export interface CanonicalStation {
  key: string;
  id: string;
  name: string;
}

interface CalendarRule {
  startDate: string;
  endDate: string;
  weekdays: boolean[];
}

interface RouteInfo {
  id: string;
  name: string;
  color: string;
}

export interface GenerateTimetableOptions {
  gtfsDir: string;
  outputPath: string;
  dates: string[];
  credentials?: PtvCredentials;
  generatedAt?: Date;
}

function compactGtfsDate(value: string): string {
  return value.length === 8 ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
}

function weekdayIndex(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function melbourneDateRange(dayCount = 8, now = new Date()): string[] {
  const today = melbourneDateString(now);
  const cursor = new Date(`${today}T12:00:00Z`);
  return Array.from({ length: dayCount }, (_, index) => {
    const value = new Date(cursor);
    value.setUTCDate(cursor.getUTCDate() + index);
    return value.toISOString().slice(0, 10);
  });
}

export function parseGtfsTime(value: string): number {
  const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(value.trim());
  if (!match) throw new Error(`Invalid GTFS time "${value}"`);
  return Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 60;
}

function stationName(value: string): string {
  return value.replace(/\s+Railway Station$|\s+Station$/i, "").trim();
}

function normalizedStationIdentity(value: string): string {
  return stationName(value).normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("en-AU")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function distanceMetres(a: GtfsStopRecord, b: GtfsStopRecord): number {
  const radians = Math.PI / 180;
  const lat1 = a.lat * radians;
  const lat2 = b.lat * radians;
  const deltaLat = (b.lat - a.lat) * radians;
  const deltaLon = (b.lon - a.lon) * radians;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

/**
 * Resolves GTFS platform stops to stable station identities. A declared
 * parent_station is authoritative. The coordinate fallback is name-scoped
 * and distance-limited so equally named but geographically
 * distinct stations cannot be merged.
 */
export function canonicalizeGtfsStops(records: GtfsStopRecord[]): Map<string, CanonicalStation> {
  const byId = new Map(records.map((record) => [record.id, record]));
  const keyByStop = new Map<string, string>();
  const representativeByKey = new Map<string, GtfsStopRecord>();
  const fallbackAnchors = new Map<string, GtfsStopRecord[]>();
  const sorted = [...records].sort((a, b) =>
    normalizedStationIdentity(a.name).localeCompare(normalizedStationIdentity(b.name))
    || a.lat - b.lat
    || a.lon - b.lon
    || a.id.localeCompare(b.id));

  for (const record of sorted) {
    let key: string;
    let representative = record;
    if (record.parentStation) {
      key = `parent:${record.parentStation}`;
      representative = byId.get(record.parentStation) ?? record;
    } else if (record.locationType === "1") {
      key = `parent:${record.id}`;
    } else {
      const identity = normalizedStationIdentity(record.name);
      const coordinatesAreUsable = Number.isFinite(record.lat) && Number.isFinite(record.lon);
      const anchors = fallbackAnchors.get(identity) ?? [];
      const anchor = coordinatesAreUsable
        ? anchors.find((candidate) => distanceMetres(candidate, record) <= 500)
        : undefined;
      if (anchor) {
        key = keyByStop.get(anchor.id)!;
        representative = representativeByKey.get(key) ?? anchor;
      } else {
        key = coordinatesAreUsable
          ? `fallback:${identity}:${record.lat.toFixed(5)}:${record.lon.toFixed(5)}`
          : `stop:${record.id}`;
        anchors.push(record);
        fallbackAnchors.set(identity, anchors);
      }
    }
    keyByStop.set(record.id, key);
    if (!representativeByKey.has(key) || representative.id === record.id) {
      representativeByKey.set(key, representative);
    }
  }

  const keysByBaseId = new Map<string, string[]>();
  for (const [key, representative] of representativeByKey) {
    const baseId = lineIdFromName(stationName(representative.name));
    const keys = keysByBaseId.get(baseId) ?? [];
    keys.push(key);
    keysByBaseId.set(baseId, keys);
  }
  for (const keys of keysByBaseId.values()) keys.sort();

  return new Map(records.map((record) => {
    const key = keyByStop.get(record.id)!;
    const representative = representativeByKey.get(key)!;
    const name = stationName(representative.name);
    const baseId = lineIdFromName(name);
    const collidingKeys = keysByBaseId.get(baseId) ?? [key];
    const id = collidingKeys.length === 1 ? baseId : `${baseId}-${collidingKeys.indexOf(key) + 1}`;
    return [record.id, { key, id, name }];
  }));
}

export function canonicalStopSequence(
  stops: RawStopTime[],
  canonicalByStop: Map<string, CanonicalStation>,
): string[] {
  const result: string[] = [];
  for (const stop of [...stops].sort((a, b) => a.sequence - b.sequence || a.stopId.localeCompare(b.stopId))) {
    const key = canonicalByStop.get(stop.stopId)?.key;
    if (key && result.at(-1) !== key) result.push(key);
  }
  return result;
}

/**
 * One timetable column represents one station visit. If malformed or
 * loop-shaped input calls at the same canonical station more than once, retain
 * the first call by stop_sequence (then raw stop_id) rather than allowing file
 * order or a later platform row to overwrite it.
 */
export function selectCanonicalStopTimes(
  stops: RawStopTime[],
  canonicalByStop: Map<string, CanonicalStation>,
): Map<string, number> {
  const selected = new Map<string, number>();
  for (const stop of [...stops].sort((a, b) => a.sequence - b.sequence || a.stopId.localeCompare(b.stopId))) {
    const key = canonicalByStop.get(stop.stopId)?.key;
    if (key && !selected.has(key)) selected.set(key, Math.round(stop.minutes * 10) / 10);
  }
  return selected;
}

/**
 * The scheduled platform at each canonical station, keyed the same way as
 * `selectCanonicalStopTimes` so the two line up column for column.
 *
 * Canonicalisation is what loses the platform in the first place: it folds
 * every platform-level GTFS stop back into one station, which is right for a
 * timetable column but discards the one field a rider on the concourse needs.
 */
export function selectCanonicalStopPlatforms(
  stops: RawStopTime[],
  canonicalByStop: Map<string, CanonicalStation>,
  platformByStopId: Map<string, string>,
): Map<string, string> {
  const selected = new Map<string, string>();
  const seen = new Set<string>();
  for (const stop of [...stops].sort((a, b) => a.sequence - b.sequence || a.stopId.localeCompare(b.stopId))) {
    const key = canonicalByStop.get(stop.stopId)?.key;
    if (!key || seen.has(key)) continue;
    // Claim the column on the first call even when that call names no platform,
    // so a later re-visit cannot attach its platform to the earlier time.
    seen.add(key);
    const platform = platformByStopId.get(stop.stopId);
    if (platform) selected.set(key, platform);
  }
  return selected;
}

/**
 * Produces a deterministic station union that preserves every observed adjacent
 * ordering where possible. Branch-only stations settle by average normalized
 * position and name, so input-file ordering cannot scramble columns.
 */
export function unionStationOrder(sequences: string[][]): string[] {
  const nodes = new Set(sequences.flat());
  const edges = new Map<string, Set<string>>();
  const indegree = new Map([...nodes].map((node) => [node, 0]));
  const rankSamples = new Map<string, number[]>();

  for (const sequence of sequences) {
    sequence.forEach((node, index) => {
      const samples = rankSamples.get(node) ?? [];
      samples.push(sequence.length <= 1 ? 0 : index / (sequence.length - 1));
      rankSamples.set(node, samples);
      if (index === sequence.length - 1) return;
      const next = sequence[index + 1];
      if (node === next) return;
      const outgoing = edges.get(node) ?? new Set<string>();
      if (!outgoing.has(next)) {
        outgoing.add(next);
        indegree.set(next, (indegree.get(next) ?? 0) + 1);
      }
      edges.set(node, outgoing);
    });
  }

  const averageRank = (node: string) => {
    const samples = rankSamples.get(node) ?? [0];
    return samples.reduce((sum, value) => sum + value, 0) / samples.length;
  };
  const compare = (a: string, b: string) => averageRank(a) - averageRank(b) || a.localeCompare(b);
  const ready = [...nodes].filter((node) => indegree.get(node) === 0).sort(compare);
  const result: string[] = [];

  while (ready.length > 0) {
    const node = ready.shift()!;
    result.push(node);
    for (const next of edges.get(node) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if (indegree.get(next) === 0) {
        ready.push(next);
        ready.sort(compare);
      }
    }
  }

  // Circular/through-routed data can contain contradictory pairs. Keep every
  // station and fall back to the stable aggregate rank for the cyclic remainder.
  if (result.length < nodes.size) {
    result.push(...[...nodes].filter((node) => !result.includes(node)).sort(compare));
  }
  return result;
}

function isServiceActive(
  serviceId: string,
  date: string,
  calendars: Map<string, CalendarRule>,
  exceptions: Map<string, Map<string, boolean>>,
): boolean {
  const exception = exceptions.get(serviceId)?.get(date);
  if (exception !== undefined) return exception;
  const rule = calendars.get(serviceId);
  if (!rule || date < rule.startDate || date > rule.endDate) return false;
  return rule.weekdays[weekdayIndex(date)];
}

async function loadGtfs(gtfsDir: string, dates: string[]) {
  const routesById = new Map<string, RouteInfo>();
  await streamCsv(path.join(gtfsDir, "routes.txt"), (row) => {
    if ((IN_SCOPE_LINE_NAMES as readonly string[]).includes(row.route_short_name)) {
      routesById.set(row.route_id, {
        id: row.route_id,
        name: row.route_short_name,
        color: `#${row.route_color || "0052A4"}`,
      });
    }
  });

  const stopRecords: GtfsStopRecord[] = [];
  await streamCsv(path.join(gtfsDir, "stops.txt"), (row) => {
    stopRecords.push({
      id: row.stop_id,
      name: row.stop_name,
      lat: Number(row.stop_lat),
      lon: Number(row.stop_lon),
      locationType: row.location_type,
      parentStation: row.parent_station,
      platformCode: row.platform_code || undefined,
    });
  });
  const canonicalByStop = canonicalizeGtfsStops(stopRecords);
  const platformByStopId = new Map(
    stopRecords.filter((record) => record.platformCode).map((record) => [record.id, record.platformCode!]),
  );

  const calendars = new Map<string, CalendarRule>();
  const calendarPath = path.join(gtfsDir, "calendar.txt");
  if (existsSync(calendarPath)) {
    await streamCsv(calendarPath, (row) => {
      calendars.set(row.service_id, {
        startDate: compactGtfsDate(row.start_date),
        endDate: compactGtfsDate(row.end_date),
        weekdays: [
          row.sunday === "1",
          row.monday === "1",
          row.tuesday === "1",
          row.wednesday === "1",
          row.thursday === "1",
          row.friday === "1",
          row.saturday === "1",
        ],
      });
    });
  }

  const exceptions = new Map<string, Map<string, boolean>>();
  const exceptionsPath = path.join(gtfsDir, "calendar_dates.txt");
  if (existsSync(exceptionsPath)) {
    await streamCsv(exceptionsPath, (row) => {
      const byDate = exceptions.get(row.service_id) ?? new Map<string, boolean>();
      byDate.set(compactGtfsDate(row.date), row.exception_type === "1");
      exceptions.set(row.service_id, byDate);
    });
  }

  const trips = new Map<string, TripInfo>();
  await streamCsv(path.join(gtfsDir, "trips.txt"), (row) => {
    if (!routesById.has(row.route_id)) return;
    const activeDates = dates.filter((date) => isServiceActive(row.service_id, date, calendars, exceptions));
    if (activeDates.length === 0) return;
    trips.set(row.trip_id, {
      id: row.trip_id,
      routeId: row.route_id,
      serviceId: row.service_id,
      directionId: row.direction_id || "0",
      headsign: row.trip_headsign ?? "",
      activeDates,
    });
  });

  const stopTimes = new Map<string, RawStopTime[]>();
  await streamCsv(path.join(gtfsDir, "stop_times.txt"), (row) => {
    if (!trips.has(row.trip_id)) return;
    const departure = row.departure_time || row.arrival_time;
    if (!departure) return;
    const values = stopTimes.get(row.trip_id) ?? [];
    values.push({
      stopId: row.stop_id,
      sequence: Number(row.stop_sequence),
      minutes: parseGtfsTime(departure),
    });
    stopTimes.set(row.trip_id, values);
  });

  return { routesById, canonicalByStop, platformByStopId, trips, stopTimes };
}

/** Stations that only appear on City Loop workings. */
const CITY_LOOP_STATION_PATTERN = /^(flagstaff|melbourne central|parliament)$/i;
/** Stations that only appear on Metro Tunnel workings. */
const METRO_TUNNEL_STATION_PATTERN = /^(anzac|town hall|state library|parkville|arden)$/i;

/**
 * Names a stopping pattern the way a rider would ask for it: by where it ends
 * up, then by the route it takes, then by whether it skips anything.
 *
 * Collisions are resolved by the caller, which appends the origin — two
 * patterns sharing a destination and a routing genuinely differ only in where
 * they start.
 */
function describePattern(stationNames: string[], destination: string): string {
  const parts = [`${stationNames[0]} → ${destination}`];

  // The GTFS headsign frequently already says "via City Loop"; repeating it
  // reads as a data bug.
  if (!/\bvia\b/i.test(destination)) {
    if (stationNames.some((name) => CITY_LOOP_STATION_PATTERN.test(name))) parts.push("via City Loop");
    else if (stationNames.some((name) => METRO_TUNNEL_STATION_PATTERN.test(name))) parts.push("via Metro Tunnel");
  }

  parts.push(`${stationNames.length} stops`);
  return parts.join(" · ");
}

function buildPatterns(
  trips: { key: string; stationKeys: string[]; destination: string }[],
  stationByKey: Map<string, CanonicalStation>,
): { patterns: TimetablePattern[]; patternIdByKey: Map<string, string> } {
  const groups = new Map<string, { stationKeys: string[]; destination: string; count: number }>();
  for (const trip of trips) {
    const signature = trip.stationKeys.join(">");
    const existing = groups.get(signature);
    if (existing) existing.count += 1;
    else groups.set(signature, { stationKeys: trip.stationKeys, destination: trip.destination, count: 1 });
  }

  const ordered = [...groups.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const labelCounts = new Map<string, number>();
  const patterns: TimetablePattern[] = [];
  const patternIdBySignature = new Map<string, string>();

  ordered.forEach(([signature, group], index) => {
    const names = group.stationKeys.map((key) => stationByKey.get(key)?.name ?? key);
    const baseLabel = describePattern(names, group.destination);
    const seen = labelCounts.get(baseLabel) ?? 0;
    labelCounts.set(baseLabel, seen + 1);
    // Two patterns with the same endpoints and length differ somewhere in the
    // middle, so a mid-route call is the shortest thing that tells them apart.
    const label = seen === 0 ? baseLabel : `${baseLabel} · via ${names[Math.floor(names.length / 2)]}`;

    const id = `p${index}`;
    patternIdBySignature.set(signature, id);
    patterns.push({
      id,
      label,
      stationIds: group.stationKeys.map((key) => stationByKey.get(key)?.id ?? lineIdFromName(key)),
      serviceCount: group.count,
    });
  });

  const patternIdByKey = new Map<string, string>();
  for (const trip of trips) patternIdByKey.set(trip.key, patternIdBySignature.get(trip.stationKeys.join(">"))!);
  return { patterns, patternIdByKey };
}

function buildDirection(
  directionId: string,
  routeTrips: TripInfo[],
  stopTimes: Map<string, RawStopTime[]>,
  canonicalByStop: Map<string, CanonicalStation>,
  platformByStopId: Map<string, string>,
  dates: string[],
): TimetableDirection | null {
  const usable = routeTrips
    .map((trip) => ({
      trip,
      stops: [...(stopTimes.get(trip.id) ?? [])].sort((a, b) => a.sequence - b.sequence || a.stopId.localeCompare(b.stopId)),
    }))
    .filter(({ stops }) => stops.length >= 2);
  if (usable.length === 0) return null;

  const sequenceByTrip = new Map(usable.map(({ trip, stops }) => [trip.id, canonicalStopSequence(stops, canonicalByStop)]));
  const stationKeys = unionStationOrder([...sequenceByTrip.values()]);
  const stationByKey = new Map(
    [...canonicalByStop.values()].map((station) => [station.key, station]),
  );
  const columnByStation = new Map(stationKeys.map((key, index) => [key, index]));
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const destinationCounts = new Map<string, number>();

  const destinationByTrip = new Map(usable.map(({ trip, stops }) => [
    trip.id,
    trip.headsign.trim() || canonicalByStop.get(stops.at(-1)!.stopId)?.name || "Destination unavailable",
  ]));
  for (const destination of destinationByTrip.values()) {
    destinationCounts.set(destination, (destinationCounts.get(destination) ?? 0) + 1);
  }

  const { patterns, patternIdByKey } = buildPatterns(
    usable.map(({ trip }) => ({
      key: trip.id,
      stationKeys: sequenceByTrip.get(trip.id)!,
      destination: destinationByTrip.get(trip.id)!,
    })),
    stationByKey,
  );

  // Distinct platform rows, shared across every service that uses them.
  const platformSets: (string | null)[][] = [];
  const platformSetBySignature = new Map<string, number>();

  const services: TimetableService[] = [];
  for (const { trip, stops } of usable) {
    const service: TimetableService = {
      id: trip.id,
      origin: canonicalByStop.get(stops[0].stopId)?.name ?? "Origin unavailable",
      destination: destinationByTrip.get(trip.id)!,
      dateMask: trip.activeDates.reduce((mask, date) => mask | (1 << dateIndex.get(date)!), 0),
      patternId: patternIdByKey.get(trip.id)!,
      times: Array<number | null>(stationKeys.length).fill(null),
    };
    for (const [key, minutes] of selectCanonicalStopTimes(stops, canonicalByStop)) {
      const column = columnByStation.get(key);
      if (column !== undefined) service.times[column] = minutes;
    }

    const platforms = Array<string | null>(stationKeys.length).fill(null);
    let anyPlatform = false;
    for (const [key, platform] of selectCanonicalStopPlatforms(stops, canonicalByStop, platformByStopId)) {
      const column = columnByStation.get(key);
      if (column === undefined) continue;
      platforms[column] = platform;
      anyPlatform = true;
    }
    if (anyPlatform) {
      const signature = platforms.join("|");
      let index = platformSetBySignature.get(signature);
      if (index === undefined) {
        index = platformSets.push(platforms) - 1;
        platformSetBySignature.set(signature, index);
      }
      service.platformSet = index;
    }

    services.push(service);
  }

  services.sort((a, b) => {
    const firstA = a.times.find((time): time is number => time !== null) ?? Number.POSITIVE_INFINITY;
    const firstB = b.times.find((time): time is number => time !== null) ?? Number.POSITIVE_INFINITY;
    return firstA - firstB || a.id.localeCompare(b.id);
  });
  const endpoints = [...destinationCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const label = endpoints.length === 1
    ? `Towards ${endpoints[0][0]}`
    : `Towards ${endpoints.slice(0, 2).map(([name]) => name).join(" / ")}`;

  const direction: TimetableDirection = {
    id: directionId,
    label,
    stationIds: stationKeys.map((key) => stationByKey.get(key)?.id ?? lineIdFromName(key)),
    stationNames: stationKeys.map((key) => stationByKey.get(key)?.name ?? key),
    patterns,
    services,
  };
  if (platformSets.length > 0) direction.platformSets = platformSets;
  return direction;
}

export function validateTimetable(data: NetworkTimetableData): void {
  if (data.schemaVersion !== 1 || data.timezone !== MELBOURNE_TIMEZONE) throw new Error("Invalid timetable metadata");
  if (data.availableDates.length !== 8 || new Set(data.availableDates).size !== 8) throw new Error("Expected eight unique dates");
  if (data.source.partial !== false) {
    const warningSummary = data.source.warnings.length > 0 ? `: ${data.source.warnings.join("; ")}` : "";
    throw new Error(`Refusing to publish a partial timetable${warningSummary}`);
  }
  if (data.lines.length === 0) throw new Error("Timetable contains no lines");
  for (const line of data.lines) {
    if (!line.id || line.directions.length === 0) throw new Error(`Line ${line.name || "(unknown)"} has no directions`);
    for (const direction of line.directions) {
      if (direction.stationIds.length !== direction.stationNames.length) throw new Error(`${line.name} station metadata mismatch`);
      if (new Set(direction.stationIds).size !== direction.stationIds.length) {
        throw new Error(`${line.name} direction ${direction.id} has duplicate canonical station ids`);
      }
      if (!Array.isArray(direction.services)) throw new Error(`${line.name} has invalid services`);
      if (!Array.isArray(direction.patterns) || direction.patterns.length === 0) {
        throw new Error(`${line.name} direction ${direction.id} has no stopping patterns`);
      }
      const patternIds = new Set(direction.patterns.map((pattern) => pattern.id));
      for (const service of direction.services) {
        if (!patternIds.has(service.patternId)) {
          throw new Error(`${line.name} service ${service.id} references unknown pattern ${service.patternId}`);
        }
      }
      for (const service of direction.services) {
        if (!Number.isInteger(service.dateMask) || service.dateMask <= 0 || service.dateMask > 255) {
          throw new Error(`${line.name} service ${service.id} has an invalid date mask`);
        }
        if (service.times.length !== direction.stationIds.length) throw new Error(`${line.name} service ${service.id} column mismatch`);
        if (service.times.some((time) => time !== null && (!Number.isFinite(time) || time < 0))) {
          throw new Error(`${line.name} service ${service.id} has an invalid time`);
        }
        if (service.platformSet !== undefined && !direction.platformSets?.[service.platformSet]) {
          throw new Error(`${line.name} service ${service.id} references unknown platform set ${service.platformSet}`);
        }
      }
      for (const platforms of direction.platformSets ?? []) {
        if (platforms.length !== direction.stationIds.length) {
          throw new Error(`${line.name} direction ${direction.id} has a platform set of the wrong width`);
        }
      }
    }
  }
}

export function auditTimetableStationDuplicates(data: NetworkTimetableData): {
  affectedTables: number;
  duplicateGroups: number;
  details: string[];
} {
  const details: string[] = [];
  let duplicateGroups = 0;
  for (const line of data.lines) {
    for (const direction of line.directions) {
      const indexesByIdentity = new Map<string, number[]>();
      direction.stationNames.forEach((name, index) => {
        const identity = normalizedStationIdentity(name);
        const indexes = indexesByIdentity.get(identity) ?? [];
        indexes.push(index);
        indexesByIdentity.set(identity, indexes);
      });
      const duplicates = [...indexesByIdentity.entries()].filter(([, indexes]) => indexes.length > 1);
      if (duplicates.length === 0) continue;
      duplicateGroups += duplicates.length;
      details.push(`${line.name}/${direction.id}: ${duplicates.map(([name, indexes]) => `${name}=${indexes.length}`).join(", ")}`);
    }
  }
  return { affectedTables: details.length, duplicateGroups, details };
}

export async function generateTimetable(options: GenerateTimetableOptions): Promise<NetworkTimetableData> {
  const generatedAt = options.generatedAt ?? new Date();
  const warnings: string[] = [];
  const { routesById, canonicalByStop, platformByStopId, trips, stopTimes } = await loadGtfs(options.gtfsDir, options.dates);
  let ptvRouteMetadata: "verified" | "not-verified" = "not-verified";
  let ptvVerifiedAtUtc: string | null = null;

  if (options.credentials) {
    try {
      const apiNames = new Set((await getRoutes(ROUTE_TYPE_TRAIN, options.credentials)).map((route) => route.route_name));
      const missing = IN_SCOPE_LINE_NAMES.filter((name) => !apiNames.has(name));
      if (missing.length > 0) warnings.push(`PTV route metadata missing: ${missing.join(", ")}`);
      else {
        ptvRouteMetadata = "verified";
        ptvVerifiedAtUtc = generatedAt.toISOString();
      }
    } catch (error) {
      warnings.push(`PTV route metadata validation failed: ${error instanceof Error ? error.message.split("\n")[0] : "unknown error"}`);
    }
  } else {
    warnings.push("PTV credentials unavailable; route metadata was not re-verified");
  }

  const lines: TimetableLine[] = [];
  for (const lineName of IN_SCOPE_LINE_NAMES) {
    const route = [...routesById.values()].find((candidate) => candidate.name === lineName);
    if (!route) {
      warnings.push(`GTFS route unavailable: ${lineName}`);
      continue;
    }
    const routeTrips = [...trips.values()].filter((trip) => trip.routeId === route.id);
    const directionIds = [...new Set(routeTrips.map((trip) => trip.directionId))].sort();
    const directions = directionIds
      .map((directionId) => buildDirection(
        directionId,
        routeTrips.filter((trip) => trip.directionId === directionId),
        stopTimes,
        canonicalByStop,
        platformByStopId,
        options.dates,
      ))
      .filter((direction): direction is TimetableDirection => direction !== null);
    if (directions.length === 0) {
      warnings.push(`No active GTFS services for ${lineName} in requested date range`);
      continue;
    }
    lines.push({ id: lineIdFromName(lineName), name: lineName, color: route.color, directions });
  }

  const data: NetworkTimetableData = {
    schemaVersion: 1,
    generatedAtUtc: generatedAt.toISOString(),
    timezone: MELBOURNE_TIMEZONE,
    availableDates: options.dates,
    source: {
      schedule: "Victorian GTFS Schedule",
      ptvRouteMetadata,
      ptvVerifiedAtUtc,
      partial: warnings.some((warning) => /unavailable|No active|validation failed|missing/i.test(warning)),
      warnings,
    },
    lines,
  };
  validateTimetable(data);
  return data;
}

export async function writeTimetableAtomically(data: NetworkTimetableData, outputPath: string): Promise<void> {
  const temporaryPath = `${outputPath}.tmp`;
  try {
    validateTimetable(data);
    await writeFile(temporaryPath, `${JSON.stringify(data)}\n`, "utf8");
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function readTimetable(pathname: string): Promise<NetworkTimetableData> {
  return JSON.parse(await readFile(pathname, "utf8")) as NetworkTimetableData;
}
