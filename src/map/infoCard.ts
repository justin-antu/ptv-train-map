import maplibregl from "maplibre-gl";
import type { LiveRun, StationStatic } from "../shared/types";
import type { TrainPosition } from "../trains/interpolate";
import { formatEta, soonestPerLine, upcomingStopsForStation } from "../data/departures";
import type { FavouriteController } from "./favourite";

type ActiveTarget = { kind: "station"; stationId: string } | { kind: "train"; key: string };

export interface InfoCardController {
  /** Opens (or replaces the currently-open card with) the info card for a clicked station. */
  showStation(stationId: string, runs: LiveRun[], now: number): void;
  /** Opens (or replaces the currently-open card with) the info card for a clicked train. */
  showTrain(pos: TrainPosition, runs: LiveRun[], now: number): void;
  /** Closes the card, if any is open — call this for clicks that hit neither a station nor a train. */
  closeForBackgroundClick(): void;
  /** Call every animation frame: keeps a train card following its train and refreshes displayed times/departures. */
  refresh(runs: LiveRun[], positions: TrainPosition[], now: number): void;
}

const DELAYED_THRESHOLD_MIN = 3;

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

/** Small "+X min" pill shown for meaningfully-late trains; on-time/early trains show nothing extra. */
function delayBadgeHtml(delayMin: number): string {
  if (delayMin < DELAYED_THRESHOLD_MIN) return "";
  return `<span class="info-card-delay">+${delayMin} min</span>`;
}

/**
 * Manages a single shared MapLibre Popup used for both "station clicked" and
 * "train clicked" info cards. Using one reused Popup instance (rather than
 * creating a new one per click) is what guarantees the "only one info card
 * visible at a time" requirement: showing a new card always just repositions
 * and rewrites the same DOM node instead of stacking additional ones.
 *
 * We intentionally do NOT use MapLibre's built-in `closeOnClick` popup option:
 * it closes the popup on *any* map click, including the very click that's
 * simultaneously trying to open a *different* station's card, and event
 * ordering between its internal listener and our own click handling isn't
 * something we want to depend on. Instead, dismissal is fully explicit:
 * `closeForBackgroundClick` is called by the map's click handler only when
 * the click didn't hit a station, and train clicks are handled by listeners
 * on the marker elements themselves (which never reach the map's own click
 * handler, since they're separate DOM elements layered on top of the canvas).
 */
export function createInfoCardController(
  map: maplibregl.Map,
  stationsById: Map<string, StationStatic>,
  lineNameById: Map<string, string>,
  lineColorById: Map<string, string>,
  favourite: FavouriteController,
): InfoCardController {
  const popup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    maxWidth: "260px",
    className: "info-popup",
  });

  let active: ActiveTarget | null = null;
  let lastHtml = "";
  let lastContentRefreshAt = 0;
  let lastRuns: LiveRun[] = [];
  let delegatedListenerAttached = false;

  popup.on("close", () => {
    active = null;
    lastHtml = "";
  });

  function renderStationHtml(station: StationStatic, runs: LiveRun[], now: number): string {
    const departures = soonestPerLine(upcomingStopsForStation(station, runs, now));
    const rows = departures
      .map(
        (d) => `
        <div class="info-card-row">
          <span class="legend-swatch" style="background:${lineColorById.get(d.lineId) ?? "#333"}"></span>
          <span class="info-card-line">${escapeHtml(lineNameById.get(d.lineId) ?? d.lineId)}</span>
          <span class="info-card-time">${formatEta(d.timeUtc, now)}</span>
          ${delayBadgeHtml(d.delayMin)}
        </div>`,
      )
      .join("");
    const starred = favourite.isFavourite(station.id);
    return `<div class="info-card">
        <div class="info-card-title">
          <span class="info-card-title-text">${escapeHtml(station.name)}</span>
          <button type="button" class="info-card-favourite${starred ? " info-card-favourite--active" : ""}" data-station-id="${escapeHtml(station.id)}" title="${starred ? "Remove as my station" : "Set as my station"}">${starred ? "\u2605" : "\u2606"}</button>
        </div>
        <div class="info-card-subtitle">Next departures</div>
        ${rows || '<div class="info-card-empty">No upcoming departures in current data.</div>'}
      </div>`;
  }

  function renderTrainHtml(pos: TrainPosition, runs: LiveRun[], now: number): string {
    const run = runs.find((r) => r.lineId === pos.lineId && r.runRef === pos.runRef);
    const nextStop = run?.stops.find((s) => Date.parse(s.timeUtc) > now) ?? null;
    const color = lineColorById.get(pos.lineId) ?? "#333";
    const lineName = lineNameById.get(pos.lineId) ?? pos.lineId;
    const nextStationName = nextStop ? (stationsById.get(nextStop.stationId)?.name ?? nextStop.stationId) : null;
    const nextRow =
      nextStop && nextStationName
        ? `<div class="info-card-row">
            <span class="info-card-line">Next: ${escapeHtml(nextStationName)}</span>
            <span class="info-card-time">${formatEta(nextStop.timeUtc, now)}</span>
          </div>`
        : `<div class="info-card-empty">Approaching ${escapeHtml(pos.destinationName)}</div>`;
    return `<div class="info-card">
        <div class="info-card-title"><span class="legend-swatch" style="background:${color}"></span>${escapeHtml(lineName)}${delayBadgeHtml(pos.delayMin)}</div>
        <div class="info-card-subtitle">To ${escapeHtml(pos.destinationName)}</div>
        ${nextRow}
      </div>`;
  }

  function ensureDelegatedListener(): void {
    if (delegatedListenerAttached) return;
    const el = popup.getElement();
    if (!el) return;
    delegatedListenerAttached = true;
    el.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(".info-card-favourite");
      if (!target) return;
      e.stopPropagation();
      const stationId = target.dataset.stationId;
      if (!stationId) return;
      favourite.toggle(stationId);
      // Re-render immediately so the star reflects the new state without waiting for the next refresh() tick.
      if (active?.kind === "station" && active.stationId === stationId) {
        const station = stationsById.get(stationId);
        if (station) setContent([station.lon, station.lat], renderStationHtml(station, lastRuns, lastContentRefreshAt));
      }
    });
  }

  function setContent(lngLat: [number, number], html: string): void {
    lastHtml = html;
    popup.setLngLat(lngLat).setHTML(html);
    if (!popup.isOpen()) popup.addTo(map);
    ensureDelegatedListener();
  }

  return {
    showStation(stationId, runs, now) {
      const station = stationsById.get(stationId);
      if (!station) return;
      active = { kind: "station", stationId };
      lastContentRefreshAt = now;
      lastRuns = runs;
      setContent([station.lon, station.lat], renderStationHtml(station, runs, now));
    },

    showTrain(pos, runs, now) {
      active = { kind: "train", key: `${pos.lineId}:${pos.runRef}` };
      lastContentRefreshAt = now;
      lastRuns = runs;
      setContent([pos.lon, pos.lat], renderTrainHtml(pos, runs, now));
    },

    closeForBackgroundClick() {
      if (popup.isOpen()) popup.remove();
      active = null;
    },

    refresh(runs, positions, now) {
      if (!active) return;
      const current = active;
      lastRuns = runs;

      if (current.kind === "train") {
        const pos = positions.find((p) => `${p.lineId}:${p.runRef}` === current.key);
        if (!pos) {
          popup.remove();
          return;
        }
        // Cheap and done every frame, so the card visually follows the moving train.
        popup.setLngLat([pos.lon, pos.lat]);
        if (now - lastContentRefreshAt > 3000) {
          lastContentRefreshAt = now;
          const html = renderTrainHtml(pos, runs, now);
          if (html !== lastHtml) {
            lastHtml = html;
            popup.setHTML(html);
          }
        }
        return;
      }

      if (now - lastContentRefreshAt > 5000) {
        lastContentRefreshAt = now;
        const station = stationsById.get(current.stationId);
        if (!station) {
          popup.remove();
          return;
        }
        const html = renderStationHtml(station, runs, now);
        if (html !== lastHtml) {
          lastHtml = html;
          popup.setHTML(html);
        }
      }
    },
  };
}
