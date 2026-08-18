import { Star, X } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { EtaText } from "../EtaText";
import { DelayBadge } from "../DelayBadge";
import type { LiveRun, StationStatic } from "../../shared/types";
import type { Selection } from "../../shared/selection";
import type { FavouriteStationController } from "../../hooks/useFavouriteStation";
import { delayMinutesFor, soonestPerLine, upcomingStopsForStation } from "../../data/departures";
import { useNow } from "../../hooks/useNow";
import { cn } from "../../lib/utils";

interface SelectedInfoCardProps {
  selection: Selection;
  stationsById: Map<string, StationStatic>;
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  runs: LiveRun[];
  favourite: FavouriteStationController;
  onClose: () => void;
}

/**
 * The station/train "click for details" card, now living permanently in the
 * left pane instead of a floating MapLibre popup — this is a deliberate part
 * of the redesign (see the layout spec), which also nicely sidesteps the
 * original single-shared-popup-instance bookkeeping since React just
 * re-renders this component from `selection` state.
 *
 * Owns its own 1s clock (rather than receiving `now` from a shared App-level
 * ticker) so that this is the *only* thing that re-renders once a second —
 * not the entire app tree.
 */
export function SelectedInfoCard({
  selection,
  stationsById,
  lineNameById,
  lineColorById,
  runs,
  favourite,
  onClose,
}: SelectedInfoCardProps) {
  const now = useNow(1000);

  if (!selection) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">
        Click a station or train on the map to see live departures.
      </div>
    );
  }

  if (selection.kind === "station") {
    const station = stationsById.get(selection.stationId);
    if (!station) return null;
    const departures = soonestPerLine(upcomingStopsForStation(station, runs, now));
    const starred = favourite.isFavourite(station.id);

    return (
      <div className="relative overflow-hidden rounded-xl border border-l-4 border-border border-l-sky-500 bg-card/80 p-4 shadow-sm backdrop-blur-sm dark:border-l-foreground/60">
        <div className="flex items-start justify-between gap-2">
          <div className="type-heading min-w-0 flex-1 truncate text-base">{station.name}</div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => favourite.toggle(station.id)}
                  className={cn("text-muted-foreground", starred && "text-amber-500")}
                >
                  <Star className={cn("size-4", starred && "fill-amber-400 text-amber-500")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{starred ? "Remove as my station" : "Set as my station"}</TooltipContent>
            </Tooltip>
            <Button size="icon-sm" variant="ghost" onClick={onClose} className="text-muted-foreground">
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">Next departures</div>
        <div className="mt-2 space-y-1.5">
          {departures.length === 0 ? (
            <div className="text-xs italic text-muted-foreground">No upcoming departures in current data.</div>
          ) : (
            departures.map((d) => (
              <div key={d.lineId} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: lineColorById.get(d.lineId) ?? "#999" }} />
                <span className="flex-1 truncate">{lineNameById.get(d.lineId) ?? d.lineId}</span>
                <EtaText timeUtc={d.timeUtc} now={now} className="font-semibold" />
                <DelayBadge delayMin={d.delayMin} />
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  const run = runs.find((r) => r.lineId === selection.lineId && r.runRef === selection.runRef);
  if (!run) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">
        This train is no longer being tracked.
      </div>
    );
  }

  const nextStop = run.stops.find((s) => Date.parse(s.timeUtc) > now) ?? null;
  const lastStop = run.stops[run.stops.length - 1];
  const delayMin = delayMinutesFor(nextStop ?? lastStop);
  const color = lineColorById.get(run.lineId) ?? "#999999";
  const lineName = lineNameById.get(run.lineId) ?? run.lineId;
  const nextStationName = nextStop ? (stationsById.get(nextStop.stationId)?.name ?? nextStop.stationId) : null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-l-4 border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm" style={{ borderLeftColor: color }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: color }} />
          <span className="type-heading truncate text-base">{lineName}</span>
          <DelayBadge delayMin={delayMin} />
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onClose} className="shrink-0 text-muted-foreground">
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">To {run.destinationName}</div>
      <div className="mt-2 text-xs">
        {nextStop && nextStationName ? (
          <div className="flex items-center gap-2">
            <span className="flex-1">Next: {nextStationName}</span>
            <EtaText timeUtc={nextStop.timeUtc} now={now} className="font-semibold" />
          </div>
        ) : (
          <div className="text-muted-foreground italic">Approaching {run.destinationName}</div>
        )}
      </div>
    </div>
  );
}
