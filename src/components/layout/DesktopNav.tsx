import { APP_SECTIONS, type SectionId } from "./sections";
import { cn } from "../../lib/utils";

interface DesktopNavProps {
  activeSection: SectionId;
  onNavigate: (sectionId: SectionId) => void;
  /** Badge count shown on the Alerts link, matching the mobile tab bar. */
  alertCount: number;
  /** Raises the badge to destructive when a line the commuter uses is suspended. */
  hasCriticalAlert: boolean;
}

/** Section links for the desktop header. */
export function DesktopNav({ activeSection, onNavigate, alertCount, hasCriticalAlert }: DesktopNavProps) {
  return (
    <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
      {APP_SECTIONS.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          aria-current={id === activeSection ? "true" : undefined}
          onClick={(event) => {
            event.preventDefault();
            onNavigate(id);
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            id === activeSection ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          {label}
          {id === "alerts" && alertCount > 0 && (
            <span
              className={cn(
                "type-numeric flex min-w-4 justify-center rounded-full px-1 text-3xs leading-4 font-semibold",
                hasCriticalAlert
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-[hsl(42_90%_52%)] text-[hsl(30_12%_8%)]",
              )}
            >
              <span aria-hidden="true">{alertCount > 9 ? "9+" : alertCount}</span>
              <span className="sr-only">
                {alertCount} active{hasCriticalAlert && ", including a major disruption on your lines"}
              </span>
            </span>
          )}
        </a>
      ))}
    </nav>
  );
}
