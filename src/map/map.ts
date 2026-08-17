import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { NetworkStaticData } from "../shared/types";

/**
 * Keyless raster basemap using CARTO's free "Positron" tiles, plus a free
 * public glyphs CDN (openmaptiles.org) so that MapLibre symbol/text layers
 * (station name labels) can render without needing any API key or account —
 * matches the "static site, no accounts required" constraint.
 *
 * We deliberately use Positron (a light-grey, minimal "good for point data"
 * style, built on the same OpenStreetMap data as the previous standard-OSM
 * tiles) rather than a busier full-colour basemap: with 16 coloured train
 * lines and 90+ animated markers on screen at once, a visually loud basemap
 * (saturated land-use colours, dense POI icons, thick roads) competes with
 * and drowns out the data we actually want to be the visual focus. Positron's
 * muted roads/labels and near-white background let the line colours and
 * train markers read clearly at a glance.
 */
const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    "carto-positron": {
      type: "raster",
      // CARTO round-robins requests across these 4 keyless subdomains.
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "carto-positron-tiles",
      type: "raster",
      source: "carto-positron",
      minzoom: 0,
      maxzoom: 20,
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
    // This is a single-city map that never needs to pan across the antimeridian,
    // so we don't need MapLibre to render/track multiple wrapped copies of the
    // world. This also sidesteps a real bug we hit: Marker's internal position
    // update logic, when renderWorldCopies is on (the default), re-picks the
    // "closest" world-copy of a marker's longitude by comparing against that
    // marker's *previous* projected screen position — for our custom train
    // markers (whose geographic position can jump by a non-trivial screen
    // distance between updates, e.g. a fast interpolation step or a marker's
    // very first placement), this occasionally chose the wrong copy and left
    // the marker rendered many kilometres from its real (correct) position,
    // even though marker.getLngLat() and our own position data were always
    // correct — a purely visual MapLibre-side symptom, not a bug in our own
    // position math.
    renderWorldCopies: false,
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
