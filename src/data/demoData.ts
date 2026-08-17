import type { LiveRun, LiveRunStop, LiveSnapshot, StaticLineData } from "../shared/types";

/**
 * Generates a plausible-looking "demo/sample data" snapshot purely on the client,
 * used whenever the real live snapshot isn't available yet (e.g. local dev without
 * PTV secrets configured, or before the first scheduled data-refresh workflow run).
 *
 * This is a synthetic simulation, NOT real train data — the UI must always label
 * it clearly as demo/sample data (see LiveSnapshot.isDemo).
 *
 * It's implemented as a pure function of the current wall-clock time (using modulo
 * arithmetic to place a handful of trains along the line), so re-generating it on
 * every poll tick produces continuous, smoothly-moving trains rather than jumping
 * around randomly.
 */

const APPROX_TRIP_DURATION_MS = 42 * 60_000;
const NUM_DEMO_TRAINS = 6;
const STAGGER_MS = APPROX_TRIP_DURATION_MS / NUM_DEMO_TRAINS;

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function generateDemoSnapshot(staticData: StaticLineData): LiveSnapshot {
  const now = Date.now();
  const stationsByOrder = [...staticData.stations].sort((a, b) => a.sequence - b.sequence);
  const segmentCount = stationsByOrder.length - 1;
  const msPerSegment = APPROX_TRIP_DURATION_MS / segmentCount;

  const runs: LiveRun[] = [];

  for (let i = 0; i < NUM_DEMO_TRAINS; i++) {
    const outbound = i % 2 === 0;
    const orderedStations = outbound ? stationsByOrder : [...stationsByOrder].reverse();

    const phase = mod(now + i * STAGGER_MS, APPROX_TRIP_DURATION_MS);
    const tripStart = now - phase;
    const currentSegment = Math.min(segmentCount - 1, Math.floor(phase / msPerSegment));

    const windowStart = Math.max(0, currentSegment - 1);
    const windowEnd = Math.min(orderedStations.length - 1, currentSegment + 2);

    const stops: LiveRunStop[] = [];
    for (let s = windowStart; s <= windowEnd; s++) {
      stops.push({
        stationId: orderedStations[s].id,
        timeUtc: new Date(tripStart + s * msPerSegment).toISOString(),
        isEstimate: true,
      });
    }

    runs.push({
      runRef: `demo-${i}`,
      directionId: outbound ? 0 : 1,
      destinationName: orderedStations[orderedStations.length - 1].name,
      stops,
    });
  }

  return {
    generatedAtUtc: new Date(now).toISOString(),
    isDemo: true,
    line: { id: staticData.line.id, ptvRouteId: null },
    runs,
  };
}
