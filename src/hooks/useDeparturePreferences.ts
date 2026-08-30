import { useCallback, useMemo, useState } from "react";
import { DEFAULT_ORIGIN_STATION_ID } from "../shared/commute";

const ORIGIN_KEY = "wimt:originStation";
const DESTINATION_KEY = "wimt:destinationStation";
const LINE_KEY = "wimt:lineFilter";

/** Keys from the commute-settings model this replaces. */
const LEGACY_TO_CITY_KEY = "wimt:commuteToCity";
const LEGACY_FROM_CITY_KEY = "wimt:commuteFromCity";
const LEGACY_LINES_KEY = "wimt:favouriteLines";
/** Single-favourite key used before commute directions existed. */
const LEGACY_FAVOURITE_KEY = "wimt:favouriteStationId";

export interface DeparturePreferences {
  /** Station the board reads departures from. */
  originStationId: string | null;
  /** Where the commuter is heading. Context only — it does not filter departures. */
  destinationStationId: string | null;
  /** Single line to narrow the whole app to, or null for the entire network. */
  lineId: string | null;
}

export interface DeparturePreferencesController extends DeparturePreferences {
  setOrigin(stationId: string | null): void;
  setDestination(stationId: string | null): void;
  setLine(lineId: string | null): void;
  /** Reverses the journey. No-op without a destination, so origin is never blanked. */
  swap(): void;
  reset(): void;
}

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeString(key: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // In-memory preferences remain available when storage writes fail.
  }
}

/** Reads the first entry of a legacy JSON string array, if any. */
function readFirstOfArray(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const first = parsed.find((id): id is string => typeof id === "string");
      return first ?? null;
    }
  } catch {
    // Treat malformed or inaccessible storage as no saved preference.
  }
  return null;
}

/**
 * Reads stored preferences, promoting anything saved under the old commute
 * settings: the to-city station becomes the origin, the from-city station the
 * destination, and the first favourite line the single line filter. Legacy keys
 * are cleared afterwards so a later reset is not undone by the migration
 * running again.
 */
function loadPreferences(): DeparturePreferences {
  let originStationId = readString(ORIGIN_KEY);
  let destinationStationId = readString(DESTINATION_KEY);
  let lineId = readString(LINE_KEY);

  if (originStationId === null) {
    const legacy = readString(LEGACY_TO_CITY_KEY) ?? readString(LEGACY_FAVOURITE_KEY);
    if (legacy) {
      writeString(ORIGIN_KEY, legacy);
      originStationId = legacy;
    }
  }
  if (destinationStationId === null) {
    const legacy = readString(LEGACY_FROM_CITY_KEY);
    if (legacy) {
      writeString(DESTINATION_KEY, legacy);
      destinationStationId = legacy;
    }
  }
  if (lineId === null) {
    const legacy = readFirstOfArray(LEGACY_LINES_KEY);
    if (legacy) {
      writeString(LINE_KEY, legacy);
      lineId = legacy;
    }
  }

  for (const key of [LEGACY_TO_CITY_KEY, LEGACY_FROM_CITY_KEY, LEGACY_LINES_KEY, LEGACY_FAVOURITE_KEY]) {
    writeString(key, null);
  }

  // Most trips in this network touch Flinders Street, so an untouched install
  // still shows a useful board.
  return {
    originStationId: originStationId ?? DEFAULT_ORIGIN_STATION_ID,
    destinationStationId,
    lineId,
  };
}

function persist(preferences: DeparturePreferences): void {
  writeString(ORIGIN_KEY, preferences.originStationId);
  writeString(DESTINATION_KEY, preferences.destinationStationId);
  writeString(LINE_KEY, preferences.lineId);
}

/**
 * Owns the departure board's saved origin, destination, and line. Everything
 * lives in `localStorage`; the app has no accounts or server-side state.
 */
export function useDeparturePreferences(): DeparturePreferencesController {
  const [preferences, setPreferences] = useState<DeparturePreferences>(loadPreferences);

  /** Single write path, so every change is persisted exactly once. */
  const mutate = useCallback((change: (prev: DeparturePreferences) => DeparturePreferences) => {
    setPreferences((prev) => {
      const next = change(prev);
      if (next === prev) return prev;
      persist(next);
      return next;
    });
  }, []);

  const setOrigin = useCallback(
    (stationId: string | null) => mutate((prev) => ({ ...prev, originStationId: stationId })),
    [mutate],
  );

  const setDestination = useCallback(
    (stationId: string | null) => mutate((prev) => ({ ...prev, destinationStationId: stationId })),
    [mutate],
  );

  const setLine = useCallback((lineId: string | null) => mutate((prev) => ({ ...prev, lineId })), [mutate]);

  const swap = useCallback(
    () =>
      mutate((prev) =>
        prev.destinationStationId
          ? { ...prev, originStationId: prev.destinationStationId, destinationStationId: prev.originStationId }
          : prev,
      ),
    [mutate],
  );

  const reset = useCallback(
    () => mutate(() => ({ originStationId: DEFAULT_ORIGIN_STATION_ID, destinationStationId: null, lineId: null })),
    [mutate],
  );

  return useMemo(
    () => ({ ...preferences, setOrigin, setDestination, setLine, swap, reset }),
    [preferences, setOrigin, setDestination, setLine, swap, reset],
  );
}
