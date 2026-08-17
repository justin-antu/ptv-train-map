/**
 * Minimal client for the PTV Timetable API v3.
 *
 * This module is only ever imported by Node scripts under `scripts/` (run locally
 * or in the GitHub Actions "refresh-data" workflow). It must never be imported by
 * browser code, since it requires the secret API key.
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
 * Note: the official PTV documentation appendix includes a worked example (key
 * "9c132d31-...", devid 2, path "/v2/mode/2/line/787/stops-for-line") claiming a
 * specific resulting signature. That documented example is actually internally
 * inconsistent (independently reproduced and confirmed broken by a 2014
 * StackOverflow thread: https://stackoverflow.com/questions/22340119). The
 * *algorithm* described in prose (HMAC-SHA1 of path+query+devid, keyed with the
 * secret, hex-uppercased) is correct and matches multiple independent real-world
 * open-source PTV API clients (e.g. github.com/bremor/public_transport_victoria,
 * and the widely-shared "ptv_signature.py" gist). ptvClient.test.ts cross-checks
 * this implementation against an independently written reference implementation
 * of that same documented algorithm rather than the broken doc example.
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
  const url = buildPtvUrl(pathAndQuery, credentials);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PtvApiError(res.status, res.statusText, pathAndQuery, body);
  }
  return (await res.json()) as T;
}

// --- Typed response shapes (only the fields we actually use) -------------

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

// --- Public helpers --------------------------------------------------------

/** GET /v3/routes?route_types={routeType} — used to resolve the Lilydale route_id. */
export async function getRoutes(routeType: number, credentials: PtvCredentials): Promise<PtvRoute[]> {
  const res = await ptvGet<PtvRoutesResponse>(`/v3/routes?route_types=${routeType}`, credentials);
  return res.routes;
}

/** GET /v3/stops/route/{routeId}/route_type/{routeType} — used to resolve PTV stop_ids for our stations. */
export async function getStopsForRoute(
  routeId: number,
  routeType: number,
  credentials: PtvCredentials,
): Promise<PtvStop[]> {
  const res = await ptvGet<PtvStopsResponse>(`/v3/stops/route/${routeId}/route_type/${routeType}`, credentials);
  return res.stops;
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
  // URLSearchParams would percent-encode "Run" fine, but `expand` can repeat; add manually.
  const path = `/v3/departures/route_type/${routeType}/stop/${stopId}/route/${routeId}?${query.toString()}`;
  const res = await ptvGet<PtvDeparturesResponse>(path, credentials);
  return { departures: res.departures, runs: res.runs ?? {} };
}
