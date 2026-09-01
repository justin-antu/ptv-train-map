import { LIVE_DATA_STALE_AFTER_MS } from "../config";
import type { LiveSnapshot } from "../shared/types";

/**
 * How much the times on screen can be trusted, as a ladder rather than a
 * boolean. Each rung says something different about what the rider should do,
 * so collapsing them into "live / not live" throws away the only information
 * that distinguishes "fine" from "check another source".
 */
export type FreshnessLevel = "live" | "aging" | "stale" | "schedule-only" | "waiting";

export interface Freshness {
  level: FreshnessLevel;
  /** Short label for the status line. */
  label: string;
  /** The consequence, shown when the board is degraded. Absent when everything is fine. */
  detail?: string;
  tone: "success" | "muted" | "warning";
}

/** Below this the feed is effectively current; the workflow republishes every five minutes. */
const AGING_AFTER_MS = 6 * 60_000;

export function describeFreshness(
  snapshot: Pick<LiveSnapshot, "generatedAtUtc" | "feedTimestampUtc" | "isScheduleOnly"> | null,
  now: number,
): Freshness {
  if (!snapshot) {
    return { level: "waiting", label: "Waiting for live data…", tone: "muted" };
  }

  if (snapshot.isScheduleOnly) {
    return {
      level: "schedule-only",
      label: "Timetable only",
      detail: "Scheduled times — delays and cancellations are not shown.",
      tone: "warning",
    };
  }

  // The feed header is when the *predictions* were made. `generatedAtUtc` only
  // says when this file was written, which stays recent even if the upstream
  // feed froze an hour ago.
  const measuredAt = Date.parse(snapshot.feedTimestampUtc ?? snapshot.generatedAtUtc);
  if (!Number.isFinite(measuredAt)) {
    return { level: "waiting", label: "Waiting for live data…", tone: "muted" };
  }

  const ageMs = now - measuredAt;
  const clock = new Date(measuredAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (ageMs > LIVE_DATA_STALE_AFTER_MS) {
    return {
      level: "stale",
      label: `Live updates paused since ${clock}`,
      detail: "These times are no longer being updated. Check the PTV app before you travel.",
      tone: "warning",
    };
  }

  if (ageMs > AGING_AFTER_MS) {
    return { level: "aging", label: `Updated ${Math.round(ageMs / 60_000)} min ago`, tone: "muted" };
  }

  return { level: "live", label: "Live · updated just now", tone: "success" };
}
