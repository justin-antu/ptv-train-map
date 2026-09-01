import { useEffect, useState } from "react";
import { TIMETABLE_DATA_URL } from "../config";
import type { NetworkTimetableData } from "../shared/types";

interface TimetableDataState {
  data: NetworkTimetableData | null;
  error: Error | null;
  loading: boolean;
}

function isTimetableData(value: unknown): value is NetworkTimetableData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<NetworkTimetableData>;
  return data.schemaVersion === 1
    && data.timezone === "Australia/Melbourne"
    && Array.isArray(data.availableDates)
    && Array.isArray(data.lines);
}

export function useTimetableData(enabled = true): TimetableDataState {
  const [state, setState] = useState<TimetableDataState>({ data: null, error: null, loading: enabled });

  useEffect(() => {
    if (!enabled) {
      setState((prev) => (prev.data || prev.error ? prev : { data: null, error: null, loading: false }));
      return;
    }
    let cancelled = false;
    setState((prev) => (prev.data ? prev : { data: null, error: null, loading: true }));
    fetch(TIMETABLE_DATA_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Timetable unavailable (${response.status})`);
        const value: unknown = await response.json();
        if (!isTimetableData(value)) throw new Error("Timetable data has an unsupported format");
        return value;
      })
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ data: null, error: error instanceof Error ? error : new Error("Timetable unavailable"), loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
