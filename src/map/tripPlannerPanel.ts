import type { LiveRun, StationStatic } from "../shared/types";
import { formatEta } from "../data/departures";
import { planTrip, type TripOption, type TripPlanResult } from "../data/tripPlanner";
import { createStationAutocomplete } from "./stationAutocomplete";

export interface TripPlannerController {
  /** Call every animation frame (throttled internally): keeps results fresh as new live data/relative times come in. */
  update(runs: LiveRun[], now: number): void;
}

const COLLAPSED_STORAGE_KEY = "wimt:tripPlannerCollapsed";
const DELAYED_THRESHOLD_MIN = 3;

function loadCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    // Unlike the line legend, the trip planner defaults to collapsed on a
    // first-ever visit — it's an occasional-use tool, not something every
    // visitor needs open immediately.
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
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

function delayBadgeHtml(delayMin: number): string {
  if (delayMin < DELAYED_THRESHOLD_MIN) return "";
  return `<span class="info-card-delay">+${delayMin} min</span>`;
}

export function createTripPlannerPanel(
  container: HTMLElement,
  stations: readonly StationStatic[],
  stationsById: Map<string, StationStatic>,
  lineNameById: Map<string, string>,
  lineColorById: Map<string, string>,
): TripPlannerController {
  // Reuses the legend's collapsible header/body classes so this reads as
  // "another section of the same panel" rather than a visually distinct
  // component, per the plan's "match existing visual language" goal.
  container.className = "trip-planner legend";
  container.classList.toggle("legend-collapsed", loadCollapsed());
  container.innerHTML = `
    <button type="button" class="legend-header">
      <span class="legend-title">Trip planner</span>
      <span class="legend-chevron">&#9662;</span>
    </button>
    <div class="legend-body">
      <div class="trip-planner-field">
        <label class="trip-planner-label">From</label>
        <div class="trip-planner-from"></div>
      </div>
      <div class="trip-planner-field">
        <label class="trip-planner-label">To</label>
        <div class="trip-planner-to"></div>
      </div>
      <div class="trip-planner-results"></div>
    </div>
  `;

  const header = container.querySelector<HTMLButtonElement>(".legend-header")!;
  const fromContainer = container.querySelector<HTMLDivElement>(".trip-planner-from")!;
  const toContainer = container.querySelector<HTMLDivElement>(".trip-planner-to")!;
  const resultsEl = container.querySelector<HTMLDivElement>(".trip-planner-results")!;

  header.setAttribute("aria-expanded", String(!container.classList.contains("legend-collapsed")));
  header.addEventListener("click", () => {
    const collapsed = container.classList.toggle("legend-collapsed");
    header.setAttribute("aria-expanded", String(!collapsed));
    saveCollapsed(collapsed);
  });

  let origin: StationStatic | null = null;
  let destination: StationStatic | null = null;
  let latestRuns: LiveRun[] = [];
  let lastRenderedHtml = "";
  let lastUpdateAt = 0;

  function renderOptionHtml(option: TripOption, now: number): string {
    const legRows = option.legs
      .map((leg) => {
        const lineName = lineNameById.get(leg.lineId) ?? leg.lineId;
        const color = lineColorById.get(leg.lineId) ?? "#333";
        const fromName = stationsById.get(leg.fromStationId)?.name ?? leg.fromStationId;
        const toName = stationsById.get(leg.toStationId)?.name ?? leg.toStationId;
        return `
          <div class="trip-leg">
            <div class="trip-leg-line">
              <span class="legend-swatch" style="background:${color}"></span>
              <span class="info-card-line">${escapeHtml(lineName)}</span>
              ${delayBadgeHtml(leg.delayMin)}
            </div>
            <div class="trip-leg-detail">${escapeHtml(fromName)} <b>${formatEta(leg.departTimeUtc, now)}</b> &rarr; ${escapeHtml(toName)} <b>${formatEta(leg.arriveTimeUtc, now)}</b></div>
          </div>`;
      })
      .join("");
    return `<div class="trip-option">${legRows}</div>`;
  }

  function renderResultsHtml(result: TripPlanResult, now: number): string {
    switch (result.kind) {
      case "same-station":
        return `<div class="info-card-empty">Origin and destination are the same station.</div>`;
      case "no-route":
        return result.nearestInterchangeName
          ? `<div class="info-card-empty">No direct line found — try via ${escapeHtml(result.nearestInterchangeName)}.</div>`
          : `<div class="info-card-empty">No route found between these stations in the current data.</div>`;
      case "direct":
        return result.options.map((o) => renderOptionHtml(o, now)).join("");
      case "interchange":
        return `<div class="trip-interchange-note">Change at ${escapeHtml(result.interchangeName)}</div>${result.options.map((o) => renderOptionHtml(o, now)).join("")}`;
    }
  }

  function recompute(now: number): void {
    if (!origin || !destination) {
      resultsEl.innerHTML = "";
      lastRenderedHtml = "";
      return;
    }
    const result = planTrip(origin, destination, stations, latestRuns, now);
    const html = renderResultsHtml(result, now);
    if (html !== lastRenderedHtml) {
      lastRenderedHtml = html;
      resultsEl.innerHTML = html;
    }
  }

  createStationAutocomplete(fromContainer, stations, {
    placeholder: "Origin station…",
    onSelect: (station) => {
      origin = station;
      recompute(Date.now());
    },
  });

  createStationAutocomplete(toContainer, stations, {
    placeholder: "Destination station…",
    onSelect: (station) => {
      destination = station;
      recompute(Date.now());
    },
  });

  return {
    update(runs, now) {
      latestRuns = runs;
      // Same 1s throttle as the favourite board — results only meaningfully
      // change roughly once a minute; no need to re-render on every frame.
      if (now - lastUpdateAt < 1000) return;
      lastUpdateAt = now;
      recompute(now);
    },
  };
}
