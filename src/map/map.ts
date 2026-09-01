import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { NetworkStaticData } from "../shared/types";

/**
 * CARTO serves raster tiles requested without a key under a repeated "API key
 * required" watermark, and does so with HTTP 200, so nothing surfaces as a tile
 * error. The key is inlined into the bundle by Vite and is public by design —
 * CARTO issues it against a nominated domain. It is left off entirely when
 * unset, so a build without one falls back to the watermark rather than
 * requesting `?key=undefined`.
 */
const TILE_KEY_PARAM = import.meta.env.VITE_CARTO_BASEMAP_KEY ? `?key=${import.meta.env.VITE_CARTO_BASEMAP_KEY}` : "";

/**
 * CARTO Positron / Dark Matter raster styles. The map remounts on theme
 * change so custom line and station layers are rebuilt rather than calling
 * `map.setStyle()`.
 */
function buildCartoStyle(variant: "light_all" | "dark_all"): StyleSpecification {
  const sourceId = `carto-${variant}`;
  return {
    version: 8,
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    sources: {
      [sourceId]: {
        type: "raster",
        tiles: ["a", "b", "c", "d"].map(
          (subdomain) => `https://${subdomain}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png${TILE_KEY_PARAM}`,
        ),
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [
      {
        id: `${sourceId}-tiles`,
        type: "raster",
        source: sourceId,
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  };
}

const POSITRON_STYLE = buildCartoStyle("light_all");
const DARK_MATTER_STYLE = buildCartoStyle("dark_all");
const STATION_PAINT_DARK = { circleFill: "#f4f1ea" };

const LINES_SOURCE_ID = "network-lines";
const STATIONS_SOURCE_ID = "network-stations";
const LINE_CONTEXT_LAYER_ID = "network-line-context";
const LINE_FOCUS_GLOW_LAYER_ID = "network-line-focus-glow";
const LINE_FOCUS_LAYER_ID = "network-line-focus";
const STATIONS_CIRCLE_LAYER_ID = "network-stations-circle";

const STATION_PAINT = { circleFill: "#1a1a1a" };

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

/** Creates the map. Dark UI uses CARTO Dark Matter so the map matches the night platform. */
export function createMap(
  container: HTMLElement,
  staticData: NetworkStaticData,
  theme: "light" | "dark" = "light",
): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: theme === "dark" ? DARK_MATTER_STYLE : POSITRON_STYLE,
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
 * Draws the network as a thin colour diagram, then optionally a single
 * focused line with a restrained glow. Shared inner-city corridors stay
 * readable because only the focus line blooms — the rest stay flat.
 */
export function addLineAndStations(
  map: maplibregl.Map,
  staticData: NetworkStaticData,
  theme: "light" | "dark" = "light",
  focusedLineIds: ReadonlySet<string> = new Set(),
): void {
  const draw = () => {
    drawLinesAndStations(map, staticData, theme);
    setFocusedLines(map, focusedLineIds);
  };
  if (map.isStyleLoaded()) draw();
  else map.on("load", draw);
}

function drawLinesAndStations(
  map: maplibregl.Map,
  staticData: NetworkStaticData,
  theme: "light" | "dark" = "light",
): void {
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
  const dark = theme === "dark";
  const rasterId = dark ? "carto-dark_all-tiles" : "carto-light_all-tiles";
  if (map.getLayer(rasterId)) {
    map.setPaintProperty(rasterId, "raster-opacity", dark ? 0.55 : 0.72);
    map.setPaintProperty(rasterId, "raster-saturation", dark ? -0.35 : -0.2);
  }

  map.addLayer({
    id: LINE_CONTEXT_LAYER_ID,
    type: "line",
    source: LINES_SOURCE_ID,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 1.6,
      "line-opacity": 1,
    },
  });
  map.addLayer({
    id: LINE_FOCUS_GLOW_LAYER_ID,
    type: "line",
    source: LINES_SOURCE_ID,
    layout: { "line-join": "round", "line-cap": "round", visibility: "none" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": dark ? 7 : 6,
      "line-opacity": dark ? 0.38 : 0.22,
      "line-blur": dark ? 3.5 : 2.5,
    },
  });
  map.addLayer({
    id: LINE_FOCUS_LAYER_ID,
    type: "line",
    source: LINES_SOURCE_ID,
    layout: { "line-join": "round", "line-cap": "round", visibility: "none" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 2.25,
      "line-opacity": 1,
    },
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
      "circle-radius": ["case", [">", ["get", "lineCount"], 1], 2.4, 1.8],
      "circle-color": theme === "dark" ? STATION_PAINT_DARK.circleFill : STATION_PAINT.circleFill,
      "circle-stroke-width": 0,
    },
  });
}

/**
 * Lights one commute line. Other routes stay as a flat diagram so shared
 * corridors do not bloom into a mash-up. An empty set lights nothing.
 */
export function setFocusedLines(map: maplibregl.Map, focusedLineIds: ReadonlySet<string>): void {
  const hasFocus = focusedLineIds.size > 0;
  const focusFilter: maplibregl.FilterSpecification = hasFocus
    ? ["in", ["get", "lineId"], ["literal", [...focusedLineIds]]]
    : ["==", ["get", "lineId"], ""];
  const contextFilter: maplibregl.FilterSpecification | null = hasFocus
    ? ["!", ["in", ["get", "lineId"], ["literal", [...focusedLineIds]]]]
    : null;

  if (map.getLayer(LINE_CONTEXT_LAYER_ID)) {
    map.setFilter(LINE_CONTEXT_LAYER_ID, contextFilter);
    map.setPaintProperty(LINE_CONTEXT_LAYER_ID, "line-opacity", hasFocus ? 0.16 : 1);
    map.setPaintProperty(LINE_CONTEXT_LAYER_ID, "line-width", hasFocus ? 1.25 : 1.6);
  }
  if (map.getLayer(LINE_FOCUS_GLOW_LAYER_ID)) {
    map.setFilter(LINE_FOCUS_GLOW_LAYER_ID, focusFilter);
    map.setLayoutProperty(LINE_FOCUS_GLOW_LAYER_ID, "visibility", hasFocus ? "visible" : "none");
  }
  if (map.getLayer(LINE_FOCUS_LAYER_ID)) {
    map.setFilter(LINE_FOCUS_LAYER_ID, focusFilter);
    map.setLayoutProperty(LINE_FOCUS_LAYER_ID, "visibility", hasFocus ? "visible" : "none");
  }
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
