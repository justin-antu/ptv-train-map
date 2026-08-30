import { APP_SECTIONS, type SectionId } from "./sections";
import { cn } from "../../lib/utils";

interface MobileTabBarProps {
  activeSection: SectionId;
  onSelect: (sectionId: SectionId) => void;
  /** Badge count shown on the Alerts tab. */
  alertCount: number;
  /** Raises the badge to destructive when a line the commuter uses is suspended. */
  hasCriticalAlert: boolean;
}

/**
 * Primary navigation on phones, where nearly all commuter traffic lands. Fixed
 * to the bottom of the viewport and padded for the home-indicator inset.
 */
export function MobileTabBar({ activeSection, onSelect, alertCount, hasCriticalAlert }: MobileTabBarProps) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-safe backdrop-blur-md lg:hidden"
    >
      <ul className="flex items-stretch">
        {APP_SECTIONS.map(({ id, label, icon: Icon }) => {
          const isActive = id === activeSection;
          return (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  // 10px, not 11px: five tabs leave ~72px each at 360px, and
                  // "Departures" has no space to wrap on if it overflows.
                  "relative flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors",
                  isActive ? "text-brand" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden="true" />
                  {id === "alerts" && alertCount > 0 && (
                    <span
                      className={cn(
                        "absolute -top-1 -right-2 flex min-w-4 justify-center rounded-full px-1 text-[9px] leading-4 font-semibold",
                        hasCriticalAlert ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-surface",
                      )}
                    >
                      <span aria-hidden="true">{alertCount > 9 ? "9+" : alertCount}</span>
                      <span className="sr-only">
                        {alertCount} active{hasCriticalAlert && ", including a major disruption on your lines"}
                      </span>
                    </span>
                  )}
                </span>
                {label}
                {isActive && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand" />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
