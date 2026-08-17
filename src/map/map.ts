import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { LINE_COLOR } from "../config";
import type { StaticLineData } from "../shared/types";

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

const LINE_SOURCE_ID = "lilydale-line";
const STATIONS_SOURCE_ID = "lilydale-stations";

function computeBounds(polyline: [number, number][]): maplibregl.LngLatBoundsLike {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of polyline) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

export function createMap(container: HTMLElement, staticData: StaticLineData): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: BASEMAP_STYLE,
    bounds: computeBounds(staticData.polyline),
    fitBoundsOptions: { padding: 48 },
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  return map;
}

/** Draws the route line and station markers once the map style has loaded. Idempotent per map instance. */
export function addLineAndStations(map: maplibregl.Map, staticData: StaticLineData): void {
  const draw = () => {
    if (map.getSource(LINE_SOURCE_ID)) return; // already drawn (e.g. re-entrant "load" handling)

    map.addSource(LINE_SOURCE_ID, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: staticData.polyline },
      },
    });
    map.addLayer({
      id: "lilydale-line-casing",
      type: "line",
      source: LINE_SOURCE_ID,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
    });
    map.addLayer({
      id: "lilydale-line",
      type: "line",
      source: LINE_SOURCE_ID,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": LINE_COLOR, "line-width": 4 },
    });

    map.addSource(STATIONS_SOURCE_ID, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: staticData.stations.map((station) => ({
          type: "Feature",
          properties: { name: station.name, id: station.id },
          geometry: { type: "Point", coordinates: [station.lon, station.lat] },
        })),
      },
    });
    map.addLayer({
      id: "lilydale-stations-circle",
      type: "circle",
      source: STATIONS_SOURCE_ID,
      paint: {
        "circle-radius": 5,
        "circle-color": "#ffffff",
        "circle-stroke-color": LINE_COLOR,
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "lilydale-stations-label",
      type: "symbol",
      source: STATIONS_SOURCE_ID,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-font": ["Noto Sans Regular"],
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
