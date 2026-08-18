import { useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import type { LineDisruption } from "../../shared/types";
import type { VisibleLinesController } from "../../hooks/useVisibleLines";
import { cn } from "../../lib/utils";

const COLLAPSED_STORAGE_KEY = "wimt:legendCollapsed";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Ignore write failures.
  }
}

export interface LegendLine {
  id: string;
  name: string;
  color: string;
}

interface LegendCardProps {
  lines: LegendLine[];
  visibleLines: VisibleLinesController;
  disruptionsByLine: Record<string, LineDisruption[]>;
}

/**
 * Collapsible show/hide-per-line legend, restyled as a bento-style card.
 * Both the per-line visibility selection (`useVisibleLines`) and this
 * card's own collapsed/expanded state persist across visits, matching the
 * original vanilla implementation's behaviour.
 */
export function LegendCard({ lines, visibleLines, disruptionsByLine }: LegendCardProps) {
  const [open, setOpen] = useState(() => !loadCollapsed());
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        saveCollapsed(!next);
      }}
      className="relative overflow-hidden rounded-xl border border-t-2 border-border border-t-primary bg-card/80 shadow-sm backdrop-blur-sm"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="type-label flex min-h-11 w-full items-center justify-between px-4 py-3 text-muted-foreground transition-colors hover:text-foreground"
        >
          <span>Lines</span>
          <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="flex items-center gap-2 px-4 pb-2">
          <Button size="sm" variant="secondary" className="h-6 rounded-full px-3 text-[11px]" onClick={visibleLines.showAll}>
            All
          </Button>
          <Button size="sm" variant="secondary" className="h-6 rounded-full px-3 text-[11px]" onClick={visibleLines.hideAll}>
            None
          </Button>
        </div>
        <ScrollArea className="max-h-[30rem]">
          <div className="space-y-0.5 px-3 pb-3">
            {lines.map((line) => {
              const disruptions = [...new Map((disruptionsByLine[line.id] ?? []).map((disruption) => [disruption.id, disruption])).values()];
              const checked = visibleLines.visible.has(line.id);
              const isExpanded = expandedLineId === line.id;
              const panelId = `line-alerts-${line.id}`;
              return (
                <Collapsible key={line.id} open={isExpanded}>
                  <div className="flex min-w-0 items-center rounded-md transition-colors hover:bg-accent/60">
                    <label htmlFor={`line-visible-${line.id}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1.5 py-1.5 text-xs text-foreground/90">
                      <Checkbox
                        id={`line-visible-${line.id}`}
                        checked={checked}
                        onCheckedChange={() => visibleLines.toggleLine(line.id)}
                        className="size-3.5 shrink-0"
                      />
                      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: line.color }} />
                      <span className="flex-1 truncate">{line.name}</span>
                    </label>
                    {disruptions.length > 0 && (
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={panelId}
                          aria-label={`${isExpanded ? "Close" : "Open"} service alert details for the ${line.name} line`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setExpandedLineId(isExpanded ? null : line.id);
                          }}
                          className="mr-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-amber-600 transition-colors hover:bg-amber-500/10 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 dark:text-warning dark:hover:text-warning-foreground"
                        >
                          <AlertTriangle className="size-3.5" aria-hidden="true" />
                        </button>
                      </CollapsibleTrigger>
                    )}
                  </div>
                  <CollapsibleContent
                    id={panelId}
                    className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
                  >
                    <div className="mx-1 mb-2 space-y-3 rounded-lg border border-warning-border/60 bg-warning-surface px-3 py-2.5 text-warning-foreground shadow-sm">
                      {disruptions.map((disruption, index) => (
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
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}

function formatAffectedDates(fromDateUtc: string | null, toDateUtc: string | null): string {
  const format = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  };
  const from = fromDateUtc ? format(fromDateUtc) : null;
  const to = toDateUtc ? format(toDateUtc) : null;
  if (from && to) return `Affected ${from} – ${to}`;
  if (from) return `Affected from ${from}`;
  if (to) return `Affected until ${to}`;
  return "Dates unavailable";
}
