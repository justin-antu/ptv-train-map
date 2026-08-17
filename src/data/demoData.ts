import type { LiveRun, LiveRunStop, LiveSnapshot, NetworkStaticData } from "../shared/types";

/**
 * Generates a plausible-looking "demo/sample data" snapshot purely on the client,
 * used whenever the real live snapshot isn't available yet (e.g. local dev without
 * PTV secrets configured, or before the first scheduled data-refresh workflow run).
 *
 * This is a synthetic simulation, NOT real train data — the UI must always label
 * it clearly as demo/sample data (see LiveSnapshot.isDemo).
 *
 * It's implemented as a pure function of the current wall-clock time (using modulo
 * arithmetic to place a couple of trains per line along each line), so
 * re-generating it on every poll tick produces continuous, smoothly-moving trains
 * rather than jumping around randomly.
 */

const APPROX_TRIP_DURATION_MS = 42 * 60_000;
const NUM_DEMO_TRAINS_PER_LINE = 2;

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Small deterministic hash so each line's demo trains are out of phase with each other, not all clustered at the same relative position. */
function phaseOffsetForLine(lineId: string): number {
  let hash = 0;
  for (let i = 0; i < lineId.length; i++) hash = (hash * 31 + lineId.charCodeAt(i)) >>> 0;
  return hash % APPROX_TRIP_DURATION_MS;
}

export function generateDemoSnapshot(staticData: NetworkStaticData): LiveSnapshot {
  const now = Date.now();
  const runs: LiveRun[] = [];

  for (const line of staticData.lines) {
    const segmentCount = line.stationIds.length - 1;
    if (segmentCount <= 0) continue;

    const msPerSegment = APPROX_TRIP_DURATION_MS / segmentCount;
    const staggerMs = APPROX_TRIP_DURATION_MS / NUM_DEMO_TRAINS_PER_LINE;
    const lineOffset = phaseOffsetForLine(line.id);

    for (let i = 0; i < NUM_DEMO_TRAINS_PER_LINE; i++) {
      const outbound = i % 2 === 0;
      const orderedStationIds = outbound ? line.stationIds : [...line.stationIds].reverse();

      const phase = mod(now + lineOffset + i * staggerMs, APPROX_TRIP_DURATION_MS);
      const tripStart = now - phase;
      const currentSegment = Math.min(segmentCount - 1, Math.floor(phase / msPerSegment));

      const windowStart = Math.max(0, currentSegment - 1);
      const windowEnd = Math.min(orderedStationIds.length - 1, currentSegment + 2);

      const stops: LiveRunStop[] = [];
      for (let s = windowStart; s <= windowEnd; s++) {
        stops.push({
          stationId: orderedStationIds[s],
          timeUtc: new Date(tripStart + s * msPerSegment).toISOString(),
          isEstimate: true,
        });
      }

      const destinationStationId = orderedStationIds[orderedStationIds.length - 1];
      const destinationName = staticData.stations.find((s) => s.id === destinationStationId)?.name ?? line.name;

      runs.push({
        runRef: `demo-${line.id}-${i}`,
        lineId: line.id,
        directionId: outbound ? 0 : 1,
        destinationName,
        stops,
      });
    }
  }

  return {
    generatedAtUtc: new Date(now).toISOString(),
    isDemo: true,
    lines: staticData.lines.map((l) => ({ id: l.id, ptvRouteId: null })),
    runs,
  };
}
