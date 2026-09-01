import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Header } from "../Header";
import { Footer } from "../Footer";
import { MobileTabBar } from "./MobileTabBar";
import { SectionErrorBoundary } from "./SectionErrorBoundary";
import { CollapsedSectionsProvider, useCollapsedSections } from "./collapsedSections";
import { SectionNavigationProvider } from "./sectionNavigation";
import { APP_SECTIONS, DEFAULT_SECTION_ID, sectionFromHash, type SectionId } from "./sections";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useNow } from "../../hooks/useNow";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import type { Theme } from "../../hooks/useTheme";
import type { CommuteController } from "../../hooks/useCommute";
import { describeFreshness } from "../../data/freshness";
import { cn } from "../../lib/utils";

const DESKTOP_QUERY = "(min-width: 1024px)";

interface AppShellProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  isScheduleOnly: boolean;
  generatedAtUtc: string | null;
  feedTimestampUtc: string | null;
  trainCount: number;
  alertCount: number;
  hasCriticalAlert: boolean;
  onRefresh: () => Promise<void> | void;
  commute: CommuteController;
  originName: string | null;
  destinationName: string | null;
  hideChrome?: boolean;
  onChangeCommute: () => void;
  onSectionChange?: (sectionId: SectionId) => void;
  sections: Record<SectionId, ReactNode>;
}

export function AppShell(props: AppShellProps) {
  return (
    <CollapsedSectionsProvider>
      <AppShellContent {...props} />
    </CollapsedSectionsProvider>
  );
}

function AppShellContent({
  theme,
  onThemeChange,
  isScheduleOnly,
  generatedAtUtc,
  feedTimestampUtc,
  trainCount,
  alertCount,
  hasCriticalAlert,
  onRefresh,
  commute,
  originName,
  destinationName,
  hideChrome,
  onChangeCommute,
  onSectionChange,
  sections,
}: AppShellProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const { expand } = useCollapsedSections();
  const freshnessNow = useNow(30_000);
  const freshness = useMemo(
    () =>
      describeFreshness(
        { generatedAtUtc: generatedAtUtc ?? "", feedTimestampUtc: feedTimestampUtc ?? undefined, isScheduleOnly },
        freshnessNow,
      ),
    [generatedAtUtc, feedTimestampUtc, isScheduleOnly, freshnessNow],
  );

  const [activeSection, setActiveSection] = useState<SectionId>(() =>
    sectionFromHash(window.location.hash.slice(1)),
  );
  const [openedSections, setOpenedSections] = useState<Set<SectionId>>(() => new Set([activeSection]));
  const mainRef = useRef<HTMLElement>(null);

  const pull = usePullToRefresh(mainRef, onRefresh, !isDesktop && activeSection === DEFAULT_SECTION_ID);

  const navigate = useCallback(
    (sectionId: SectionId) => {
      setActiveSection(sectionId);
      setOpenedSections((prev) => (prev.has(sectionId) ? prev : new Set(prev).add(sectionId)));
      expand(sectionId);
      onSectionChange?.(sectionId);
    },
    [expand, onSectionChange],
  );

  const goHome = useCallback(() => navigate(DEFAULT_SECTION_ID), [navigate]);

  useEffect(() => {
    const fragment = `#${activeSection}`;
    if (window.location.hash === fragment) return;
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}${fragment}`,
    );
  }, [activeSection]);

  return (
    <SectionNavigationProvider value={navigate}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <div className="sticky top-0 z-30">
          <Footer className="border-b border-border lg:hidden" />
          {!hideChrome && (
            <Header
              theme={theme}
              onThemeChange={onThemeChange}
              freshnessLabel={freshness.label}
              freshnessTone={freshness.tone}
              trainCount={trainCount}
              alertCount={alertCount}
              hasCriticalAlert={hasCriticalAlert}
              activeSection={activeSection}
              onNavigate={navigate}
              onHome={goHome}
              onChangeCommute={onChangeCommute}
              commute={commute}
              originName={originName}
              destinationName={destinationName}
            />
          )}
        </div>

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

        <main
          ref={mainRef}
          className={cn(
            "mx-auto w-full flex-1 px-4 py-6 sm:px-6",
            activeSection === "home" ? "max-w-6xl lg:py-10" : "max-w-6xl lg:py-8",
            !hideChrome && "max-lg:pb-tab-bar",
          )}
        >
          {APP_SECTIONS.filter(({ id }) => openedSections.has(id)).map(({ id, label }) => (
            <div key={id} className={cn(id !== activeSection && "hidden")}>
              <SectionErrorBoundary name={label}>{sections[id]}</SectionErrorBoundary>
            </div>
          ))}
        </main>

        <Footer className="mt-auto hidden border-t border-border lg:block" />
        {!hideChrome && (
          <MobileTabBar
            activeSection={activeSection}
            onSelect={navigate}
            alertCount={alertCount}
            hasCriticalAlert={hasCriticalAlert}
          />
        )}
      </div>
    </SectionNavigationProvider>
  );
}
