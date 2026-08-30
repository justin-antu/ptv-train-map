import type { LineDisruption } from "../shared/types";

/** How urgently a disruption affects travel, mapped to the theme's severity tokens. */
export type DisruptionSeverity = "critical" | "warning" | "info";

export const DISRUPTION_SEVERITY_ORDER: readonly DisruptionSeverity[] = ["critical", "warning", "info"];

export const DISRUPTION_SEVERITY_LABELS: Record<DisruptionSeverity, string> = {
  critical: "Critical",
  warning: "Delays",
  info: "Information",
};

/** One disruption together with every line it affects. */
export interface AggregatedDisruption {
  disruption: LineDisruption;
  /** Affected line ids, in network order. */
  lineIds: string[];
  severity: DisruptionSeverity;
}

/**
 * Classifies a PTV alert by how much it disrupts a journey.
 *
 * PTV supplies a free-text `disruptionType` and title rather than a severity
 * field, so this reads both for the phrases the feed actually uses.
 */
export function disruptionSeverity(disruption: LineDisruption): DisruptionSeverity {
  const text = `${disruption.disruptionType} ${disruption.title}`.toLowerCase();
  if (/suspend|cancel|not running|no trains|buses replace|part closure/.test(text)) return "critical";
  if (/delay|disrupt|slow|congestion/.test(text)) return "warning";
  return "info";
}

/**
 * Flattens the per-line disruption map into a deduplicated feed.
 *
 * PTV repeats the same disruption under every line it touches, so a
 * network-wide list has to group by `disruption.id` or a single works notice
 * appears three or four times.
 */
export function aggregateDisruptions(
  disruptionsByLine: Record<string, LineDisruption[]>,
  lineOrder: readonly string[],
): AggregatedDisruption[] {
  const byId = new Map<number, AggregatedDisruption>();
  for (const lineId of lineOrder) {
    for (const disruption of disruptionsByLine[lineId] ?? []) {
      const existing = byId.get(disruption.id);
      if (existing) {
        if (!existing.lineIds.includes(lineId)) existing.lineIds.push(lineId);
      } else {
        byId.set(disruption.id, { disruption, lineIds: [lineId], severity: disruptionSeverity(disruption) });
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) => DISRUPTION_SEVERITY_ORDER.indexOf(a.severity) - DISRUPTION_SEVERITY_ORDER.indexOf(b.severity),
  );
}

export interface LineDisruptionSummary {
  /** Lines from the requested set that currently have at least one alert. */
  lineIds: string[];
  /** Most disruptive severity across those lines, or null when all are clear. */
  worstSeverity: DisruptionSeverity | null;
  /** Subset of `lineIds` carrying a critical alert, so they can be named first. */
  criticalLineIds: string[];
  /** Distinct critical disruptions, for the major-disruption indicator. */
  criticalCount: number;
  /** Distinct warning and information disruptions. */
  otherCount: number;
  /** Distinct disruptions across those lines. */
  total: number;
}

/**
 * Rolls up the disruptions on a specific set of lines, so the commute banner can
 * lead with the worst thing happening rather than just a count.
 */
export function summariseLineDisruptions(
  disruptionsByLine: Record<string, LineDisruption[]>,
  lineIds: readonly string[],
): LineDisruptionSummary {
  const affected: string[] = [];
  const criticalLineIds: string[] = [];
  const critical = new Set<number>();
  const other = new Set<number>();
  let worstIndex = Number.POSITIVE_INFINITY;

  for (const lineId of lineIds) {
    const disruptions = disruptionsByLine[lineId] ?? [];
    if (disruptions.length === 0) continue;
    affected.push(lineId);

    for (const disruption of disruptions) {
      const severity = disruptionSeverity(disruption);
      if (severity === "critical") {
        critical.add(disruption.id);
        if (!criticalLineIds.includes(lineId)) criticalLineIds.push(lineId);
      } else {
        other.add(disruption.id);
      }
      const index = DISRUPTION_SEVERITY_ORDER.indexOf(severity);
      if (index < worstIndex) worstIndex = index;
    }
  }

  return {
    lineIds: affected,
    worstSeverity: Number.isFinite(worstIndex) ? DISRUPTION_SEVERITY_ORDER[worstIndex] : null,
    criticalLineIds,
    criticalCount: critical.size,
    otherCount: other.size,
    total: critical.size + other.size,
  };
}

/** Formats a disruption's active window for display, e.g. "Affected from 3 Sep 2026". */
export function formatAffectedDates(fromDateUtc: string | null, toDateUtc: string | null): string {
  const format = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  };
  const from = fromDateUtc ? format(fromDateUtc) : null;
  const to = toDateUtc ? format(toDateUtc) : null;
  if (from && to) return `Affected ${from} – ${to}`;
  if (from) return `Affected from ${from}`;
  if (to) return `Affected until ${to}`;
  return "Dates unavailable";
}
