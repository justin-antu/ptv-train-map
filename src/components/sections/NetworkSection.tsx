import { SectionCard } from "../layout/SectionCard";
import { MapView } from "../MapView";
import { NetworkStatsCard } from "../panels/NetworkStatsCard";
import { SelectedInfoCard } from "../panels/SelectedInfoCard";
import { BorderBeam } from "../ui/border-beam";
import { NETWORK_SUBTITLE } from "../../config";
import type { LiveRun, NetworkStaticData, StationStatic } from "../../shared/types";
import type { Selection } from "../../shared/selection";

interface NetworkSectionProps {
  staticData: NetworkStaticData;
  stationsById: Map<string, StationStatic>;
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  runs: LiveRun[];
  /** Lines drawn on the map: the commuter's favourites, or all of them. */
  visibleLineIds: Set<string>;
  selection: Selection;
  trainsRunning: number;
  linesActive: number;
  onStationSelect: (stationId: string) => void;
  onTrainSelect: (pos: { lineId: string; runRef: string }) => void;
  onBackgroundClick: () => void;
  onClearSelection: () => void;
}

/**
 * The live map. Secondary to the departure board, so it sits behind its own tab
 * on mobile.
 */
export function NetworkSection({
  staticData,
  stationsById,
  lineNameById,
  lineColorById,
  runs,
  visibleLineIds,
  selection,
  trainsRunning,
  linesActive,
  onStationSelect,
  onTrainSelect,
  onBackgroundClick,
  onClearSelection,
}: NetworkSectionProps) {
  const visibleLines = staticData.lines.filter((line) => visibleLineIds.has(line.id));

  return (
    <SectionCard
      id="network"
      title="Network map"
      description={
        visibleLines.length === 1
          ? `Showing the ${visibleLines[0].name} line only`
          : "Estimated live train positions"
      }
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div
          className="relative isolate h-[42vh] min-h-[300px] overflow-hidden rounded-xl border border-border lg:h-[30rem]"
          aria-label={`${NETWORK_SUBTITLE} live map`}
        >
          <MapView
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
          <NetworkStatsCard trainsRunning={trainsRunning} linesActive={linesActive} />
          <SelectedInfoCard
            selection={selection}
            stationsById={stationsById}
            lineNameById={lineNameById}
            lineColorById={lineColorById}
            runs={runs}
            onClose={onClearSelection}
          />
        </div>
      </div>
    </SectionCard>
  );
}
