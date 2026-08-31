import { X } from "lucide-react";
import { cn } from "../lib/utils";

interface ScopeChipProps {
  /** What the scope is, e.g. "Lilydale line". */
  label: string;
  /** Line colour, so the chip carries the same identity as the rows it filters. */
  color?: string;
  /**
   * How much the scope is hiding, e.g. "4 of 18 services". A filter that
   * silently removes most of a list is the single most common way people end up
   * convinced the data is broken.
   */
  count?: string;
  onClear: () => void;
  className?: string;
}

/**
 * Restates an app-wide filter inside a section it affects, with a one-tap
 * escape. Deliberately never rendered on sections the scope does not change —
 * a chip that does nothing teaches people to ignore the ones that do.
 */
export function ScopeChip({ label, color, count, onClear, className }: ScopeChipProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-secondary/70 py-1 pr-1 pl-2.5 text-2xs",
        className,
      )}
    >
      {color && <span className="size-2 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden="true" />}
      <span className="truncate font-medium">{label}</span>
      {count && <span className="shrink-0 text-muted-foreground">· {count}</span>}
      <button
        type="button"
        onClick={onClear}
        // 44px of touch target from a 20px glyph, without a 44px hole in the
        // chip's own layout.
        className="relative -m-2 shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <X className="size-3.5" aria-hidden="true" />
        <span className="sr-only">Clear the {label} filter</span>
        <span className="absolute top-1/2 left-1/2 size-11 -translate-x-1/2 -translate-y-1/2" aria-hidden="true" />
      </button>
    </span>
  );
}
