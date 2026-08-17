import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { LINE_NAME, LIVE_POLL_INTERVAL_MS, RUN_SHOW_BEFORE_FIRST_STOP_MS, RUN_STALE_AFTER_MS } from "./config";
import { loadStaticData, pollLiveData } from "./data/loadData";
import { addLineAndStations, createMap } from "./map/map";
import { startAnimationLoop } from "./trains/animate";
import { buildInterpolationContext, computeTrainPositions } from "./trains/interpolate";
import { TrainMarkerLayer } from "./trains/trainMarkers";
import type { LiveRun } from "./shared/types";

const app = document.getElementById("app");
if (!app) throw new Error("#app root element missing");

app.innerHTML = `
  <div id="map"></div>
  <div class="panel">
    <h1><span class="line-swatch"></span>Where Is My Train?</h1>
    <p class="subtitle">${LINE_NAME} line &middot; Metro Trains Melbourne</p>
    <div class="status-row">
      <span class="demo-badge" id="demo-badge">DEMO DATA</span>
      <span id="status-text">Loading…</span>
    </div>
    <p class="note">
      Train positions are estimated by interpolating between predicted departure
      times at each station (the PTV Timetable API doesn't expose live GPS for
      trains) &mdash; so treat this as "roughly where the train should be", not exact GPS.
    </p>
  </div>
`;

async function main() {
  const mapContainer = document.getElementById("map");
  const statusText = document.getElementById("status-text");
  const demoBadge = document.getElementById("demo-badge");
  if (!mapContainer || !statusText || !demoBadge) return;

  const staticData = await loadStaticData();
  const map = createMap(mapContainer, staticData);
  addLineAndStations(map, staticData);

  const stationsById = new Map(staticData.stations.map((s) => [s.id, s]));
  const interpolationContext = buildInterpolationContext(staticData.stations, staticData.polyline);
  const trainMarkers = new TrainMarkerLayer(map);

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
    trainMarkers.update(positions);
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
