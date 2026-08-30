import { MapPin, SlidersHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import { EtaText } from "../EtaText";
import { DelayBadge } from "../DelayBadge";
import { useNow } from "../../hooks/useNow";
import { upcomingStopsForStation } from "../../data/departures";
import type { LiveRun, StationStatic } from "../../shared/types";

const MAX_ROWS = 6;

interface DepartureBoardProps {
  station: StationStatic;
  runs: LiveRun[];
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  /** Restricts rows to the commuter's chosen lines. */
  includesLine: (lineId: string) => boolean;
  onStationClick: () => void;
  onChangeStation: () => void;
}

/**
 * Next departures from one commute station.
 *
 * Owns a one-second clock so only this board re-renders as ETAs tick, rather
 * than the whole app tree.
 */
export function DepartureBoard({
  station,
  runs,
  lineNameById,
  lineColorById,
  includesLine,
  onStationClick,
  onChangeStation,
}: DepartureBoardProps) {
  const now = useNow(1000);
  const stops = upcomingStopsForStation(station, runs, now)
    .filter((stop) => includesLine(stop.lineId))
    .slice(0, MAX_ROWS);

  return (
    <div className="relative overflow-hidden rounded-lg border-l-2 border-l-brand bg-background/40 py-1 pl-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="type-label text-muted-foreground">Departing from</div>
          <button
            type="button"
            onClick={onStationClick}
            className="type-heading mt-0.5 flex max-w-full items-center gap-1.5 truncate text-left text-base text-brand hover:underline"
          >
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{station.name}</span>
          </button>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onChangeStation}
          aria-label="Change commute stations"
          className="shrink-0 text-muted-foreground"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      </div>

      {stops.length === 0 ? (
        <p className="mt-3 text-xs italic text-muted-foreground">No upcoming departures in current data.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {stops.map((stop) => (
            <li key={`${stop.lineId}:${stop.runRef}:${stop.timeUtc}`} className="flex items-center gap-2 rounded-md py-0.5 text-xs">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: lineColorById.get(stop.lineId) ?? "#999" }} />
              <span className="flex-1 truncate">{lineNameById.get(stop.lineId) ?? stop.lineId}</span>
              <EtaText timeUtc={stop.timeUtc} now={now} className="font-semibold" />
              <DelayBadge delayMin={stop.delayMin} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
