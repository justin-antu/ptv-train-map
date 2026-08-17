import { AlertTriangle } from "lucide-react";
import { ScrollArea } from "../ui/scroll-area";
import type { LineDisruption } from "../../shared/types";

interface AlertsCardProps {
  disruptionsByLine: Record<string, LineDisruption[]>;
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
}

interface GroupedAlert {
  disruption: LineDisruption;
  lineIds: string[];
}

/**
 * Static (non-scrolling) list of current PTV service alerts, one row per
 * distinct disruption — replaces an earlier auto-scrolling Marquee ticker,
 * which users couldn't read in time before it scrolled off. Lives under the
 * line legend in the left pane instead of the header.
 *
 * The same underlying PTV disruption can affect multiple lines at once (e.g.
 * a City Loop closure), so this groups by `disruption.id` and lists every
 * affected line's colour/name on one row rather than repeating the same
 * alert text once per line.
 */
export function AlertsCard({ disruptionsByLine, lineNameById, lineColorById }: AlertsCardProps) {
  const byId = new Map<number, GroupedAlert>();
  for (const [lineId, disruptions] of Object.entries(disruptionsByLine)) {
    for (const disruption of disruptions) {
      const existing = byId.get(disruption.id);
      if (existing) existing.lineIds.push(lineId);
      else byId.set(disruption.id, { disruption, lineIds: [lineId] });
    }
  }
  const alerts = [...byId.values()];
  if (alerts.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-warning-border/50 bg-warning-surface/90 shadow-sm">
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5 text-xs font-bold tracking-wide text-warning uppercase">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span>
          Service alerts ({alerts.length})
        </span>
      </div>
      <ScrollArea className="max-h-56">
        <ul className="space-y-2 px-4 pb-3">
          {alerts.map(({ disruption, lineIds }) => (
            <li key={disruption.id} className="text-[11.5px] leading-snug text-warning-foreground">
              <div className="mb-1 flex flex-wrap items-center gap-1">
                {lineIds.map((lineId) => (
                  <span key={lineId} className="flex items-center gap-1 rounded-full bg-warning-muted/80 px-1.5 py-0.5 text-[10px] font-semibold">
                    <span className="size-2 shrink-0 rounded-[2px]" style={{ background: lineColorById.get(lineId) ?? "#999" }} />
                    {lineNameById.get(lineId) ?? lineId}
                  </span>
                ))}
              </div>
              <div>{disruption.title}</div>
              {disruption.url && (
                <a href={disruption.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  More info
                </a>
              )}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
