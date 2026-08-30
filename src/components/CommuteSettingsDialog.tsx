import { useEffect, useMemo, useState } from "react";
import { Bell, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Switch } from "./ui/switch";
import { StationCombobox } from "./StationCombobox";
import {
  CBD_QUICK_PICK_STATION_IDS,
  COMMUTE_DIRECTIONS,
  COMMUTE_DIRECTION_HINTS,
  COMMUTE_DIRECTION_LABELS,
  DEFAULT_FROM_CITY_STATION_ID,
} from "../shared/commute";
import { cn } from "../lib/utils";
import type { LineStatic, StationStatic } from "../shared/types";
import type { CommutePreferences, CommutePreferencesController } from "../hooks/useCommutePreferences";
import type { NotificationsController } from "../hooks/useNotifications";

interface CommuteSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stations: StationStatic[];
  lines: LineStatic[];
  commute: CommutePreferencesController;
  notifications: NotificationsController;
}

/**
 * Single home for every commuter preference.
 *
 * Stations and lines are edited as a draft and committed on save, so a
 * half-finished change never disturbs the live boards behind the dialog.
 * Notifications stay outside the draft because the browser only grants
 * permission from the switch's own click.
 */
export function CommuteSettingsDialog({
  open,
  onOpenChange,
  stations,
  lines,
  commute,
  notifications,
}: CommuteSettingsDialogProps) {
  const [draft, setDraft] = useState<CommutePreferences>(commute);

  /** Quick picks, minus any interchange missing from the current network data. */
  const quickPicks = useMemo(
    () =>
      CBD_QUICK_PICK_STATION_IDS.map((stationId) => stations.find((station) => station.id === stationId)).filter(
        (station): station is StationStatic => station !== undefined,
      ),
    [stations],
  );

  useEffect(() => {
    if (open) {
      setDraft({
        toCityStationId: commute.toCityStationId,
        // Most return trips start in the city, so offer Flinders Street rather
        // than an empty picker.
        fromCityStationId: commute.fromCityStationId ?? DEFAULT_FROM_CITY_STATION_ID,
        favouriteLineIds: commute.favouriteLineIds,
      });
    }
  }, [open, commute.toCityStationId, commute.fromCityStationId, commute.favouriteLineIds]);

  const toggleLine = (lineId: string) => {
    setDraft((prev) => ({
      ...prev,
      favouriteLineIds: prev.favouriteLineIds.includes(lineId)
        ? prev.favouriteLineIds.filter((id) => id !== lineId)
        : [...prev.favouriteLineIds, lineId],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Commute settings</DialogTitle>
          <DialogDescription>All preferences are saved on this device — no account needed.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="type-label text-muted-foreground">My stations</legend>
            {COMMUTE_DIRECTIONS.map((direction) => {
              const inputId = `commute-station-${direction}`;
              const selectedId = direction === "toCity" ? draft.toCityStationId : draft.fromCityStationId;
              return (
                <div key={direction}>
                  <label htmlFor={inputId} className="text-xs font-medium">
                    {COMMUTE_DIRECTION_LABELS[direction]}
                  </label>
                  <p className="mb-1.5 text-[11px] text-muted-foreground">{COMMUTE_DIRECTION_HINTS[direction]}</p>
                  <StationCombobox
                    id={inputId}
                    stations={stations}
                    value={selectedId}
                    onChange={(stationId) =>
                      setDraft((prev) =>
                        direction === "toCity" ? { ...prev, toCityStationId: stationId } : { ...prev, fromCityStationId: stationId },
                      )
                    }
                  />
                  {direction === "fromCity" && quickPicks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {quickPicks.map((station) => (
                        <button
                          key={station.id}
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, fromCityStationId: station.id }))}
                          aria-pressed={selectedId === station.id}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                            selectedId === station.id
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                          )}
                        >
                          {station.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>

          <fieldset>
            <legend className="type-label text-muted-foreground">My lines</legend>
            <p className="mt-0.5 mb-2 text-[11px] text-muted-foreground">
              Filters departures, alerts, and the map. Leave empty to see the whole network.
            </p>
            <div className="grid grid-cols-2 gap-1">
              {lines.map((line) => {
                const checkboxId = `favourite-line-${line.id}`;
                const checked = draft.favouriteLineIds.includes(line.id);
                return (
                  <label
                    key={line.id}
                    htmlFor={checkboxId}
                    className={cn(
                      "flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent/60",
                      checked && "bg-accent/40",
                    )}
                  >
                    <Checkbox id={checkboxId} checked={checked} onCheckedChange={() => toggleLine(line.id)} className="size-3.5 shrink-0" />
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: line.color }} />
                    <span className="truncate">{line.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="notify-toggle" className="flex cursor-pointer items-center gap-2 text-xs">
                <Bell className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span>
                  Notify me ~2 minutes before a train arrives
                  <span className="block text-[11px] text-muted-foreground">Uses your browser's notifications.</span>
                </span>
              </label>
              <Switch id="notify-toggle" checked={notifications.enabled} onCheckedChange={() => void notifications.toggle()} />
            </div>
            {notifications.message && <p className="text-[11px] text-destructive">{notifications.message}</p>}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              commute.reset();
              onOpenChange(false);
            }}
            className="border border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <RotateCcw aria-hidden="true" />
            Reset all
          </Button>
          <Button
            size="sm"
            onClick={() => {
              commute.save(draft);
              onOpenChange(false);
            }}
          >
            Save preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
