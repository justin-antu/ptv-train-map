import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { APP_TITLE, LIVE_POLL_INTERVAL_MS, NETWORK_SUBTITLE, RUN_SHOW_BEFORE_FIRST_STOP_MS, RUN_STALE_AFTER_MS } from "./config";
import { loadStaticData, pollLiveData } from "./data/loadData";
import { addLineAndStations, createMap, queryStationIdAt, setupStationHoverCursor, setVisibleLines } from "./map/map";
import { createLegend } from "./map/legend";
import { createInfoCardController } from "./map/infoCard";
import { createFavouriteBoard } from "./map/favourite";
import { createStationAutocomplete } from "./map/stationAutocomplete";
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
      <span class="demo-badge" id="demo-badge" title="Live PTV data isn't available right now, so a couple of simulated trains per line are shown instead.">SAMPLE DATA</span>
      <span id="status-text">Loading…</span>
    </div>
    <p class="note">
      Train positions are estimated by interpolating between predicted departure
      times at each station (the PTV Timetable API doesn't expose live GPS for
      trains) &mdash; so treat this as "roughly where the train should be", not exact GPS.
    </p>
    <div class="station-autocomplete" id="station-search"></div>
    <div class="fav-board" id="fav-board"></div>
    <div class="legend" id="legend"></div>
  </div>
`;

async function main() {
  const mapContainer = document.getElementById("map");
  const statusText = document.getElementById("status-text");
  const demoBadge = document.getElementById("demo-badge");
  const legendContainer = document.getElementById("legend");
  const favBoardContainer = document.getElementById("fav-board");
  const searchContainer = document.getElementById("station-search");
  if (!mapContainer || !statusText || !demoBadge || !legendContainer || !favBoardContainer || !searchContainer) return;

  const staticData = await loadStaticData();
  const map = createMap(mapContainer, staticData);
  addLineAndStations(map, staticData);
  setupStationHoverCursor(map);

  const lineColorById = new Map(staticData.lines.map((l) => [l.id, l.color]));
  const lineNameById = new Map(staticData.lines.map((l) => [l.id, l.name]));
  const stationsById = new Map(staticData.stations.map((s) => [s.id, s]));
  const interpolationContext = buildInterpolationContext(staticData);

  // The favourite board's "jump to my station" click is wired up after both it
  // and the info card exist (they're mutually referential: the info card needs
  // the favourite controller to render the star, the board needs the info card
  // to open on click) — this indirection avoids a circular construction order.
  let onFavouriteStationClick: ((stationId: string) => void) | undefined;
  const favourite = createFavouriteBoard(favBoardContainer, stationsById, lineNameById, lineColorById, (stationId) =>
    onFavouriteStationClick?.(stationId),
  );

  const infoCard = createInfoCardController(map, stationsById, lineNameById, lineColorById, favourite);
  const trainMarkers = new TrainMarkerLayer(map, lineColorById, (pos) => {
    infoCard.showTrain(pos, currentRuns, Date.now());
  });

  onFavouriteStationClick = (stationId) => {
    const station = stationsById.get(stationId);
    if (!station) return;
    map.flyTo({ center: [station.lon, station.lat], zoom: Math.max(map.getZoom(), 12), essential: true });
    infoCard.showStation(stationId, currentRuns, Date.now());
  };

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
  const legend = createLegend(
    legendContainer,
    staticData.lines.map((l) => ({ id: l.id, name: l.name, color: l.color })),
    (visible) => {
      visibleLineIds = new Set(visible);
      setVisibleLines(map, visibleLineIds);
    },
  );

  createStationAutocomplete(searchContainer, staticData.stations, {
    placeholder: "Search for a station…",
    onSelect: (station) => {
      // A searched-for station might currently be hidden via the legend (or
      // simply not have any of its lines checked) — make sure at least one of
      // its lines is visible so flying to it doesn't land on an invisible dot.
      legend.setVisible(station.lineIds);
      map.flyTo({ center: [station.lon, station.lat], zoom: Math.max(map.getZoom(), 12), essential: true });
      infoCard.showStation(station.id, currentRuns, Date.now());
    },
  });

  let currentRuns: LiveRun[] = [];

  pollLiveData(staticData, LIVE_POLL_INTERVAL_MS, (snapshot, isDemo) => {
    currentRuns = snapshot.runs;
    demoBadge.classList.toggle("visible", isDemo);
    const generated = new Date(snapshot.generatedAtUtc);
    const label = isDemo ? "Sample preview — live data unavailable" : `Live data as of ${generated.toLocaleTimeString()}`;
    statusText.textContent = `${label} · ${currentRuns.length} train${currentRuns.length === 1 ? "" : "s"} tracked`;
    legend.setDisruptions(snapshot.disruptionsByLine ?? {});
  });

  startAnimationLoop((now) => {
    const positions = computeTrainPositions(currentRuns, stationsById, interpolationContext, now, {
      staleAfterMs: RUN_STALE_AFTER_MS,
      showBeforeFirstStopMs: RUN_SHOW_BEFORE_FIRST_STOP_MS,
    });
    const visiblePositions = positions.filter((p) => visibleLineIds.has(p.lineId));
    trainMarkers.update(visiblePositions);
    infoCard.refresh(currentRuns, visiblePositions, now);
    favourite.update(currentRuns, now);
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
