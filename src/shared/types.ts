/**
 * Shared data shapes for the Metro Trains Melbourne network map.
 *
 * These types are used both by the Node scripts (which generate/fetch the JSON
 * files under `public/data/`) and by the browser app (which consumes them).
 */

export interface LineStatic {
  /** Internal slug for the line, e.g. "lilydale". */
  id: string;
  /** Display name, e.g. "Lilydale". */
  name: string;
  /** Official PTV network-map colour for this line, as a "#RRGGBB" hex string. */
  color: string;
  /** GTFS route_id this data was extracted from (Metropolitan Train branch). */
  gtfsRouteId: string;
  /**
   * Ordered station ids (see StationStatic.id) tracing this line's canonical
   * alignment end-to-end. References into the shared `stations` collection —
   * shared stations (e.g. Flinders Street, Richmond) appear in multiple
   * lines' `stationIds` arrays pointing at the same station entry.
   */
  stationIds: string[];
  /** Ordered [lon, lat] coordinates tracing this line's track alignment. */
  polyline: [number, number][];
}

export interface StationStatic {
  /** Stable slug derived from the station name, e.g. "box-hill". Used to join with live data. */
  id: string;
  /** Human-readable station name, e.g. "Box Hill". */
  name: string;
  lat: number;
  lon: number;
  /** Raw GTFS stop_id this station was extracted from (informational only; first line encountered "wins" if shared). */
  gtfsStopId: string;
  /** Ids of every line (see LineStatic.id) that serves this station. */
  lineIds: string[];
  /**
   * True when the station is only reached by a subset of a line's trips (the
   * City Loop stations, principally). The map draws one canonical alignment per
   * line, so these stations are real destinations but may sit off that line's
   * drawn polyline.
   */
  offCanonicalAlignment?: boolean;
}

/**
 * Metro's GTFS `stops.txt` is platform-level: every stop referenced by
 * `stop_times.txt` is one platform with a `parent_station` and a
 * `platform_code`. This index resolves those raw ids, which is what the
 * realtime feed and the schedule both speak, back to a station and a platform.
 */
export interface GtfsStopRef {
  /** Matches StationStatic.id. */
  stationId: string;
  /** GTFS `platform_code`, e.g. "3". Absent for stops that declare none. */
  platformCode?: string;
}

export interface NetworkStaticData {
  lines: LineStatic[];
  /** Deduplicated across all lines — a station shared by multiple lines appears once. */
  stations: StationStatic[];
  /** Platform-level GTFS stop_id -> station and platform. Keyed by raw GTFS stop_id. */
  gtfsStops?: Record<string, GtfsStopRef>;
  /** ISO timestamp of when this static file was generated from the GTFS feed. */
  generatedAt: string;
}

/** One call a run makes, used both for the departure board and the interpolation timeline. */
export interface LiveRunStop {
  /** Matches StationStatic.id. */
  stationId: string;
  /** ISO 8601 UTC *timetabled* departure time. Always present — this is the call's identity. */
  scheduledTimeUtc: string;
  /**
   * ISO 8601 UTC real-time prediction. Absent when the feed published none for
   * this call, which is a genuine state the UI must show rather than paper over
   * by silently falling back to the scheduled time.
   */
  estimatedTimeUtc?: string;
  /**
   * True when `estimatedTimeUtc` was derived by carrying an earlier call's delay
   * forward rather than published for this call directly.
   */
  isPropagated?: boolean;
  /** True when the realtime feed marks this call as skipped by an otherwise running service. */
  isSkipped?: boolean;
  /** Scheduled platform at this station, when the schedule declares one. */
  platform?: string;
}

/** How a run relates to the published timetable. */
export type LiveRunStatus = "scheduled" | "updated" | "added" | "cancelled";

export interface LiveRun {
  /**
   * Stable identifier for this service on this day. Now the GTFS `trip_id`,
   * which is also what `network-timetable.json` keys services by, so a
   * departure row can be cross-linked into the timetable.
   */
  runRef: string;
  /** Matches LineStatic.id — which line this run belongs to. */
  lineId: string;
  /** GTFS direction_id (0 or 1); not semantically meaningful on its own, just an opaque grouping key. */
  directionId: number;
  /** Human readable destination, e.g. "Lilydale" or "Flinders Street". */
  destinationName: string;
  /**
   * `scheduled` means the timetable is the only source for this run.
   * `updated` means the realtime feed supplied at least one prediction.
   */
  status: LiveRunStatus;
  /** True when any part of this run came from the realtime feed. */
  isRealtime: boolean;
  /** Last observed GPS fix, when the vehicle-positions feed carried one for this trip. */
  position?: {
    lat: number;
    lon: number;
    /** Degrees clockwise from true north, when published. */
    bearing?: number;
    observedAtUtc: string;
  };
  /** Every call this run makes today, sorted ascending by scheduled time. */
  stops: LiveRunStop[];
}

/** The effective departure time for a call: the prediction if there is one, else the timetable. */
export function effectiveStopTimeUtc(stop: LiveRunStop): string {
  return stop.estimatedTimeUtc ?? stop.scheduledTimeUtc;
}

/** Minutes late at a call, or null when no prediction exists to compare against. */
export function stopDelayMinutes(stop: LiveRunStop): number | null {
  if (!stop.estimatedTimeUtc) return null;
  return Math.round((Date.parse(stop.estimatedTimeUtc) - Date.parse(stop.scheduledTimeUtc)) / 60000);
}

/** A current or planned PTV service alert/disruption affecting a specific line. */
export interface LineDisruption {
  /** PTV disruption_id — stable identifier, used to dedupe the same disruption across lines/stops. */
  id: number;
  /** Headline title summarising the disruption (PTV's own wording). */
  title: string;
  /** PTV's longer prose body, when supplied. Often the only place the detail lives. */
  description?: string;
  /** URL of the relevant article on the PTV website, if any. */
  url: string | null;
  /** PTV's own disruption_type label, e.g. "Planned Works", "Station detour". */
  disruptionType: string;
  /** PTV's lifecycle status when supplied by the current snapshot, e.g. "Current". */
  disruptionStatus?: string;
  /**
   * PTV's own severity signal: `true` means the disruption is significant enough
   * to publish on station passenger information displays. Far more reliable than
   * inferring severity from the wording of the title.
   */
  displayOnBoard?: boolean;
  /** PTV's severity colour for the disruption, as a "#RRGGBB" hex string. */
  colour?: string;
  /** Ids of specifically affected stations (see StationStatic.id), when PTV names any. */
  stationIds?: string[];
  /** ISO 8601 UTC start time, if known. */
  fromDateUtc: string | null;
  /** ISO 8601 UTC end time, if known (open-ended disruptions have no end date yet). */
  toDateUtc: string | null;
}

export interface LiveSnapshot {
  /** ISO timestamp of when this snapshot was assembled. */
  generatedAtUtc: string;
  /**
   * Header timestamp of the GTFS-Realtime feed the snapshot was built from.
   * Absent on a schedule-only snapshot. This, not `generatedAtUtc`, is how old
   * the *predictions* are.
   */
  feedTimestampUtc?: string;
  /**
   * True when no real-time layer was available and every run carries timetable
   * times only. The board must say so: showing scheduled times as though they
   * were predictions is the failure mode riders notice and stop trusting.
   */
  isScheduleOnly?: boolean;
  runs: LiveRun[];
  /**
   * Current disruptions per line, keyed by LineStatic.id. Lines with no current
   * disruption are omitted entirely (rather than present with an empty array)
   * to keep the committed JSON lean.
   */
  disruptionsByLine?: Record<string, LineDisruption[]>;
}

/** A compact scheduled service. Times are minutes after the Melbourne service-day midnight; values >= 1440 cross midnight. */
export interface TimetableService {
  id: string;
  destination: string;
  origin: string;
  /** Bit N means this service operates on availableDates[N] (eight dates maximum). */
  dateMask: number;
  /** Which stopping pattern this service follows (see TimetableDirection.patterns). */
  patternId: string;
  /** One value per direction.stationIds entry; null means this service skips/does not use that station. */
  times: (number | null)[];
}

/**
 * A distinct stopping pattern within a direction.
 *
 * Grouping by GTFS `direction_id` alone unions every variant into one column
 * order, which is why the matrix view is mostly em-dashes: a Lilydale train, a
 * Ringwood short and a City Loop working share a direction but not a route.
 */
export interface TimetablePattern {
  id: string;
  /** Human-readable name, e.g. "Lilydale via City Loop" or "Ringwood (limited stops)". */
  label: string;
  /** This pattern's own ordered calls, a subset of the direction's station list. */
  stationIds: string[];
  /** How many services follow this pattern across the covered dates. */
  serviceCount: number;
}

export interface TimetableDirection {
  id: string;
  label: string;
  stationIds: string[];
  stationNames: string[];
  /** Ordered by how many services follow each, most common first. */
  patterns: TimetablePattern[];
  /** Services are stored once and selected by dateMask to avoid repeating weekday schedules. */
  services: TimetableService[];
}

export interface TimetableLine {
  id: string;
  name: string;
  color: string;
  directions: TimetableDirection[];
}

export interface NetworkTimetableData {
  schemaVersion: 1;
  generatedAtUtc: string;
  timezone: "Australia/Melbourne";
  availableDates: string[];
  source: {
    schedule: "Victorian GTFS Schedule";
    ptvRouteMetadata: "verified" | "not-verified";
    ptvVerifiedAtUtc: string | null;
    partial: boolean;
    warnings: string[];
  };
  lines: TimetableLine[];
}
