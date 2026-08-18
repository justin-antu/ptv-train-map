import { useCallback, useState } from "react";

const FAVOURITE_STORAGE_KEY = "wimt:favouriteStationId";

function loadFavouriteStationId(): string | null {
  try {
    return localStorage.getItem(FAVOURITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveFavouriteStationId(id: string | null): void {
  try {
    if (id) localStorage.setItem(FAVOURITE_STORAGE_KEY, id);
    else localStorage.removeItem(FAVOURITE_STORAGE_KEY);
  } catch {
    // The in-memory favourite remains available when storage writes fail.
  }
}

export interface FavouriteStationController {
  favouriteId: string | null;
  isFavourite(stationId: string): boolean;
  /** Toggles `stationId` as the single favourite station. */
  toggle(stationId: string): void;
  clear(): void;
}

/** Tracks the single "my station" favourite, persisted in `localStorage`. */
export function useFavouriteStation(): FavouriteStationController {
  const [favouriteId, setFavouriteId] = useState<string | null>(loadFavouriteStationId);

  const toggle = useCallback((stationId: string) => {
    setFavouriteId((prev) => {
      const next = prev === stationId ? null : stationId;
      saveFavouriteStationId(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setFavouriteId(null);
    saveFavouriteStationId(null);
  }, []);

  const isFavourite = useCallback((stationId: string) => favouriteId === stationId, [favouriteId]);

  return { favouriteId, isFavourite, toggle, clear };
}
