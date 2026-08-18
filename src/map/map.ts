import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { NetworkStaticData } from "../shared/types";

/**
 * Keyless CARTO Positron raster style. The basemap remains light in both UI
 * themes; dark mode applies only to the surrounding interface. Avoiding
 * `map.setStyle()` prevents custom source and layer teardown during theme
 * changes and eliminates a full map reload.
 */
function buildPositronStyle(): StyleSpecification {
  const sourceId = "carto-light_all";
  return {
    version: 8,
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    sources: {
      [sourceId]: {
        type: "raster",
        // CARTO distributes keyless tile requests across four subdomains.
        tiles: [
          `https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`,
          `https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`,
          `https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`,
          `https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`,
        ],
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [
      {
        id: "carto-light_all-tiles",
        type: "raster",
        source: sourceId,
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  };
}

const POSITRON_STYLE = buildPositronStyle();

const LINES_SOURCE_ID = "network-lines";
const STATIONS_SOURCE_ID = "network-stations";
const LINE_CASING_LAYER_ID = "network-line-casing";
const LINE_LAYER_ID = "network-line";
const STATIONS_CIRCLE_LAYER_ID = "network-stations-circle";
const STATIONS_LABEL_LAYER_ID = "network-stations-label";

/** Station dot/label/line-casing colours, chosen for contrast against the (permanently light) Positron basemap. */
const STATION_PAINT = { circleFill: "#ffffff", circleStroke: "#333333", lineCasing: "#ffffff", textColor: "#1a1a1a", textHalo: "#ffffff" };

function computeBounds(staticData: NetworkStaticData): maplibregl.LngLatBoundsLike {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const line of staticData.lines) {
    for (const [lon, lat] of line.polyline) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

/** Creates the map, permanently on the Positron basemap. Called exactly once per `MapView` mount. */
export function createMap(container: HTMLElement, staticData: NetworkStaticData): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: POSITRON_STYLE,
    bounds: computeBounds(staticData),
    fitBoundsOptions: { padding: 32 },
    attributionControl: { compact: true },
    // World wrapping is unnecessary for a single-city map. Disabling it also
    // prevents MapLibre markers from selecting a wrapped longitude copy based
    // on their previous projected position after large interpolation updates.
    renderWorldCopies: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  return map;
}

/**
 * Draws every in-scope line's route + a single deduplicated set of station
 * markers after the map style loads. The operation is idempotent per map.
 *
 * Shared corridors are rendered as overlapping colour-coded lines rather than
 * merged track infrastructure.
 */
export function addLineAndStations(map: maplibregl.Map, staticData: NetworkStaticData): void {
  if (map.isStyleLoaded()) {
    drawLinesAndStations(map, staticData);
  } else {
    // The fixed map style emits one load event per map instance.
    map.on("load", () => drawLinesAndStations(map, staticData));
  }
}

function drawLinesAndStations(map: maplibregl.Map, staticData: NetworkStaticData): void {
  if (map.getSource(LINES_SOURCE_ID)) return; // Prevent duplicate sources during re-entrant calls.

  map.addSource(LINES_SOURCE_ID, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: staticData.lines.map((line) => ({
        type: "Feature",
        properties: { lineId: line.id, name: line.name, color: line.color },
        geometry: { type: "LineString", coordinates: line.polyline },
      })),
    },
  });
  map.addLayer({
    id: LINE_CASING_LAYER_ID,
    type: "line",
    source: LINES_SOURCE_ID,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": STATION_PAINT.lineCasing, "line-width": 6, "line-opacity": 0.85 },
  });
  map.addLayer({
    id: LINE_LAYER_ID,
    type: "line",
    source: LINES_SOURCE_ID,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 3.5 },
  });

  map.addSource(STATIONS_SOURCE_ID, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: staticData.stations.map((station) => ({
        type: "Feature",
        properties: { name: station.name, id: station.id, lineCount: station.lineIds.length },
        geometry: { type: "Point", coordinates: [station.lon, station.lat] },
      })),
    },
  });
  map.addLayer({
    id: STATIONS_CIRCLE_LAYER_ID,
    type: "circle",
    source: STATIONS_SOURCE_ID,
    paint: {
      // Interchange stations use a larger marker.
      "circle-radius": ["case", [">", ["get", "lineCount"], 1], 5.5, 4],
      "circle-color": STATION_PAINT.circleFill,
      "circle-stroke-color": STATION_PAINT.circleStroke,
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: STATIONS_LABEL_LAYER_ID,
    type: "symbol",
    source: STATIONS_SOURCE_ID,
    minzoom: 10,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-font": ["Noto Sans Regular"],
      "text-optional": true,
    },
    paint: {
      "text-color": STATION_PAINT.textColor,
      "text-halo-color": STATION_PAINT.textHalo,
      "text-halo-width": 1.4,
    },
  });
}

/** Shows/hides line layers based on the given set of visible line ids (see the legend panel). */
export function setVisibleLines(map: maplibregl.Map, visibleLineIds: ReadonlySet<string>): void {
  const filter: maplibregl.FilterSpecification = ["in", ["get", "lineId"], ["literal", [...visibleLineIds]]];
  if (map.getLayer(LINE_LAYER_ID)) map.setFilter(LINE_LAYER_ID, filter);
  if (map.getLayer(LINE_CASING_LAYER_ID)) map.setFilter(LINE_CASING_LAYER_ID, filter);
}

/** Returns the clicked station's id, or null if the given point didn't land on a station dot. */
export function queryStationIdAt(map: maplibregl.Map, point: maplibregl.PointLike): string | null {
  if (!map.getLayer(STATIONS_CIRCLE_LAYER_ID)) return null;
  const features = map.queryRenderedFeatures(point, { layers: [STATIONS_CIRCLE_LAYER_ID] });
  const id = features[0]?.properties?.id;
  return typeof id === "string" ? id : null;
}

/** Toggles the pointer cursor while hovering over station dots, for a basic clickability affordance. */
export function setupStationHoverCursor(map: maplibregl.Map): void {
  map.on("mouseenter", STATIONS_CIRCLE_LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", STATIONS_CIRCLE_LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
  });
}
