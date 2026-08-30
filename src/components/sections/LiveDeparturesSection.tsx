import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Bell, BellOff, Info, MapPinned, RotateCcw, Settings2 } from "lucide-react";
import { SectionCard } from "../layout/SectionCard";
import { useSectionNavigation } from "../layout/sectionNavigation";
import { SearchableSelect, type SelectItem } from "../SearchableSelect";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { EtaText } from "../EtaText";
import { useNow } from "../../hooks/useNow";
import { departureRowsForStation, departureStatus } from "../../data/departures";
import { CBD_QUICK_PICK_STATION_IDS } from "../../shared/commute";
import { LIVE_DATA_STALE_AFTER_MS } from "../../config";
import { cn } from "../../lib/utils";
import type { LineDisruptionSummary } from "../../data/disruptions";
import type { DeparturePreferencesController } from "../../hooks/useDeparturePreferences";
import type { NotificationsController } from "../../hooks/useNotifications";
import type { LineStatic, LiveRun, StationStatic } from "../../shared/types";

/** Departures shown before the reader asks for more. */
const PREVIEW_ROWS = 3;
const EXPANDED_ROWS = 12;

const STATUS_TONE_CLASS = {
  success: "text-success",
  warning: "text-warning",
  muted: "text-muted-foreground",
} as const;

interface LiveDeparturesSectionProps {
  lines: LineStatic[];
  stations: StationStatic[];
  stationsById: Map<string, StationStatic>;
  runs: LiveRun[];
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  preferences: DeparturePreferencesController;
  /** Alerts on the lines this board is currently showing. */
  disruptionSummary: LineDisruptionSummary;
  notifications: NotificationsController;
  generatedAtUtc: string | null;
  isDemo: boolean;
  onShowOnMap: (station: StationStatic) => void;
}

function freshnessLabel(generatedAtUtc: string | null, now: number): { text: string; stale: boolean } {
  const generatedAt = generatedAtUtc ? Date.parse(generatedAtUtc) : Number.NaN;
  if (!Number.isFinite(generatedAt)) return { text: "Waiting for live data…", stale: true };

  const ageMs = now - generatedAt;
  const stale = ageMs > LIVE_DATA_STALE_AFTER_MS;
  if (ageMs < 90_000) return { text: "Updated just now", stale };
  const minutes = Math.round(ageMs / 60_000);
  if (minutes < 60) return { text: `Updated ${minutes} min ago`, stale };
  return {
    text: `Updated ${new Date(generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
    stale,
  };
}

/**
 * The landing card: the next services from the commuter's station.
 *
 * Origin, destination, and line all live in the card's own control bar rather
 * than a settings dialog, so changing where you are standing takes one tap from
 * the board you are already looking at.
 */
export function LiveDeparturesSection({
  lines,
  stations,
  stationsById,
  runs,
  lineNameById,
  lineColorById,
  preferences,
  disruptionSummary,
  notifications,
  generatedAtUtc,
  isDemo,
  onShowOnMap,
}: LiveDeparturesSectionProps) {
  const navigate = useSectionNavigation();
  const now = useNow(1000);
  const [expanded, setExpanded] = useState(false);

  const freshness = useMemo(() => freshnessLabel(generatedAtUtc, now), [generatedAtUtc, now]);

  const selectedLine = useMemo(
    () => (preferences.lineId ? (lines.find((line) => line.id === preferences.lineId) ?? null) : null),
    [lines, preferences.lineId],
  );

  const lineItems = useMemo<SelectItem[]>(() => lines.map((line) => ({ id: line.id, label: line.name, color: line.color })), [lines]);

  // Narrowing to a line narrows the station choices with it, so the pickers
  // cannot offer a station the board will never have departures for.
  const stationItems = useMemo<SelectItem[]>(() => {
    const pool = selectedLine
      ? selectedLine.stationIds.map((stationId) => stationsById.get(stationId)).filter((station): station is StationStatic => station !== undefined)
      : stations;
    return pool.map((station) => ({ id: station.id, label: station.name }));
  }, [selectedLine, stations, stationsById]);

  // A station id saved before a data regeneration may no longer exist; treat it
  // as unset rather than rendering an empty board with no explanation.
  const origin = preferences.originStationId ? stationsById.get(preferences.originStationId) : undefined;
  const destination = preferences.destinationStationId ? stationsById.get(preferences.destinationStationId) : undefined;
  const lineMismatch = Boolean(origin && selectedLine && !selectedLine.stationIds.includes(origin.id));

  const rows = useMemo(() => {
    if (!origin) return [];
    return departureRowsForStation(origin, runs, now).filter((row) => !preferences.lineId || row.lineId === preferences.lineId);
  }, [origin, runs, now, preferences.lineId]);

  const visibleRows = rows.slice(0, expanded ? EXPANDED_ROWS : PREVIEW_ROWS);

  const description = origin
    ? destination
      ? `${origin.name} to ${destination.name}`
      : `Next services from ${origin.name}`
    : "Choose where you are departing from";

  return (
    <SectionCard id="departures" title="Live Departures" description={description}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <SearchableSelect
              items={lineItems}
              value={preferences.lineId}
              onChange={preferences.setLine}
              placeholder="All lines"
              emptyOption="All lines"
              label="Line"
              size="sm"
              className="w-[9.5rem]"
            />
            <SearchableSelect
              items={stationItems}
              value={preferences.originStationId}
              onChange={preferences.setOrigin}
              placeholder="Choose station"
              quickPickIds={CBD_QUICK_PICK_STATION_IDS}
              label="Departing from"
              size="sm"
              className="w-[11rem]"
            />
            {/* Marked disabled rather than truly disabled: a disabled button
                swallows pointer events, hiding the tooltip that explains why. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-disabled={!preferences.destinationStationId}
                  onClick={() => preferences.swap()}
                  className={cn("shrink-0 text-muted-foreground", !preferences.destinationStationId && "opacity-40")}
                >
                  <ArrowLeftRight className="size-4" />
                  <span className="sr-only">Reverse the journey</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {preferences.destinationStationId ? "Reverse the journey" : "Set a destination to reverse the journey"}
              </TooltipContent>
            </Tooltip>
            <SearchableSelect
              items={stationItems}
              value={preferences.destinationStationId}
              onChange={preferences.setDestination}
              placeholder="Any destination"
              emptyOption="Any destination"
              label="Travelling to"
              size="sm"
              className="w-[11rem]"
            />
            {origin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onShowOnMap(origin)}
                    className="shrink-0 text-muted-foreground"
                  >
                    <MapPinned className="size-4" />
                    <span className="sr-only">Show {origin.name} on the map</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Show on the map</TooltipContent>
              </Tooltip>
            )}
          </div>

          <DisruptionIndicators summary={disruptionSummary} lineNameById={lineNameById} onView={() => navigate("alerts")} />

          <div className="flex items-center gap-2 text-[11px]">
            <span className={cn("flex items-center gap-1.5", freshness.stale ? "text-warning" : "text-muted-foreground")}>
              <span className={cn("size-1.5 rounded-full", isDemo || freshness.stale ? "bg-warning" : "bg-success")} />
              {isDemo ? "Sample preview" : freshness.text}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={notifications.enabled}
                  onClick={() => void notifications.toggle()}
                  className={cn("shrink-0", notifications.enabled ? "text-brand" : "text-muted-foreground")}
                >
                  {notifications.enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
                  <span className="sr-only">
                    Arrival alerts {notifications.enabled ? "on" : "off"}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {notifications.enabled ? "Arrival alerts on — tap to turn off" : "Notify me ~2 min before a train arrives"}
              </TooltipContent>
            </Tooltip>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground">
                  <Settings2 className="size-4" />
                  <span className="sr-only">Board settings</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 text-xs">
                <p className="type-label text-muted-foreground">Board settings</p>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  Your line and stations are saved on this device only.
                </p>
                {notifications.message && <p className="mt-2 text-destructive">{notifications.message}</p>}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={preferences.reset}
                  className="mt-3 w-full border border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <RotateCcw aria-hidden="true" />
                  Reset
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {isDemo && (
          <p
            role="status"
            className="flex items-start gap-2.5 rounded-lg border border-warning-border/60 bg-warning-surface px-3 py-2.5 text-xs text-warning-foreground"
          >
            <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">Sample data — do not plan a trip with this.</span> Live departures are
              unavailable right now, so the times below are made up.
            </span>
          </p>
        )}

        {lineMismatch && origin && selectedLine && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-info-border/60 bg-info-surface px-3 py-2 text-xs text-info-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {origin.name} is not on the {selectedLine.name} line.
            </span>
            <button
              type="button"
              onClick={() => preferences.setLine(null)}
              className="font-medium underline underline-offset-2 hover:opacity-80"
            >
              Show all lines
            </button>
          </p>
        )}

        {!origin ? (
          <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-center">
            <MapPinned className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">Pick your station</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Choose where you board above and your next departures appear here every time you open the app.
            </p>
          </div>
        ) : visibleRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-center text-xs text-muted-foreground">
            No upcoming departures from {origin.name} in the current data
            {selectedLine && !lineMismatch && ` on the ${selectedLine.name} line`}.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border/60">
              {visibleRows.map((row) => {
                const status = departureStatus(row);
                return (
                  <li key={`${row.lineId}:${row.runRef}:${row.timeUtc}`} className="flex items-center gap-2.5 py-2.5">
                    <span
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ background: lineColorById.get(row.lineId) ?? "#999" }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="type-numeric shrink-0 text-sm font-semibold">
                          {new Date(row.scheduledTimeUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span className="truncate text-xs font-medium">{row.destinationName}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {lineNameById.get(row.lineId) ?? row.lineId}
                        <span className={cn("ml-1.5 font-medium", STATUS_TONE_CLASS[status.tone])}>{status.label}</span>
                        <span className="hidden sm:inline">
                          {" · "}
                          {row.remainingStops === 0 ? "Terminates here" : `Calling at ${row.remainingStops} more stops`}
                        </span>
                      </div>
                    </div>
                    <EtaText timeUtc={row.timeUtc} now={now} className="shrink-0 text-sm font-semibold" />
                  </li>
                );
              })}
            </ul>

            {rows.length > PREVIEW_ROWS && (
              <Button variant="ghost" size="sm" onClick={() => setExpanded((prev) => !prev)} className="self-center text-muted-foreground">
                {expanded ? "Show fewer" : `Show more (${Math.min(rows.length, EXPANDED_ROWS) - PREVIEW_ROWS})`}
              </Button>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}

/**
 * Compact severity indicators: red for anything that stops trains running,
 * amber for delays and notices. Both jump to the full alert feed.
 */
function DisruptionIndicators({
  summary,
  lineNameById,
  onView,
}: {
  summary: LineDisruptionSummary;
  lineNameById: Map<string, string>;
  onView: () => void;
}) {
  if (summary.total === 0) return null;

  const criticalLines = summary.criticalLineIds.map((lineId) => lineNameById.get(lineId) ?? lineId).join(", ");

  return (
    <div className="flex items-center gap-1.5">
      {summary.criticalCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onView}
              className="flex items-center gap-1 rounded-full border border-destructive-border/70 bg-destructive-surface px-2 py-1 text-[11px] font-semibold text-destructive transition-colors hover:border-destructive"
            >
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {summary.criticalCount}
              <span className="sr-only">major disruptions — view alerts</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Major disruption on {criticalLines}</TooltipContent>
        </Tooltip>
      )}
      {summary.otherCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onView}
              className="flex items-center gap-1 rounded-full border border-warning-border/60 bg-warning-surface px-2 py-1 text-[11px] font-semibold text-warning-foreground transition-colors hover:border-warning-border"
            >
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {summary.otherCount}
              <span className="sr-only">delays or notices — view alerts</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Delays or planned works on your lines</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
