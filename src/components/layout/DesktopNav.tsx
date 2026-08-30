import { APP_SECTIONS, type SectionId } from "./sections";
import { cn } from "../../lib/utils";

interface DesktopNavProps {
  activeSection: SectionId;
  onNavigate: (sectionId: SectionId) => void;
}

/** Section links for the desktop single-scroll layout. */
export function DesktopNav({ activeSection, onNavigate }: DesktopNavProps) {
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
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            id === activeSection ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
