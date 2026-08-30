import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { CommuteSection } from "./components/sections/CommuteSection";
import { LiveDeparturesSection } from "./components/sections/LiveDeparturesSection";
import { RoutePlannerSection } from "./components/sections/RoutePlannerSection";
import { NetworkSection } from "./components/sections/NetworkSection";
import { TimetableSection } from "./components/sections/TimetableSection";
import { DisruptionsSection } from "./components/sections/DisruptionsSection";
import { CommuteSettingsDialog } from "./components/CommuteSettingsDialog";
import type { MapViewHandle } from "./components/MapView";
import { TooltipProvider } from "./components/ui/tooltip";
import { useTheme } from "./hooks/useTheme";
import { useStaticData } from "./hooks/useStaticData";
import { useLiveData } from "./hooks/useLiveData";
import { useTimetableData } from "./hooks/useTimetableData";
import { useCommutePreferences } from "./hooks/useCommutePreferences";
import { useFavouriteLineFilter } from "./hooks/useFavouriteLineFilter";
import { useNotifications } from "./hooks/useNotifications";
import { aggregateDisruptions, summariseLineDisruptions } from "./data/disruptions";
import { defaultCommuteDirection, otherDirection } from "./shared/commute";
import { countActiveRuns } from "./trains/interpolate";
import { APP_TITLE, RUN_SHOW_BEFORE_FIRST_STOP_MS, RUN_STALE_AFTER_MS } from "./config";
import type { Selection } from "./shared/selection";
import type { StationStatic } from "./shared/types";

export default function App() {
  const [theme, setTheme] = useTheme();
  const { data: staticData, error: staticDataError } = useStaticData();
  const live = useLiveData(staticData);
  const timetable = useTimetableData();
  const [selection, setSelection] = useState<Selection>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mapRef = useRef<MapViewHandle>(null);

  const allLineIds = useMemo(() => staticData?.lines.map((l) => l.id) ?? [], [staticData]);
  const commute = useCommutePreferences();
  const lineFilter = useFavouriteLineFilter(commute.favouriteLineIds, allLineIds);
  const preferredDirection = useMemo(() => defaultCommuteDirection(), []);

  const stationsById = useMemo(() => new Map((staticData?.stations ?? []).map((s) => [s.id, s])), [staticData]);
  const lineNameById = useMemo(() => new Map((staticData?.lines ?? []).map((l) => [l.id, l.name])), [staticData]);
  const lineColorById = useMemo(() => new Map((staticData?.lines ?? []).map((l) => [l.id, l.color])), [staticData]);

  // Notifications follow the time-of-day leg rather than whichever tab is on
  // screen, so glancing at the return trip does not move the alerts.
  const notifyStationId = useMemo(
    () => commute.stationIdFor(preferredDirection) ?? commute.stationIdFor(otherDirection(preferredDirection)),
    [commute, preferredDirection],
  );
  const notifyStation = notifyStationId ? stationsById.get(notifyStationId) : undefined;
  const notifications = useNotifications(notifyStationId, notifyStation, live.runs);

  // Count only runs within the active display window. The snapshot also
  // contains future departures. Recompute once per live-data refresh.
  const trainsRunningNow = useMemo(
    () => countActiveRuns(live.runs, Date.now(), { staleAfterMs: RUN_STALE_AFTER_MS, showBeforeFirstStopMs: RUN_SHOW_BEFORE_FIRST_STOP_MS }),
    [live.runs],
  );

  const alertCount = useMemo(
    () => aggregateDisruptions(live.disruptionsByLine, allLineIds).length,
    [live.disruptionsByLine, allLineIds],
  );

  const linesActive = useMemo(() => new Set(live.runs.map((run) => run.lineId)).size, [live.runs]);

  /**
   * Lines worth warning this commuter about: their chosen lines, or failing
   * that, whichever lines serve their commute stations.
   */
  const commuteDisruptions = useMemo(() => {
    const relevant = new Set<string>();
    if (lineFilter.hasPreference) {
      for (const lineId of lineFilter.lineIds) relevant.add(lineId);
    } else {
      for (const stationId of [commute.toCityStationId, commute.fromCityStationId]) {
        const station = stationId ? stationsById.get(stationId) : undefined;
        for (const lineId of station?.lineIds ?? []) relevant.add(lineId);
      }
    }
    return summariseLineDisruptions(
      live.disruptionsByLine,
      allLineIds.filter((lineId) => relevant.has(lineId)),
    );
  }, [lineFilter, commute.toCityStationId, commute.fromCityStationId, stationsById, allLineIds, live.disruptionsByLine]);

  // Prompt once on a first visit so the commute board is never left empty
  // without an obvious way to fill it.
  useEffect(() => {
    if (staticData && !commute.hasCommute) setSettingsOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticData]);

  const flyToAndSelect = useCallback((station: StationStatic) => {
    mapRef.current?.flyToStation(station);
    setSelection({ kind: "station", stationId: station.id });
  }, []);

  const handleStationSelect = useCallback((stationId: string) => {
    setSelection({ kind: "station", stationId });
  }, []);

  const handleTrainSelect = useCallback((pos: { lineId: string; runRef: string }) => {
    setSelection({ kind: "train", lineId: pos.lineId, runRef: pos.runRef });
  }, []);

  const handleBackgroundClick = useCallback(() => setSelection(null), []);

  if (staticDataError) {
    return (
      <div className="flex h-dvh items-center justify-center p-8 text-center">
        <div>
          <h1 className="type-heading text-xl">Something went wrong loading the map</h1>
          <p className="mt-2 text-sm text-muted-foreground">{staticDataError.message}</p>
        </div>
      </div>
    );
  }

  if (!staticData) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 text-center">
        <span className="animate-bounce text-4xl">🚆</span>
        <p className="text-sm text-muted-foreground">Loading {APP_TITLE}…</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <AppShell
        theme={theme}
        onThemeChange={setTheme}
        isDemo={live.isDemo}
        generatedAtUtc={live.generatedAtUtc}
        trainCount={trainsRunningNow}
        alertCount={alertCount}
        hasCriticalAlert={commuteDisruptions.criticalLineIds.length > 0}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefresh={live.refresh}
        sections={{
          commute: (
            <div className="flex flex-col gap-3 sm:gap-4">
              <CommuteSection
                commute={commute}
                stationsById={stationsById}
                runs={live.runs}
                lineNameById={lineNameById}
                lineColorById={lineColorById}
                lineFilter={lineFilter}
                disruptionSummary={commuteDisruptions}
                notificationsEnabled={notifications.enabled}
                generatedAtUtc={live.generatedAtUtc}
                isDemo={live.isDemo}
                onOpenSettings={() => setSettingsOpen(true)}
                onStationClick={flyToAndSelect}
              />
              <LiveDeparturesSection
                commute={commute}
                stationsById={stationsById}
                runs={live.runs}
                lineNameById={lineNameById}
                lineColorById={lineColorById}
                lineFilter={lineFilter}
                initialDirection={preferredDirection}
              />
              <RoutePlannerSection />
            </div>
          ),
          network: (
            <NetworkSection
              ref={mapRef}
              staticData={staticData}
              stationsById={stationsById}
              lineNameById={lineNameById}
              lineColorById={lineColorById}
              runs={live.runs}
              visibleLineIds={lineFilter.effectiveLineIds}
              disruptionsByLine={live.disruptionsByLine}
              selection={selection}
              commute={commute}
              trainsRunning={trainsRunningNow}
              linesActive={linesActive}
              disruptionCount={alertCount}
              onStationSelect={handleStationSelect}
              onTrainSelect={handleTrainSelect}
              onBackgroundClick={handleBackgroundClick}
              onClearSelection={handleBackgroundClick}
            />
          ),
          timetable: (
            <TimetableSection
              data={timetable.data}
              loading={timetable.loading}
              error={timetable.error}
              disruptionsByLine={live.disruptionsByLine}
            />
          ),
          alerts: (
            <DisruptionsSection
              disruptionsByLine={live.disruptionsByLine}
              lineOrder={allLineIds}
              lineNameById={lineNameById}
              lineColorById={lineColorById}
              lineFilter={lineFilter}
            />
          ),
        }}
      />

      <CommuteSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        stations={staticData.stations}
        lines={staticData.lines}
        commute={commute}
        notifications={notifications}
      />
    </TooltipProvider>
  );
}
