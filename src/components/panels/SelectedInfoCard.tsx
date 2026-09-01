import { X } from "lucide-react";
import { BoardBlock } from "../layout/BoardBlock";
import { Button } from "../ui/button";
import { EtaText } from "../EtaText";
import { DelayBadge } from "../DelayBadge";
import { effectiveStopTimeUtc, type LiveRun, type StationStatic } from "../../shared/types";
import type { Selection } from "../../shared/selection";
import { delayMinutesFor, soonestPerLine, upcomingStopsForStation } from "../../data/departures";
import { useNow } from "../../hooks/useNow";

interface SelectedInfoCardProps {
  selection: Selection;
  stationsById: Map<string, StationStatic>;
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  runs: LiveRun[];
  onClose: () => void;
}

/**
 * Renders details for the station or train picked on the map.
 *
 * A local one-second clock limits ETA re-renders to this component.
 */
export function SelectedInfoCard({
  selection,
  stationsById,
  lineNameById,
  lineColorById,
  runs,
  onClose,
}: SelectedInfoCardProps) {
  const now = useNow(1000);

  if (!selection) {
    return (
      <BoardBlock className="border-dashed p-5 text-center text-xs text-muted-foreground">
        Select a station or train on the map to see live departures.
      </BoardBlock>
    );
  }

  if (selection.kind === "station") {
    const station = stationsById.get(selection.stationId);
    if (!station) return null;
    const departures = soonestPerLine(upcomingStopsForStation(station, runs, now));

    return (
      <BoardBlock accent="hsl(var(--brand))" className="p-5 pl-6 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="type-heading min-w-0 flex-1 truncate text-base">{station.name}</div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} className="touch-target shrink-0 text-muted-foreground">
            <X className="size-4" />
            <span className="sr-only">Close {station.name}</span>
          </Button>
        </div>
        <div className="mt-0.5 text-2xs text-muted-foreground">Next departures</div>
        <div className="mt-2 space-y-1.5">
          {departures.length === 0 ? (
            <div className="text-xs italic text-muted-foreground">No upcoming departures in current data.</div>
          ) : (
            departures.map((d) => (
              <div key={d.lineId} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: lineColorById.get(d.lineId) ?? "#999" }} aria-hidden="true" />
                <span className="flex-1 truncate">{lineNameById.get(d.lineId) ?? d.lineId}</span>
                <EtaText timeUtc={d.timeUtc} now={now} className="font-semibold" />
                {/* No prediction means no delay to report, rather than "0 min late". */}
                {d.delayMin !== null && <DelayBadge delayMin={d.delayMin} />}
              </div>
            ))
          )}
        </div>
      </BoardBlock>
    );
  }

  const run = runs.find((r) => r.lineId === selection.lineId && r.runRef === selection.runRef);
  if (!run) {
    return (
      <BoardBlock className="border-dashed p-5 text-center text-xs text-muted-foreground">
        This train is no longer being tracked.
      </BoardBlock>
    );
  }

  const nextStop = run.stops.find((s) => Date.parse(effectiveStopTimeUtc(s)) > now) ?? null;
  const lastStop = run.stops[run.stops.length - 1];
  const delayMin = delayMinutesFor(nextStop ?? lastStop);
  const color = lineColorById.get(run.lineId) ?? "#999999";
  const lineName = lineNameById.get(run.lineId) ?? run.lineId;
  const nextStationName = nextStop ? (stationsById.get(nextStop.stationId)?.name ?? nextStop.stationId) : null;

  return (
    <BoardBlock accent={color} className="p-5 pl-6 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: color }} aria-hidden="true" />
          <span className="type-heading truncate text-base">{lineName}</span>
          {delayMin !== null && <DelayBadge delayMin={delayMin} />}
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onClose} className="touch-target shrink-0 text-muted-foreground">
          <X className="size-4" />
          <span className="sr-only">Close {lineName} service</span>
        </Button>
      </div>
      <div className="mt-0.5 text-2xs text-muted-foreground">To {run.destinationName}</div>
      <div className="mt-2 text-xs">
        {nextStop && nextStationName ? (
          <div className="flex items-center gap-2">
            <span className="flex-1">Next: {nextStationName}</span>
            <EtaText timeUtc={effectiveStopTimeUtc(nextStop)} now={now} className="font-semibold" />
          </div>
        ) : (
          <div className="text-muted-foreground italic">Approaching {run.destinationName}</div>
        )}
      </div>
    </BoardBlock>
  );
}
