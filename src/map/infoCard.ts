import maplibregl from "maplibre-gl";
import type { LiveRun, StationStatic } from "../shared/types";
import type { TrainPosition } from "../trains/interpolate";

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

/** Formats a predicted ISO time as a short relative/absolute label, e.g. "Due", "4 min", "2:15 pm". */
function formatEta(timeUtc: string, now: number): string {
  const diffMs = Date.parse(timeUtc) - now;
  if (diffMs <= 30_000) return "Due";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins} min`;
  return new Date(timeUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** For a station, finds the soonest still-upcoming predicted departure per line that serves it, soonest first. */
function computeStationDepartures(
  station: StationStatic,
  runs: LiveRun[],
  now: number,
): { lineId: string; timeUtc: string }[] {
  const soonestByLine = new Map<string, string>();
  for (const run of runs) {
    if (!station.lineIds.includes(run.lineId)) continue;
    for (const stop of run.stops) {
      if (stop.stationId !== station.id) continue;
      const t = Date.parse(stop.timeUtc);
      if (t < now) continue;
      const existing = soonestByLine.get(run.lineId);
      if (existing === undefined || t < Date.parse(existing)) soonestByLine.set(run.lineId, stop.timeUtc);
    }
  }
  return [...soonestByLine.entries()]
    .map(([lineId, timeUtc]) => ({ lineId, timeUtc }))
    .sort((a, b) => Date.parse(a.timeUtc) - Date.parse(b.timeUtc));
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

  popup.on("close", () => {
    active = null;
    lastHtml = "";
  });

  function renderStationHtml(station: StationStatic, runs: LiveRun[], now: number): string {
    const departures = computeStationDepartures(station, runs, now);
    const rows = departures
      .map(
        (d) => `
        <div class="info-card-row">
          <span class="legend-swatch" style="background:${lineColorById.get(d.lineId) ?? "#333"}"></span>
          <span class="info-card-line">${escapeHtml(lineNameById.get(d.lineId) ?? d.lineId)}</span>
          <span class="info-card-time">${formatEta(d.timeUtc, now)}</span>
        </div>`,
      )
      .join("");
    return `<div class="info-card">
        <div class="info-card-title">${escapeHtml(station.name)}</div>
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
        <div class="info-card-title"><span class="legend-swatch" style="background:${color}"></span>${escapeHtml(lineName)}</div>
        <div class="info-card-subtitle">To ${escapeHtml(pos.destinationName)}</div>
        ${nextRow}
      </div>`;
  }

  function setContent(lngLat: [number, number], html: string): void {
    lastHtml = html;
    popup.setLngLat(lngLat).setHTML(html);
    if (!popup.isOpen()) popup.addTo(map);
  }

  return {
    showStation(stationId, runs, now) {
      const station = stationsById.get(stationId);
      if (!station) return;
      active = { kind: "station", stationId };
      lastContentRefreshAt = now;
      setContent([station.lon, station.lat], renderStationHtml(station, runs, now));
    },

    showTrain(pos, runs, now) {
      active = { kind: "train", key: `${pos.lineId}:${pos.runRef}` };
      lastContentRefreshAt = now;
      setContent([pos.lon, pos.lat], renderTrainHtml(pos, runs, now));
    },

    closeForBackgroundClick() {
      if (popup.isOpen()) popup.remove();
      active = null;
    },

    refresh(runs, positions, now) {
      if (!active) return;
      const current = active;

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
