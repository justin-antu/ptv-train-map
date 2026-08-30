import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "../lib/utils";
import type { StationStatic } from "../shared/types";

/** Keeps the list short enough to stay scannable on a phone. */
const MAX_RESULTS = 40;

interface StationComboboxProps {
  id?: string;
  stations: StationStatic[];
  value: string | null;
  onChange: (stationId: string | null) => void;
  placeholder?: string;
}

/**
 * Type-to-filter station picker. The app has no global search bar, so this is
 * how a commuter finds one of the ~220 Metro stations by name.
 *
 * The result list is rendered inline rather than in a popover. A portalled
 * popover lands outside the settings dialog's scroll-lock container, which
 * silently blocks wheel and touch scrolling over the list.
 */
export function StationCombobox({ id, stations, value, onChange, placeholder = "Select a station" }: StationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = useMemo(() => stations.find((station) => station.id === value) ?? null, [stations, value]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle ? stations.filter((station) => station.name.toLowerCase().includes(needle)) : stations;
    return { visible: pool.slice(0, MAX_RESULTS), total: pool.length };
  }, [stations, query]);

  // Radix no longer supplies dismissal now that the list is not a popover.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commit = (stationId: string) => {
    onChange(stationId);
    setOpen(false);
    setQuery("");
  };

  const moveHighlight = (delta: number) => {
    setHighlight((prev) => {
      const next = Math.min(Math.max(prev + delta, 0), Math.max(matches.visible.length - 1, 0));
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
      return next;
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1.5">
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => {
            setOpen((prev) => !prev);
            setQuery("");
            setHighlight(0);
          }}
          className="h-10 min-w-0 flex-1 justify-between px-3 font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.name ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
        {selected && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange(null)}
            aria-label={`Clear ${selected.name}`}
            className="shrink-0 text-muted-foreground"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-1.5 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <div className="relative border-b border-border">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlight(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveHighlight(1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveHighlight(-1);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const station = matches.visible[highlight];
                  if (station) commit(station.id);
                }
              }}
              placeholder="Search stations…"
              aria-label="Search stations"
              aria-controls={listId}
              aria-activedescendant={matches.visible[highlight] ? `${listId}-${matches.visible[highlight].id}` : undefined}
              className="h-10 border-0 pl-9 shadow-none focus-visible:ring-0"
            />
          </div>

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Stations"
            className="thin-scrollbar max-h-56 overflow-y-auto overscroll-contain p-1 [-webkit-overflow-scrolling:touch]"
          >
            {matches.visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No station matches “{query}”.</p>
            ) : (
              matches.visible.map((station, index) => (
                <button
                  key={station.id}
                  id={`${listId}-${station.id}`}
                  type="button"
                  role="option"
                  aria-selected={station.id === value}
                  onClick={() => commit(station.id)}
                  onMouseEnter={() => setHighlight(index)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
                    index === highlight ? "bg-accent text-accent-foreground" : "text-foreground/90",
                  )}
                >
                  <Check className={cn("size-3.5 shrink-0", station.id === value ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  <span className="truncate">{station.name}</span>
                </button>
              ))
            )}
            {matches.total > matches.visible.length && (
              <p className="px-3 py-2 text-center text-[11px] text-muted-foreground">
                {matches.total - matches.visible.length} more — keep typing to narrow it down.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
