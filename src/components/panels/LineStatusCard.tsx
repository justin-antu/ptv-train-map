import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { formatAffectedDates, lineStatusFor, type LineStatus } from "../../data/disruptions";
import type { LineDisruption } from "../../shared/types";
import { cn } from "../../lib/utils";

const STATUS_CLASS: Record<LineStatus["severity"], string> = {
  good: "text-success",
  critical: "text-destructive",
  warning: "text-warning",
  info: "text-info",
};

export interface LineStatusEntry {
  id: string;
  name: string;
  color: string;
}

interface LineStatusCardProps {
  lines: LineStatusEntry[];
  disruptionsByLine: Record<string, LineDisruption[]>;
}

/**
 * Per-line service status and colour key for the map. Lines with an active
 * alert expand to show the PTV detail inline.
 */
export function LineStatusCard({ lines, disruptionsByLine }: LineStatusCardProps) {
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-t-2 border-border border-t-brand bg-card/80 shadow-sm backdrop-blur-sm">
      <h3 className="type-label shrink-0 px-4 py-3 text-muted-foreground">Line status</h3>
      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] lg:max-h-[24rem]">
        <div className="space-y-0.5 px-3 pb-3">
          {lines.map((line) => {
            const status = lineStatusFor(disruptionsByLine[line.id]);
            const hasDetail = status.disruptions.length > 0;
            const isExpanded = expandedLineId === line.id;
            const panelId = `line-status-${line.id}`;

            return (
              <Collapsible key={line.id} open={isExpanded}>
                <CollapsibleTrigger asChild disabled={!hasDetail}>
                  <button
                    type="button"
                    disabled={!hasDetail}
                    aria-expanded={hasDetail ? isExpanded : undefined}
                    aria-controls={hasDetail ? panelId : undefined}
                    onClick={() => hasDetail && setExpandedLineId(isExpanded ? null : line.id)}
                    className={cn(
                      "flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs transition-colors",
                      hasDetail ? "hover:bg-accent/60" : "cursor-default",
                    )}
                  >
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: line.color }} />
                    <span className="min-w-0 flex-1 truncate text-foreground/90">{line.name}</span>
                    <span className={cn("shrink-0 text-[11px] font-medium", STATUS_CLASS[status.severity])}>{status.label}</span>
                    {hasDetail && (
                      <ChevronDown
                        className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180")}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent
                  id={panelId}
                  className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
                >
                  <div className="mx-1 mb-2 space-y-3 rounded-lg border border-warning-border/60 bg-warning-surface px-3 py-2.5 text-warning-foreground shadow-sm">
                    {status.disruptions.map((disruption, index) => (
                      <article key={disruption.id} className={cn(index > 0 && "border-t border-warning-border/40 pt-3")}>
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                          {disruption.disruptionType && (
                            <span className="type-label rounded-full border border-warning-border/60 bg-warning-muted/70 px-2 py-0.5">
                              {disruption.disruptionType}
                            </span>
                          )}
                          {disruption.disruptionStatus && (
                            <span className="type-label text-warning-foreground/70">{disruption.disruptionStatus}</span>
                          )}
                        </div>
                        <p className="text-[11px] leading-relaxed">{disruption.title}</p>
                        {(disruption.fromDateUtc || disruption.toDateUtc) && (
                          <p className="mt-1.5 text-[11px] leading-snug text-warning-foreground/75">
                            {formatAffectedDates(disruption.fromDateUtc, disruption.toDateUtc)}
                          </p>
                        )}
                        {disruption.url && (
                          <a
                            href={disruption.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex min-h-7 items-center gap-1 text-[11px] font-medium underline decoration-warning-border underline-offset-2 hover:text-foreground"
                          >
                            PTV details <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        )}
                      </article>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </div>
    </div>
  );
}
