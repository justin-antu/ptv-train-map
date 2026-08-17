import type { LiveRun, StationStatic } from "../shared/types";

/** One still-upcoming predicted stop at a particular station, with delay already computed. */
export interface UpcomingStop {
  lineId: string;
  runRef: string;
  timeUtc: string;
  scheduledTimeUtc: string;
  /** Minutes late (0 or negative = on time/early), derived from timeUtc - scheduledTimeUtc. */
  delayMin: number;
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
    if (!station.lineIds.includes(run.lineId)) continue;
    for (const stop of run.stops) {
      if (stop.stationId !== station.id) continue;
      const t = Date.parse(stop.timeUtc);
      if (t < now) continue;
      results.push({
        lineId: run.lineId,
        runRef: run.runRef,
        timeUtc: stop.timeUtc,
        scheduledTimeUtc: stop.scheduledTimeUtc,
        delayMin: Math.round((t - Date.parse(stop.scheduledTimeUtc)) / 60_000),
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
