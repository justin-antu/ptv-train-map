import type { LineDisruption } from "../shared/types";

export interface LegendLine {
  id: string;
  name: string;
  color: string;
}

export interface LegendController {
  /** Programmatically force a specific set of lines visible (e.g. from a search result pick), syncing checkboxes + storage + onChange. */
  setVisible(lineIds: Iterable<string>): void;
  /** Updates the per-line disruption indicator/detail text; call whenever a fresh live snapshot is polled. */
  setDisruptions(disruptionsByLine: Record<string, LineDisruption[]>): void;
}

const VISIBLE_LINES_STORAGE_KEY = "wimt:visibleLineIds";
const COLLAPSED_STORAGE_KEY = "wimt:legendCollapsed";

function loadVisibleLineIds(allLineIds: readonly string[]): Set<string> {
  try {
    const raw = localStorage.getItem(VISIBLE_LINES_STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Filter against the current line list so a stale/renamed id from an
        // older version of the app can't leave a permanently-invisible entry.
        return new Set(parsed.filter((id): id is string => typeof id === "string" && allLineIds.includes(id)));
      }
    }
  } catch {
    // Malformed/inaccessible storage (corrupted JSON, private-browsing quota, etc.) — fall through to default.
  }
  // No stored preference yet (first-ever visit, or cleared storage): default to every line visible.
  return new Set(allLineIds);
}

function saveVisibleLineIds(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(VISIBLE_LINES_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore write failures (e.g. storage disabled/full) — visibility still works for this session.
  }
}

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Ignore write failures.
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/**
 * Renders a collapsible show/hide checkbox legend for every line into
 * `container`, calling `onChange` with the current set of visible line ids
 * whenever it changes — including once synchronously during setup, so the
 * caller's initial state matches whatever was restored from `localStorage`
 * (or the all-lines-visible default on a first-ever visit).
 *
 * Both the line-visibility selection and the panel's collapsed/expanded state
 * are persisted to `localStorage` so a returning visitor sees their last
 * configuration instead of resetting every time. A first-ever visitor (no
 * stored preference yet) sees every line visible by default.
 *
 * Each line row can also show a small disruption warning indicator (see
 * `setDisruptions` on the returned controller) — clicking it expands an
 * inline detail row with the disruption title(s) and a link, rather than
 * opening a whole separate popup/panel.
 */
export function createLegend(
  container: HTMLElement,
  lines: LegendLine[],
  onChange: (visibleLineIds: ReadonlySet<string>) => void,
): LegendController {
  const allLineIds = lines.map((l) => l.id);
  const visible = loadVisibleLineIds(allLineIds);
  const checkboxes = new Map<string, HTMLInputElement>();
  const alertButtons = new Map<string, HTMLButtonElement>();
  const alertDetails = new Map<string, HTMLDivElement>();

  container.innerHTML = "";
  container.classList.toggle("legend-collapsed", loadCollapsed());

  const header = document.createElement("button");
  header.type = "button";
  header.className = "legend-header";
  header.setAttribute("aria-expanded", String(!container.classList.contains("legend-collapsed")));
  header.innerHTML = `<span class="legend-title">Lines</span><span class="legend-chevron">&#9662;</span>`;
  container.appendChild(header);

  const body = document.createElement("div");
  body.className = "legend-body";
  container.appendChild(body);

  header.addEventListener("click", () => {
    const collapsed = container.classList.toggle("legend-collapsed");
    header.setAttribute("aria-expanded", String(!collapsed));
    saveCollapsed(collapsed);
  });

  const actions = document.createElement("div");
  actions.className = "legend-actions";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.textContent = "All";
  const noneBtn = document.createElement("button");
  noneBtn.type = "button";
  noneBtn.textContent = "None";
  actions.append(allBtn, noneBtn);
  body.appendChild(actions);

  const list = document.createElement("div");
  list.className = "legend-list";
  body.appendChild(list);

  const emit = () => {
    saveVisibleLineIds(visible);
    onChange(visible);
  };

  for (const line of lines) {
    // Each line gets one grid cell (`.legend-row`) containing the checkbox row
    // plus an initially-hidden detail block — keeping both inside a single grid
    // item is what lets the disruption detail expand without disturbing the
    // 2-column grid's placement of every other line's row.
    const row = document.createElement("div");
    row.className = "legend-row";

    const item = document.createElement("label");
    item.className = "legend-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = visible.has(line.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) visible.add(line.id);
      else visible.delete(line.id);
      emit();
    });
    checkboxes.set(line.id, checkbox);

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = line.color;

    const label = document.createElement("span");
    label.className = "legend-name";
    label.textContent = line.name;

    const alertBtn = document.createElement("button");
    alertBtn.type = "button";
    alertBtn.className = "legend-alert";
    alertBtn.textContent = "\u26A0";
    alertBtn.style.display = "none";
    alertButtons.set(line.id, alertBtn);

    item.append(checkbox, swatch, label, alertBtn);
    row.appendChild(item);

    const detail = document.createElement("div");
    detail.className = "legend-alert-detail";
    detail.style.display = "none";
    alertDetails.set(line.id, detail);
    row.appendChild(detail);

    alertBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = detail.style.display !== "none";
      detail.style.display = isOpen ? "none" : "block";
    });

    list.appendChild(row);
  }

  allBtn.addEventListener("click", () => {
    for (const line of lines) visible.add(line.id);
    for (const checkbox of checkboxes.values()) checkbox.checked = true;
    emit();
  });
  noneBtn.addEventListener("click", () => {
    visible.clear();
    for (const checkbox of checkboxes.values()) checkbox.checked = false;
    emit();
  });

  // Sync the caller's initial state (e.g. main.ts's train-position filter) with
  // whatever we just restored/defaulted to, without waiting for user interaction.
  onChange(visible);

  return {
    setVisible(lineIds) {
      const wanted = new Set(lineIds);
      let changed = false;
      for (const id of wanted) {
        if (!visible.has(id)) {
          visible.add(id);
          changed = true;
        }
      }
      if (!changed) return;
      for (const [id, checkbox] of checkboxes) checkbox.checked = visible.has(id);
      emit();
    },

    setDisruptions(disruptionsByLine) {
      for (const line of lines) {
        const disruptions = disruptionsByLine[line.id] ?? [];
        const alertBtn = alertButtons.get(line.id);
        const detail = alertDetails.get(line.id);
        if (!alertBtn || !detail) continue;

        if (disruptions.length === 0) {
          alertBtn.style.display = "none";
          detail.style.display = "none";
          detail.innerHTML = "";
          continue;
        }

        alertBtn.style.display = "inline-flex";
        alertBtn.title = `${disruptions.length} current disruption${disruptions.length === 1 ? "" : "s"} on the ${line.name} line`;
        detail.innerHTML = disruptions
          .map(
            (d) => `
              <div class="legend-alert-item">
                <div class="legend-alert-title">${escapeHtml(d.title)}</div>
                ${d.url ? `<a class="legend-alert-link" href="${escapeHtml(d.url)}" target="_blank" rel="noopener noreferrer">More info</a>` : ""}
              </div>`,
          )
          .join("");
      }
    },
  };
}
