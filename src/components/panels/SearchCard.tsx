import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "../ui/input";
import type { StationStatic } from "../../shared/types";
import { cn } from "../../lib/utils";

const MAX_RESULTS = 6;

interface SearchCardProps {
  stations: readonly StationStatic[];
  onSelect: (station: StationStatic) => void;
}

/** Station name search with a filtered, animated dropdown of matches. */
export function SearchCard({ stations, onSelect }: SearchCardProps) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return stations.filter((s) => s.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS);
  }, [stations, query]);

  function select(station: StationStatic) {
    setQuery(station.name);
    onSelect(station);
    inputRef.current?.blur();
  }

  return (
    <div className="rounded-xl border border-border bg-card/80 p-3 shadow-sm backdrop-blur-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          onKeyDown={(e) => {
            if (matches.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlighted((i) => (i + 1) % matches.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((i) => (i - 1 + matches.length) % matches.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const station = matches[highlighted] ?? matches[0];
              if (station) select(station);
            } else if (e.key === "Escape") {
              setQuery("");
            }
          }}
          placeholder="Search for a station…"
          autoComplete="off"
          spellCheck={false}
          className="pl-8"
        />
      </div>
      {matches.length > 0 && (
        <div className="mt-2 flex flex-col overflow-hidden rounded-lg border border-border">
          {matches.map((station, i) => (
            <button
              key={station.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(station)}
              className={cn(
                "w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                i === highlighted && "bg-accent",
              )}
            >
              {station.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
