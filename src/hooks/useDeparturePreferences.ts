import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_ORIGIN_STATION_ID } from "../shared/commute";

const ORIGIN_KEY = "wimt:originStation";
const DESTINATION_KEY = "wimt:destinationStation";
const LINE_KEY = "wimt:lineFilter";

/**
 * Query parameters mirroring the board's state, following National Rail's
 * `/departures/{from}/to/{to}` grammar closely enough to be guessable. A board
 * is a thing people send each other ("here's the 5:12 from Box Hill"), so it
 * needs an address.
 */
const ORIGIN_PARAM = "from";
const DESTINATION_PARAM = "to";
const LINE_PARAM = "line";

/** Keys from the commute-settings model this replaces. */
const LEGACY_TO_CITY_KEY = "wimt:commuteToCity";
const LEGACY_FROM_CITY_KEY = "wimt:commuteFromCity";
const LEGACY_LINES_KEY = "wimt:favouriteLines";
/** Single-favourite key used before commute directions existed. */
const LEGACY_FAVOURITE_KEY = "wimt:favouriteStationId";

export interface DeparturePreferences {
  /** Station the board reads departures from. */
  originStationId: string | null;
  /**
   * Where the commuter is heading. A real filter: only services that later call
   * at this station are shown.
   */
  destinationStationId: string | null;
  /** Single line to narrow the whole app to, or null for the entire network. */
  lineId: string | null;
}

export interface DeparturePreferencesController extends DeparturePreferences {
  /** True when nothing has been chosen yet, so there is nothing for a reset to undo. */
  isDefault: boolean;
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
  // A shared link is an explicit request for a particular board, so it takes
  // precedence over whatever this device happens to have saved.
  const params = new URLSearchParams(window.location.search);
  let originStationId = params.get(ORIGIN_PARAM) || readString(ORIGIN_KEY);
  let destinationStationId = params.get(DESTINATION_PARAM) || readString(DESTINATION_KEY);
  let lineId = params.get(LINE_PARAM) || readString(LINE_KEY);

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
 * Mirrors the board into the address bar without touching the fragment, which
 * the shell owns for section navigation. `replaceState` rather than `pushState`
 * because changing a filter is not a navigation — it should not take four back
 * presses to leave the page.
 */
function reflectInUrl(preferences: DeparturePreferences): void {
  const url = new URL(window.location.href);
  const apply = (key: string, value: string | null) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  };
  apply(ORIGIN_PARAM, preferences.originStationId);
  apply(DESTINATION_PARAM, preferences.destinationStationId);
  apply(LINE_PARAM, preferences.lineId);
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, "", next);
  }
}

/**
 * Owns the departure board's saved origin, destination, and line. Everything
 * lives in `localStorage`; the app has no accounts or server-side state.
 */
export function useDeparturePreferences(): DeparturePreferencesController {
  const [preferences, setPreferences] = useState<DeparturePreferences>(loadPreferences);

  useEffect(() => reflectInUrl(preferences), [preferences]);

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

  const isDefault = preferences.originStationId === DEFAULT_ORIGIN_STATION_ID
    && !preferences.destinationStationId
    && !preferences.lineId;

  return useMemo(
    () => ({ ...preferences, isDefault, setOrigin, setDestination, setLine, swap, reset }),
    [preferences, isDefault, setOrigin, setDestination, setLine, swap, reset],
  );
}
