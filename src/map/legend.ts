export interface LegendLine {
  id: string;
  name: string;
  color: string;
}

const VISIBLE_LINES_STORAGE_KEY = "wimt:visibleLineIds";
const COLLAPSED_STORAGE_KEY = "wimt:legendCollapsed";

/** Only the Lilydale line is shown by default for a first-ever visitor (no stored preference yet). */
const DEFAULT_VISIBLE_LINE_IDS = ["lilydale"];

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
  return new Set(DEFAULT_VISIBLE_LINE_IDS.filter((id) => allLineIds.includes(id)));
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

/**
 * Renders a collapsible show/hide checkbox legend for every line into
 * `container`, calling `onChange` with the current set of visible line ids
 * whenever it changes — including once synchronously during setup, so the
 * caller's initial state matches whatever was restored from `localStorage`
 * (or the Lilydale-only default on a first-ever visit).
 *
 * Both the line-visibility selection and the panel's collapsed/expanded state
 * are persisted to `localStorage` so a returning visitor sees their last
 * configuration instead of resetting every time.
 */
export function createLegend(
  container: HTMLElement,
  lines: LegendLine[],
  onChange: (visibleLineIds: ReadonlySet<string>) => void,
): void {
  const allLineIds = lines.map((l) => l.id);
  const visible = loadVisibleLineIds(allLineIds);
  const checkboxes = new Map<string, HTMLInputElement>();

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

    item.append(checkbox, swatch, label);
    list.appendChild(item);
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
}
