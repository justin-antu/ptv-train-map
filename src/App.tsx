import { useCallback, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { MapView, type MapViewHandle } from "./components/MapView";
import { LeftPane } from "./components/panels/LeftPane";
import { RightPanePlaceholder } from "./components/panels/RightPanePlaceholder";
import { TooltipProvider } from "./components/ui/tooltip";
import { BlurFade } from "./components/ui/blur-fade";
import { useTheme } from "./hooks/useTheme";
import { useStaticData } from "./hooks/useStaticData";
import { useLiveData } from "./hooks/useLiveData";
import { useVisibleLines } from "./hooks/useVisibleLines";
import { useFavouriteStation } from "./hooks/useFavouriteStation";
import { useNotifications } from "./hooks/useNotifications";
import { useNow } from "./hooks/useNow";
import type { Selection } from "./shared/selection";
import type { StationStatic } from "./shared/types";
import { APP_TITLE, NETWORK_SUBTITLE } from "./config";

export default function App() {
  const [theme, setTheme] = useTheme();
  const { data: staticData, error: staticDataError } = useStaticData();
  const live = useLiveData(staticData);
  const now = useNow(1000);
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

  const disruptionCount = useMemo(
    () => new Set(Object.values(live.disruptionsByLine).flat().map((d) => d.id)).size,
    [live.disruptionsByLine],
  );
  // "Active" = lines currently running at least one train, per the live data
  // snapshot — distinct from (and more meaningful here than) which lines the
  // user has toggled on in the legend, which is just a display preference.
  const linesWithActiveService = useMemo(() => new Set(live.runs.map((r) => r.lineId)).size, [live.runs]);

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
          <h1 className="text-xl font-bold">Something went wrong loading the map</h1>
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
      <BlurFade duration={0.5} offset={10} className="flex min-h-dvh flex-col bg-background text-foreground lg:h-dvh lg:overflow-hidden">
        <Header theme={theme} onThemeChange={setTheme} isDemo={live.isDemo} generatedAtUtc={live.generatedAtUtc} trainCount={live.runs.length} />

        <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[20%_60%_20%] lg:grid-rows-[1fr] lg:overflow-hidden">
          <aside className="thin-scrollbar order-2 border-t border-border bg-muted/20 p-3 lg:order-none lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-r">
            <LeftPane
              staticData={staticData}
              stationsById={stationsById}
              lineNameById={lineNameById}
              lineColorById={lineColorById}
              runs={live.runs}
              now={now}
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
            className="relative order-1 h-[58vh] min-h-[340px] lg:order-none lg:h-full lg:min-h-0"
            aria-label={`${NETWORK_SUBTITLE} live map`}
          >
            <MapView
              ref={mapRef}
              staticData={staticData}
              stationsById={stationsById}
              lineColorById={lineColorById}
              runs={live.runs}
              visibleLineIds={visibleLines.visible}
              theme={theme}
              onStationSelect={handleStationSelect}
              onTrainSelect={handleTrainSelect}
              onBackgroundClick={handleBackgroundClick}
            />
          </main>

          <aside className="hidden border-border lg:order-none lg:block lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-l">
            <RightPanePlaceholder
              stats={{
                trainsRunning: live.runs.length,
                linesActive: linesWithActiveService,
                stationCount: staticData.stations.length,
                disruptionCount,
              }}
            />
          </aside>
        </div>

        <Footer />
      </BlurFade>
    </TooltipProvider>
  );
}
