import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { LiveRun, NetworkStaticData, StationStatic } from "../shared/types";
import type { Theme } from "../hooks/useTheme";
import { addLineAndStations, createMap, queryStationIdAt, setMapTheme, setVisibleLines, setupStationHoverCursor } from "../map/map";
import { startAnimationLoop } from "../trains/animate";
import { buildInterpolationContext, computeTrainPositions, type TrainPosition } from "../trains/interpolate";
import { TrainMarkerLayer } from "../trains/trainMarkers";
import { RUN_SHOW_BEFORE_FIRST_STOP_MS, RUN_STALE_AFTER_MS } from "../config";

export interface MapViewHandle {
  flyToStation(station: StationStatic): void;
}

interface MapViewProps {
  staticData: NetworkStaticData;
  stationsById: Map<string, StationStatic>;
  lineColorById: Map<string, string>;
  runs: LiveRun[];
  visibleLineIds: Set<string>;
  theme: Theme;
  onStationSelect: (stationId: string) => void;
  onTrainSelect: (pos: TrainPosition) => void;
  onBackgroundClick: () => void;
}

/**
 * Thin React wrapper around the (framework-agnostic) MapLibre setup + train
 * interpolation/animation logic ported from the original vanilla app. The
 * MapLibre instance and its per-frame marker updates are managed entirely
 * imperatively inside refs/effects — none of that goes through React state,
 * since re-rendering the whole component tree at animation-frame rate would
 * be wasteful (and pointless, since MapLibre already owns its own canvas).
 */
export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { staticData, stationsById, lineColorById, runs, visibleLineIds, theme, onStationSelect, onTrainSelect, onBackgroundClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerLayerRef = useRef<TrainMarkerLayer | null>(null);
  const runsRef = useRef<LiveRun[]>(runs);
  const visibleLineIdsRef = useRef<Set<string>>(visibleLineIds);
  const themeRef = useRef<Theme>(theme);
  // Tracks whichever theme the *current* map instance's basemap actually
  // reflects, so the effect below can tell "theme prop changed since the map
  // was created/last swapped" apart from "component re-rendered for some
  // unrelated reason" — set once at map-creation time (not just on the very
  // first render), so it's re-derived correctly if the mount effect ever
  // re-runs (e.g. React StrictMode's dev-only double-invoke), unlike a
  // one-shot "is this the first render" flag which can't tell those cases
  // apart and previously caused a spurious extra basemap swap right after a
  // StrictMode-triggered remount.
  const appliedThemeRef = useRef<Theme | null>(null);

  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  useEffect(() => {
    visibleLineIdsRef.current = visibleLineIds;
    if (mapRef.current) setVisibleLines(mapRef.current, visibleLineIds);
  }, [visibleLineIds]);

  // Mount once: create the map, draw the network, wire up click/hover handling
  // and the shared train-position animation loop. staticData/callbacks are
  // treated as stable for the component's lifetime (App only creates them
  // once staticData has loaded, and passes stable callback identities).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = createMap(container, staticData, themeRef.current);
    mapRef.current = map;
    appliedThemeRef.current = themeRef.current;
    addLineAndStations(map, staticData, themeRef.current);
    setupStationHoverCursor(map);

    const interpolationContext = buildInterpolationContext(staticData);
    const markerLayer = new TrainMarkerLayer(map, lineColorById, (pos) => onTrainSelect(pos));
    markerLayerRef.current = markerLayer;

    map.on("click", (e) => {
      const stationId = queryStationIdAt(map, e.point);
      if (stationId) onStationSelect(stationId);
      else onBackgroundClick();
    });

    const stopAnimation = startAnimationLoop((now) => {
      const positions = computeTrainPositions(runsRef.current, stationsById, interpolationContext, now, {
        staleAfterMs: RUN_STALE_AFTER_MS,
        showBeforeFirstStopMs: RUN_SHOW_BEFORE_FIRST_STOP_MS,
      });
      const visiblePositions = positions.filter((p) => visibleLineIdsRef.current.has(p.lineId));
      markerLayer.update(visiblePositions);
    });

    return () => {
      stopAnimation();
      markerLayer.removeAll();
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticData]);

  // Basemap swap: only when `theme` has actually changed from whatever the
  // current map instance was created/last swapped to (see appliedThemeRef
  // above) — not on every render/effect re-run.
  useEffect(() => {
    themeRef.current = theme;
    if (!mapRef.current || appliedThemeRef.current === theme) return;
    appliedThemeRef.current = theme;
    setMapTheme(mapRef.current, theme, staticData, visibleLineIdsRef.current);
  }, [theme, staticData]);

  useImperativeHandle(
    ref,
    () => ({
      flyToStation(station) {
        const map = mapRef.current;
        if (!map) return;
        map.flyTo({ center: [station.lon, station.lat], zoom: Math.max(map.getZoom(), 12), essential: true });
      },
    }),
    [],
  );

  return <div ref={containerRef} className="absolute inset-0" />;
});
