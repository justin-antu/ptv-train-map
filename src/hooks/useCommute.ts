import { useCallback, useEffect, useMemo, useState } from "react";
import { commutePeriodAt, type CommuteDirection, type CommutePeriod } from "../shared/commute";
import { useNow } from "./useNow";

const HOME_KEY = "wimt:homeStation";
const WORK_KEY = "wimt:workStation";
const DIRECTION_KEY = "wimt:directionOverride";
const LINE_KEY = "wimt:lineFilter";

const ORIGIN_KEY = "wimt:originStation";
const DESTINATION_KEY = "wimt:destinationStation";
const LEGACY_TO_CITY_KEY = "wimt:commuteToCity";
const LEGACY_FROM_CITY_KEY = "wimt:commuteFromCity";
const LEGACY_LINES_KEY = "wimt:favouriteLines";
const LEGACY_FAVOURITE_KEY = "wimt:favouriteStationId";

const FROM_PARAM = "from";
const TO_PARAM = "to";
const LINE_PARAM = "line";

export interface CommuteState {
  homeStationId: string | null;
  workStationId: string | null;
  /** When set, swap has pinned a direction until the commuter swaps again. */
  directionOverride: CommuteDirection | null;
  lineId: string | null;
}

export interface CommuteController extends CommuteState {
  direction: CommuteDirection;
  period: CommutePeriod;
  originStationId: string | null;
  destinationStationId: string | null;
  /** True until both ends of the commute have been chosen. */
  needsSetup: boolean;
  /** True when the address bar is asking for a specific board, not the saved commute. */
  isSharedBoard: boolean;
  setHome(stationId: string | null): void;
  setWork(stationId: string | null): void;
  setup(homeStationId: string, workStationId: string): void;
  setLine(lineId: string | null): void;
  /** Flips the current journey and pins that direction. */
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
    // In-memory state remains available when storage writes fail.
  }
}

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
    // Treat malformed storage as empty.
  }
  return null;
}

function migrateLegacyBoard(): Pick<CommuteState, "homeStationId" | "workStationId" | "lineId"> {
  const origin = readString(ORIGIN_KEY) ?? readString(LEGACY_TO_CITY_KEY) ?? readString(LEGACY_FAVOURITE_KEY);
  const destination = readString(DESTINATION_KEY) ?? readString(LEGACY_FROM_CITY_KEY);
  const lineId = readString(LINE_KEY) ?? readFirstOfArray(LEGACY_LINES_KEY);

  for (const key of [
    ORIGIN_KEY,
    DESTINATION_KEY,
    LEGACY_TO_CITY_KEY,
    LEGACY_FROM_CITY_KEY,
    LEGACY_LINES_KEY,
    LEGACY_FAVOURITE_KEY,
  ]) {
    writeString(key, null);
  }

  // A destination means the rider configured a real board. Origin-only
  // Flinders Street was the old untouched default and is not a commute.
  if (origin && destination && origin !== destination) {
    writeString(HOME_KEY, origin);
    writeString(WORK_KEY, destination);
    if (lineId) writeString(LINE_KEY, lineId);
    return { homeStationId: origin, workStationId: destination, lineId };
  }

  return { homeStationId: null, workStationId: null, lineId };
}

function loadState(): CommuteState {
  let homeStationId = readString(HOME_KEY);
  let workStationId = readString(WORK_KEY);
  const directionRaw = readString(DIRECTION_KEY);
  const directionOverride: CommuteDirection | null =
    directionRaw === "outbound" || directionRaw === "inbound" ? directionRaw : null;
  let lineId = readString(LINE_KEY);

  if (homeStationId === null && workStationId === null) {
    const migrated = migrateLegacyBoard();
    homeStationId = migrated.homeStationId;
    workStationId = migrated.workStationId;
    lineId = migrated.lineId ?? lineId;
  }

  return { homeStationId, workStationId, directionOverride, lineId };
}

function persist(state: CommuteState): void {
  writeString(HOME_KEY, state.homeStationId);
  writeString(WORK_KEY, state.workStationId);
  writeString(DIRECTION_KEY, state.directionOverride);
  writeString(LINE_KEY, state.lineId);
}

function sharedFromUrl(): { from: string | null; to: string | null; lineId: string | null } {
  const params = new URLSearchParams(window.location.search);
  return {
    from: params.get(FROM_PARAM),
    to: params.get(TO_PARAM),
    lineId: params.get(LINE_PARAM),
  };
}

function reflectInUrl(originId: string | null, destinationId: string | null, lineId: string | null): void {
  const url = new URL(window.location.href);
  const apply = (key: string, value: string | null) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  };
  apply(FROM_PARAM, originId);
  apply(TO_PARAM, destinationId);
  apply(LINE_PARAM, lineId);
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, "", next);
  }
}

function clearBoardFromUrl(): void {
  reflectInUrl(null, null, null);
}

/**
 * Saved Home / Work pair, with time-of-day direction and an optional share URL.
 *
 * A shared `?from=&to=` link is a request for that board and does not overwrite
 * the commute. New installs have no default origin — first-run collects both ends.
 */
export function useCommute(): CommuteController {
  const [state, setState] = useState<CommuteState>(loadState);
  const now = useNow(60_000);
  const clock = commutePeriodAt(new Date(now));

  const mutate = useCallback((change: (prev: CommuteState) => CommuteState) => {
    setState((prev) => {
      const next = change(prev);
      if (next === prev) return prev;
      persist(next);
      return next;
    });
  }, []);

  const direction = state.directionOverride ?? clock.suggestedDirection;
  const shared = sharedFromUrl();
  // A reflected commute writes `?from=&to=` too. Only treat the address as a
  // shared board when it is asking for a pair this device has not saved.
  const isSharedBoard = Boolean(
    shared.from
    && shared.to
    && shared.from !== shared.to
    && (shared.from !== state.homeStationId || shared.to !== state.workStationId)
    && (shared.from !== state.workStationId || shared.to !== state.homeStationId),
  );

  const originStationId = isSharedBoard
    ? shared.from
    : direction === "outbound"
      ? state.homeStationId
      : state.workStationId;
  const destinationStationId = isSharedBoard
    ? shared.to
    : direction === "outbound"
      ? state.workStationId
      : state.homeStationId;

  const lineId = shared.lineId ?? state.lineId;
  const needsSetup = !isSharedBoard && (!state.homeStationId || !state.workStationId);

  useEffect(() => {
    if (needsSetup) return;
    reflectInUrl(originStationId, destinationStationId, state.lineId);
  }, [needsSetup, originStationId, destinationStationId, state.lineId]);

  const setHome = useCallback(
    (stationId: string | null) => mutate((prev) => ({ ...prev, homeStationId: stationId })),
    [mutate],
  );
  const setWork = useCallback(
    (stationId: string | null) => mutate((prev) => ({ ...prev, workStationId: stationId })),
    [mutate],
  );
  const setup = useCallback(
    (homeStationId: string, workStationId: string) => {
      // Drop the previous board from the address bar first. Those params are
      // also how a shared link overrides the saved commute; leaving the old
      // pair there makes the next render treat the change as someone else's
      // board and write it straight back.
      clearBoardFromUrl();
      mutate((prev) => ({ ...prev, homeStationId, workStationId, directionOverride: null }));
    },
    [mutate],
  );
  const setLine = useCallback((nextLineId: string | null) => mutate((prev) => ({ ...prev, lineId: nextLineId })), [mutate]);
  const swap = useCallback(
    () =>
      mutate((prev) => {
        const current = prev.directionOverride ?? clock.suggestedDirection;
        return { ...prev, directionOverride: current === "outbound" ? "inbound" : "outbound" };
      }),
    [mutate, clock.suggestedDirection],
  );
  const reset = useCallback(
    () => {
      clearBoardFromUrl();
      mutate(() => ({ homeStationId: null, workStationId: null, directionOverride: null, lineId: null }));
    },
    [mutate],
  );

  return useMemo(
    () => ({
      ...state,
      lineId,
      direction,
      period: clock.period,
      originStationId,
      destinationStationId,
      needsSetup,
      isSharedBoard,
      setHome,
      setWork,
      setup,
      setLine,
      swap,
      reset,
    }),
    [
      state,
      lineId,
      direction,
      clock.period,
      originStationId,
      destinationStationId,
      needsSetup,
      isSharedBoard,
      setHome,
      setWork,
      setup,
      setLine,
      swap,
      reset,
    ],
  );
}
