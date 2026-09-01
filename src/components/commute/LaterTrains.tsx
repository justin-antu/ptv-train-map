import { departureStatus, type DepartureRow } from "../../data/departures";
import { cn } from "../../lib/utils";

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function shortEta(timeUtc: string, now: number): string {
  const diffMs = Date.parse(timeUtc) - now;
  if (diffMs <= 30_000) return "Due";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins} min`;
  return clockTime(timeUtc);
}

interface LaterTrainsProps {
  rows: DepartureRow[];
  now: number;
  lineColorById: Map<string, string>;
}

/** Three more services. Not another board. */
export function LaterTrains({ rows, now, lineColorById }: LaterTrainsProps) {
  if (rows.length === 0) return null;

  return (
    <div>
      <p className="type-label text-muted-foreground">Later</p>
      <ul className="mt-3 divide-y divide-border/70">
        {rows.map((row) => {
          const status = departureStatus(row);
          const lineColor = lineColorById.get(row.lineId) ?? "#152C6B";
          return (
            <li
              key={`${row.lineId}:${row.runRef}:${row.scheduledTimeUtc}`}
              className="flex min-h-11 items-baseline justify-between gap-3 py-3 font-mono text-sm"
            >
              <span className="flex min-w-0 items-baseline gap-3">
                <span className="w-14 shrink-0 tabular-nums">{clockTime(row.scheduledTimeUtc)}</span>
                <span className="truncate">{row.destinationName}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span
                  className={cn(
                    "tabular-nums",
                    row.isCancelled && "text-destructive",
                    status.tone === "warning" && "text-warning",
                  )}
                >
                  {row.isCancelled ? "CXL" : shortEta(row.timeUtc, now)}
                </span>
                {row.platform && !row.isCancelled && (
                  <span
                    className="rounded-sm border px-1.5 py-0.5 text-3xs font-semibold tracking-wide"
                    style={{ borderColor: lineColor }}
                  >
                    P{row.platform}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
