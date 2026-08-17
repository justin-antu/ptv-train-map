import { memo, useMemo } from "react";
import { Clock3, MapPin } from "lucide-react";
import { formatEta, upcomingStopsForStation, type UpcomingStop } from "../../data/departures";
import { useNow } from "../../hooks/useNow";
import type { LineStatic, LiveRun, StationStatic } from "../../shared/types";

interface FlindersDepartureBoardProps {
  lines: readonly LineStatic[];
  stations: readonly StationStatic[];
  runs: readonly LiveRun[];
}

const FLINDERS_STREET_ID = "flinders-street";

/**
 * A stable, non-auto-scrolling board for every Metro line. The board chooses
 * the soonest still-upcoming Flinders Street stop per line, regardless of
 * direction; later departures remain available to take over as each one
 * passes. Lines absent from the fetched window keep their place and show an
 * explicit empty state.
 *
 * The one-second clock lives in this memoized leaf. It updates countdowns and
 * rotates elapsed services without re-rendering App, MapView, or either pane.
 */
export const FlindersDepartureBoard = memo(function FlindersDepartureBoard({
  lines,
  stations,
  runs,
}: FlindersDepartureBoardProps) {
  const now = useNow(1000);
  const station = useMemo(
    () => stations.find((candidate) => candidate.id === FLINDERS_STREET_ID),
    [stations],
  );

  // Build the station window only when polling supplies new runs. Per-second
  // ticks then perform a cheap pass over this pre-sorted subset.
  const stationStops = useMemo(
    () => (station ? upcomingStopsForStation(station, [...runs], 0) : []),
    [station, runs],
  );
  const runByKey = useMemo(
    () => new Map(runs.map((run) => [`${run.lineId}:${run.runRef}`, run])),
    [runs],
  );

  const nextByLine = new Map<string, UpcomingStop>();
  for (const stop of stationStops) {
    if (Date.parse(stop.timeUtc) < now || nextByLine.has(stop.lineId)) continue;
    nextByLine.set(stop.lineId, stop);
  }

  return (
    <section
      aria-labelledby="flinders-board-title"
      className="thin-scrollbar relative flex h-full min-h-0 flex-col overflow-y-auto rounded-xl border border-border bg-card shadow-sm"
    >
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-4 backdrop-blur-sm">
        <div className="mb-1 flex items-center gap-1.5 text-[9.5px] tracking-[0.16em] text-muted-foreground uppercase">
          <MapPin className="size-3" aria-hidden="true" />
          Flinders Street
        </div>
        <h2 id="flinders-board-title" className="text-lg leading-tight font-medium tracking-[0.01em]">
          Next live departures
        </h2>
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
          Soonest service per line · live data window
        </p>
      </header>

      <div className="divide-y divide-border/70">
        {lines.map((line) => {
          const stop = nextByLine.get(line.id);
          const run = stop ? runByKey.get(`${stop.lineId}:${stop.runRef}`) : undefined;
          return (
            <article key={line.id} className="relative px-3 py-3">
              <span
                className="absolute inset-y-3 left-0 w-1 rounded-r-full"
                style={{ backgroundColor: line.color }}
                aria-hidden="true"
              />
              <div className="flex items-start gap-2.5">
                <span className="mt-1 size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: line.color }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] leading-tight font-semibold tracking-[0.01em]">{line.name}</div>
                  {stop && run ? (
                    <>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">
                        To <span className="text-foreground/85">{run.destinationName || "Destination unavailable"}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
                        <span className="text-sm font-semibold">{formatClock(stop.timeUtc)}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock3 className="size-3" aria-hidden="true" />
                          {formatEta(stop.timeUtc, now)}
                        </span>
                        <span className="text-[9px] tracking-[0.1em] text-muted-foreground uppercase">
                          {stop.isEstimate ? "Est." : "Sched."}
                        </span>
                        {Number.isFinite(stop.delayMin) && stop.delayMin >= 3 && (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                            +{stop.delayMin} min
                          </span>
                        )}
                      </div>
                      {stop.isEstimate && stop.delayMin >= 3 && (
                        <div className="mt-1 text-[9.5px] text-muted-foreground tabular-nums">
                          Scheduled {formatClock(stop.scheduledTimeUtc)}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
                      No upcoming service in current data
                    </p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
});

function formatClock(timeUtc: string): string {
  const time = new Date(timeUtc);
  if (Number.isNaN(time.getTime())) return "Time unavailable";
  return time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
