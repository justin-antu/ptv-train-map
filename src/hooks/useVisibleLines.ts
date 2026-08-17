import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const VISIBLE_LINES_STORAGE_KEY = "wimt:visibleLineIds";

/** Reads the raw stored line-id list, or `null` if the user has never made an explicit selection yet. */
function loadStoredIds(): string[] | null {
  try {
    const raw = localStorage.getItem(VISIBLE_LINES_STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === "string");
    }
  } catch {
    // Malformed/inaccessible storage (corrupted JSON, private-browsing quota, etc.) — fall through to "no preference".
  }
  return null;
}

function saveStoredIds(ids: readonly string[]): void {
  try {
    localStorage.setItem(VISIBLE_LINES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Ignore write failures (e.g. storage disabled/full) — visibility still works for this session.
  }
}

export interface VisibleLinesController {
  visible: Set<string>;
  toggleLine(lineId: string): void;
  showAll(): void;
  hideAll(): void;
  /** Ensures every given line id is visible (e.g. from a search result pick), without hiding any others. */
  ensureVisible(lineIds: Iterable<string>): void;
}

/**
 * Tracks which lines are currently shown on the map, persisted per the
 * legend's show/hide selection.
 *
 * `allLineIds` isn't known yet on the very first render (the static
 * line/station data is still loading asynchronously at that point), so we
 * deliberately do NOT bake "default to every line visible" into a one-shot
 * `useState` lazy initializer keyed off `allLineIds` — that pattern only runs
 * once, on mount, and would permanently capture an empty set (since
 * `allLineIds` is `[]` on that very first render), leaving every line hidden
 * for the rest of the session regardless of when data actually finishes
 * loading. Instead, `storedIds` only ever holds an *explicit* user
 * selection (or `null` before one exists), and the effective `visible` set
 * falls back to "all currently known lines" whenever there's no explicit
 * selection yet — recomputed on every render, so it naturally becomes
 * correct as soon as `allLineIds` is populated.
 */
export function useVisibleLines(allLineIds: readonly string[]): VisibleLinesController {
  const [storedIds, setStoredIds] = useState<string[] | null>(() => loadStoredIds());
  const allLineIdsRef = useRef(allLineIds);
  allLineIdsRef.current = allLineIds;

  useEffect(() => {
    if (storedIds !== null) saveStoredIds(storedIds);
  }, [storedIds]);

  const visible = useMemo(() => {
    if (storedIds === null) return new Set(allLineIds);
    // Filter against the current line list so a stale/renamed id from an
    // older version of the app can't leave a permanently-invisible entry.
    const known = new Set(allLineIds);
    return new Set(storedIds.filter((id) => known.has(id)));
  }, [storedIds, allLineIds]);

  const toggleLine = useCallback((lineId: string) => {
    setStoredIds((prev) => {
      const base = new Set(prev ?? allLineIdsRef.current);
      if (base.has(lineId)) base.delete(lineId);
      else base.add(lineId);
      return [...base];
    });
  }, []);

  const showAll = useCallback(() => {
    setStoredIds([...allLineIdsRef.current]);
  }, []);

  const hideAll = useCallback(() => {
    setStoredIds([]);
  }, []);

  const ensureVisible = useCallback((lineIds: Iterable<string>) => {
    setStoredIds((prev) => {
      const base = new Set(prev ?? allLineIdsRef.current);
      let changed = prev === null;
      for (const id of lineIds) {
        if (!base.has(id)) {
          base.add(id);
          changed = true;
        }
      }
      return changed ? [...base] : prev;
    });
  }, []);

  return { visible, toggleLine, showAll, hideAll, ensureVisible };
}
