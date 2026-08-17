/**
 * Shared data shapes for the Lilydale line map.
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
}

export interface StationStatic {
  /** Stable slug derived from the station name, e.g. "box-hill". Used to join with live data. */
  id: string;
  /** Human-readable station name, e.g. "Box Hill". */
  name: string;
  lat: number;
  lon: number;
  /** 0-based order of the station along the line, starting at Flinders Street. */
  sequence: number;
  /** Raw GTFS stop_id this station was extracted from (informational only). */
  gtfsStopId: string;
}

export interface StaticLineData {
  line: LineStatic;
  stations: StationStatic[];
  /** Ordered [lon, lat] coordinates tracing the line from Flinders Street to Lilydale. */
  polyline: [number, number][];
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
  line: {
    id: string;
    /** Resolved PTV Timetable API route_id, or null if it could not be resolved this run. */
    ptvRouteId: number | null;
  };
  runs: LiveRun[];
}
