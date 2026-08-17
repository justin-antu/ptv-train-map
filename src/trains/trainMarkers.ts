import maplibregl from "maplibre-gl";
import type { TrainPosition } from "./interpolate";

/** Minutes late before a train is visually flagged as delayed — small (1-2 min) prediction jitter is normal and not worth flagging. */
const DELAYED_THRESHOLD_MIN = 3;

interface TrackedMarker {
  marker: maplibregl.Marker;
  /** Kept in sync every update() so the click handler (bound once, at creation) always reports the current position. */
  position: TrainPosition;
}

/** Manages one MapLibre Marker per active train run, adding/moving/removing as needed each frame. */
export class TrainMarkerLayer {
  private readonly markers = new Map<string, TrackedMarker>();

  constructor(
    private readonly map: maplibregl.Map,
    private readonly lineColorById: Map<string, string>,
    private readonly onTrainClick?: (position: TrainPosition) => void,
  ) {}

  update(positions: TrainPosition[]): void {
    const seen = new Set<string>();

    for (const pos of positions) {
      // Keyed by lineId+runRef, not runRef alone: PTV's run_ref values are not
      // documented as globally unique across different routes/lines, so two
      // unrelated trains on different lines could in principle share the same
      // run_ref. Keying by runRef alone would then make them alias to a single
      // marker that flickers between both lines' (unrelated) positions.
      const key = `${pos.lineId}:${pos.runRef}`;
      seen.add(key);
      let tracked = this.markers.get(key);
      if (!tracked) {
        const el = document.createElement("div");
        el.className = "train-marker";
        el.dataset.key = key;
        el.innerHTML = `<span class="train-marker-dot"></span><span class="train-marker-icon">🚆</span>`;
        const marker = new maplibregl.Marker({ element: el, anchor: "center" });
        marker.setLngLat([pos.lon, pos.lat]);
        marker.addTo(this.map);
        const created: TrackedMarker = { marker, position: pos };
        this.markers.set(key, created);
        tracked = created;

        // Bound once per marker element (not per update()): reads `created.position`
        // at click time, which update() below keeps current every frame, so this
        // always reports wherever the train actually is *now*, not where it was
        // when the listener was attached.
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this.onTrainClick?.(created.position);
        });
      }
      // Skip DOM/MapLibre writes entirely when nothing actually changed since
      // the last update — a train "waiting at platform" or "just arrived"
      // reports the exact same lon/lat/delay every tick, so without this
      // check we'd still force a MapLibre marker reprojection + style write
      // on every element every ~100ms even while visually motionless.
      const prev = tracked.position;
      const unchanged = prev.lon === pos.lon && prev.lat === pos.lat && prev.delayMin === pos.delayMin;
      tracked.position = pos;
      if (!unchanged) {
        const el = tracked.marker.getElement();
        const delayed = pos.delayMin >= DELAYED_THRESHOLD_MIN;
        el.title = delayed ? `To ${pos.destinationName} (+${pos.delayMin} min late)` : `To ${pos.destinationName}`;
        el.classList.toggle("train-marker--delayed", delayed);
        const dot = el.querySelector<HTMLElement>(".train-marker-dot");
        if (dot) dot.style.background = this.lineColorById.get(pos.lineId) ?? "#333";
        tracked.marker.setLngLat([pos.lon, pos.lat]);
      }
    }

    for (const [key, tracked] of this.markers) {
      if (!seen.has(key)) {
        tracked.marker.remove();
        this.markers.delete(key);
      }
    }
  }

  removeAll(): void {
    for (const tracked of this.markers.values()) tracked.marker.remove();
    this.markers.clear();
  }
}
