/**
 * Authoritative list of in-scope Metro Trains Melbourne lines (V/Line regional
 * services are explicitly out of scope for this app).
 *
 * This is deliberately NOT a memory-recalled/guessed list — it was verified by
 * actually calling the live PTV Timetable API v3 `/v3/routes?route_types=0`
 * endpoint (route_type 0 = "Train" = Metro metropolitan trains in this API;
 * V/Line uses a different route_type and is never returned here) on
 * 2026-08-17, which returned exactly these 16 route names:
 *
 *   Alamein, Belgrave, Craigieburn, Cranbourne, Frankston, Glen Waverley,
 *   Hurstbridge, Lilydale, Mernda, Pakenham, Sandringham, Stony Point,
 *   Sunbury, Upfield, Werribee, Williamstown
 *
 * This matches PTV's current publicly published Metro network map exactly.
 *
 * Cross-checked against the Victorian GTFS Schedule feed's Metropolitan Train
 * branch (`routes.txt`, `route_type=400`), which additionally contains:
 *   - A "Replacement Bus" variant per line (gtfs_id suffixed "-R") — these are
 *     temporary bus-substitution trips, not the rail line itself, and are
 *     excluded by matching on exact route_short_name against this list.
 *   - "City Circle" and "Flemington Racecourse" — special/non-daily shuttle
 *     routes (tourist loop tram... actually a rail shuttle; and a race-day-only
 *     shuttle respectively) that are *not* part of the live API's regular
 *     16-route Metro list, so they're excluded too by only matching names in
 *     this list.
 *
 * If PTV restructures the network in future (they have before, e.g. the 2025
 * Metro Tunnel changes that shifted Sunbury/Cranbourne/Pakenham's city routing),
 * re-verify this list by re-running the query above rather than trusting this
 * comment indefinitely.
 */
export const IN_SCOPE_LINE_NAMES = [
  "Alamein",
  "Belgrave",
  "Craigieburn",
  "Cranbourne",
  "Frankston",
  "Glen Waverley",
  "Hurstbridge",
  "Lilydale",
  "Mernda",
  "Pakenham",
  "Sandringham",
  "Stony Point",
  "Sunbury",
  "Upfield",
  "Werribee",
  "Williamstown",
] as const;

export type InScopeLineName = (typeof IN_SCOPE_LINE_NAMES)[number];

export function lineIdFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
