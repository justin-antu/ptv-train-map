import { forwardRef } from "react";
import { NumberTicker } from "../ui/number-ticker";
import { BorderBeam } from "../ui/border-beam";
import { arrivalForDestination, DELAYED_THRESHOLD_MIN, departureStatus, spokenEta, type DepartureRow } from "../../data/departures";
import { cn } from "../../lib/utils";

const DUE_SOON_MS = 2 * 60_000;

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

interface HeroNextTrainProps {
  row: DepartureRow;
  now: number;
  originName: string;
  destinationName: string;
  destinationStationId?: string | null;
  lineName: string;
  lineColor: string;
  pattern: string;
  nextAlternative?: { destinationName: string; timeUtc: string };
}

/**
 * The product: one next service, at a scale you can read from the platform.
 */
export const HeroNextTrain = forwardRef<HTMLElement, HeroNextTrainProps>(function HeroNextTrain(
  {
    row,
    now,
    originName,
    destinationName,
    destinationStationId,
    lineName,
    lineColor,
    pattern,
    nextAlternative,
  },
  ref,
) {
  const status = departureStatus(row);
  const scheduled = clockTime(row.scheduledTimeUtc);
  const expected = row.estimatedTimeUtc ? clockTime(row.estimatedTimeUtc) : null;
  const departTime = clockTime(row.timeUtc);
  const arrival = arrivalForDestination(row.onwardStops, destinationStationId);
  const arriveTime = arrival ? clockTime(arrival.timeUtc) : null;
  const issued = ticketStamp(now);
  const isRetimed = expected !== null && expected !== scheduled;
  const remainingMs = Date.parse(row.timeUtc) - now;
  const dueSoon = !row.isCancelled && remainingMs > 0 && remainingMs <= DUE_SOON_MS;
  const mins = Math.round(remainingMs / 60_000);
  const isDue = remainingMs <= 30_000;
  const showMinutes = !isDue && mins < 60;

  const accessibleName = row.isCancelled
    ? `${scheduled} to ${row.destinationName}, ${lineName} line. Cancelled.`
      + (nextAlternative ? ` Next ${nextAlternative.destinationName} service ${clockTime(nextAlternative.timeUtc)}.` : "")
    : [
      `${scheduled} from ${originName} to ${destinationName}, ${lineName} line`,
      row.platform ? `platform ${row.platform}` : null,
      status.label.toLowerCase(),
      isRetimed ? `expected ${expected}` : null,
      `departing ${spokenEta(row.timeUtc, now)}`,
      pattern,
    ].filter(Boolean).join(", ") + ".";

  return (
    <article
      ref={ref}
      aria-label={accessibleName}
      className={cn(
        "relative w-full overflow-hidden rounded-sm border border-border/70 bg-background/40 px-5 py-8 text-left sm:px-8 sm:py-10",
        row.isCancelled && "bg-destructive-surface/80",
      )}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2" style={{ background: lineColor }} />
      {dueSoon && (
        <span data-capture-ignore="" className="pointer-events-none absolute inset-0">
          <BorderBeam
            size={80}
            duration={8}
            colorFrom={lineColor}
            colorTo={lineColor}
            borderWidth={1.5}
          />
        </span>
      )}

      <div className="flex items-baseline justify-between gap-4 pl-3">
        <p className="type-label text-muted-foreground">Next</p>
        <p className="font-mono text-[clamp(0.625rem,2.4vw,0.75rem)] uppercase tracking-widest text-muted-foreground">
          {issued}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-6 pl-3">
        <div className="min-w-0">
          {row.isCancelled ? (
            <p className="type-display text-5xl text-destructive sm:text-7xl">Cancelled</p>
          ) : isDue ? (
            <p className="type-display text-[clamp(4.5rem,16vw,9rem)] text-foreground">Due</p>
          ) : showMinutes ? (
            <p className="flex items-end gap-3">
              <span className="type-display text-[clamp(4.5rem,16vw,9rem)] text-foreground">
                <NumberTicker value={mins} className="text-inherit dark:text-inherit" />
              </span>
              <span className="mb-3 font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground sm:mb-5 sm:text-base">
                min
              </span>
            </p>
          ) : (
            <p className="type-display text-[clamp(3rem,10vw,6rem)] text-foreground">{clockTime(row.timeUtc)}</p>
          )}
        </div>

        {!row.isCancelled && (
          <div className="mb-2 flex flex-col items-end gap-2 font-mono">
            {row.platform && (
              <span
                className="rounded-sm border px-2.5 py-1 text-xs font-semibold tracking-widest text-foreground"
                style={{ borderColor: lineColor }}
              >
                PLAT {row.platform}
              </span>
            )}
            <span className="text-sm">{scheduled}</span>
            {isRetimed && <span className="text-xs text-warning">expected {expected}</span>}
            {(!isRetimed || (row.delayMin !== null && row.delayMin >= DELAYED_THRESHOLD_MIN)) && (
              <span
                className={cn(
                  "text-xs uppercase tracking-widest",
                  status.tone === "success" && "text-success",
                  status.tone === "warning" && "text-warning",
                  status.tone === "destructive" && "text-destructive",
                  status.tone === "muted" && "text-muted-foreground",
                )}
              >
                {status.label.toLowerCase()}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="relative mt-8 grid grid-cols-[1fr_auto_1fr] items-start gap-3 border-t border-dashed border-border/80 pt-6 pl-3 sm:gap-5">
        <div className="min-w-0">
          <p className="type-label text-muted-foreground">Depart</p>
          <h2 className="type-heading mt-1 truncate text-lg sm:text-2xl">{originName}</h2>
          <p className="mt-1 font-mono text-sm tabular-nums">{departTime}</p>
        </div>
        <span aria-hidden="true" className="mt-7 font-mono text-xs text-muted-foreground">→</span>
        <div className="min-w-0 text-right">
          <p className="type-label text-muted-foreground">Arrive</p>
          <p className="type-heading mt-1 truncate text-lg sm:text-2xl">{destinationName}</p>
          <p className="mt-1 font-mono text-sm tabular-nums">{arriveTime ?? "—"}</p>
          {arrival?.viaStationName && (
            <p className="mt-0.5 font-mono text-2xs text-muted-foreground">via {arrival.viaStationName}</p>
          )}
        </div>
      </div>

      <p className="mt-5 pl-3 font-mono text-xs text-muted-foreground sm:text-sm">
        {lineName} line
        <span className="mx-2">·</span>
        {pattern}
      </p>
      {row.isCancelled && nextAlternative && (
        <p className="mt-3 pl-3 font-mono text-xs text-muted-foreground">
          Next {nextAlternative.destinationName} service {clockTime(nextAlternative.timeUtc)}
        </p>
      )}
    </article>
  );
});

function ticketStamp(now: number): string {
  return new Date(now).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}
