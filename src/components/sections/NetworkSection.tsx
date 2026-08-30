import { forwardRef } from "react";
import { SectionCard } from "../layout/SectionCard";
import { MapView, type MapViewHandle } from "../MapView";
import { LineStatusCard } from "../panels/LineStatusCard";
import { NetworkStatsCard } from "../panels/NetworkStatsCard";
import { SelectedInfoCard } from "../panels/SelectedInfoCard";
import { BorderBeam } from "../ui/border-beam";
import { NETWORK_SUBTITLE } from "../../config";
import type { LineDisruption, LiveRun, NetworkStaticData, StationStatic } from "../../shared/types";
import type { Selection } from "../../shared/selection";
import type { CommutePreferencesController } from "../../hooks/useCommutePreferences";

interface NetworkSectionProps {
  staticData: NetworkStaticData;
  stationsById: Map<string, StationStatic>;
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  runs: LiveRun[];
  /** Lines drawn on the map: the commuter's favourites, or all of them. */
  visibleLineIds: Set<string>;
  disruptionsByLine: Record<string, LineDisruption[]>;
  selection: Selection;
  commute: CommutePreferencesController;
  trainsRunning: number;
  linesActive: number;
  disruptionCount: number;
  onStationSelect: (stationId: string) => void;
  onTrainSelect: (pos: { lineId: string; runRef: string }) => void;
  onBackgroundClick: () => void;
  onClearSelection: () => void;
}

/**
 * The live map and line status. Secondary to the commute board, so it sits
 * behind its own tab on mobile.
 */
export const NetworkSection = forwardRef<MapViewHandle, NetworkSectionProps>(function NetworkSection(
  {
    staticData,
    stationsById,
    lineNameById,
    lineColorById,
    runs,
    visibleLineIds,
    disruptionsByLine,
    selection,
    commute,
    trainsRunning,
    linesActive,
    disruptionCount,
    onStationSelect,
    onTrainSelect,
    onBackgroundClick,
    onClearSelection,
  },
  ref,
) {
  const visibleLines = staticData.lines.filter((line) => visibleLineIds.has(line.id));

  return (
    <SectionCard
      id="network"
      title="Live network"
      description={
        visibleLines.length < staticData.lines.length
          ? `Showing your ${visibleLines.length} lines — change this in settings`
          : "Estimated train positions and line status"
      }
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div
          className="relative isolate h-[42vh] min-h-[300px] overflow-hidden rounded-xl border border-border lg:h-[30rem]"
          aria-label={`${NETWORK_SUBTITLE} live map`}
        >
          <MapView
            ref={ref}
            staticData={staticData}
            stationsById={stationsById}
            lineColorById={lineColorById}
            runs={runs}
            visibleLineIds={visibleLineIds}
            onStationSelect={onStationSelect}
            onTrainSelect={onTrainSelect}
            onBackgroundClick={onBackgroundClick}
          />
          <BorderBeam
            size={140}
            duration={10}
            borderWidth={1}
            colorFrom="hsl(var(--muted-foreground) / 0.3)"
            colorTo="hsl(var(--brand) / 0.82)"
            className="opacity-70 dark:opacity-60"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <NetworkStatsCard
            trainsRunning={trainsRunning}
            linesActive={linesActive}
            stationCount={staticData.stations.length}
            disruptionCount={disruptionCount}
          />
          <SelectedInfoCard
            selection={selection}
            stationsById={stationsById}
            lineNameById={lineNameById}
            lineColorById={lineColorById}
            runs={runs}
            commute={commute}
            onClose={onClearSelection}
          />
          <LineStatusCard
            lines={visibleLines.map((line) => ({ id: line.id, name: line.name, color: line.color }))}
            disruptionsByLine={disruptionsByLine}
          />
        </div>
      </div>
    </SectionCard>
  );
});
