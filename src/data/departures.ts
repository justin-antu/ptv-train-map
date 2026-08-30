import type { LiveRun, StationStatic } from "../shared/types";

/** One still-upcoming predicted stop at a particular station, with delay already computed. */
export interface UpcomingStop {
  lineId: string;
  runRef: string;
  timeUtc: string;
  scheduledTimeUtc: string;
  isEstimate: boolean;
  /** Minutes late (0 or negative = on time/early), derived from timeUtc - scheduledTimeUtc. */
  delayMin: number;
}

/**
 * Minutes late (0 or negative = on time/early) derived from a stop's
 * `timeUtc - scheduledTimeUtc`. Falls back to 0 (treated as on-time) if
 * either timestamp is missing or unparsable, preventing `NaN` delay badges
 * from partial live snapshots.
 */
export function delayMinutesFor(stop: { timeUtc: string; scheduledTimeUtc: string }): number {
  const t = Date.parse(stop.timeUtc);
  const scheduled = Date.parse(stop.scheduledTimeUtc);
  if (Number.isNaN(t) || Number.isNaN(scheduled)) return 0;
  return Math.round((t - scheduled) / 60_000);
}

/**
 * Returns upcoming predicted stops at `station`, sorted chronologically.
 * Station cards reduce the result per line; the favourite board retains the
 * next stops across all lines.
 */
export function upcomingStopsForStation(station: StationStatic, runs: LiveRun[], now: number): UpcomingStop[] {
  const results: UpcomingStop[] = [];
  for (const run of runs) {
    // Match the exact stop carried by live data rather than pre-filtering by
    // StationStatic.lineIds. That static list can lag route changes (notably
    // Metro Tunnel services), while a run containing this stop is definitive.
    for (const stop of run.stops) {
      if (stop.stationId !== station.id) continue;
      const t = Date.parse(stop.timeUtc);
      if (!Number.isFinite(t) || t < now) continue;
      results.push({
        lineId: run.lineId,
        runRef: run.runRef,
        timeUtc: stop.timeUtc,
        scheduledTimeUtc: stop.scheduledTimeUtc,
        isEstimate: stop.isEstimate,
        delayMin: delayMinutesFor(stop),
      });
    }
  }
  return results.sort((a, b) => Date.parse(a.timeUtc) - Date.parse(b.timeUtc));
}

/** An upcoming departure enriched with its run's destination and remaining stop count. */
export interface DepartureRow extends UpcomingStop {
  destinationName: string;
  /** Stops still to come after this station, for a "calling at N stops" summary. */
  remainingStops: number;
}

/**
 * Upcoming departures at `station` with run context attached, for the live
 * departures board.
 *
 * PTV's snapshot carries no platform number, so callers cannot show one.
 */
export function departureRowsForStation(station: StationStatic, runs: LiveRun[], now: number): DepartureRow[] {
  const rows: DepartureRow[] = [];
  for (const run of runs) {
    const index = run.stops.findIndex((stop) => stop.stationId === station.id);
    if (index < 0) continue;
    const stop = run.stops[index];
    const t = Date.parse(stop.timeUtc);
    if (!Number.isFinite(t) || t < now) continue;
    rows.push({
      lineId: run.lineId,
      runRef: run.runRef,
      timeUtc: stop.timeUtc,
      scheduledTimeUtc: stop.scheduledTimeUtc,
      isEstimate: stop.isEstimate,
      delayMin: delayMinutesFor(stop),
      destinationName: run.destinationName,
      remainingStops: Math.max(0, run.stops.length - index - 1),
    });
  }
  return rows.sort((a, b) => Date.parse(a.timeUtc) - Date.parse(b.timeUtc));
}

/** Minutes late at which a departure is called out as delayed, matching `DelayBadge`. */
export const DELAYED_THRESHOLD_MIN = 3;

export interface DepartureStatus {
  label: string;
  tone: "success" | "warning" | "muted";
}

export function departureStatus(row: Pick<DepartureRow, "delayMin" | "isEstimate">): DepartureStatus {
  if (row.delayMin >= DELAYED_THRESHOLD_MIN) return { label: `Delayed ${row.delayMin} min`, tone: "warning" };
  if (!row.isEstimate) return { label: "Scheduled", tone: "muted" };
  return { label: "On time", tone: "success" };
}

/** Reduces an already-sorted (soonest first) stop list to just the soonest one per line. */
export function soonestPerLine(stops: readonly UpcomingStop[]): UpcomingStop[] {
  const seen = new Set<string>();
  const result: UpcomingStop[] = [];
  for (const stop of stops) {
    if (seen.has(stop.lineId)) continue;
    seen.add(stop.lineId);
    result.push(stop);
  }
  return result;
}

/** Formats a predicted ISO time as a short relative/absolute label, e.g. "Due", "4 min", "2:15 pm". */
export function formatEta(timeUtc: string, now: number): string {
  const diffMs = Date.parse(timeUtc) - now;
  if (diffMs <= 30_000) return "Due";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins} min`;
  return new Date(timeUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
