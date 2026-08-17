import type { LiveRun, StationStatic } from "../shared/types";
import { formatEta, upcomingStopsForStation } from "../data/departures";

const FAVOURITE_STORAGE_KEY = "wimt:favouriteStationId";
const NOTIFY_STORAGE_KEY = "wimt:notifyEnabled";

/** How soon before a train's predicted arrival we fire a notification, per the spec's "~2 minutes". */
const NOTIFY_THRESHOLD_MS = 2 * 60_000;
/** Only the next few departures, like a real platform departure board — not deduped per line, unlike the station info card. */
const MAX_ROWS = 6;
const DELAYED_THRESHOLD_MIN = 3;

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
    // Ignore write failures — favouriting still works for this session.
  }
}

function loadNotifyEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIFY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveNotifyEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFY_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore write failures.
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export interface FavouriteController {
  /** True if `stationId` is the current single favourite. */
  isFavourite(stationId: string): boolean;
  /** Stars `stationId` as the favourite (replacing any previous one), or un-stars it if it's already the favourite. */
  toggle(stationId: string): void;
  /** Call every live-poll tick: refreshes the departure board and fires any due notification. */
  update(runs: LiveRun[], now: number): void;
}

/**
 * Renders a compact "next departures" board for a single favourite station
 * into `container` — hidden entirely (zero footprint) when no favourite is
 * set. The favourite itself is starred from the station info card (see
 * infoCard.ts); this component only owns the persistent board + the
 * opt-in browser-notification toggle.
 *
 * Notifications are strictly opt-in: `Notification.requestPermission()` is
 * only ever called from inside the checkbox's own `change` handler (i.e. a
 * direct user gesture on this exact control), never automatically on load.
 */
export function createFavouriteBoard(
  container: HTMLElement,
  stationsById: Map<string, StationStatic>,
  lineNameById: Map<string, string>,
  lineColorById: Map<string, string>,
  onStationClick?: (stationId: string) => void,
): FavouriteController {
  let favouriteId = loadFavouriteStationId();
  let notifyEnabled = loadNotifyEnabled();
  const notifiedRunKeys = new Set<string>();
  let lastUpdateAt = 0;

  container.className = "fav-board";
  container.innerHTML = `
    <div class="fav-board-header">
      <div>
        <div class="fav-board-label">My station</div>
        <button type="button" class="fav-board-name"></button>
      </div>
      <button type="button" class="fav-board-remove" title="Remove favourite station">&#10005;</button>
    </div>
    <div class="fav-board-rows"></div>
    <label class="fav-board-notify">
      <input type="checkbox" class="fav-board-notify-checkbox" />
      Notify me when my train is ~2 min away
    </label>
    <div class="fav-board-notify-msg"></div>
  `;

  const nameBtn = container.querySelector<HTMLButtonElement>(".fav-board-name")!;
  const removeBtn = container.querySelector<HTMLButtonElement>(".fav-board-remove")!;
  const rowsEl = container.querySelector<HTMLDivElement>(".fav-board-rows")!;
  const notifyCheckbox = container.querySelector<HTMLInputElement>(".fav-board-notify-checkbox")!;
  const notifyMsg = container.querySelector<HTMLDivElement>(".fav-board-notify-msg")!;

  function delayBadgeHtml(delayMin: number): string {
    if (delayMin < DELAYED_THRESHOLD_MIN) return "";
    return `<span class="info-card-delay">+${delayMin} min</span>`;
  }

  function syncNotifyCheckbox(): void {
    const granted = typeof Notification !== "undefined" && Notification.permission === "granted";
    // Passively reflect reality (e.g. the user revoked the permission in
    // browser settings since last visit) rather than re-prompting.
    if (notifyEnabled && !granted) {
      notifyEnabled = false;
      saveNotifyEnabled(false);
    }
    notifyCheckbox.checked = notifyEnabled;
  }

  function renderHeader(): void {
    const station = favouriteId ? stationsById.get(favouriteId) : undefined;
    if (!station) {
      container.style.display = "none";
      return;
    }
    container.style.display = "flex";
    nameBtn.textContent = station.name;
    syncNotifyCheckbox();
  }

  nameBtn.addEventListener("click", () => {
    if (favouriteId) onStationClick?.(favouriteId);
  });

  removeBtn.addEventListener("click", () => {
    favouriteId = null;
    saveFavouriteStationId(null);
    notifiedRunKeys.clear();
    renderHeader();
  });

  notifyCheckbox.addEventListener("change", () => {
    void (async () => {
      if (!notifyCheckbox.checked) {
        notifyEnabled = false;
        saveNotifyEnabled(false);
        notifyMsg.textContent = "";
        return;
      }
      if (typeof Notification === "undefined") {
        notifyCheckbox.checked = false;
        notifyMsg.textContent = "Notifications aren't supported in this browser.";
        return;
      }
      // Only ever requested here, in direct response to this checkbox's own click — never on page load.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        notifyCheckbox.checked = false;
        notifyEnabled = false;
        saveNotifyEnabled(false);
        notifyMsg.textContent = "Notifications blocked — enable them in your browser settings to use this.";
        return;
      }
      notifyEnabled = true;
      saveNotifyEnabled(true);
      notifyMsg.textContent = "";
    })();
  });

  renderHeader();

  return {
    isFavourite(stationId) {
      return favouriteId === stationId;
    },

    toggle(stationId) {
      favouriteId = favouriteId === stationId ? null : stationId;
      saveFavouriteStationId(favouriteId);
      notifiedRunKeys.clear();
      renderHeader();
    },

    update(runs, now) {
      if (!favouriteId) return;
      // Recomputing + rewriting the board's HTML on every animation frame
      // (called ~60x/sec) would be wasteful for something that only visibly
      // changes about once a minute — throttle to a still-plenty-live 1s cadence.
      if (now - lastUpdateAt < 1000) return;
      lastUpdateAt = now;

      const station = stationsById.get(favouriteId);
      if (!station) return;

      const stops = upcomingStopsForStation(station, runs, now);

      const rows = stops.slice(0, MAX_ROWS);
      rowsEl.innerHTML =
        rows
          .map(
            (s) => `
        <div class="info-card-row">
          <span class="legend-swatch" style="background:${lineColorById.get(s.lineId) ?? "#333"}"></span>
          <span class="info-card-line">${escapeHtml(lineNameById.get(s.lineId) ?? s.lineId)}</span>
          <span class="info-card-time">${formatEta(s.timeUtc, now)}</span>
          ${delayBadgeHtml(s.delayMin)}
        </div>`,
          )
          .join("") || '<div class="info-card-empty">No upcoming departures in current data.</div>';

      if (notifyEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const currentKeys = new Set(stops.map((s) => `${s.lineId}:${s.runRef}`));
        for (const key of [...notifiedRunKeys]) {
          if (!currentKeys.has(key)) notifiedRunKeys.delete(key);
        }
        for (const s of stops) {
          const key = `${s.lineId}:${s.runRef}`;
          const remainingMs = Date.parse(s.timeUtc) - now;
          if (remainingMs <= NOTIFY_THRESHOLD_MS && remainingMs > -30_000 && !notifiedRunKeys.has(key)) {
            notifiedRunKeys.add(key);
            const lineName = lineNameById.get(s.lineId) ?? s.lineId;
            new Notification(`${lineName} train approaching ${station.name}`, {
              body: `${formatEta(s.timeUtc, now)} away`,
              tag: `wimt-${key}`,
            });
          }
        }
      }
    },
  };
}
