import { useMemo, useState } from "react";
import { BoardBlock } from "../layout/BoardBlock";
import { MapView } from "../MapView";
import { SelectedInfoCard } from "../panels/SelectedInfoCard";
import { Checkbox } from "../ui/checkbox";
import { NETWORK_SUBTITLE } from "../../config";
import type { LiveRun, NetworkStaticData, StationStatic } from "../../shared/types";
import type { Selection } from "../../shared/selection";

interface NetworkSectionProps {
  staticData: NetworkStaticData;
  stationsById: Map<string, StationStatic>;
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  runs: LiveRun[];
  /** Lines that serve the current board pair (or the saved line). */
  routeLineIds: Set<string>;
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
  routeLineIds,
  selection,
  onStationSelect,
  onTrainSelect,
  onBackgroundClick,
  onClearSelection,
  theme = "light",
}: NetworkSectionProps) {
  const [showOnlyMyRoute, setShowOnlyMyRoute] = useState(true);
  const canFocusRoute = routeLineIds.size > 0;
  const focusedLineIds = useMemo(
    () => (showOnlyMyRoute && canFocusRoute ? routeLineIds : new Set<string>()),
    [showOnlyMyRoute, canFocusRoute, routeLineIds],
  );
  const focusedLines = staticData.lines.filter((line) => focusedLineIds.has(line.id));
  const description = focusedLines.length === 1
    ? `${focusedLines[0].name} on the network`
    : focusedLines.length > 1
      ? "Your lines on the network"
      : "Melbourne Metro";
  const accent = focusedLines[0]?.color ?? staticData.lines.find((line) => routeLineIds.has(line.id))?.color ?? "hsl(var(--brand))";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="type-label text-muted-foreground">Network</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <label
          htmlFor="show-only-my-route"
          className={`flex items-center gap-2 text-sm ${canFocusRoute ? "cursor-pointer text-foreground" : "cursor-not-allowed text-muted-foreground"}`}
        >
          <Checkbox
            id="show-only-my-route"
            checked={showOnlyMyRoute}
            disabled={!canFocusRoute}
            onCheckedChange={(value) => setShowOnlyMyRoute(value === true)}
          />
          <span>Show only my route</span>
        </label>
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
            focusedLineIds={focusedLineIds}
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
        preferredLineIds={focusedLineIds.size > 0 ? focusedLineIds : routeLineIds}
        onClose={onClearSelection}
      />
    </div>
  );
}
