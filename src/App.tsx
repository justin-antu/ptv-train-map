import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { MapPinned } from "lucide-react";
import trainLogo from "./assets/train-logo.png";
import { AppShell } from "./components/layout/AppShell";
import { CommuteHome } from "./components/commute/CommuteHome";
import { FirstRun } from "./components/commute/FirstRun";
import { TimetableSection } from "./components/sections/TimetableSection";
import { DisruptionsSection } from "./components/sections/DisruptionsSection";
import { TooltipProvider } from "./components/ui/tooltip";
import { useTheme } from "./hooks/useTheme";
import { useStaticData } from "./hooks/useStaticData";
import { useLiveData } from "./hooks/useLiveData";
import { useTimetableData } from "./hooks/useTimetableData";
import { useCommute } from "./hooks/useCommute";
import { useFavouriteLineFilter } from "./hooks/useFavouriteLineFilter";
import { aggregateDisruptions, summariseLineDisruptions } from "./data/disruptions";
import { countActiveRuns } from "./trains/interpolate";
import { describeFreshness } from "./data/freshness";
import { APP_SHORT_TITLE, RUN_SHOW_BEFORE_FIRST_STOP_MS, RUN_STALE_AFTER_MS } from "./config";
import type { Selection } from "./shared/selection";

const NetworkSection = lazy(() =>
  import("./components/sections/NetworkSection").then((m) => ({ default: m.NetworkSection })),
);

export default function App() {
  const [theme, setTheme] = useTheme();
  const { data: staticData, error: staticDataError } = useStaticData();
  const [timetableEnabled, setTimetableEnabled] = useState(false);
  const timetable = useTimetableData(timetableEnabled);
  const live = useLiveData(timetable.data);
  const [selection, setSelection] = useState<Selection>(null);
  const [editingCommute, setEditingCommute] = useState(false);

  const allLineIds = useMemo(() => staticData?.lines.map((l) => l.id) ?? [], [staticData]);
  const commute = useCommute();
  const favouriteLineIds = useMemo(() => (commute.lineId ? [commute.lineId] : []), [commute.lineId]);
  const lineFilter = useFavouriteLineFilter(favouriteLineIds, allLineIds);

  const stationsById = useMemo(() => new Map((staticData?.stations ?? []).map((s) => [s.id, s])), [staticData]);
  const lineNameById = useMemo(() => new Map((staticData?.lines ?? []).map((l) => [l.id, l.name])), [staticData]);
  const lineColorById = useMemo(() => new Map((staticData?.lines ?? []).map((l) => [l.id, l.color])), [staticData]);
  const routeLineIds = useMemo(() => {
    if (commute.lineId) return new Set([commute.lineId]);
    const originLines = stationsById.get(commute.originStationId ?? "")?.lineIds ?? [];
    const destinationLines = new Set(stationsById.get(commute.destinationStationId ?? "")?.lineIds ?? []);
    return new Set(originLines.filter((id) => destinationLines.has(id)));
  }, [commute.lineId, commute.originStationId, commute.destinationStationId, stationsById]);

  useEffect(() => {
    if (live.needsScheduleFallback) setTimetableEnabled(true);
  }, [live.needsScheduleFallback]);

  const trainsRunningNow = useMemo(
    () => countActiveRuns(live.runs, Date.now(), { staleAfterMs: RUN_STALE_AFTER_MS, showBeforeFirstStopMs: RUN_SHOW_BEFORE_FIRST_STOP_MS }),
    [live.runs],
  );

  const alertCount = useMemo(
    () => aggregateDisruptions(live.disruptionsByLine, allLineIds).length,
    [live.disruptionsByLine, allLineIds],
  );

  const linesActive = useMemo(() => new Set(live.runs.map((run) => run.lineId)).size, [live.runs]);

  const boardLineIds = useMemo(() => {
    const relevant = new Set<string>();
    if (lineFilter.hasPreference) {
      for (const lineId of lineFilter.lineIds) relevant.add(lineId);
    } else {
      for (const stationId of [commute.originStationId, commute.destinationStationId]) {
        const station = stationId ? stationsById.get(stationId) : undefined;
        for (const lineId of station?.lineIds ?? []) relevant.add(lineId);
      }
    }
    return allLineIds.filter((lineId) => relevant.has(lineId));
  }, [lineFilter, commute.originStationId, commute.destinationStationId, stationsById, allLineIds]);

  const boardDisruptions = useMemo(
    () => summariseLineDisruptions(live.disruptionsByLine, boardLineIds),
    [live.disruptionsByLine, boardLineIds],
  );

  const criticalIncident = useMemo(() => {
    if (boardDisruptions.criticalCount === 0) return null;
    return (
      aggregateDisruptions(live.disruptionsByLine, boardLineIds).find((incident) => incident.severity === "critical")
      ?? null
    );
  }, [boardDisruptions.criticalCount, live.disruptionsByLine, boardLineIds]);

  const freshness = describeFreshness(
    { generatedAtUtc: live.generatedAtUtc ?? "", feedTimestampUtc: live.feedTimestampUtc ?? undefined, isScheduleOnly: live.isScheduleOnly },
    Date.now(),
  );

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
        <p className="text-sm text-muted-foreground">Loading {APP_SHORT_TITLE}…</p>
      </div>
    );
  }

  const originName = commute.originStationId ? stationsById.get(commute.originStationId)?.name ?? null : null;
  const destinationName = commute.destinationStationId
    ? stationsById.get(commute.destinationStationId)?.name ?? null
    : null;

  return (
    <TooltipProvider>
      <AppShell
        theme={theme}
        onThemeChange={setTheme}
        isScheduleOnly={live.isScheduleOnly}
        generatedAtUtc={live.generatedAtUtc}
        feedTimestampUtc={live.feedTimestampUtc}
        trainCount={trainsRunningNow}
        alertCount={alertCount}
        hasCriticalAlert={boardDisruptions.criticalCount > 0}
        onRefresh={live.refresh}
        commute={commute}
        originName={originName}
        destinationName={destinationName}
        hideChrome={commute.needsSetup && !editingCommute}
        onChangeCommute={() => setEditingCommute(true)}
        onSectionChange={(sectionId) => {
          if (sectionId === "timetable") setTimetableEnabled(true);
        }}
        sections={{
          home: commute.needsSetup || editingCommute ? (
            <FirstRun
              stations={staticData.stations}
              lines={staticData.lines}
              initialHomeId={commute.homeStationId}
              initialWorkId={commute.workStationId}
              onComplete={(homeId, workId) => {
                commute.setup(homeId, workId);
                setEditingCommute(false);
              }}
              onCancel={editingCommute ? () => setEditingCommute(false) : undefined}
            />
          ) : (
            <CommuteHome
              lines={staticData.lines}
              stationsById={stationsById}
              runs={live.runs}
              lineNameById={lineNameById}
              lineColorById={lineColorById}
              commute={commute}
              criticalIncident={criticalIncident}
              isInitialising={live.isInitialising}
              isScheduleOnly={live.isScheduleOnly}
              freshnessDetail={freshness.detail}
              trainsRunning={trainsRunningNow}
              linesActive={linesActive}
            />
          ),
          network: (
            <Suspense fallback={<NetworkSectionFallback />}>
              <NetworkSection
                staticData={staticData}
                stationsById={stationsById}
                lineNameById={lineNameById}
                lineColorById={lineColorById}
                runs={live.runs}
                routeLineIds={routeLineIds}
                selection={selection}
                onStationSelect={handleStationSelect}
                onTrainSelect={handleTrainSelect}
                onBackgroundClick={handleBackgroundClick}
                onClearSelection={handleBackgroundClick}
                theme={theme}
              />
            </Suspense>
          ),
          timetable: (
            <TimetableSection
              data={timetable.data}
              loading={timetable.loading || !timetableEnabled}
              error={timetable.error}
              scopeLineId={commute.lineId}
              onClearScope={() => commute.setLine(null)}
              focus={null}
            />
          ),
          alerts: (
            <DisruptionsSection
              disruptionsByLine={live.disruptionsByLine}
              lineOrder={allLineIds}
              lineNameById={lineNameById}
              lineColorById={lineColorById}
              scopeLineId={commute.lineId}
              onScopeLineChange={commute.setLine}
            />
          ),
        }}
      />
    </TooltipProvider>
  );
}

function NetworkSectionFallback() {
  return (
    <div
      className="flex h-[42vh] min-h-[300px] flex-col items-center justify-center gap-3 rounded-sm border border-border bg-muted/40 lg:h-[34rem]"
      role="status"
      aria-label="Loading the network map"
    >
      <MapPinned className="size-7 text-muted-foreground/50 motion-safe:animate-pulse" aria-hidden="true" />
      <p className="text-xs text-muted-foreground">Loading the network map…</p>
    </div>
  );
}
