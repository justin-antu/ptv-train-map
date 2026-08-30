import { useCallback, useMemo, useRef, useState } from "react";
import trainLogo from "./assets/train-logo.png";
import { AppShell } from "./components/layout/AppShell";
import { LiveDeparturesSection } from "./components/sections/LiveDeparturesSection";
import { RoutePlannerSection } from "./components/sections/RoutePlannerSection";
import { NetworkSection } from "./components/sections/NetworkSection";
import { TimetableSection } from "./components/sections/TimetableSection";
import { DisruptionsSection } from "./components/sections/DisruptionsSection";
import type { MapViewHandle } from "./components/MapView";
import { TooltipProvider } from "./components/ui/tooltip";
import { useTheme } from "./hooks/useTheme";
import { useStaticData } from "./hooks/useStaticData";
import { useLiveData } from "./hooks/useLiveData";
import { useTimetableData } from "./hooks/useTimetableData";
import { useDeparturePreferences } from "./hooks/useDeparturePreferences";
import { useFavouriteLineFilter } from "./hooks/useFavouriteLineFilter";
import { useNotifications } from "./hooks/useNotifications";
import { aggregateDisruptions, summariseLineDisruptions } from "./data/disruptions";
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
  const mapRef = useRef<MapViewHandle>(null);

  const allLineIds = useMemo(() => staticData?.lines.map((l) => l.id) ?? [], [staticData]);
  const preferences = useDeparturePreferences();
  // One chosen line narrows the whole app; no choice means the whole network.
  const favouriteLineIds = useMemo(() => (preferences.lineId ? [preferences.lineId] : []), [preferences.lineId]);
  const lineFilter = useFavouriteLineFilter(favouriteLineIds, allLineIds);

  const stationsById = useMemo(() => new Map((staticData?.stations ?? []).map((s) => [s.id, s])), [staticData]);
  const lineNameById = useMemo(() => new Map((staticData?.lines ?? []).map((l) => [l.id, l.name])), [staticData]);
  const lineColorById = useMemo(() => new Map((staticData?.lines ?? []).map((l) => [l.id, l.color])), [staticData]);

  // Arrival alerts follow the board's origin, which is the platform the
  // commuter is actually standing on.
  const notifyStation = preferences.originStationId ? stationsById.get(preferences.originStationId) : undefined;
  const notifications = useNotifications(preferences.originStationId, notifyStation, live.runs);

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
   * Lines worth warning this commuter about: their chosen line, or failing
   * that, whichever lines serve the stations on their board.
   */
  const boardDisruptions = useMemo(() => {
    const relevant = new Set<string>();
    if (lineFilter.hasPreference) {
      for (const lineId of lineFilter.lineIds) relevant.add(lineId);
    } else {
      for (const stationId of [preferences.originStationId, preferences.destinationStationId]) {
        const station = stationId ? stationsById.get(stationId) : undefined;
        for (const lineId of station?.lineIds ?? []) relevant.add(lineId);
      }
    }
    return summariseLineDisruptions(
      live.disruptionsByLine,
      allLineIds.filter((lineId) => relevant.has(lineId)),
    );
  }, [
    lineFilter,
    preferences.originStationId,
    preferences.destinationStationId,
    stationsById,
    allLineIds,
    live.disruptionsByLine,
  ]);

  const flyToAndSelect = useCallback((station: StationStatic) => {
    setSelection({ kind: "station", stationId: station.id });
    mapRef.current?.flyToStation(station);
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
        <img src={trainLogo} alt="" width={193} height={108} className="h-12 w-auto animate-bounce select-none sm:h-14" />
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
        hasCriticalAlert={boardDisruptions.criticalCount > 0}
        onRefresh={live.refresh}
        sections={{
          departures: (
            <LiveDeparturesSection
              lines={staticData.lines}
              stations={staticData.stations}
              stationsById={stationsById}
              runs={live.runs}
              lineNameById={lineNameById}
              lineColorById={lineColorById}
              preferences={preferences}
              disruptionSummary={boardDisruptions}
              notifications={notifications}
              generatedAtUtc={live.generatedAtUtc}
              isDemo={live.isDemo}
              onShowOnMap={flyToAndSelect}
            />
          ),
          planner: <RoutePlannerSection />,
          network: (
            <NetworkSection
              ref={mapRef}
              staticData={staticData}
              stationsById={stationsById}
              lineNameById={lineNameById}
              lineColorById={lineColorById}
              runs={live.runs}
              visibleLineIds={lineFilter.effectiveLineIds}
              selection={selection}
              preferences={preferences}
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
    </TooltipProvider>
  );
}
