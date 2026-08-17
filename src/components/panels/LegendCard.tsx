import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
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
          className="flex w-full items-center justify-between px-4 py-3 text-xs font-bold tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground"
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
        <ScrollArea className="max-h-64">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 pb-4">
            {lines.map((line) => {
              const disruptions = disruptionsByLine[line.id] ?? [];
              const checked = visibleLines.visible.has(line.id);
              const isExpanded = expandedLineId === line.id;
              return (
                <div key={line.id} className="min-w-0">
                  <label className="flex cursor-pointer items-center gap-1.5 py-1 text-[11.5px] text-foreground/90">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => visibleLines.toggleLine(line.id)}
                      className="size-3.5 shrink-0"
                    />
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: line.color }} />
                    <span className="flex-1 truncate">{line.name}</span>
                    {disruptions.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setExpandedLineId(isExpanded ? null : line.id);
                        }}
                        title={`${disruptions.length} current disruption${disruptions.length === 1 ? "" : "s"} on the ${line.name} line`}
                        className="shrink-0 text-amber-500 transition-colors hover:text-amber-600 dark:text-warning dark:hover:text-warning-foreground"
                      >
                        <AlertTriangle className="size-3.5" />
                      </button>
                    )}
                  </label>
                  {isExpanded && disruptions.length > 0 && (
                    <div className="mb-1 space-y-1.5 rounded-md border border-warning-border/50 bg-warning-surface p-2 text-[10.5px] leading-snug text-warning-foreground">
                      {disruptions.map((d) => (
                        <div key={d.id}>
                          <div>{d.title}</div>
                          {d.url && (
                            <a href={d.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                              More info
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}
