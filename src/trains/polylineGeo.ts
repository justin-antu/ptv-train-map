/**
 * Small geo helpers used to interpolate train positions *along the actual track
 * shape* (the committed route polyline) rather than in a straight line between
 * two stations, which would cut corners on curvy sections of the line.
 */

type LonLat = [number, number];

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: LonLat, b: LonLat): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Cumulative distance (metres) from the start of the polyline to each vertex. */
export function cumulativeDistances(polyline: LonLat[]): number[] {
  const dist = [0];
  for (let i = 1; i < polyline.length; i++) {
    dist.push(dist[i - 1] + haversineMeters(polyline[i - 1], polyline[i]));
  }
  return dist;
}

/**
 * Finds how far along the polyline (in metres from the start) the nearest point
 * to `target` is. Uses nearest-vertex matching (not full segment projection) —
 * simple and accurate enough given the fine-grained GTFS shape points, and much
 * cheaper to compute for a handful of stations at build/load time.
 */
export function nearestDistanceAlong(polyline: LonLat[], cumDist: number[], target: LonLat): number {
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < polyline.length; i++) {
    const d = haversineMeters(polyline[i], target);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }
  return cumDist[bestIndex];
}

/** Interpolates a lon/lat point at a given cumulative distance along the polyline. */
export function pointAtDistance(polyline: LonLat[], cumDist: number[], targetDistance: number): LonLat {
  const clamped = Math.max(0, Math.min(targetDistance, cumDist[cumDist.length - 1]));
  let i = 1;
  while (i < cumDist.length && cumDist[i] < clamped) i++;
  if (i >= polyline.length) return polyline[polyline.length - 1];
  const segStart = cumDist[i - 1];
  const segEnd = cumDist[i];
  const t = segEnd === segStart ? 0 : (clamped - segStart) / (segEnd - segStart);
  const [lon1, lat1] = polyline[i - 1];
  const [lon2, lat2] = polyline[i];
  return [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t];
}
