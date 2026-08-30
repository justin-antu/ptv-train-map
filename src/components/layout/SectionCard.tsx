import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useCollapsedSection } from "./collapsedSections";
import { cn } from "../../lib/utils";

interface SectionCardProps {
  /** Doubles as the desktop scroll-anchor target and collapse storage key, e.g. `departures`. */
  id: string;
  title: string;
  /** Short status chip beside the title, e.g. `Beta`. */
  badge?: string;
  description?: string;
  /** Controls rendered beside the title, outside the collapse button. */
  actions?: ReactNode;
  /** Starting state when nothing has been stored for this card yet. */
  defaultCollapsed?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * The single container for every top-level area: a titled, collapsible card.
 *
 * The body is hidden rather than unmounted. Unmounting would tear down and
 * rebuild the MapLibre instance on each collapse, and would drop scroll
 * position in the timetable's virtualized list.
 */
export function SectionCard({
  id,
  title,
  badge,
  description,
  actions,
  defaultCollapsed = false,
  className,
  bodyClassName,
  children,
}: SectionCardProps) {
  const { collapsed, toggle } = useCollapsedSection(id, defaultCollapsed);
  const bodyId = `${id}-body`;

  // The card deliberately does not clip its overflow: the departure board's
  // dropdown panels overhang it, and clipping would cut the station list short.
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-20 rounded-xl border border-border bg-card/60 shadow-sm", className)}
    >
      <div className="flex items-start gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
        {/* Only the title block is the toggle: nesting the action controls inside
            a button would be invalid markup and unreachable by keyboard. */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="-m-1 flex min-w-0 flex-1 items-start gap-2 rounded-lg p-1 text-left transition-colors hover:bg-accent/40"
        >
          <ChevronDown
            className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200", collapsed && "-rotate-90")}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span id={`${id}-title`} className="type-heading text-sm sm:text-base">
                {title}
              </span>
              {badge && (
                <span className="type-label rounded-full border border-brand/40 bg-brand/10 px-1.5 text-[9px] leading-4 text-brand">
                  {badge}
                </span>
              )}
            </span>
            {description && <span className="mt-0.5 block text-[11px] text-muted-foreground sm:text-xs">{description}</span>}
          </span>
        </button>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {/* The `hidden` class comes last so it still wins if a caller's body class
          sets its own display. */}
      <div id={bodyId} className={cn("border-t border-border/70 p-3 sm:p-4", bodyClassName, collapsed && "hidden")}>
        {children}
      </div>
    </section>
  );
}
