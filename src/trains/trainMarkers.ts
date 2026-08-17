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
      seen.add(pos.runRef);
      let marker = this.markers.get(pos.runRef);
      if (!marker) {
        const el = document.createElement("div");
        el.className = "train-marker";
        el.innerHTML = `<span class="train-marker-dot"></span><span class="train-marker-icon">🚆</span>`;
        marker = new maplibregl.Marker({ element: el, anchor: "center" });
        marker.setLngLat([pos.lon, pos.lat]);
        marker.addTo(this.map);
        this.markers.set(pos.runRef, marker);
      }
      const el = marker.getElement();
      el.title = `To ${pos.destinationName}`;
      const dot = el.querySelector<HTMLElement>(".train-marker-dot");
      if (dot) dot.style.background = this.lineColorById.get(pos.lineId) ?? "#333";
      marker.setLngLat([pos.lon, pos.lat]);
    }

    for (const [runRef, marker] of this.markers) {
      if (!seen.has(runRef)) {
        marker.remove();
        this.markers.delete(runRef);
      }
    }
  }

  removeAll(): void {
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
  }
}
