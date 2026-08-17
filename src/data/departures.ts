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
 * either timestamp is missing or unparsable, rather than propagating `NaN`
 * into the UI — real-world live snapshots occasionally lack one of these
 * fields (e.g. an older/partial data snapshot), and that should never be
 * allowed to surface as a "+NaN min" badge.
 */
export function delayMinutesFor(stop: { timeUtc: string; scheduledTimeUtc: string }): number {
  const t = Date.parse(stop.timeUtc);
  const scheduled = Date.parse(stop.scheduledTimeUtc);
  if (Number.isNaN(t) || Number.isNaN(scheduled)) return 0;
  return Math.round((t - scheduled) / 60_000);
}

/**
 * Every still-upcoming predicted stop at `station`, across every line that
 * serves it, sorted soonest first. This is the single source of truth for
 * "what's coming up at this station" — used both by the station info card
 * (which further reduces it to one row per line) and the favourite-station
 * departure board (which shows the next few overall, like a real platform
 * display, without deduping by line).
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
