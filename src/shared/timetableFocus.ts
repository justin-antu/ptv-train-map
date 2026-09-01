/**
 * A request to open the timetable at one specific service.
 *
 * Departures and the timetable answer the same question at different zoom
 * levels — "when does my train leave" and "where does it go after that" — so a
 * departure row is only useful if it can hand off to the timetable without the
 * rider re-entering the line, direction and station by hand.
 */
export interface TimetableFocus {
  lineId: string;
  directionId: string;
  stationId: string;
  /** GTFS trip_id, which live runs now carry as their `runRef`. */
  serviceId: string;
  /**
   * Bumped on every request. Two taps on the same row must both scroll, and
   * without this the props would be identical and nothing would happen.
   */
  requestedAt: number;
}
