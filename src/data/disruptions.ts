import type { LineDisruption } from "../shared/types";

/** How urgently a disruption affects travel, mapped to the theme's severity tokens. */
export type DisruptionSeverity = "critical" | "warning" | "info";

/** Whether a disruption is biting now or is still ahead of the traveller. */
export type DisruptionTiming = "now" | "upcoming";

export const DISRUPTION_SEVERITY_ORDER: readonly DisruptionSeverity[] = ["critical", "warning", "info"];

export const DISRUPTION_SEVERITY_LABELS: Record<DisruptionSeverity, string> = {
  critical: "Major disruption",
  warning: "Minor delay",
  info: "Information",
};

/**
 * Hue bands of PTV's own disruption colours.
 *
 * The feed ships `colour` as a hex string rather than a severity enum, but the
 * palette is stable: `#ff5100` (19°) for the things that stop trains running,
 * `#ffbb00` (44°) for detours and short delays, `#ffd500` (50°) for planned
 * works and notices. Comparing hue rather than exact strings means a new shade
 * lands in the right band instead of falling through to "Information".
 */
const MAJOR_HUE_MAX = 35;
const MINOR_HUE_MAX = 47;

/** Hue in degrees for a "#rrggbb" string, or null if it is not one. */
function colourHue(colour: string | undefined): number | null {
  if (!colour) return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(colour.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  if (span === 0) return null;
  let hue: number;
  if (max === r) hue = ((g - b) / span) % 6;
  else if (max === g) hue = (b - r) / span + 2;
  else hue = (r - g) / span + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

/**
 * Classifies a PTV alert by how much it disrupts a journey, using PTV's own
 * signals rather than the wording of the title.
 *
 * The previous keyword regex read the title for phrases like "delay" or
 * "suspend", which mislabelled the feed's actual content — "Station detour"
 * matched nothing and was filed under Information despite being on the
 * platform displays. `display_on_board` is PTV's editorial judgement that
 * something is worth telling waiting passengers, and `colour` is the severity
 * band their own channels render.
 */
export function disruptionSeverity(disruption: LineDisruption): DisruptionSeverity {
  const hue = colourHue(disruption.colour);
  if (hue !== null && hue <= MAJOR_HUE_MAX) return "critical";
  // On the platform displays means it is affecting travel now, whatever band
  // the colour puts it in.
  if (disruption.displayOnBoard) return "warning";
  if (hue !== null && hue <= MINOR_HUE_MAX) return "warning";
  return "info";
}

/** Is this disruption in force, or does it start later? */
export function disruptionTiming(fromDateUtc: string | null, now: number): DisruptionTiming {
  if (!fromDateUtc) return "now";
  const from = Date.parse(fromDateUtc);
  return Number.isNaN(from) || from <= now ? "now" : "upcoming";
}

/**
 * Strips the line prefix PTV puts on nearly every title.
 *
 * Titles read "Cranbourne Line: Buses replace trains…" or "Sunbury Line
 * stations: Car park closures…". The card already names the affected lines as
 * chips above the text, so repeating them in the headline both wastes the
 * width and hides the part that differs.
 */
export function headlineOf(title: string): string {
  const stripped = title.replace(/^.{0,60}?\bline[s]?\b[^:]{0,30}:\s*/i, "");
  if (!stripped || stripped.length < 8) return title;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** One incident, with every line and PTV notice folded into it. */
export interface AggregatedDisruption {
  /** Stable identity for the merged incident. */
  key: string;
  /** The first notice seen for this incident, for type, description and link. */
  disruption: LineDisruption;
  /** Every PTV disruption_id merged here — usually one per affected line. */
  ids: number[];
  /** Affected line ids, in network order. */
  lineIds: string[];
  /** Specifically named stations across every merged notice. */
  stationIds: string[];
  severity: DisruptionSeverity;
  /** The title with its redundant line prefix removed. */
  headline: string;
  /** Earliest start across the merged notices. */
  fromDateUtc: string | null;
  /** Latest end, or null when any merged notice is open-ended. */
  toDateUtc: string | null;
}

/**
 * Identity of an *incident* rather than of a PTV record.
 *
 * PTV publishes one disruption id per line even when it is manifestly one
 * event: the September industrial action arrives as sixteen near-identical
 * notices, and a network-wide car-park programme as one per line. Keying on
 * the de-prefixed title plus type plus severity collapses those into a single
 * card listing every line. Dates are deliberately not part of the key — the
 * same programme is often logged with a different start date per line — so the
 * merged window is widened to cover all of them instead.
 */
function incidentKey(disruption: LineDisruption, severity: DisruptionSeverity): string {
  const headline = headlineOf(disruption.title).toLowerCase().replace(/\s+/g, " ").trim();
  return `${severity}|${disruption.disruptionType.toLowerCase()}|${headline}`;
}

/** Earlier of two ISO timestamps, treating null as "unknown" rather than "unbounded". */
function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

/** Later of two end timestamps, where null means open-ended and therefore wins. */
function latestEnd(a: string | null, b: string | null): string | null {
  if (a === null || b === null) return null;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * Flattens the per-line disruption map into a deduplicated incident feed,
 * most disruptive first.
 */
export function aggregateDisruptions(
  disruptionsByLine: Record<string, LineDisruption[]>,
  lineOrder: readonly string[],
): AggregatedDisruption[] {
  const byIncident = new Map<string, AggregatedDisruption>();

  for (const lineId of lineOrder) {
    for (const disruption of disruptionsByLine[lineId] ?? []) {
      const severity = disruptionSeverity(disruption);
      const key = incidentKey(disruption, severity);
      const existing = byIncident.get(key);

      if (!existing) {
        byIncident.set(key, {
          key,
          disruption,
          ids: [disruption.id],
          lineIds: [lineId],
          stationIds: [...(disruption.stationIds ?? [])],
          severity,
          headline: headlineOf(disruption.title),
          fromDateUtc: disruption.fromDateUtc,
          toDateUtc: disruption.toDateUtc,
        });
        continue;
      }

      if (!existing.lineIds.includes(lineId)) existing.lineIds.push(lineId);
      if (!existing.ids.includes(disruption.id)) {
        existing.ids.push(disruption.id);
        existing.fromDateUtc = earliest(existing.fromDateUtc, disruption.fromDateUtc);
        existing.toDateUtc = latestEnd(existing.toDateUtc, disruption.toDateUtc);
      }
      for (const stationId of disruption.stationIds ?? []) {
        if (!existing.stationIds.includes(stationId)) existing.stationIds.push(stationId);
      }
    }
  }

  return [...byIncident.values()].sort(
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
  /** Distinct critical incidents, for the major-disruption indicator. */
  criticalCount: number;
  /** Distinct warning and information incidents. */
  otherCount: number;
  /** Distinct incidents across those lines. */
  total: number;
}

/**
 * Rolls up the disruptions on a specific set of lines, so the commute banner can
 * lead with the worst thing happening rather than just a count.
 *
 * Counts incidents, not PTV records, so the banner and the alerts feed never
 * disagree about how many things are wrong.
 */
export function summariseLineDisruptions(
  disruptionsByLine: Record<string, LineDisruption[]>,
  lineIds: readonly string[],
): LineDisruptionSummary {
  const incidents = aggregateDisruptions(disruptionsByLine, lineIds);

  const affected: string[] = [];
  const criticalLineIds: string[] = [];
  let criticalCount = 0;
  let otherCount = 0;
  let worstIndex = Number.POSITIVE_INFINITY;

  for (const incident of incidents) {
    if (incident.severity === "critical") criticalCount += 1;
    else otherCount += 1;

    for (const lineId of incident.lineIds) {
      if (!affected.includes(lineId)) affected.push(lineId);
      if (incident.severity === "critical" && !criticalLineIds.includes(lineId)) criticalLineIds.push(lineId);
    }

    worstIndex = Math.min(worstIndex, DISRUPTION_SEVERITY_ORDER.indexOf(incident.severity));
  }

  // Restore network order, which the incident walk does not preserve.
  const inOrder = (ids: string[]) => lineIds.filter((lineId) => ids.includes(lineId));

  return {
    lineIds: inOrder(affected),
    worstSeverity: Number.isFinite(worstIndex) ? DISRUPTION_SEVERITY_ORDER[worstIndex] : null,
    criticalLineIds: inOrder(criticalLineIds),
    criticalCount,
    otherCount,
    total: criticalCount + otherCount,
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

/**
 * The one-line scope under an incident's headline: which lines, how many named
 * stations, and the window. Also used as the row's accessible description, so a
 * screen reader gets the same qualification a sighted reader does.
 */
export function describeScope(
  incident: AggregatedDisruption,
  lineNameById: Map<string, string>,
): string {
  const lineNames = incident.lineIds.map((lineId) => lineNameById.get(lineId) ?? lineId);
  const lines = lineNames.length === 0
    ? "Network-wide"
    : lineNames.length <= 3
      ? `${lineNames.join(", ")} ${lineNames.length === 1 ? "line" : "lines"}`
      : `${lineNames.length} lines`;
  const stations = incident.stationIds.length > 0
    ? `${incident.stationIds.length} station${incident.stationIds.length === 1 ? "" : "s"}`
    : null;
  return [lines, stations, formatAffectedDates(incident.fromDateUtc, incident.toDateUtc)]
    .filter(Boolean)
    .join(" · ");
}
