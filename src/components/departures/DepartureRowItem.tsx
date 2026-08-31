import { memo } from "react";
import { cn } from "../../lib/utils";
import { EtaText } from "../EtaText";
import { departureStatus, spokenEta, type DepartureRow } from "../../data/departures";

const STATUS_TONE_CLASS = {
  success: "text-success",
  warning: "text-warning",
  muted: "text-muted-foreground",
  destructive: "text-destructive",
} as const;

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

interface DepartureRowItemProps {
  row: DepartureRow;
  now: number;
  lineName: string;
  lineColor: string;
  /** Sentence describing where the service goes, e.g. "Stops all stations to Lilydale". */
  pattern: string;
  /**
   * The next usable service on the same line, named when this one is cancelled.
   * A bare cancellation without an alternative measurably lowers satisfaction
   * even when the cancellation itself is unavoidable.
   */
  nextAlternative?: { destinationName: string; timeUtc: string };
  /**
   * True when the whole snapshot is the shipped timetable. Suppresses the
   * per-row provenance badge, which would otherwise repeat "Timetable only" on
   * every row of a board that already says so once at the top.
   */
  isScheduleOnly: boolean;
  onOpenTimetable: (row: DepartureRow) => void;
}

/**
 * One departure.
 *
 * The hierarchy is deliberate. The countdown is the largest thing because it is
 * the only number most people read. The scheduled time is the row's *identity*
 * and is always present, with the expected time beside it as a status — never
 * silently swapped in, which leaves a rider unable to reconcile the board
 * against the timetable they remember. Platform sits with the countdown rather
 * than near the destination, because PTV's own Flinders Street testing found
 * riders could not tell which number was the platform and which the time.
 */
export const DepartureRowItem = memo(function DepartureRowItem({
  row,
  now,
  lineName,
  lineColor,
  pattern,
  nextAlternative,
  isScheduleOnly,
  onOpenTimetable,
}: DepartureRowItemProps) {
  const status = departureStatus(row);
  const scheduled = clockTime(row.scheduledTimeUtc);
  const expected = row.estimatedTimeUtc ? clockTime(row.estimatedTimeUtc) : null;
  const isRetimed = expected !== null && expected !== scheduled;

  const accessibleName = row.isCancelled
    ? `${scheduled} to ${row.destinationName}, ${lineName} line. Cancelled.`
      + (nextAlternative ? ` Next ${nextAlternative.destinationName} service ${clockTime(nextAlternative.timeUtc)}.` : "")
    : [
      `${scheduled} to ${row.destinationName}, ${lineName} line`,
      row.platform ? `platform ${row.platform}` : null,
      status.label.toLowerCase(),
      isRetimed ? `expected ${expected}` : null,
      `departing ${spokenEta(row.timeUtc, now)}`,
      pattern,
    ].filter(Boolean).join(", ") + ".";

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenTimetable(row)}
        aria-label={accessibleName}
        // The whole row is the target rather than a small chevron: at 44px tall
        // it already satisfies the touch minimum, and there is nothing else in
        // the row to hit by accident.
        className={cn(
          "flex w-full min-h-11 items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          row.isCancelled && "bg-destructive-surface/60",
        )}
      >
        <span
          className={cn("w-1 shrink-0 self-stretch rounded-full", row.isCancelled && "opacity-50")}
          style={{ background: lineColor }}
          aria-hidden="true"
        />

        <span className="min-w-0 flex-1" aria-hidden="true">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{row.destinationName}</span>
            {/* Colour alone stops being distinguishable well before sixteen
                lines, so the name always accompanies the chip. */}
            <span className="shrink-0 truncate text-2xs text-muted-foreground">{lineName}</span>
          </span>

          <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-2xs">
            <span className="type-numeric font-medium">{scheduled}</span>
            <span className={cn("font-medium", STATUS_TONE_CLASS[status.tone])}>
              {status.label}
              {isRetimed && !row.isCancelled && <span className="type-numeric"> · expected {expected}</span>}
            </span>
            {!row.isCancelled && !isScheduleOnly && (
              <LiveIndicator isRealtime={row.isRealtime} isPropagated={row.isPropagated} />
            )}
          </span>

          {row.isCancelled ? (
            nextAlternative && (
              <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                Next {nextAlternative.destinationName} service {clockTime(nextAlternative.timeUtc)}
              </span>
            )
          ) : (
            <span className="mt-0.5 block truncate text-2xs text-muted-foreground">{pattern}</span>
          )}
        </span>

        {/* Countdown and platform are locked together in one column so the two
            numbers can never be read as a pair. */}
        <span className="flex shrink-0 flex-col items-end gap-1" aria-hidden="true">
          {row.isCancelled ? (
            <span className="text-sm font-semibold text-destructive">Cancelled</span>
          ) : (
            <>
              {/* role="timer" carries an implicit aria-live of "off", so the
                  per-second tick never interrupts a screen reader. */}
              <span role="timer">
                <EtaText timeUtc={row.timeUtc} now={now} className="text-base font-semibold" />
              </span>
              {row.platform && (
                // Borrows the line colour so the platform reads as belonging to
                // the service in the row rather than to the board. Decorative
                // only: the line is named in full beside the destination.
                <span
                  className="type-numeric rounded border bg-secondary px-1.5 py-0.5 text-3xs font-semibold tracking-wide"
                  style={{ borderColor: lineColor }}
                >
                  PLAT {row.platform}
                </span>
              )}
            </>
          )}
        </span>
      </button>
    </li>
  );
});

/**
 * Per-row provenance, shown only for a mixed snapshot. A board that mixes
 * predictions and timetable times without saying which is which trains people
 * to distrust both; a board where every row is the same needs saying once.
 */
function LiveIndicator({ isRealtime, isPropagated }: { isRealtime: boolean; isPropagated: boolean }) {
  if (!isRealtime) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <span className="size-1.5 rounded-full border border-muted-foreground/60" />
        Timetable only
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-success">
      <span className="size-1.5 rounded-full bg-success motion-safe:animate-pulse" />
      {isPropagated ? "Live (estimated)" : "Live"}
    </span>
  );
}
