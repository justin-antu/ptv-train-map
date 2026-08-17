import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { APP_TITLE, LIVE_POLL_INTERVAL_MS, NETWORK_SUBTITLE, RUN_SHOW_BEFORE_FIRST_STOP_MS, RUN_STALE_AFTER_MS } from "./config";
import { loadStaticData, pollLiveData } from "./data/loadData";
import { addLineAndStations, createMap, queryStationIdAt, setupStationHoverCursor, setVisibleLines } from "./map/map";
import { createLegend } from "./map/legend";
import { createInfoCardController } from "./map/infoCard";
import { startAnimationLoop } from "./trains/animate";
import { buildInterpolationContext, computeTrainPositions } from "./trains/interpolate";
import { TrainMarkerLayer } from "./trains/trainMarkers";
import type { LiveRun } from "./shared/types";

const app = document.getElementById("app");
if (!app) throw new Error("#app root element missing");

app.innerHTML = `
  <div id="map"></div>
  <div class="panel">
    <h1>${APP_TITLE}</h1>
    <p class="subtitle">${NETWORK_SUBTITLE} &middot; all metro lines (no V/Line)</p>
    <div class="status-row">
      <span class="demo-badge" id="demo-badge">DEMO DATA</span>
      <span id="status-text">Loading…</span>
    </div>
    <p class="note">
      Train positions are estimated by interpolating between predicted departure
      times at each station (the PTV Timetable API doesn't expose live GPS for
      trains) &mdash; so treat this as "roughly where the train should be", not exact GPS.
    </p>
    <div class="legend" id="legend"></div>
  </div>
`;

async function main() {
  const mapContainer = document.getElementById("map");
  const statusText = document.getElementById("status-text");
  const demoBadge = document.getElementById("demo-badge");
  const legendContainer = document.getElementById("legend");
  if (!mapContainer || !statusText || !demoBadge || !legendContainer) return;

  const staticData = await loadStaticData();
  const map = createMap(mapContainer, staticData);
  addLineAndStations(map, staticData);
  setupStationHoverCursor(map);

  const lineColorById = new Map(staticData.lines.map((l) => [l.id, l.color]));
  const lineNameById = new Map(staticData.lines.map((l) => [l.id, l.name]));
  const stationsById = new Map(staticData.stations.map((s) => [s.id, s]));
  const interpolationContext = buildInterpolationContext(staticData);

  const infoCard = createInfoCardController(map, stationsById, lineNameById, lineColorById);
  const trainMarkers = new TrainMarkerLayer(map, lineColorById, (pos) => {
    infoCard.showTrain(pos, currentRuns, Date.now());
  });

  // A click that doesn't land on a station dot (train marker clicks never reach
  // this handler at all — see infoCard.ts's doc comment) dismisses any open card.
  map.on("click", (e) => {
    const stationId = queryStationIdAt(map, e.point);
    if (stationId) {
      infoCard.showStation(stationId, currentRuns, Date.now());
    } else {
      infoCard.closeForBackgroundClick();
    }
  });

  let visibleLineIds = new Set(staticData.lines.map((l) => l.id));
  createLegend(
    legendContainer,
    staticData.lines.map((l) => ({ id: l.id, name: l.name, color: l.color })),
    (visible) => {
      visibleLineIds = new Set(visible);
      setVisibleLines(map, visibleLineIds);
    },
  );

  let currentRuns: LiveRun[] = [];

  pollLiveData(staticData, LIVE_POLL_INTERVAL_MS, (snapshot, isDemo) => {
    currentRuns = snapshot.runs;
    demoBadge.classList.toggle("visible", isDemo);
    const generated = new Date(snapshot.generatedAtUtc);
    const label = isDemo ? "Simulated demo trains" : `Live data as of ${generated.toLocaleTimeString()}`;
    statusText.textContent = `${label} · ${currentRuns.length} train${currentRuns.length === 1 ? "" : "s"} tracked`;
  });

  startAnimationLoop((now) => {
    const positions = computeTrainPositions(currentRuns, stationsById, interpolationContext, now, {
      staleAfterMs: RUN_STALE_AFTER_MS,
      showBeforeFirstStopMs: RUN_SHOW_BEFORE_FIRST_STOP_MS,
    });
    const visiblePositions = positions.filter((p) => visibleLineIds.has(p.lineId));
    trainMarkers.update(visiblePositions);
    infoCard.refresh(currentRuns, visiblePositions, now);
  });
}

main().catch((err) => {
  console.error(err);
  const appEl = document.getElementById("app");
  if (appEl) {
    appEl.innerHTML = `<div style="padding:2rem;font-family:system-ui,sans-serif;">
      <h1>Something went wrong loading the map</h1>
      <p>${err instanceof Error ? err.message : String(err)}</p>
    </div>`;
  }
});
