import { memo, useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
// Imported here rather than in main.tsx so the stylesheet travels with the
// lazily-loaded map chunk instead of blocking the first paint of every visit.
import "maplibre-gl/dist/maplibre-gl.css";
import type { LiveRun, NetworkStaticData, StationStatic } from "../shared/types";
import { addLineAndStations, createMap, queryStationIdAt, setVisibleLines, setupStationHoverCursor } from "../map/map";
import { startAnimationLoop } from "../trains/animate";
import { buildInterpolationContext, computeTrainPositions, type TrainPosition } from "../trains/interpolate";
import { TrainMarkerLayer } from "../trains/trainMarkers";
import { RUN_SHOW_BEFORE_FIRST_STOP_MS, RUN_STALE_AFTER_MS, TRAIN_UPDATE_INTERVAL_MS } from "../config";

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
 * React wrapper around MapLibre and train interpolation. Refs and effects own
 * the map instance and marker updates to avoid animation-rate React renders.
 *
 * `memo` prevents unrelated application updates from re-rendering the wrapper.
 */
export const MapView = memo(function MapView({
  staticData,
  stationsById,
  lineColorById,
  runs,
  visibleLineIds,
  onStationSelect,
  onTrainSelect,
  onBackgroundClick,
}: MapViewProps) {
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

  // Mount once with static data and stable callback identities.
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

  return <div ref={containerRef} className="absolute inset-0" />;
});
