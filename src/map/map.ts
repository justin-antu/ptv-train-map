import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { NetworkStaticData } from "../shared/types";

/**
 * Keyless raster basemap using OpenStreetMap's standard tile server, plus a
 * free public glyphs CDN (openmaptiles.org) so that MapLibre symbol/text
 * layers (station name labels) can render without needing any API key or
 * Mapbox account — matches the "static site, no accounts required" constraint.
 */
const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: "osm-tiles",
      type: "raster",
      source: "osm",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const LINES_SOURCE_ID = "network-lines";
const STATIONS_SOURCE_ID = "network-stations";
const LINE_CASING_LAYER_ID = "network-line-casing";
const LINE_LAYER_ID = "network-line";
const STATIONS_CIRCLE_LAYER_ID = "network-stations-circle";
const STATIONS_LABEL_LAYER_ID = "network-stations-label";

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

export function createMap(container: HTMLElement, staticData: NetworkStaticData): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: BASEMAP_STYLE,
    bounds: computeBounds(staticData),
    fitBoundsOptions: { padding: 32 },
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  return map;
}

/**
 * Draws every in-scope line's route + a single deduplicated set of station
 * markers, once the map style has loaded. Idempotent per map instance.
 *
 * v1 simplification: shared corridors (e.g. the City Loop approaches, or the
 * Metro Tunnel trunk shared by Sunbury/Cranbourne/Pakenham) are rendered as
 * multiple overlapping colour-coded lines rather than a single cartographically
 * "merged" line — acceptable for a fun infographic-style map, not aiming for
 * pixel-perfect PTV map styling.
 */
export function addLineAndStations(map: maplibregl.Map, staticData: NetworkStaticData): void {
  const draw = () => {
    if (map.getSource(LINES_SOURCE_ID)) return; // already drawn (e.g. re-entrant "load" handling)

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
      paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.85 },
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
        // Interchange stations (served by 2+ lines) get a slightly bigger dot so they read as "hubs".
        "circle-radius": ["case", [">", ["get", "lineCount"], 1], 5.5, 4],
        "circle-color": "#ffffff",
        "circle-stroke-color": "#333333",
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
        "text-color": "#1a1a1a",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.4,
      },
    });
  };

  if (map.isStyleLoaded()) {
    draw();
  } else {
    map.on("load", draw);
  }
}

/** Shows/hides line layers based on the given set of visible line ids (see the legend panel). */
export function setVisibleLines(map: maplibregl.Map, visibleLineIds: ReadonlySet<string>): void {
  const filter: maplibregl.FilterSpecification = ["in", ["get", "lineId"], ["literal", [...visibleLineIds]]];
  if (map.getLayer(LINE_LAYER_ID)) map.setFilter(LINE_LAYER_ID, filter);
  if (map.getLayer(LINE_CASING_LAYER_ID)) map.setFilter(LINE_CASING_LAYER_ID, filter);
}
