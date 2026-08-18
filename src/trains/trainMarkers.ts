import maplibregl from "maplibre-gl";
import type { TrainPosition } from "./interpolate";

/** Delay threshold that excludes normal one-to-two-minute prediction jitter. */
const DELAYED_THRESHOLD_MIN = 3;

interface TrackedMarker {
  marker: maplibregl.Marker;
  /** Current position read by the marker's persistent click handler. */
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
      // PTV does not document run_ref as globally unique. Include lineId to
      // prevent unrelated runs on different lines from sharing one marker.
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

        // Bind once and read the position object updated by each frame.
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this.onTrainClick?.(created.position);
        });
      }
      // Skip marker reprojection and style writes while position and delay are
      // unchanged.
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
