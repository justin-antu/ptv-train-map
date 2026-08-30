import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "../lib/utils";

/** Keeps the list short enough to stay scannable on a phone. */
const MAX_RESULTS = 40;

export interface SelectItem {
  id: string;
  label: string;
  /** Line colour, rendered as a swatch beside the label. */
  color?: string;
}

interface SearchableSelectProps {
  id?: string;
  items: readonly SelectItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Shown on the trigger when nothing is selected. */
  placeholder: string;
  /** Adds a first entry that clears the selection, e.g. "All lines". */
  emptyOption?: string;
  /** Item ids surfaced as one-tap chips above the results. */
  quickPickIds?: readonly string[];
  /** Screen-reader name for the control. */
  label: string;
  size?: "sm" | "default";
  className?: string;
}

/**
 * Type-to-filter picker for stations and lines.
 *
 * The result list is rendered inline rather than in a popover: a portalled
 * popover lands outside any scroll-locking container above it, which silently
 * blocks wheel and touch scrolling over the list.
 */
export function SearchableSelect({
  id,
  items,
  value,
  onChange,
  placeholder,
  emptyOption,
  quickPickIds,
  label,
  size = "default",
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = useMemo(() => items.find((item) => item.id === value) ?? null, [items, value]);

  const quickPicks = useMemo(
    () => (quickPickIds ?? []).map((pickId) => items.find((item) => item.id === pickId)).filter((item): item is SelectItem => item !== undefined),
    [items, quickPickIds],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle ? items.filter((item) => item.label.toLowerCase().includes(needle)) : items;
    return { visible: pool.slice(0, MAX_RESULTS), total: pool.length };
  }, [items, query]);

  // Nothing above provides dismissal now that the list is not a popover.
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

  const commit = (nextId: string | null) => {
    onChange(nextId);
    setOpen(false);
    setQuery("");
  };

  const moveHighlight = (delta: number) => {
    setHighlight((prev) => {
      const next = Math.min(Math.max(prev + delta, 0), Math.max(matches.visible.length - 1, 0));
      listRef.current?.querySelectorAll("[role='option']")[next]?.scrollIntoView({ block: "nearest" });
      return next;
    });
  };

  const compact = size === "sm";

  return (
    <div ref={containerRef} className={cn("relative min-w-0", className)}>
      <Button
        id={id}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => {
          setOpen((prev) => !prev);
          setQuery("");
          setHighlight(0);
        }}
        className={cn("w-full min-w-0 justify-between font-normal", compact ? "h-8 gap-1 px-2 text-xs" : "h-10 px-3")}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {selected?.color && <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: selected.color }} />}
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
        </span>
        <ChevronsUpDown className={cn("shrink-0 opacity-50", compact && "size-3")} aria-hidden="true" />
      </Button>

      {open && (
        <div
          className={cn(
            "absolute top-full left-0 z-40 mt-1 w-full min-w-[13rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg",
          )}
        >
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
                  const item = matches.visible[highlight];
                  if (item) commit(item.id);
                }
              }}
              placeholder="Search…"
              aria-label={`Search ${label}`}
              aria-controls={listId}
              aria-activedescendant={matches.visible[highlight] ? `${listId}-${matches.visible[highlight].id}` : undefined}
              className="h-9 border-0 pl-9 text-xs shadow-none focus-visible:ring-0"
            />
          </div>

          {quickPicks.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5">
              {quickPicks.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => commit(item.id)}
                  aria-pressed={item.id === value}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                    item.id === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="thin-scrollbar max-h-56 overflow-y-auto overscroll-contain p-1 [-webkit-overflow-scrolling:touch]"
          >
            {emptyOption && !query.trim() && (
              <button
                type="button"
                role="option"
                aria-selected={value === null}
                onClick={() => commit(null)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
                  value === null ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                )}
              >
                <Check className={cn("size-3.5 shrink-0", value === null ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                <span className="truncate">{emptyOption}</span>
              </button>
            )}

            {matches.visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No match for “{query}”.</p>
            ) : (
              matches.visible.map((item, index) => (
                <button
                  key={item.id}
                  id={`${listId}-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={item.id === value}
                  onClick={() => commit(item.id)}
                  onMouseEnter={() => setHighlight(index)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
                    index === highlight ? "bg-accent text-accent-foreground" : "text-foreground/90",
                  )}
                >
                  <Check className={cn("size-3.5 shrink-0", item.id === value ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  {item.color && <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: item.color }} />}
                  <span className="truncate">{item.label}</span>
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
