import { useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeftRight, Bell, BellOff, RotateCcw } from "lucide-react";
import { SectionCard } from "../layout/SectionCard";
import { useSectionNavigation } from "../layout/sectionNavigation";
import { SearchableSelect, type SelectItem } from "../SearchableSelect";
import { ScopeChip } from "../ScopeChip";
import { CountAnnouncer } from "../CountAnnouncer";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { DepartureRowItem } from "../departures/DepartureRowItem";
import { DeparturesEmptyState, type EmptyReason } from "../departures/DeparturesEmptyState";
import { useNow } from "../../hooks/useNow";
import { departureRowsForStation, describeStoppingPattern, type DepartureRow } from "../../data/departures";
import { describeFreshness } from "../../data/freshness";
import { CBD_QUICK_PICK_STATION_IDS } from "../../shared/commute";
import { cn } from "../../lib/utils";
import type { LineDisruptionSummary } from "../../data/disruptions";
import type { DeparturePreferencesController } from "../../hooks/useDeparturePreferences";
import type { NotificationsController } from "../../hooks/useNotifications";
import type { LineStatic, LiveRun, StationStatic } from "../../shared/types";

/** Departures shown before the reader asks for more. */
const PREVIEW_ROWS = 4;
const EXPANDED_ROWS = 12;

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
  feedTimestampUtc: string | null;
  isScheduleOnly: boolean;
  onOpenTimetableAt: (row: DepartureRow) => void;
}

/**
 * The landing card: the next services from the commuter's station.
 *
 * Origin is a *scope switch* — it re-bases everything below and is therefore
 * the screen's subject, kept apart from the filters. Destination and line are
 * *filters* over that scope and sit in a chip row beneath it. The old layout
 * put all three in one "From / To" bar, which is journey-planner grammar and
 * was read that way no matter what the help text said.
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
  feedTimestampUtc,
  isScheduleOnly,
  onOpenTimetableAt,
}: LiveDeparturesSectionProps) {
  const navigate = useSectionNavigation();
  const now = useNow(1000);
  const [expanded, setExpanded] = useState(false);
  const originFieldId = useId();
  const destinationFieldId = useId();

  const freshness = useMemo(
    () => describeFreshness({ generatedAtUtc: generatedAtUtc ?? "", feedTimestampUtc: feedTimestampUtc ?? undefined, isScheduleOnly }, now),
    [generatedAtUtc, feedTimestampUtc, isScheduleOnly, now],
  );

  const selectedLine = useMemo(
    () => (preferences.lineId ? (lines.find((line) => line.id === preferences.lineId) ?? null) : null),
    [lines, preferences.lineId],
  );
  const linesById = useMemo(() => new Map(lines.map((line) => [line.id, line])), [lines]);
  const stationNamesById = useMemo(() => new Map(stations.map((station) => [station.id, station.name])), [stations]);

  const stationItems = useMemo<SelectItem[]>(
    () => stations.map((station) => ({ id: station.id, label: station.name })),
    [stations],
  );

  // A station id saved before a data regeneration may no longer exist; treat it
  // as unset rather than rendering an empty board with no explanation.
  const origin = preferences.originStationId ? stationsById.get(preferences.originStationId) : undefined;
  const destination = preferences.destinationStationId ? stationsById.get(preferences.destinationStationId) : undefined;

  // Three progressively narrower result sets, kept separately so the empty
  // state can name which filter did the excluding rather than shrugging.
  const { unfiltered, destinationOnly, rows } = useMemo(() => {
    if (!origin) return { unfiltered: [], destinationOnly: [], rows: [] };
    const all = departureRowsForStation(origin, runs, now);
    const byDestination = destination
      ? all.filter((row) => row.onwardStops.some((stop) => stop.stationId === destination.id && !stop.isSkipped))
      : all;
    return {
      unfiltered: all,
      destinationOnly: byDestination,
      rows: preferences.lineId ? byDestination.filter((row) => row.lineId === preferences.lineId) : byDestination,
    };
  }, [origin, destination, runs, now, preferences.lineId]);

  const runnable = useMemo(() => rows.filter((row) => !row.isCancelled), [rows]);
  const visibleRows = rows.slice(0, expanded ? EXPANDED_ROWS : PREVIEW_ROWS);

  const openTimetable = useCallback(
    (row: DepartureRow) => {
      onOpenTimetableAt(row);
      navigate("timetable");
    },
    [onOpenTimetableAt, navigate],
  );

  /** The next usable service on the same line, for a cancelled row to point at. */
  const nextAlternativeFor = useCallback(
    (row: DepartureRow) =>
      rows.find(
        (candidate) =>
          !candidate.isCancelled
          && candidate.lineId === row.lineId
          && Date.parse(candidate.timeUtc) > Date.parse(row.timeUtc),
      ),
    [rows],
  );

  // Counts only. Anything time-derived here would be re-announced every second.
  const cancelledCount = rows.length - runnable.length;
  const announcement = origin
    ? [
      `${rows.length} ${rows.length === 1 ? "departure" : "departures"}`,
      `from ${origin.name}`,
      destination ? `stopping at ${destination.name}` : null,
      selectedLine ? `on the ${selectedLine.name} line` : null,
      cancelledCount > 0 ? `${cancelledCount} cancelled` : null,
    ].filter(Boolean).join(", ")
    : "No departure station chosen";

  const emptyReason = useMemo<EmptyReason | null>(() => {
    if (!origin) return { kind: "no-origin" };
    if (rows.length > 0) return null;
    if (selectedLine && !selectedLine.stationIds.includes(origin.id)) {
      return { kind: "line-excludes-origin", originName: origin.name, lineName: selectedLine.name };
    }
    if (selectedLine && destination && destinationOnly.length > 0) {
      return { kind: "line-excludes-destination", destinationName: destination.name, lineName: selectedLine.name };
    }
    if (destination && unfiltered.length > 0) {
      // Some line reaches it eventually, just not inside this board's window.
      const everReached = runs.some((run) => run.stops.some((stop) => stop.stationId === destination.id));
      return everReached
        ? { kind: "outside-window", destinationName: destination.name }
        : { kind: "unreachable", originName: origin.name, destinationName: destination.name };
    }
    return { kind: "none", originName: origin.name };
  }, [origin, destination, selectedLine, rows.length, destinationOnly.length, unfiltered.length, runs]);

  // All-cancelled is its own state: the services exist, so "no departures"
  // would be a lie, and the useful next step is the alerts feed.
  const allCancelled = rows.length > 0 && runnable.length === 0;

  return (
    <SectionCard
      id="departures"
      title="Departures"
      description={origin ? `Next services from ${origin.name}` : undefined}
      actions={
        // These act on the board as a whole rather than on any one control in
        // it, so they belong to the card's own header. Given a row inside the
        // body they mostly sat there alone, since the alerts toggle is the only
        // one of the three that is always shown.
        <div className="flex items-center gap-1">
          <DisruptionIndicators summary={disruptionSummary} lineNameById={lineNameById} onView={() => navigate("alerts")} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-pressed={notifications.enabled}
                onClick={() => void notifications.toggle()}
                className={cn("touch-target shrink-0", notifications.enabled ? "text-brand" : "text-muted-foreground")}
              >
                {notifications.enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
                <span className="sr-only">Arrival alerts {notifications.enabled ? "on" : "off"}</span>
              </Button>
            </TooltipTrigger>
            {/* Says "open" because it is: the check is a foreground timer, so
                a locked phone gets nothing. Promising background alerts would
                be the kind of lie that makes someone miss a train. */}
            <TooltipContent>
              {notifications.enabled
                ? "Arrival alerts on — fires ~2 min before a train arrives, while the app is open"
                : "Alert me ~2 min before a train arrives, while the app is open"}
            </TooltipContent>
          </Tooltip>
          {/* Only offered once there is something to undo: a permanently live
              destructive control beside the station picker is a trap. */}
          {!preferences.isDefault && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={preferences.reset}
                  className="touch-target shrink-0 text-muted-foreground"
                >
                  <RotateCcw className="size-4" />
                  <span className="sr-only">Reset the board</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset the board</TooltipContent>
            </Tooltip>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/*
          Origin and destination sit on one row at one size. They still do
          different jobs — origin re-bases the board, destination only filters
          it — but expressing that as two differently sized controls on separate
          rows read as a rendering fault rather than as a distinction. The
          visible captions carry the difference instead.
        */}
        <div className="flex items-end gap-2">
          <Field label="Departing from" htmlFor={originFieldId}>
            <SearchableSelect
              id={originFieldId}
              items={stationItems}
              value={preferences.originStationId}
              onChange={preferences.setOrigin}
              placeholder="Choose station"
              quickPickIds={CBD_QUICK_PICK_STATION_IDS}
              label="Departing from"
            />
          </Field>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-disabled={!preferences.destinationStationId}
                onClick={() => preferences.swap()}
                className={cn("touch-target shrink-0 text-muted-foreground", !preferences.destinationStationId && "opacity-40")}
              >
                <ArrowLeftRight className="size-4" />
                <span className="sr-only">Reverse the journey</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {preferences.destinationStationId ? "Reverse the journey" : "Set a destination to reverse the journey"}
            </TooltipContent>
          </Tooltip>

          <Field label="Stopping at" htmlFor={destinationFieldId}>
            <SearchableSelect
              id={destinationFieldId}
              items={stationItems}
              value={preferences.destinationStationId}
              onChange={preferences.setDestination}
              placeholder="Anywhere"
              emptyOption="Anywhere"
              quickPickIds={CBD_QUICK_PICK_STATION_IDS}
              label="Only show trains stopping at"
              align="end"
            />
          </Field>
        </div>

        {/* The header already names the scoped line, so this restates it only
            for the one thing the header cannot show: how much of the board it
            is hiding. */}
        {selectedLine && (
          <ScopeChip
            className="self-start"
            label={`${selectedLine.name} line`}
            color={selectedLine.color}
            count={
              destinationOnly.length > rows.length
                ? `${rows.length} of ${destinationOnly.length} services`
                : undefined
            }
            onClear={() => preferences.setLine(null)}
          />
        )}

        {/* A denied permission prompt has to be visible without going hunting
            for it, so it sits at the top of the body rather than behind the
            toggle that caused it. */}
        {notifications.message && <p className="text-2xs text-destructive">{notifications.message}</p>}

        <CountAnnouncer message={announcement} />

        {/* The status line itself lives in the masthead, because it is true of
            the map and the alerts too. Only the schedule-only case still earns
            a banner here: with no real-time layer, a cancelled service is
            indistinguishable from a running one, and that is worth interrupting
            for in a way that merely aging times are not. */}
        {freshness.detail && (
          <p className="flex items-start gap-2.5 rounded-lg border border-warning-border/60 bg-warning-surface px-3 py-2.5 text-xs text-warning-foreground">
            <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden="true" />
            <span>{freshness.detail}</span>
          </p>
        )}

        {allCancelled && origin ? (
          <DeparturesEmptyState
            reason={{ kind: "all-cancelled", originName: origin.name, count: rows.length }}
            onClearLine={() => preferences.setLine(null)}
            onClearDestination={() => preferences.setDestination(null)}
            onOpenTimetable={() => navigate("timetable")}
          />
        ) : emptyReason ? (
          <DeparturesEmptyState
            reason={emptyReason}
            onClearLine={() => preferences.setLine(null)}
            onClearDestination={() => preferences.setDestination(null)}
            onOpenTimetable={() => navigate("timetable")}
          />
        ) : (
          <>
            <ul className="divide-y divide-border/60">
              {visibleRows.map((row) => (
                <DepartureRowItem
                  key={`${row.lineId}:${row.runRef}:${row.scheduledTimeUtc}`}
                  row={row}
                  now={now}
                  lineName={lineNameById.get(row.lineId) ?? row.lineId}
                  lineColor={lineColorById.get(row.lineId) ?? "#999"}
                  pattern={describeStoppingPattern(row, stationNamesById, linesById.get(row.lineId), row.stationId)}
                  nextAlternative={row.isCancelled ? nextAlternativeFor(row) : undefined}
                  isScheduleOnly={isScheduleOnly}
                  onOpenTimetable={openTimetable}
                />
              ))}
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
 * A caption above one of the two station pickers.
 *
 * The pickers are deliberately identical in size, so without a visible caption
 * the pair reads as the From/To of a journey planner. The caption is what says
 * the second one only filters what the first one produced.
 */
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label htmlFor={htmlFor} className="type-label truncate text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Only major disruptions earn a place on the board itself.
 *
 * Car-park works and station detours were previously given an amber pill here
 * beside the critical one, so the board carried a permanent pair of warning
 * badges that never changed and stopped being read. Everything below critical
 * lives in the alerts feed, which the tab badge already counts.
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
  if (summary.criticalCount === 0) return null;

  const criticalLines = summary.criticalLineIds.map((lineId) => lineNameById.get(lineId) ?? lineId).join(", ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onView}
          className="flex min-h-11 items-center gap-1 rounded-full border border-destructive-border/70 bg-destructive-surface px-2.5 text-2xs font-semibold text-destructive transition-colors hover:border-destructive"
        >
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          {summary.criticalCount}
          <span className="sr-only">
            major {summary.criticalCount === 1 ? "disruption" : "disruptions"} on {criticalLines} — view alerts
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>Major disruption on {criticalLines}</TooltipContent>
    </Tooltip>
  );
}
