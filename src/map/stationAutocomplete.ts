import type { StationStatic } from "../shared/types";

export interface StationAutocompleteController {
  /** Clears the input text and closes the results dropdown, without firing onSelect. */
  clear(): void;
  /** Sets the input's displayed text (e.g. to reflect a selection made another way) without opening the dropdown. */
  setValue(text: string): void;
}

const MAX_RESULTS = 8;

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
 * Renders a text input with a filtered dropdown of station name matches into
 * `container`. Reused for both the always-visible quick-jump search box and
 * the trip planner's "From"/"To" pickers, rather than building three separate
 * ad hoc inputs — behaviour (substring match, keyboard nav, click-to-select)
 * is identical between them; only styling context and what `onSelect` does
 * with the chosen station differs.
 */
export function createStationAutocomplete(
  container: HTMLElement,
  stations: readonly StationStatic[],
  options: { placeholder: string; onSelect: (station: StationStatic) => void },
): StationAutocompleteController {
  container.className = "station-autocomplete";
  container.innerHTML = `
    <input type="text" class="station-autocomplete-input" placeholder="${escapeHtml(options.placeholder)}" autocomplete="off" spellcheck="false" />
    <div class="station-autocomplete-results"></div>
  `;

  const input = container.querySelector<HTMLInputElement>(".station-autocomplete-input")!;
  const resultsEl = container.querySelector<HTMLDivElement>(".station-autocomplete-results")!;

  let matches: StationStatic[] = [];
  let highlightedIndex = -1;

  function closeResults(): void {
    resultsEl.classList.remove("open");
    resultsEl.innerHTML = "";
    matches = [];
    highlightedIndex = -1;
  }

  function renderResults(): void {
    if (matches.length === 0) {
      closeResults();
      return;
    }
    resultsEl.innerHTML = matches
      .map(
        (s, i) =>
          `<button type="button" class="station-autocomplete-item${i === highlightedIndex ? " station-autocomplete-item--active" : ""}" data-index="${i}">${escapeHtml(s.name)}</button>`,
      )
      .join("");
    resultsEl.classList.add("open");
  }

  function selectStation(station: StationStatic): void {
    input.value = station.name;
    closeResults();
    options.onSelect(station);
  }

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    if (query.length === 0) {
      closeResults();
      return;
    }
    matches = stations.filter((s) => s.name.toLowerCase().includes(query)).slice(0, MAX_RESULTS);
    highlightedIndex = matches.length > 0 ? 0 : -1;
    renderResults();
  });

  input.addEventListener("keydown", (e) => {
    if (matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = (highlightedIndex + 1) % matches.length;
      renderResults();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = (highlightedIndex - 1 + matches.length) % matches.length;
      renderResults();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const station = matches[highlightedIndex] ?? matches[0];
      if (station) selectStation(station);
    } else if (e.key === "Escape") {
      closeResults();
    }
  });

  resultsEl.addEventListener("mousedown", (e) => {
    // mousedown (not click) so this fires before the input's blur handler below removes the dropdown.
    const target = (e.target as HTMLElement).closest<HTMLElement>(".station-autocomplete-item");
    if (!target) return;
    e.preventDefault();
    const index = Number(target.dataset.index);
    const station = matches[index];
    if (station) selectStation(station);
  });

  input.addEventListener("blur", () => {
    // Small delay so a click on a result (mousedown -> blur -> click) isn't cut off mid-selection.
    setTimeout(closeResults, 150);
  });

  return {
    clear() {
      input.value = "";
      closeResults();
    },
    setValue(text) {
      input.value = text;
      closeResults();
    },
  };
}
