import maplibregl from "maplibre-gl";
import type { TrainPosition } from "./interpolate";

/** Delay threshold that excludes normal one-to-two-minute prediction jitter. */
const DELAYED_THRESHOLD_MIN = 3;

/** Lucide `TrainFront`, inlined so MapLibre markers stay plain DOM. */
const TRAIN_ICON_SVG = `<svg class="train-marker-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/>
  <path d="m9 15-1-1"/>
  <path d="m15 15 1-1"/>
  <path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/>
  <path d="m8 19-2 3"/>
  <path d="m16 19 2 3"/>
</svg>`;

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
      const isNew = !tracked;
      if (!tracked) {
        const el = document.createElement("div");
        el.className = "train-marker";
        el.dataset.key = key;
        el.innerHTML = `<span class="train-marker-badge">${TRAIN_ICON_SVG}</span>`;
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
      // unchanged. New markers still need a first paint of colour and title.
      const prev = tracked.position;
      const unchanged = prev.lon === pos.lon
        && prev.lat === pos.lat
        && prev.delayMin === pos.delayMin
        && prev.source === pos.source;
      tracked.position = pos;
      if (isNew || !unchanged) {
        const el = tracked.marker.getElement();
        const delayed = pos.delayMin >= DELAYED_THRESHOLD_MIN;
        // An interpolated marker is a guess between two timetabled calls, so it
        // says so rather than implying the same confidence as a real GPS fix.
        const provenance = pos.source === "gps" ? "live position" : "estimated position";
        el.title = delayed
          ? `To ${pos.destinationName} (+${pos.delayMin} min late, ${provenance})`
          : `To ${pos.destinationName} (${provenance})`;
        el.classList.toggle("train-marker--delayed", delayed);
        el.classList.toggle("train-marker--estimated", pos.source !== "gps");
        const color = this.lineColorById.get(pos.lineId) ?? "#c45c12";
        el.style.setProperty("--train-color", color);
        el.style.setProperty("--train-ink", inkOn(color));
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

/** Black ink on gold/cyan, paper ink on navy/red, so the SVG stays readable. */
function inkOn(hex: string): string {
  const raw = hex.replace("#", "");
  if (raw.length < 6) return "#f4f1ea";
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 150 ? "#111318" : "#f4f1ea";
}
