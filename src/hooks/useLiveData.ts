import { useCallback, useEffect, useRef, useState } from "react";
import type { LineDisruption, LiveRun, NetworkStaticData } from "../shared/types";
import { LIVE_POLL_INTERVAL_MS } from "../config";
import { loadLiveOrDemoSnapshot, pollLiveData } from "../data/loadData";

export interface LiveDataState {
  runs: LiveRun[];
  isDemo: boolean;
  generatedAtUtc: string | null;
  disruptionsByLine: Record<string, LineDisruption[]>;
  /** Fetches a fresh snapshot immediately, for pull-to-refresh. */
  refresh: () => Promise<void>;
}

const INITIAL_SNAPSHOT = {
  runs: [] as LiveRun[],
  isDemo: false,
  generatedAtUtc: null as string | null,
  disruptionsByLine: {} as Record<string, LineDisruption[]>,
};

/** Polls the live departures/disruptions snapshot on the interval configured in `config.ts`. */
export function useLiveData(staticData: NetworkStaticData | null): LiveDataState {
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const staticDataRef = useRef(staticData);
  staticDataRef.current = staticData;

  useEffect(() => {
    if (!staticData) return;
    return pollLiveData(staticData, LIVE_POLL_INTERVAL_MS, (next, isDemo) => {
      setSnapshot({
        runs: next.runs,
        isDemo,
        generatedAtUtc: next.generatedAtUtc,
        disruptionsByLine: next.disruptionsByLine ?? {},
      });
    });
  }, [staticData]);

  const refresh = useCallback(async () => {
    const currentStaticData = staticDataRef.current;
    if (!currentStaticData) return;
    const { snapshot: next, isDemo } = await loadLiveOrDemoSnapshot(currentStaticData);
    setSnapshot({
      runs: next.runs,
      isDemo,
      generatedAtUtc: next.generatedAtUtc,
      disruptionsByLine: next.disruptionsByLine ?? {},
    });
  }, []);

  return { ...snapshot, refresh };
}
