import { SearchCard } from "./SearchCard";
import { SelectedInfoCard } from "./SelectedInfoCard";
import { FavouriteCard } from "./FavouriteCard";
import { LegendCard } from "./LegendCard";
import type { LineDisruption, LiveRun, NetworkStaticData, StationStatic } from "../../shared/types";
import type { Selection } from "../../shared/selection";
import type { VisibleLinesController } from "../../hooks/useVisibleLines";
import type { FavouriteStationController } from "../../hooks/useFavouriteStation";
import type { NotificationsController } from "../../hooks/useNotifications";

interface LeftPaneProps {
  staticData: NetworkStaticData;
  stationsById: Map<string, StationStatic>;
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  runs: LiveRun[];
  now: number;
  selection: Selection;
  onClearSelection: () => void;
  onStationSearchSelect: (station: StationStatic) => void;
  onFavouriteStationClick: (station: StationStatic) => void;
  visibleLines: VisibleLinesController;
  disruptionsByLine: Record<string, LineDisruption[]>;
  favourite: FavouriteStationController;
  notifications: NotificationsController;
}

/** The left pane's stack of bento-style cards: search, the selected station/train, the favourite dashboard, and the line legend. */
export function LeftPane({
  staticData,
  stationsById,
  lineNameById,
  lineColorById,
  runs,
  now,
  selection,
  onClearSelection,
  onStationSearchSelect,
  onFavouriteStationClick,
  visibleLines,
  disruptionsByLine,
  favourite,
  notifications,
}: LeftPaneProps) {
  const favouriteStation = favourite.favouriteId ? stationsById.get(favourite.favouriteId) : undefined;

  return (
    <div className="grid grid-cols-1 gap-3">
      <SearchCard
        stations={staticData.stations}
        onSelect={(station) => {
          visibleLines.ensureVisible(station.lineIds);
          onStationSearchSelect(station);
        }}
      />

      <SelectedInfoCard
        selection={selection}
        stationsById={stationsById}
        lineNameById={lineNameById}
        lineColorById={lineColorById}
        runs={runs}
        now={now}
        favourite={favourite}
        onClose={onClearSelection}
      />

      {favouriteStation && (
        <FavouriteCard
          favourite={favourite}
          station={favouriteStation}
          runs={runs}
          now={now}
          lineNameById={lineNameById}
          lineColorById={lineColorById}
          notifications={notifications}
          onStationClick={() => onFavouriteStationClick(favouriteStation)}
        />
      )}

      <LegendCard
        lines={staticData.lines.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
        visibleLines={visibleLines}
        disruptionsByLine={disruptionsByLine}
      />
    </div>
  );
}
