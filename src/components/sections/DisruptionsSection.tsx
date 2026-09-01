import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, Info } from "lucide-react";
import { SectionCard } from "../layout/SectionCard";
import { CountAnnouncer } from "../CountAnnouncer";
import { useNow } from "../../hooks/useNow";
import {
  DISRUPTION_SEVERITY_LABELS,
  DISRUPTION_SEVERITY_ORDER,
  aggregateDisruptions,
  describeScope,
  disruptionTiming,
  type AggregatedDisruption,
  type DisruptionSeverity,
} from "../../data/disruptions";
import { cn } from "../../lib/utils";
import type { LineDisruption } from "../../shared/types";

/**
 * Red, amber, blue — the three bands are meant to be told apart at a glance,
 * which the previous palette could not do: minor delays and information both
 * rendered in amber, differing only by opacity.
 *
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
    chip: "border-info-border/60 bg-info-surface text-info-foreground",
    icon: Info,
  },
};

interface DisruptionsSectionProps {
  disruptionsByLine: Record<string, LineDisruption[]>;
  lineOrder: string[];
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  /** The app-wide line scope, shared with the header control and every other section. */
  scopeLineId: string | null;
  onScopeLineChange: (lineId: string | null) => void;
}

/**
 * Network disruption feed, split by whether it affects travel now.
 *
 * The line chips are the scope control rather than a second, private filter:
 * picking one here is the same act as picking one in the header, so the alerts
 * feed and the departure board can never disagree about which line the reader
 * is looking at.
 */
export function DisruptionsSection({
  disruptionsByLine,
  lineOrder,
  lineNameById,
  lineColorById,
  scopeLineId,
  onScopeLineChange,
}: DisruptionsSectionProps) {
  const now = useNow(60_000);
  const [mutedSeverities, setMutedSeverities] = useState<DisruptionSeverity[]>([]);

  const all = useMemo(() => aggregateDisruptions(disruptionsByLine, lineOrder), [disruptionsByLine, lineOrder]);

  // Only offer lines that have something to show. A filter listing sixteen
  // lines where fifteen lead to "no alerts" is a maze, not a control.
  const linesWithAlerts = useMemo(() => {
    const ids = new Set(all.flatMap((entry) => entry.lineIds));
    return lineOrder.filter((lineId) => ids.has(lineId));
  }, [all, lineOrder]);

  const scoped = useMemo(
    () => (scopeLineId ? all.filter((entry) => entry.lineIds.includes(scopeLineId)) : all),
    [all, scopeLineId],
  );

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 } satisfies Record<DisruptionSeverity, number>;
    for (const entry of scoped) counts[entry.severity] += 1;
    return counts;
  }, [scoped]);

  const visible = useMemo(
    () => scoped.filter((entry) => !mutedSeverities.includes(entry.severity)),
    [scoped, mutedSeverities],
  );

  const timed = useMemo(() => {
    const groups: Record<"now" | "upcoming", AggregatedDisruption[]> = { now: [], upcoming: [] };
    for (const entry of visible) groups[disruptionTiming(entry.fromDateUtc, now)].push(entry);
    return groups;
  }, [visible, now]);

  const scopeLineName = scopeLineId ? (lineNameById.get(scopeLineId) ?? scopeLineId) : null;

  // A filter that silently removes most of a feed is the commonest way people
  // conclude the data is broken, so the heading says how much it is hiding.
  const description = scopeLineName
    ? `Current alerts on the ${scopeLineName} line${all.length > scoped.length ? ` · ${scoped.length} of ${all.length}` : ""}`
    : "Current alerts across the network";

  const toggleSeverity = (severity: DisruptionSeverity) =>
    setMutedSeverities((prev) =>
      prev.includes(severity) ? prev.filter((value) => value !== severity) : [...prev, severity],
    );

  return (
    <SectionCard
      id="alerts"
      title="Service disruptions"
      description={description}
    >
      <CountAnnouncer
        message={
          all.length === 0
            ? "No current alerts"
            : `${visible.length} of ${all.length} alerts showing${scopeLineName ? `, ${scopeLineName} line` : ""}`
            + `. ${timed.now.length} affecting travel now, ${timed.upcoming.length} upcoming.`
        }
      />

      {all.length === 0 ? (
        <GoodService reason="network-clear" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {linesWithAlerts.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter alerts by line">
                {linesWithAlerts.map((lineId) => {
                  const selected = scopeLineId === lineId;
                  return (
                    <button
                      key={lineId}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onScopeLineChange(selected ? null : lineId)}
                      className={cn(
                        "flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                        selected
                          ? "border-foreground/40 bg-secondary"
                          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                      )}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-[3px]"
                        style={{ background: lineColorById.get(lineId) ?? "#999" }}
                        aria-hidden="true"
                      />
                      {lineNameById.get(lineId) ?? lineId}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter alerts by severity">
              {DISRUPTION_SEVERITY_ORDER.map((severity) => {
                const count = severityCounts[severity];
                if (count === 0) return null;
                const shown = !mutedSeverities.includes(severity);
                return (
                  <button
                    key={severity}
                    type="button"
                    aria-pressed={shown}
                    onClick={() => toggleSeverity(severity)}
                    className={cn(
                      "flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-2xs font-semibold transition-colors",
                      // Dashed and dimmed rather than struck through: crossed-out
                      // text reads as "cancelled" everywhere else in this app.
                      shown ? SEVERITY_STYLES[severity].chip : "border-dashed border-border text-muted-foreground",
                    )}
                  >
                    {DISRUPTION_SEVERITY_LABELS[severity]}
                    <span className="font-normal">{count}</span>
                    <span className="sr-only">{shown ? " showing" : " hidden"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {visible.length === 0 ? (
            <GoodService
              reason={mutedSeverities.length > 0 ? "severity-hidden" : scopeLineName ? "line-clear" : "network-clear"}
              lineName={scopeLineName}
            />
          ) : (
            <div className="flex flex-col gap-5">
              <TimingGroup
                title="Affecting travel now"
                icon={AlertTriangle}
                entries={timed.now}
                lineNameById={lineNameById}
                lineColorById={lineColorById}
              />
              <TimingGroup
                title="Upcoming"
                icon={CalendarClock}
                entries={timed.upcoming}
                lineNameById={lineNameById}
                lineColorById={lineColorById}
              />
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/**
 * The all-clear, worded for whichever narrowing produced it. "No alerts" after
 * a filter has quietly removed them all is the fastest way to convince someone
 * the feed is broken.
 */
function GoodService({
  reason,
  lineName,
}: {
  reason: "network-clear" | "line-clear" | "severity-hidden";
  lineName?: string | null;
}) {
  const message = reason === "severity-hidden"
    ? "Nothing matches the severities you have showing"
    : reason === "line-clear"
      ? `Good service on the ${lineName} line`
      : "Good service on all lines";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-success-border/60 bg-success-surface p-4 text-success-foreground">
      <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

/**
 * A live suspension and works three weeks out are different kinds of news, so
 * they get different headings rather than one severity-ordered pile.
 */
function TimingGroup({
  title,
  icon: Icon,
  entries,
  lineNameById,
  lineColorById,
}: {
  title: string;
  icon: typeof AlertTriangle;
  entries: AggregatedDisruption[];
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
}) {
  if (entries.length === 0) return null;

  return (
    <section>
      <h3 className="type-label mb-2 flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {title} · {entries.length}
      </h3>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <DisruptionCard key={entry.key} entry={entry} lineNameById={lineNameById} lineColorById={lineColorById} />
        ))}
      </ul>
    </section>
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
      {/* How bad it is, then who it hits, then what it says. Severity leads
          because it is what decides whether the rest is worth reading. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("type-label flex items-center gap-1 rounded-full border px-2 py-0.5", styles.chip)}>
          <Icon className="size-3" aria-hidden="true" />
          {DISRUPTION_SEVERITY_LABELS[severity]}
        </span>
        {disruption.disruptionType && <span className="type-label text-muted-foreground">{disruption.disruptionType}</span>}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
        {lineIds.map((lineId) => (
          <span key={lineId} className="flex items-center gap-1.5 text-2xs font-medium">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ background: lineColorById.get(lineId) ?? "#999" }}
              aria-hidden="true"
            />
            {lineNameById.get(lineId) ?? lineId}
          </span>
        ))}
      </div>

      <h4 className="mt-2 flex-1 text-xs leading-relaxed font-medium">{entry.headline}</h4>

      <p className="mt-2 text-2xs leading-snug text-muted-foreground">{describeScope(entry, lineNameById)}</p>

      {disruption.url && (
        <a
          href={disruption.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-7 items-center gap-1 text-2xs font-medium underline underline-offset-2 hover:opacity-80"
        >
          PTV details
          <span className="sr-only"> for {entry.headline}</span>
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      )}
    </li>
  );
}
