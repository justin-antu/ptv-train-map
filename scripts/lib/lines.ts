/**
 * Authoritative list of in-scope Metro Trains Melbourne lines (V/Line regional
 * services are excluded).
 *
 * Verified on 2026-08-17 against PTV Timetable API v3
 * `/v3/routes?route_types=0`. Route type 0 represents metropolitan trains;
 * V/Line uses a different route type. The response contained these 16 routes:
 *
 *   Alamein, Belgrave, Craigieburn, Cranbourne, Frankston, Glen Waverley,
 *   Hurstbridge, Lilydale, Mernda, Pakenham, Sandringham, Stony Point,
 *   Sunbury, Upfield, Werribee, Williamstown
 *
 * Cross-checked against `routes.txt` in the Metropolitan Train branch of the
 * Victorian GTFS Schedule feed (`route_type=400`). That feed also contains:
 *   - A "Replacement Bus" variant per line (`gtfs_id` suffix `-R`), excluded
 *     by exact `route_short_name` matching.
 *   - "City Circle" and "Flemington Racecourse" — special/non-daily shuttle
 *     routes outside the regular 16-route Metro list.
 *
 * Re-run both validations after a PTV network restructure.
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
