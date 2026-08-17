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
}

export interface NetworkStaticData {
  lines: LineStatic[];
  /** Deduplicated across all lines — a station shared by multiple lines appears once. */
  stations: StationStatic[];
  /** ISO timestamp of when this static file was generated from the GTFS feed. */
  generatedAt: string;
}

/** One predicted stop for a single train run, used to build the interpolation timeline. */
export interface LiveRunStop {
  /** Matches StationStatic.id. */
  stationId: string;
  /** ISO 8601 UTC departure time (estimated real-time if available, else scheduled). */
  timeUtc: string;
  /** True if `timeUtc` came from a real-time PTV prediction rather than the static schedule. */
  isEstimate: boolean;
  /**
   * ISO 8601 UTC *scheduled* (timetabled) departure time, kept alongside `timeUtc`
   * even when a real-time estimate is available, so a delay in minutes can be
   * derived as `timeUtc - scheduledTimeUtc` (0 when not estimated, since then
   * `timeUtc === scheduledTimeUtc`).
   */
  scheduledTimeUtc: string;
}

export interface LiveRun {
  /** PTV run_ref identifying this specific train service. */
  runRef: string;
  /** Matches LineStatic.id — which line this run belongs to. */
  lineId: string;
  /** PTV direction_id (0 or 1); not semantically meaningful on its own, just an opaque grouping key. */
  directionId: number;
  /** Human readable destination, e.g. "Lilydale" or "Flinders Street". */
  destinationName: string;
  /** Predicted departure times at each station this run was seen at, sorted ascending by time. */
  stops: LiveRunStop[];
}

/** A current or planned PTV service alert/disruption affecting a specific line. */
export interface LineDisruption {
  /** PTV disruption_id — stable identifier, used to dedupe the same disruption across lines/stops. */
  id: number;
  /** Headline title summarising the disruption (PTV's own wording). */
  title: string;
  /** URL of the relevant article on the PTV website, if any. */
  url: string | null;
  /** PTV's own disruption_type label, e.g. "Planned Works", "Station detour". */
  disruptionType: string;
  /** PTV's lifecycle status when supplied by the current snapshot, e.g. "Current". */
  disruptionStatus?: string;
  /** ISO 8601 UTC start time, if known. */
  fromDateUtc: string | null;
  /** ISO 8601 UTC end time, if known (open-ended disruptions have no end date yet). */
  toDateUtc: string | null;
}

export interface LiveSnapshot {
  /** ISO timestamp of when this snapshot was fetched from the PTV API. */
  generatedAtUtc: string;
  /** True only for the bundled fallback/demo snapshot; never true for real cron output. */
  isDemo?: boolean;
  /** Resolved PTV Timetable API route_id per line, or null if it couldn't be resolved this run. */
  lines: { id: string; ptvRouteId: number | null }[];
  runs: LiveRun[];
  /**
   * Current disruptions per line, keyed by LineStatic.id. Lines with no current
   * disruption are omitted entirely (rather than present with an empty array)
   * to keep the committed JSON lean.
   */
  disruptionsByLine?: Record<string, LineDisruption[]>;
}
