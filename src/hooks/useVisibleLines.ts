import { useCallback, useEffect, useState } from "react";

const VISIBLE_LINES_STORAGE_KEY = "wimt:visibleLineIds";

function loadVisibleLineIds(allLineIds: readonly string[]): Set<string> {
  try {
    const raw = localStorage.getItem(VISIBLE_LINES_STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Filter against the current line list so a stale/renamed id from an
        // older version of the app can't leave a permanently-invisible entry.
        return new Set(parsed.filter((id): id is string => typeof id === "string" && allLineIds.includes(id)));
      }
    }
  } catch {
    // Malformed/inaccessible storage (corrupted JSON, private-browsing quota, etc.) — fall through to default.
  }
  // No stored preference yet (first-ever visit, or cleared storage): default to every line visible.
  return new Set(allLineIds);
}

function saveVisibleLineIds(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(VISIBLE_LINES_STORAGE_KEY, JSON.stringify([...ids]));
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

/** Tracks which lines are currently shown on the map, persisted per the legend's show/hide selection. */
export function useVisibleLines(allLineIds: readonly string[]): VisibleLinesController {
  const [visible, setVisible] = useState<Set<string>>(() => loadVisibleLineIds(allLineIds));

  useEffect(() => {
    saveVisibleLineIds(visible);
  }, [visible]);

  const toggleLine = useCallback((lineId: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }, []);

  const showAll = useCallback(() => {
    setVisible(new Set(allLineIds));
  }, [allLineIds]);

  const hideAll = useCallback(() => {
    setVisible(new Set());
  }, []);

  const ensureVisible = useCallback((lineIds: Iterable<string>) => {
    setVisible((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of lineIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  return { visible, toggleLine, showAll, hideAll, ensureVisible };
}
