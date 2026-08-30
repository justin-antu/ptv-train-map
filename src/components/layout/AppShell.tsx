import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Header } from "../Header";
import { Footer } from "../Footer";
import { MobileTabBar } from "./MobileTabBar";
import { SectionErrorBoundary } from "./SectionErrorBoundary";
import { SectionNavigationProvider } from "./sectionNavigation";
import { APP_SECTIONS, DEFAULT_SECTION_ID, isSectionId, type SectionId } from "./sections";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import type { Theme } from "../../hooks/useTheme";
import { cn } from "../../lib/utils";

const DESKTOP_QUERY = "(min-width: 1024px)";

interface AppShellProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  isDemo: boolean;
  generatedAtUtc: string | null;
  trainCount: number;
  alertCount: number;
  hasCriticalAlert: boolean;
  onOpenSettings: () => void;
  onRefresh: () => Promise<void> | void;
  /** Rendered content for each section, keyed by section id. */
  sections: Record<SectionId, ReactNode>;
}

/**
 * Owns the shared chrome and the two layout modes: a single scrolling page on
 * desktop, and one section at a time behind a bottom tab bar on mobile.
 *
 * Mobile keeps a section mounted once it has been opened, so returning to the
 * Network tab does not pay to rebuild the MapLibre instance, while the map is
 * still never created for a commuter who only ever checks their departures.
 */
export function AppShell({
  theme,
  onThemeChange,
  isDemo,
  generatedAtUtc,
  trainCount,
  alertCount,
  hasCriticalAlert,
  onOpenSettings,
  onRefresh,
  sections,
}: AppShellProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // A shared link or a reload lands on the section named in the URL fragment.
  const [activeSection, setActiveSection] = useState<SectionId>(() => {
    const fragment = window.location.hash.slice(1);
    return isSectionId(fragment) ? fragment : DEFAULT_SECTION_ID;
  });
  const [openedSections, setOpenedSections] = useState<Set<SectionId>>(() => new Set([activeSection]));
  const mainRef = useRef<HTMLElement>(null);

  const pull = usePullToRefresh(mainRef, onRefresh, !isDesktop && activeSection === DEFAULT_SECTION_ID);

  const navigate = useCallback(
    (sectionId: SectionId) => {
      setActiveSection(sectionId);
      setOpenedSections((prev) => (prev.has(sectionId) ? prev : new Set(prev).add(sectionId)));
      if (isDesktop) {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [isDesktop],
  );

  // Keep the fragment current so the view can be shared or reloaded, without
  // filling the back stack with tab switches.
  useEffect(() => {
    const fragment = `#${activeSection}`;
    if (window.location.hash !== fragment) window.history.replaceState(null, "", fragment);
  }, [activeSection]);

  // On desktop every section is on one page, so the nav highlight follows
  // whichever section is currently in view.
  useEffect(() => {
    if (!isDesktop) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const topMost = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (topMost && isSectionId(topMost.target.id)) setActiveSection(topMost.target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );

    for (const { id } of APP_SECTIONS) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [isDesktop]);

  return (
    <SectionNavigationProvider value={navigate}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Header
          theme={theme}
          onThemeChange={onThemeChange}
          isDemo={isDemo}
          generatedAtUtc={generatedAtUtc}
          trainCount={trainCount}
          activeSection={activeSection}
          onNavigate={navigate}
          onOpenSettings={onOpenSettings}
        />

        {(pull.distance > 0 || pull.refreshing) && (
          <div
            className="flex items-center justify-center overflow-hidden text-muted-foreground lg:hidden"
            style={{ height: pull.refreshing ? 40 : pull.distance }}
            aria-hidden="true"
          >
            {pull.refreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className={cn("size-4 transition-colors", pull.armed && "text-brand")} />
            )}
          </div>
        )}

        <main ref={mainRef} className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-6 lg:py-8">
          {isDesktop ? (
            <div className="flex flex-col gap-4">
              {APP_SECTIONS.map(({ id, label }) => (
                <SectionErrorBoundary key={id} name={label}>
                  {sections[id]}
                </SectionErrorBoundary>
              ))}
            </div>
          ) : (
            APP_SECTIONS.filter(({ id }) => openedSections.has(id)).map(({ id, label }) => (
              <div key={id} className={cn(id !== activeSection && "hidden")}>
                <SectionErrorBoundary name={label}>{sections[id]}</SectionErrorBoundary>
              </div>
            ))
          )}
        </main>

        <div className="pb-tab-bar lg:pb-0">
          <Footer />
        </div>

        <MobileTabBar activeSection={activeSection} onSelect={navigate} alertCount={alertCount} hasCriticalAlert={hasCriticalAlert} />
      </div>
    </SectionNavigationProvider>
  );
}
