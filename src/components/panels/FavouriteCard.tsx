import { Bell, X } from "lucide-react";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { EtaText } from "../EtaText";
import { DelayBadge } from "../DelayBadge";
import type { LiveRun, StationStatic } from "../../shared/types";
import type { FavouriteStationController } from "../../hooks/useFavouriteStation";
import type { NotificationsController } from "../../hooks/useNotifications";
import { upcomingStopsForStation } from "../../data/departures";
import { useNow } from "../../hooks/useNow";

const MAX_ROWS = 6;

interface FavouriteCardProps {
  favourite: FavouriteStationController;
  station: StationStatic;
  runs: LiveRun[];
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  notifications: NotificationsController;
  onStationClick: () => void;
}

/**
 * Pinned "next departures" board for the favourite ("my station") pick, with
 * an opt-in notification toggle. Owns its own 1s clock (rather than
 * receiving `now` from a shared App-level ticker) so only this card
 * re-renders once a second, not the entire app tree.
 */
export function FavouriteCard({
  favourite,
  station,
  runs,
  lineNameById,
  lineColorById,
  notifications,
  onStationClick,
}: FavouriteCardProps) {
  const now = useNow(1000);
  const stops = upcomingStopsForStation(station, runs, now).slice(0, MAX_ROWS);

  return (
    <div className="relative overflow-hidden rounded-xl border border-l-4 border-border border-l-sky-400 bg-card/80 p-4 shadow-sm backdrop-blur-sm dark:border-l-foreground/60">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold tracking-wide text-muted-foreground uppercase">My station</div>
          <button
            type="button"
            onClick={onStationClick}
            className="mt-0.5 truncate text-left text-base font-bold text-primary hover:underline"
          >
            {station.name}
          </button>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" onClick={favourite.clear} className="text-muted-foreground">
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove favourite station</TooltipContent>
        </Tooltip>
      </div>

      {stops.length === 0 ? (
        <div className="mt-3 text-xs italic text-muted-foreground">No upcoming departures in current data.</div>
      ) : (
        <div className="mt-3 flex flex-col gap-1">
          {stops.map((s) => (
            <div key={`${s.lineId}:${s.runRef}:${s.timeUtc}`} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-xs">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: lineColorById.get(s.lineId) ?? "#999" }} />
              <span className="flex-1 truncate">{lineNameById.get(s.lineId) ?? s.lineId}</span>
              <EtaText timeUtc={s.timeUtc} now={now} className="font-semibold" />
              <DelayBadge delayMin={s.delayMin} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <label htmlFor="notify-toggle" className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <Bell className="size-3.5" />
          Notify ~2 min before
        </label>
        <Switch id="notify-toggle" checked={notifications.enabled} onCheckedChange={() => void notifications.toggle()} />
      </div>
      {notifications.message && <div className="mt-1.5 text-[10px] text-destructive">{notifications.message}</div>}
    </div>
  );
}
