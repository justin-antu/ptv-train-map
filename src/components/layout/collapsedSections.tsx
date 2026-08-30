import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "wimt:collapsedSections";

type CollapsedMap = Record<string, boolean>;

function readCollapsed(): CollapsedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === "boolean"),
      ) as CollapsedMap;
    }
  } catch {
    // Treat malformed or inaccessible storage as "everything expanded".
  }
  return {};
}

function writeCollapsed(next: CollapsedMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Collapse state is a convenience; losing it is not worth surfacing.
  }
}

interface CollapsedSectionsController {
  /** `defaultCollapsed` applies only until the reader has toggled this card. */
  isCollapsed(id: string, defaultCollapsed: boolean): boolean;
  toggle(id: string, defaultCollapsed: boolean): void;
  expand(id: string): void;
}

const CollapsedSectionsContext = createContext<CollapsedSectionsController | null>(null);

/**
 * Shared collapse state for every `SectionCard`.
 *
 * Held above the cards so navigation can open a collapsed section: a nav link
 * that scrolled to a collapsed card would otherwise look broken. One
 * `localStorage` record covers all cards.
 */
export function CollapsedSectionsProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<CollapsedMap>(readCollapsed);

  const controller = useMemo<CollapsedSectionsController>(() => {
    const update = (next: CollapsedMap) => {
      writeCollapsed(next);
      setCollapsed(next);
    };

    return {
      isCollapsed: (id, defaultCollapsed) => collapsed[id] ?? defaultCollapsed,
      toggle: (id, defaultCollapsed) => update({ ...collapsed, [id]: !(collapsed[id] ?? defaultCollapsed) }),
      expand: (id) => {
        if (collapsed[id] === false) return;
        update({ ...collapsed, [id]: false });
      },
    };
  }, [collapsed]);

  return <CollapsedSectionsContext.Provider value={controller}>{children}</CollapsedSectionsContext.Provider>;
}

export function useCollapsedSections(): CollapsedSectionsController {
  const controller = useContext(CollapsedSectionsContext);
  if (!controller) throw new Error("useCollapsedSections requires CollapsedSectionsProvider");
  return controller;
}

/** Collapse state and toggle for a single card. */
export function useCollapsedSection(id: string, defaultCollapsed: boolean) {
  const controller = useCollapsedSections();
  return {
    collapsed: controller.isCollapsed(id, defaultCollapsed),
    toggle: useCallback(() => controller.toggle(id, defaultCollapsed), [controller, id, defaultCollapsed]),
  };
}
