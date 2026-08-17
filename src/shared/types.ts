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

export interface LiveSnapshot {
  /** ISO timestamp of when this snapshot was fetched from the PTV API. */
  generatedAtUtc: string;
  /** True only for the bundled fallback/demo snapshot; never true for real cron output. */
  isDemo?: boolean;
  /** Resolved PTV Timetable API route_id per line, or null if it couldn't be resolved this run. */
  lines: { id: string; ptvRouteId: number | null }[];
  runs: LiveRun[];
}
