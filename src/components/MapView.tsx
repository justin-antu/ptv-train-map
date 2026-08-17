import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { LiveRun, NetworkStaticData, StationStatic } from "../shared/types";
import { addLineAndStations, createMap, queryStationIdAt, setVisibleLines, setupStationHoverCursor } from "../map/map";
import { startAnimationLoop } from "../trains/animate";
import { buildInterpolationContext, computeTrainPositions, type TrainPosition } from "../trains/interpolate";
import { TrainMarkerLayer } from "../trains/trainMarkers";
import { RUN_SHOW_BEFORE_FIRST_STOP_MS, RUN_STALE_AFTER_MS, TRAIN_UPDATE_INTERVAL_MS } from "../config";

export interface MapViewHandle {
  flyToStation(station: StationStatic): void;
}

interface MapViewProps {
  staticData: NetworkStaticData;
  stationsById: Map<string, StationStatic>;
  lineColorById: Map<string, string>;
  runs: LiveRun[];
  visibleLineIds: Set<string>;
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
 *
 * Wrapped in `memo` so that App-level re-renders unrelated to this
 * component's own props (e.g. a countdown ticking somewhere else in the
 * tree) never cause it to re-render, let alone reinitialize the map.
 */
export const MapView = memo(
  forwardRef<MapViewHandle, MapViewProps>(function MapView(
    { staticData, stationsById, lineColorById, runs, visibleLineIds, onStationSelect, onTrainSelect, onBackgroundClick },
    ref,
  ) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerLayerRef = useRef<TrainMarkerLayer | null>(null);
  const runsRef = useRef<LiveRun[]>(runs);
  const visibleLineIdsRef = useRef<Set<string>>(visibleLineIds);

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

    const map = createMap(container, staticData);
    mapRef.current = map;
    addLineAndStations(map, staticData);
    setupStationHoverCursor(map);

    const interpolationContext = buildInterpolationContext(staticData);
    const markerLayer = new TrainMarkerLayer(map, lineColorById, (pos) => onTrainSelect(pos));
    markerLayerRef.current = markerLayer;

    map.on("click", (e) => {
      const stationId = queryStationIdAt(map, e.point);
      if (stationId) onStationSelect(stationId);
      else onBackgroundClick();
    });

    // Trains move slowly relative to a city-scale map, so recomputing
    // positions/moving markers faster than ~10x/sec is wasted work that's
    // visually indistinguishable from smooth motion — but scanning every
    // known run (which can be in the hundreds, most not currently "in
    // progress") and writing to every visible marker's DOM element is real,
    // measurable CPU cost at 60fps. `requestAnimationFrame` is still used
    // for scheduling (so this loop is correctly paused by the browser when
    // the tab is backgrounded), but the actual work is throttled.
    let lastUpdateMs = 0;
    const stopAnimation = startAnimationLoop((now) => {
      if (now - lastUpdateMs < TRAIN_UPDATE_INTERVAL_MS) return;
      lastUpdateMs = now;
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
  }),
);
MapView.displayName = "MapView";
