import { useCallback, useEffect, useMemo, useState } from "react";
import type { LineDisruption, LiveRun, LiveSnapshot, NetworkTimetableData } from "../shared/types";
import { LIVE_POLL_INTERVAL_MS } from "../config";
import { loadLiveSnapshot, pollLiveData } from "../data/loadData";
import { buildScheduledSnapshot } from "../data/scheduledSnapshot";

export interface LiveDataState {
  runs: LiveRun[];
  /**
   * True until either a snapshot or the timetable fallback has arrived.
   *
   * Callers need this to tell "no departures" from "no data yet". Both look
   * like an empty `runs`, and the board used to state the former while the
   * latter was true — announcing that the last train had gone while the
   * snapshot was still downloading.
   */
  isInitialising: boolean;
  /** True after the first live fetch missed, so the 3MB timetable can load as fallback. */
  needsScheduleFallback: boolean;
  /** True when every run carries timetable times only, with no real-time layer. */
  isScheduleOnly: boolean;
  generatedAtUtc: string | null;
  /** When the upstream realtime feed last published, which is what "how fresh" really means. */
  feedTimestampUtc: string | null;
  disruptionsByLine: Record<string, LineDisruption[]>;
  /** Fetches a fresh snapshot immediately, for pull-to-refresh. */
  refresh: () => Promise<void>;
}

/**
 * Polls the live snapshot, degrading to the shipped GTFS timetable when there
 * isn't one.
 *
 * The fallback is only computed when it is actually needed, and the disruption
 * list is kept from the last good snapshot: an alert that was true a minute ago
 * is almost certainly still true, and dropping it during a blip is exactly when
 * a rider most needs it.
 */
export function useLiveData(timetable: NetworkTimetableData | null): LiveDataState {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [liveResolved, setLiveResolved] = useState(false);

  useEffect(() => {
    const stop = pollLiveData(LIVE_POLL_INTERVAL_MS, (next) => {
      setSnapshot(next);
      setLiveResolved(true);
    });
    // pollLiveData only reports successes. If the snapshot is missing, still
    // allow the timetable fallback after a short wait.
    const missed = window.setTimeout(() => setLiveResolved(true), 4_000);
    return () => {
      stop();
      window.clearTimeout(missed);
    };
  }, []);

  const refresh = useCallback(async () => {
    const next = await loadLiveSnapshot();
    if (next) setSnapshot(next);
    setLiveResolved(true);
  }, []);

  const fallback = useMemo(
    () => (snapshot === null && timetable !== null ? buildScheduledSnapshot(timetable) : null),
    [snapshot, timetable],
  );
  const effective = snapshot ?? fallback;

  return useMemo(
    () => ({
      runs: effective?.runs ?? [],
      isInitialising: effective === null,
      needsScheduleFallback: liveResolved && snapshot === null,
      isScheduleOnly: effective?.isScheduleOnly === true,
      generatedAtUtc: effective?.generatedAtUtc ?? null,
      feedTimestampUtc: effective?.feedTimestampUtc ?? null,
      disruptionsByLine: effective?.disruptionsByLine ?? {},
      refresh,
    }),
    [effective, refresh, liveResolved, snapshot],
  );
}
