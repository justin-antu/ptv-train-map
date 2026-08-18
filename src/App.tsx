import { useCallback, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { MapView, type MapViewHandle } from "./components/MapView";
import { LeftPane } from "./components/panels/LeftPane";
import { LineTimetable } from "./components/panels/LineTimetable";
import { BorderBeam } from "./components/ui/border-beam";
import { TooltipProvider } from "./components/ui/tooltip";
import { useTheme } from "./hooks/useTheme";
import { useStaticData } from "./hooks/useStaticData";
import { useLiveData } from "./hooks/useLiveData";
import { useTimetableData } from "./hooks/useTimetableData";
import { useVisibleLines } from "./hooks/useVisibleLines";
import { useFavouriteStation } from "./hooks/useFavouriteStation";
import { useNotifications } from "./hooks/useNotifications";
import { countActiveRuns } from "./trains/interpolate";
import { RUN_SHOW_BEFORE_FIRST_STOP_MS, RUN_STALE_AFTER_MS } from "./config";
import type { Selection } from "./shared/selection";
import type { StationStatic } from "./shared/types";
import { APP_TITLE, NETWORK_SUBTITLE } from "./config";

export default function App() {
  const [theme, setTheme] = useTheme();
  const { data: staticData, error: staticDataError } = useStaticData();
  const live = useLiveData(staticData);
  const timetable = useTimetableData();
  const [selection, setSelection] = useState<Selection>(null);
  const mapRef = useRef<MapViewHandle>(null);

  const allLineIds = useMemo(() => staticData?.lines.map((l) => l.id) ?? [], [staticData]);
  const visibleLines = useVisibleLines(allLineIds);
  const favourite = useFavouriteStation();

  const stationsById = useMemo(() => new Map((staticData?.stations ?? []).map((s) => [s.id, s])), [staticData]);
  const lineNameById = useMemo(() => new Map((staticData?.lines ?? []).map((l) => [l.id, l.name])), [staticData]);
  const lineColorById = useMemo(() => new Map((staticData?.lines ?? []).map((l) => [l.id, l.color])), [staticData]);

  const favouriteStation = favourite.favouriteId ? stationsById.get(favourite.favouriteId) : undefined;
  const notifications = useNotifications(favourite.favouriteId, favouriteStation, live.runs);

  // Count only runs within the active display window. The snapshot also
  // contains future departures. Recompute once per live-data refresh.
  const trainsRunningNow = useMemo(
    () => countActiveRuns(live.runs, Date.now(), { staleAfterMs: RUN_STALE_AFTER_MS, showBeforeFirstStopMs: RUN_SHOW_BEFORE_FIRST_STOP_MS }),
    [live.runs],
  );

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
      <div className="flex min-h-dvh flex-col bg-background text-foreground lg:h-dvh lg:overflow-hidden">
        <Header theme={theme} onThemeChange={setTheme} isDemo={live.isDemo} generatedAtUtc={live.generatedAtUtc} trainCount={trainsRunningNow} />

        <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[20%_60%_20%] lg:grid-rows-[1fr] lg:overflow-hidden">
          <aside className="side-pane-grid thin-scrollbar order-2 border-t border-border p-3 lg:order-none lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-r">
            <LeftPane
              staticData={staticData}
              stationsById={stationsById}
              lineNameById={lineNameById}
              lineColorById={lineColorById}
              runs={live.runs}
              selection={selection}
              onClearSelection={handleBackgroundClick}
              onStationSearchSelect={flyToAndSelect}
              onFavouriteStationClick={flyToAndSelect}
              visibleLines={visibleLines}
              disruptionsByLine={live.disruptionsByLine}
              favourite={favourite}
              notifications={notifications}
            />
          </aside>

          <main
            className="relative isolate order-1 h-[58vh] min-h-[340px] overflow-hidden lg:order-none lg:h-full lg:min-h-0"
            aria-label={`${NETWORK_SUBTITLE} live map`}
          >
            <MapView
              ref={mapRef}
              staticData={staticData}
              stationsById={stationsById}
              lineColorById={lineColorById}
              runs={live.runs}
              visibleLineIds={visibleLines.visible}
              onStationSelect={handleStationSelect}
              onTrainSelect={handleTrainSelect}
              onBackgroundClick={handleBackgroundClick}
            />
            <BorderBeam
              size={140}
              duration={10}
              borderWidth={1}
              colorFrom="rgba(148, 163, 184, 0.3)"
              colorTo="rgba(0, 114, 206, 0.82)"
              className="opacity-70 dark:opacity-60"
            />
          </main>

          <aside className="side-pane-grid order-3 h-[42rem] min-h-[32rem] border-t border-border p-3 lg:order-none lg:block lg:h-full lg:min-h-0 lg:border-t-0 lg:border-l">
            <LineTimetable
              data={timetable.data}
              loading={timetable.loading}
              error={timetable.error}
              disruptionsByLine={live.disruptionsByLine}
            />
          </aside>
        </div>

        <Footer />
      </div>
    </TooltipProvider>
  );
}
