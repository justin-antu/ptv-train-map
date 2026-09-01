import { BoardBlock } from "../layout/BoardBlock";
import { MapView } from "../MapView";
import { SelectedInfoCard } from "../panels/SelectedInfoCard";
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
  onStationSelect: (stationId: string) => void;
  onTrainSelect: (pos: { lineId: string; runRef: string }) => void;
  onBackgroundClick: () => void;
  onClearSelection: () => void;
  theme?: "light" | "dark";
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
  onStationSelect,
  onTrainSelect,
  onBackgroundClick,
  onClearSelection,
  theme = "light",
}: NetworkSectionProps) {
  const visibleLines = staticData.lines.filter((line) => visibleLineIds.has(line.id));
  const description = visibleLines.length === 1
    ? `Showing the ${visibleLines[0].name} line only`
    : "Estimated live train positions";
  const accent = visibleLines.length === 1
    ? visibleLines[0].color
    : "hsl(var(--brand))";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="type-label text-muted-foreground">Network</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <BoardBlock accent={accent} className="h-[50vh] min-h-[320px] lg:h-[34rem]">
        <div
          className="relative isolate h-full"
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
            theme={theme}
          />
        </div>
      </BoardBlock>

      <SelectedInfoCard
        selection={selection}
        stationsById={stationsById}
        lineNameById={lineNameById}
        lineColorById={lineColorById}
        runs={runs}
        onClose={onClearSelection}
      />
    </div>
  );
}
