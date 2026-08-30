import { useCallback, useMemo, useState } from "react";

const TO_CITY_KEY = "wimt:commuteToCity";
const FROM_CITY_KEY = "wimt:commuteFromCity";
const FAVOURITE_LINES_KEY = "wimt:favouriteLines";
/** Single-favourite key used before commute directions existed. */
const LEGACY_FAVOURITE_KEY = "wimt:favouriteStationId";

/** Which leg of the commute a station belongs to. */
export type CommuteDirection = "toCity" | "fromCity";

export interface CommutePreferences {
  /** Station boarded when travelling towards the city, e.g. the home station. */
  toCityStationId: string | null;
  /** Station boarded when travelling away from the city, e.g. the work station. */
  fromCityStationId: string | null;
  /** Lines the commuter cares about. Empty means "no preference". */
  favouriteLineIds: string[];
}

export interface CommutePreferencesController extends CommutePreferences {
  /** True once at least one commute station is configured. */
  hasCommute: boolean;
  stationIdFor(direction: CommuteDirection): string | null;
  setStation(direction: CommuteDirection, stationId: string | null): void;
  /** Replaces every stored preference in a single update, for the settings dialog. */
  save(next: CommutePreferences): void;
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

function readStringArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    // Treat malformed or inaccessible storage as no saved preference.
  }
  return [];
}

function writeStringArray(key: string, value: readonly string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // In-memory preferences remain available when storage writes fail.
  }
}

/**
 * Reads stored preferences, promoting a pre-existing single favourite station
 * to the to-city leg. The legacy key is cleared so a later reset is not undone
 * by the migration running again.
 */
function loadPreferences(): CommutePreferences {
  const storedToCity = readString(TO_CITY_KEY);
  const fromCityStationId = readString(FROM_CITY_KEY);
  const favouriteLineIds = readStringArray(FAVOURITE_LINES_KEY);

  let toCityStationId = storedToCity;
  if (toCityStationId === null) {
    const legacy = readString(LEGACY_FAVOURITE_KEY);
    if (legacy) {
      writeString(TO_CITY_KEY, legacy);
      writeString(LEGACY_FAVOURITE_KEY, null);
      toCityStationId = legacy;
    }
  }

  return { toCityStationId, fromCityStationId, favouriteLineIds };
}

function persist(preferences: CommutePreferences): void {
  writeString(TO_CITY_KEY, preferences.toCityStationId);
  writeString(FROM_CITY_KEY, preferences.fromCityStationId);
  writeStringArray(FAVOURITE_LINES_KEY, preferences.favouriteLineIds);
}

/**
 * Owns the commuter's saved stations and lines. Everything lives in
 * `localStorage`; the app has no accounts or server-side state.
 */
export function useCommutePreferences(): CommutePreferencesController {
  const [preferences, setPreferences] = useState<CommutePreferences>(loadPreferences);

  const save = useCallback((next: CommutePreferences) => {
    persist(next);
    setPreferences(next);
  }, []);

  const setStation = useCallback((direction: CommuteDirection, stationId: string | null) => {
    setPreferences((prev) => {
      const next: CommutePreferences =
        direction === "toCity" ? { ...prev, toCityStationId: stationId } : { ...prev, fromCityStationId: stationId };
      persist(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next: CommutePreferences = { toCityStationId: null, fromCityStationId: null, favouriteLineIds: [] };
    persist(next);
    setPreferences(next);
  }, []);

  const stationIdFor = useCallback(
    (direction: CommuteDirection) => (direction === "toCity" ? preferences.toCityStationId : preferences.fromCityStationId),
    [preferences.toCityStationId, preferences.fromCityStationId],
  );

  return useMemo(
    () => ({
      ...preferences,
      hasCommute: preferences.toCityStationId !== null || preferences.fromCityStationId !== null,
      stationIdFor,
      setStation,
      save,
      reset,
    }),
    [preferences, stationIdFor, setStation, save, reset],
  );
}
