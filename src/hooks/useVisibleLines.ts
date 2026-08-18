import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const VISIBLE_LINES_STORAGE_KEY = "wimt:visibleLineIds";

/** Returns the stored line IDs, or `null` when no explicit selection exists. */
function loadStoredIds(): string[] | null {
  try {
    const raw = localStorage.getItem(VISIBLE_LINES_STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === "string");
    }
  } catch {
    // Treat malformed or inaccessible storage as no saved preference.
  }
  return null;
}

function saveStoredIds(ids: readonly string[]): void {
  try {
    localStorage.setItem(VISIBLE_LINES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Visibility remains available in memory when storage writes fail.
  }
}

export interface VisibleLinesController {
  visible: Set<string>;
  toggleLine(lineId: string): void;
  showAll(): void;
  hideAll(): void;
  /** Adds the supplied line IDs to the visible set without hiding other lines. */
  ensureVisible(lineIds: Iterable<string>): void;
}

/**
 * Tracks and persists the lines shown on the map.
 *
 * Static data is unavailable during the initial render. `null` therefore
 * represents the default of all currently known lines, while an array
 * represents an explicit selection. This prevents the initial empty line list
 * from becoming a permanent hidden-lines state.
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
    // Remove stale or renamed IDs that are absent from the current line list.
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
