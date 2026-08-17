import maplibregl from "maplibre-gl";
import type { TrainPosition } from "./interpolate";

/** Manages one MapLibre Marker per active train run, adding/moving/removing as needed each frame. */
export class TrainMarkerLayer {
  private readonly markers = new Map<string, maplibregl.Marker>();

  constructor(
    private readonly map: maplibregl.Map,
    private readonly lineColorById: Map<string, string>,
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
      let marker = this.markers.get(key);
      if (!marker) {
        const el = document.createElement("div");
        el.className = "train-marker";
        el.dataset.key = key;
        el.innerHTML = `<span class="train-marker-dot"></span><span class="train-marker-icon">🚆</span>`;
        marker = new maplibregl.Marker({ element: el, anchor: "center" });
        marker.setLngLat([pos.lon, pos.lat]);
        marker.addTo(this.map);
        this.markers.set(key, marker);
      }
      const el = marker.getElement();
      el.title = `To ${pos.destinationName}`;
      const dot = el.querySelector<HTMLElement>(".train-marker-dot");
      if (dot) dot.style.background = this.lineColorById.get(pos.lineId) ?? "#333";
      marker.setLngLat([pos.lon, pos.lat]);
    }

    for (const [key, marker] of this.markers) {
      if (!seen.has(key)) {
        marker.remove();
        this.markers.delete(key);
      }
    }
  }

  removeAll(): void {
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
  }
}
