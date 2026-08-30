import { useCallback, useMemo } from "react";

export interface FavouriteLineFilter {
  /** Chosen lines that still exist in the current network data. */
  lineIds: Set<string>;
  /** False when no lines are chosen, which means "show everything". */
  hasPreference: boolean;
  /** Whether `lineId` passes the current preference. */
  includes(lineId: string): boolean;
  /** Lines to actually render: the chosen ones, or all of them when unset. */
  effectiveLineIds: Set<string>;
}

/**
 * Turns the commuter's favourite lines into one filter shared by departures,
 * disruptions, the timetable default, and the map. Unknown IDs are dropped so a
 * renamed or retired line cannot silently hide the whole network.
 */
export function useFavouriteLineFilter(
  favouriteLineIds: readonly string[],
  allLineIds: readonly string[],
): FavouriteLineFilter {
  const lineIds = useMemo(() => {
    const known = new Set(allLineIds);
    return new Set(favouriteLineIds.filter((id) => known.has(id)));
  }, [favouriteLineIds, allLineIds]);

  const effectiveLineIds = useMemo(
    () => (lineIds.size > 0 ? lineIds : new Set(allLineIds)),
    [lineIds, allLineIds],
  );

  const includes = useCallback((lineId: string) => lineIds.size === 0 || lineIds.has(lineId), [lineIds]);

  return useMemo(
    () => ({ lineIds, hasPreference: lineIds.size > 0, includes, effectiveLineIds }),
    [lineIds, includes, effectiveLineIds],
  );
}
