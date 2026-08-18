import { useEffect, useState } from "react";
import type { NetworkStaticData } from "../shared/types";
import { loadStaticData } from "../data/loadData";

export interface StaticDataState {
  data: NetworkStaticData | null;
  error: Error | null;
}

/** Loads the committed static line/station data once on mount. */
export function useStaticData(): StaticDataState {
  const [state, setState] = useState<StaticDataState>({ data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    loadStaticData()
      .then((data) => {
        if (!cancelled) setState({ data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ data: null, error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
