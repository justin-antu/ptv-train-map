import { melbourneDateString, melbourneServiceTimeToUtc } from "../shared/melbourneTime";
import type { LiveRun, LiveRunStop, LiveSnapshot, NetworkTimetableData } from "../shared/types";

/** How far back and forward the derived snapshot reaches, matching the live fetcher. */
const KEEP_PAST_MS = 20 * 60_000;
const KEEP_FUTURE_MS = 4 * 60 * 60_000;

/**
 * Builds a snapshot from the published timetable alone.
 *
 * This replaces a synthetic demo generator that invented plausible-looking
 * trains whenever live data was unavailable. Invented services are worse than
 * no services: they are indistinguishable from real ones at a glance, and the
 * app already ships the genuine schedule, so the honest degradation was always
 * available.
 *
 * Every run is marked `scheduled` and `isRealtime: false`, which is what makes
 * the board label these times as timetable-only rather than as predictions.
 */
export function buildScheduledSnapshot(timetable: NetworkTimetableData, now = new Date()): LiveSnapshot {
  const today = melbourneDateString(now);
  const dateIndex = timetable.availableDates.indexOf(today);
  const nowMs = now.getTime();

  const runs: LiveRun[] = [];
  if (dateIndex >= 0) {
    const dateBit = 1 << dateIndex;

    for (const line of timetable.lines) {
      for (const direction of line.directions) {
        const directionId = Number(direction.id);
        for (const service of direction.services) {
          if ((service.dateMask & dateBit) === 0) continue;

          const stops: LiveRunStop[] = [];
          service.times.forEach((minutes, column) => {
            if (minutes === null) return;
            stops.push({
              stationId: direction.stationIds[column],
              scheduledTimeUtc: melbourneServiceTimeToUtc(today, minutes).toISOString(),
            });
          });
          if (stops.length < 2) continue;
          stops.sort((a, b) => Date.parse(a.scheduledTimeUtc) - Date.parse(b.scheduledTimeUtc));

          const firstMs = Date.parse(stops[0].scheduledTimeUtc);
          const lastMs = Date.parse(stops[stops.length - 1].scheduledTimeUtc);
          if (lastMs < nowMs - KEEP_PAST_MS || firstMs > nowMs + KEEP_FUTURE_MS) continue;

          runs.push({
            runRef: service.id,
            lineId: line.id,
            directionId: Number.isFinite(directionId) ? directionId : 0,
            destinationName: service.destination,
            status: "scheduled",
            isRealtime: false,
            stops,
          });
        }
      }
    }
  }

  return {
    generatedAtUtc: now.toISOString(),
    isScheduleOnly: true,
    runs,
  };
}
