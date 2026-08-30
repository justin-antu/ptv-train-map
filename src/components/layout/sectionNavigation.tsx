import { createContext, useContext } from "react";
import type { SectionId } from "./sections";

/**
 * Lets content nested inside a section move the reader to another section —
 * switching tabs on mobile, or scrolling on desktop. Provided by `AppShell`.
 */
const SectionNavigationContext = createContext<(sectionId: SectionId) => void>(() => {});

export const SectionNavigationProvider = SectionNavigationContext.Provider;

export function useSectionNavigation(): (sectionId: SectionId) => void {
  return useContext(SectionNavigationContext);
}
