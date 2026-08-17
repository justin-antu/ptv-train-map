import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { NetworkStaticData } from "../shared/types";

export type MapTheme = "light" | "dark";

/** Builds a keyless CARTO raster basemap style for the given palette ("light_all" = Positron, "dark_all" = Dark Matter). */
function buildCartoStyle(variant: "light_all" | "dark_all"): StyleSpecification {
  const sourceId = `carto-${variant}`;
  return {
    version: 8,
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    sources: {
      [sourceId]: {
        type: "raster",
        // CARTO round-robins requests across these 4 keyless subdomains.
        tiles: [
          `https://a.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
          `https://b.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
          `https://c.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
          `https://d.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
        ],
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [
      {
        id: `carto-${variant}-tiles`,
        type: "raster",
        source: sourceId,
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  };
}

/**
 * Keyless raster basemaps using CARTO's free "Positron" (light) and "Dark
 * Matter" (dark) tiles, plus a free public glyphs CDN (openmaptiles.org) so
 * that MapLibre symbol/text layers (station name labels) can render without
 * needing any API key or account — matches the "static site, no accounts
 * required" constraint.
 *
 * We deliberately use these muted, minimal "good for point data" styles
 * (built on the same OpenStreetMap data as a standard OSM basemap) rather
 * than a busier full-colour basemap: with 16 coloured train lines and 90+
 * animated markers on screen at once, a visually loud basemap (saturated
 * land-use colours, dense POI icons, thick roads) competes with and drowns
 * out the data we actually want to be the visual focus. Their muted
 * roads/labels and near-white/near-black backgrounds let the line colours
 * and train markers read clearly at a glance in both light and dark mode.
 */
const BASEMAP_STYLES: Record<MapTheme, StyleSpecification> = {
  light: buildCartoStyle("light_all"),
  dark: buildCartoStyle("dark_all"),
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

export function createMap(container: HTMLElement, staticData: NetworkStaticData, theme: MapTheme = "light"): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: BASEMAP_STYLES[theme],
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

/** Station dot/label colours per basemap theme — chosen for contrast against each basemap's background. */
const STATION_PAINT_BY_THEME: Record<MapTheme, { circleFill: string; circleStroke: string; lineCasing: string; textColor: string; textHalo: string }> = {
  light: { circleFill: "#ffffff", circleStroke: "#333333", lineCasing: "#ffffff", textColor: "#1a1a1a", textHalo: "#ffffff" },
  dark: { circleFill: "#1c2333", circleStroke: "#e5e9f5", lineCasing: "#0b0f1a", textColor: "#e8ecf7", textHalo: "#0b0f1a" },
};

/**
 * Draws every in-scope line's route + a single deduplicated set of station
 * markers, once the map style has loaded. Idempotent per map instance (and
 * safe to call again after a basemap style swap, since `setStyle` clears any
 * custom sources/layers along with the previous basemap's own ones).
 *
 * v1 simplification: shared corridors (e.g. the City Loop approaches, or the
 * Metro Tunnel trunk shared by Sunbury/Cranbourne/Pakenham) are rendered as
 * multiple overlapping colour-coded lines rather than a single cartographically
 * "merged" line — acceptable for a fun infographic-style map, not aiming for
 * pixel-perfect PTV map styling.
 */
export function addLineAndStations(map: maplibregl.Map, staticData: NetworkStaticData, theme: MapTheme = "light"): void {
  const palette = STATION_PAINT_BY_THEME[theme];

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
      paint: { "line-color": palette.lineCasing, "line-width": 6, "line-opacity": 0.85 },
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
        "circle-color": palette.circleFill,
        "circle-stroke-color": palette.circleStroke,
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
        "text-color": palette.textColor,
        "text-halo-color": palette.textHalo,
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

/**
 * Swaps the basemap tile style (light Positron <-> dark Dark Matter) and
 * redraws the line/station layers on top of it in the matching palette.
 * `setStyle` throws away every custom source/layer along with the previous
 * basemap, so this always fully redraws rather than trying to patch
 * individual paint properties — simpler and equally cheap for this data size.
 */
export function setMapTheme(
  map: maplibregl.Map,
  theme: MapTheme,
  staticData: NetworkStaticData,
  visibleLineIds: ReadonlySet<string>,
): void {
  map.setStyle(BASEMAP_STYLES[theme]);
  map.once("style.load", () => {
    addLineAndStations(map, staticData, theme);
    setVisibleLines(map, visibleLineIds);
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
