export interface LegendLine {
  id: string;
  name: string;
  color: string;
}

/**
 * Renders a simple show/hide checkbox legend for every line into `container`,
 * calling `onChange` with the current set of visible line ids whenever the
 * user toggles one (or uses "All"/"None"). Starts with every line visible.
 */
export function createLegend(
  container: HTMLElement,
  lines: LegendLine[],
  onChange: (visibleLineIds: ReadonlySet<string>) => void,
): void {
  const visible = new Set(lines.map((l) => l.id));
  const checkboxes = new Map<string, HTMLInputElement>();

  container.innerHTML = "";

  const actions = document.createElement("div");
  actions.className = "legend-actions";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.textContent = "All";
  const noneBtn = document.createElement("button");
  noneBtn.type = "button";
  noneBtn.textContent = "None";
  actions.append(allBtn, noneBtn);
  container.appendChild(actions);

  const list = document.createElement("div");
  list.className = "legend-list";
  container.appendChild(list);

  for (const line of lines) {
    const item = document.createElement("label");
    item.className = "legend-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) visible.add(line.id);
      else visible.delete(line.id);
      onChange(visible);
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
    onChange(visible);
  });
  noneBtn.addEventListener("click", () => {
    visible.clear();
    for (const checkbox of checkboxes.values()) checkbox.checked = false;
    onChange(visible);
  });
}
