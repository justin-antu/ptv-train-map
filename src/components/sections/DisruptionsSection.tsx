import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Info } from "lucide-react";
import { SectionCard } from "../layout/SectionCard";
import { Button } from "../ui/button";
import {
  DISRUPTION_SEVERITY_LABELS,
  DISRUPTION_SEVERITY_ORDER,
  aggregateDisruptions,
  formatAffectedDates,
  type AggregatedDisruption,
  type DisruptionSeverity,
} from "../../data/disruptions";
import { cn } from "../../lib/utils";
import type { FavouriteLineFilter } from "../../hooks/useFavouriteLineFilter";
import type { LineDisruption } from "../../shared/types";

/**
 * Only the severity chip carries a tone; the card itself stays neutral so the
 * alert text reads at the same contrast as the rest of the app.
 */
const SEVERITY_STYLES: Record<DisruptionSeverity, { chip: string; icon: typeof AlertTriangle }> = {
  critical: {
    chip: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
  warning: {
    chip: "border-warning-border/70 bg-warning-muted/70 text-warning-foreground",
    icon: AlertTriangle,
  },
  info: {
    chip: "border-warning-border/40 bg-warning-surface text-warning-foreground/80",
    icon: Info,
  },
};

interface DisruptionsSectionProps {
  disruptionsByLine: Record<string, LineDisruption[]>;
  lineOrder: string[];
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  lineFilter: FavouriteLineFilter;
}

/** Network disruption feed, most disruptive first, narrowed to the commuter's lines. */
export function DisruptionsSection({
  disruptionsByLine,
  lineOrder,
  lineNameById,
  lineColorById,
  lineFilter,
}: DisruptionsSectionProps) {
  const [showAllLines, setShowAllLines] = useState(false);

  const all = useMemo(() => aggregateDisruptions(disruptionsByLine, lineOrder), [disruptionsByLine, lineOrder]);
  const mine = useMemo(() => all.filter((entry) => entry.lineIds.some((lineId) => lineFilter.includes(lineId))), [all, lineFilter]);

  const filtered = showAllLines ? all : mine;
  const hiddenCount = all.length - mine.length;
  const canFilter = lineFilter.hasPreference && hiddenCount > 0;

  const groups = DISRUPTION_SEVERITY_ORDER.map((severity) => ({
    severity,
    entries: filtered.filter((entry) => entry.severity === severity),
  })).filter((group) => group.entries.length > 0);

  return (
    <SectionCard
      id="alerts"
      title="Service disruptions"
      description={showAllLines || !lineFilter.hasPreference ? "Current alerts across the network" : "Current alerts on your line"}
    >
      {canFilter && (
        <div className="mb-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setShowAllLines((prev) => !prev)} className="text-muted-foreground">
            {showAllLines ? "Show my line only" : `Show all lines (${hiddenCount} more)`}
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-success-border/60 bg-success-surface p-4 text-success-foreground">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">
            Good service{lineFilter.hasPreference && !showAllLines ? " on your line" : " on all lines"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(({ severity, entries }) => (
            <div key={severity}>
              <h3 className="type-label mb-2 text-muted-foreground">
                {DISRUPTION_SEVERITY_LABELS[severity]} · {entries.length}
              </h3>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((entry) => (
                  <DisruptionCard key={entry.disruption.id} entry={entry} lineNameById={lineNameById} lineColorById={lineColorById} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function DisruptionCard({
  entry,
  lineNameById,
  lineColorById,
}: {
  entry: AggregatedDisruption;
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
}) {
  const { disruption, lineIds, severity } = entry;
  const styles = SEVERITY_STYLES[severity];
  const Icon = styles.icon;

  return (
    <li className="flex flex-col rounded-xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("type-label flex items-center gap-1 rounded-full border px-2 py-0.5", styles.chip)}>
          <Icon className="size-3" aria-hidden="true" />
          {DISRUPTION_SEVERITY_LABELS[severity]}
        </span>
        {disruption.disruptionType && <span className="type-label text-muted-foreground">{disruption.disruptionType}</span>}
      </div>

      <p className="mt-2 flex-1 text-xs leading-relaxed">{disruption.title}</p>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {lineIds.map((lineId) => (
          <span key={lineId} className="flex items-center gap-1.5 text-[11px] font-medium">
            <span className="size-2.5 rounded-[3px]" style={{ background: lineColorById.get(lineId) ?? "#999" }} />
            {lineNameById.get(lineId) ?? lineId}
          </span>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{formatAffectedDates(disruption.fromDateUtc, disruption.toDateUtc)}</p>

      {disruption.url && (
        <a
          href={disruption.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-7 items-center gap-1 text-[11px] font-medium underline underline-offset-2 hover:opacity-80"
        >
          PTV details <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      )}
    </li>
  );
}
