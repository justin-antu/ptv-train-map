/**
 * Minimal client for the PTV Timetable API v3.
 *
 * This Node-only module requires the secret API key and must not be imported by
 * browser code.
 *
 * Auth scheme (verified against https://timetableapi.ptv.vic.gov.au/swagger/ui/index
 * and https://stevage.github.io/PTV-API-doc/3-quickstart.html, and cross-checked
 * against the worked example in the PTV-supplied C#/Java sample code):
 *
 *   1. Take the request path + query string (e.g. "/v3/routes?route_types=0"),
 *      NOT including the base URL.
 *   2. Append `devid=<devId>` (using `?` if there's no query string yet, `&` otherwise).
 *   3. Compute HMAC-SHA1 of that full string, using the secret API key as the HMAC key.
 *   4. Hex-encode the digest and upper-case it.
 *   5. Append it as `&signature=<HEX>`.
 *
 * The official PTV documentation appendix includes a worked example (key
 * "9c132d31-...", devid 2, path "/v2/mode/2/line/787/stops-for-line") claiming a
 * signature that is internally inconsistent, as independently reproduced in a 2014
 * StackOverflow thread: https://stackoverflow.com/questions/22340119). The
 * documented algorithm is consistent with independent open-source PTV clients.
 */
import { createHmac } from "node:crypto";

const BASE_URL = "https://timetableapi.ptv.vic.gov.au";

export interface PtvCredentials {
  devId: string | number;
  apiKey: string;
}

/** route_type used by the PTV Timetable API for metropolitan trains. */
export const ROUTE_TYPE_TRAIN = 0;

/**
 * Signs a PTV request path+query, returning the full path+query with
 * `devid` and `signature` appended.
 */
export function signPtvRequest(pathAndQuery: string, credentials: PtvCredentials): string {
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  const requestWithDevId = `${pathAndQuery}${separator}devid=${credentials.devId}`;
  const signature = createHmac("sha1", credentials.apiKey)
    .update(requestWithDevId)
    .digest("hex")
    .toUpperCase();
  return `${requestWithDevId}&signature=${signature}`;
}

export function buildPtvUrl(pathAndQuery: string, credentials: PtvCredentials): string {
  return `${BASE_URL}${signPtvRequest(pathAndQuery, credentials)}`;
}

export class PtvApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(`PTV API request failed: ${status} ${statusText} for ${path}\n${body}`);
    this.name = "PtvApiError";
  }
}

async function ptvGet<T>(pathAndQuery: string, credentials: PtvCredentials): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const url = buildPtvUrl(pathAndQuery, credentials);
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as T;

    const body = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new PtvApiError(res.status, res.statusText, pathAndQuery, body);
    }
    const retryAfterSeconds = Number(res.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1000
      : 500 * 2 ** (attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Unreachable PTV retry state");
}

// --- Typed response shapes used by this client ----------------------------

export interface PtvRoute {
  route_id: number;
  route_name: string;
  route_type: number;
  route_gtfs_id: string;
}

interface PtvRoutesResponse {
  routes: PtvRoute[];
}

export interface PtvStop {
  stop_id: number;
  stop_name: string;
  stop_latitude: number;
  stop_longitude: number;
}

interface PtvStopsResponse {
  stops: PtvStop[];
}

export interface PtvDeparture {
  stop_id: number;
  route_id: number;
  run_ref: string;
  direction_id: number;
  scheduled_departure_utc: string;
  estimated_departure_utc: string | null;
  at_platform: boolean;
}

interface PtvRunSummary {
  destination_name?: string;
}

interface PtvDeparturesResponse {
  departures: PtvDeparture[];
  runs: Record<string, PtvRunSummary>;
}

export interface PtvDisruptionRoute {
  route_id: number;
}

export interface PtvDisruption {
  disruption_id: number;
  title: string;
  url: string | null;
  disruption_status: string;
  disruption_type: string;
  from_date: string | null;
  to_date: string | null;
  routes: PtvDisruptionRoute[];
}

/**
 * The API groups disruptions by transport mode. Optional mode arrays preserve
 * unlisted categories and accommodate responses containing only affected modes.
 */
interface PtvDisruptionsByMode {
  [mode: string]: PtvDisruption[] | undefined;
}

interface PtvDisruptionsResponse {
  disruptions: PtvDisruptionsByMode;
}

// --- Public helpers --------------------------------------------------------

/** GET /v3/routes?route_types={routeType} — used to resolve each in-scope line's route_id. */
export async function getRoutes(routeType: number, credentials: PtvCredentials): Promise<PtvRoute[]> {
  const res = await ptvGet<PtvRoutesResponse>(`/v3/routes?route_types=${routeType}`, credentials);
  return res.routes;
}

/** GET /v3/stops/route/{routeId}/route_type/{routeType} — resolves station stop IDs. */
export async function getStopsForRoute(
  routeId: number,
  routeType: number,
  credentials: PtvCredentials,
): Promise<PtvStop[]> {
  const res = await ptvGet<PtvStopsResponse>(`/v3/stops/route/${routeId}/route_type/${routeType}`, credentials);
  return res.stops;
}

/**
 * GET /v3/disruptions/route/{routeId}?disruption_status=current — current (not
 * "planned") disruptions affecting a route. Verified against a real response on
 * 2026-08-17 (route_id 9, Lilydale): returns
 * `{ disruptions: { metro_train: [...], general: [...], ... }, status }`, each
 * disruption carrying `disruption_id`, `title`, `url`, `disruption_type`,
 * `from_date`/`to_date`, and a `routes[]` array of every route it applies to.
 * Flatten all mode arrays because a network-wide disruption may be filed under
 * `general` while still listing the requested route ID.
 */
export async function getDisruptionsForRoute(routeId: number, credentials: PtvCredentials): Promise<PtvDisruption[]> {
  const res = await ptvGet<PtvDisruptionsResponse>(`/v3/disruptions/route/${routeId}?disruption_status=current`, credentials);
  return Object.values(res.disruptions ?? {})
    .filter((arr): arr is PtvDisruption[] => Array.isArray(arr))
    .flat();
}

/**
 * GET /v3/departures/route_type/{routeType}/stop/{stopId}/route/{routeId}
 * — live (real-time, if available) + scheduled departures for one stop, filtered to one route
 * so that stations shared with other lines don't return irrelevant departures.
 */
export async function getDeparturesForStop(
  routeType: number,
  stopId: number,
  routeId: number,
  maxResults: number,
  credentials: PtvCredentials,
): Promise<{ departures: PtvDeparture[]; runs: Record<string, PtvRunSummary> }> {
  const query = new URLSearchParams({
    max_results: String(maxResults),
    expand: "Run",
    include_cancelled: "false",
  });
  const path = `/v3/departures/route_type/${routeType}/stop/${stopId}/route/${routeId}?${query.toString()}`;
  const res = await ptvGet<PtvDeparturesResponse>(path, credentials);
  return { departures: res.departures, runs: res.runs ?? {} };
}
