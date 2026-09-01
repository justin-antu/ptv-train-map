import { memo } from "react";
import { ArrowLeftRight, Settings } from "lucide-react";
import trainLogo from "../assets/train-logo.png";
import { APP_TITLE } from "../config";
import type { Theme } from "../hooks/useTheme";
import type { CommuteController } from "../hooks/useCommute";
import { AnimatedThemeToggler } from "./ui/animated-theme-toggler";
import { DesktopNav } from "./layout/DesktopNav";
import { LiveStatusDot } from "./LiveStatusDot";
import { DEFAULT_SECTION_ID, type SectionId } from "./layout/sections";

interface HeaderProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  freshnessLabel: string;
  freshnessTone: "success" | "muted" | "warning" | "destructive";
  trainCount: number;
  alertCount: number;
  hasCriticalAlert: boolean;
  activeSection: SectionId;
  onNavigate: (sectionId: SectionId) => void;
  onHome: () => void;
  onChangeCommute: () => void;
  commute: CommuteController;
  originName: string | null;
  destinationName: string | null;
}

const gearButtonClass =
  "flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

export const Header = memo(function Header({
  theme,
  onThemeChange,
  freshnessLabel,
  freshnessTone,
  trainCount,
  alertCount,
  hasCriticalAlert,
  activeSection,
  onNavigate,
  onHome,
  onChangeCommute,
  commute,
  originName,
  destinationName,
}: HeaderProps) {
  const pairReady = Boolean(originName && destinationName);
  const openCommute = () => {
    onHome();
    onChangeCommute();
  };

  return (
    <header className="border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6">
        <a
          href={`#${DEFAULT_SECTION_ID}`}
          onClick={(event) => {
            event.preventDefault();
            onHome();
          }}
          aria-label={`${APP_TITLE} — go home`}
          className="-m-1 flex shrink-0 items-center gap-2.5 rounded-sm p-1 transition-opacity duration-200 hover:opacity-75 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <img
            src={trainLogo}
            alt=""
            width={193}
            height={108}
            draggable={false}
            className="h-7 w-auto shrink-0 select-none sm:h-8"
          />
          <span className="type-heading hidden truncate text-sm lg:inline">{APP_TITLE}</span>
        </a>

        {pairReady && originName && destinationName && (
          <button
            type="button"
            onClick={commute.swap}
            className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-sm px-1 py-0.5 text-[13px] font-medium leading-snug hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:text-sm lg:hidden"
          >
            <span className="text-pretty">{originName}</span>
            <ArrowLeftRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-pretty">{destinationName}</span>
          </button>
        )}

        {pairReady && originName && destinationName && (
          <div className="mx-auto hidden min-w-0 max-w-full items-center gap-0.5 lg:flex">
            <button
              type="button"
              onClick={commute.swap}
              className="flex min-w-0 max-w-full items-center gap-2 rounded-sm px-1 py-0.5 text-sm font-medium hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="truncate">{originName}</span>
              <ArrowLeftRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{destinationName}</span>
            </button>
            <button type="button" onClick={openCommute} aria-label="Change commute" className={gearButtonClass}>
              <Settings className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <DesktopNav
            activeSection={activeSection}
            onNavigate={onNavigate}
            alertCount={alertCount}
            hasCriticalAlert={hasCriticalAlert}
          />
          {pairReady && (
            <button
              type="button"
              onClick={openCommute}
              aria-label="Change commute"
              className={`${gearButtonClass} lg:hidden`}
            >
              <Settings className="size-3.5" aria-hidden="true" />
            </button>
          )}
          <LiveStatusDot label={freshnessLabel} tone={freshnessTone} trainCount={trainCount} />
          <AnimatedThemeToggler
            theme={theme}
            onThemeChange={onThemeChange}
            variant="circle"
            title="Toggle dark mode"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-foreground transition-colors hover:bg-accent [&_svg]:size-4"
          />
        </div>
      </div>
    </header>
  );
});
