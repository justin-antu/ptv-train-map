import { useEffect, useState } from "react";
import type { LineDisruption, LiveRun, NetworkStaticData } from "../shared/types";
import { LIVE_POLL_INTERVAL_MS } from "../config";
import { pollLiveData } from "../data/loadData";

export interface LiveDataState {
  runs: LiveRun[];
  isDemo: boolean;
  generatedAtUtc: string | null;
  disruptionsByLine: Record<string, LineDisruption[]>;
}

const INITIAL_STATE: LiveDataState = {
  runs: [],
  isDemo: false,
  generatedAtUtc: null,
  disruptionsByLine: {},
};

/** Polls the live departures/disruptions snapshot on the interval configured in `config.ts`. */
export function useLiveData(staticData: NetworkStaticData | null): LiveDataState {
  const [state, setState] = useState<LiveDataState>(INITIAL_STATE);

  useEffect(() => {
    if (!staticData) return;
    return pollLiveData(staticData, LIVE_POLL_INTERVAL_MS, (snapshot, isDemo) => {
      setState({
        runs: snapshot.runs,
        isDemo,
        generatedAtUtc: snapshot.generatedAtUtc,
        disruptionsByLine: snapshot.disruptionsByLine ?? {},
      });
    });
  }, [staticData]);

  return state;
}
