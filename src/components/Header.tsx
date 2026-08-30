import { memo } from "react";
import { Settings2 } from "lucide-react";
import { APP_TITLE, NETWORK_SUBTITLE } from "../config";
import type { Theme } from "../hooks/useTheme";
import { cn } from "../lib/utils";
import { AnimatedThemeToggler } from "./ui/animated-theme-toggler";
import { NumberTicker } from "./ui/number-ticker";
import { TextAnimate } from "./ui/text-animate";
import { DesktopNav } from "./layout/DesktopNav";
import type { SectionId } from "./layout/sections";

interface HeaderProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  isDemo: boolean;
  generatedAtUtc: string | null;
  trainCount: number;
  activeSection: SectionId;
  onNavigate: (sectionId: SectionId) => void;
  onOpenSettings: () => void;
}

export const Header = memo(function Header({
  theme,
  onThemeChange,
  isDemo,
  generatedAtUtc,
  trainCount,
  activeSection,
  onNavigate,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="text-2xl" aria-hidden="true">
            🚆
          </span>
          <div className="min-w-0">
            <TextAnimate
              className="type-heading truncate text-sm leading-tight transition-opacity duration-200 hover:opacity-75 motion-reduce:transition-none motion-reduce:hover:opacity-100 sm:text-base"
              duration={0.28}
            >
              {APP_TITLE}
            </TextAnimate>
            {/* Monospace is wide, so the qualifier only appears once there is room. */}
            <p className="truncate text-[10px] text-muted-foreground sm:text-[11px]">
              {NETWORK_SUBTITLE}
              <span className="hidden sm:inline"> · live departures</span>
            </p>
          </div>
        </div>

        <DesktopNav activeSection={activeSection} onNavigate={onNavigate} />

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 sm:flex">
            <span className={cn("size-1.5 rounded-full", isDemo ? "bg-warning" : "bg-success")} />
            <span className="text-[11px] text-muted-foreground">
              {isDemo
                ? "Sample preview"
                : generatedAtUtc
                  ? `Last updated · ${new Date(generatedAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : "Loading…"}
            </span>
            {trainCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                <NumberTicker value={trainCount} className="text-foreground" /> trains
              </span>
            )}
          </div>
          <AnimatedThemeToggler
            theme={theme}
            onThemeChange={onThemeChange}
            variant="circle"
            title="Toggle dark mode"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-foreground transition-colors hover:bg-accent [&_svg]:size-4"
          />
          <button
            type="button"
            onClick={onOpenSettings}
            title="Commute settings"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-foreground transition-colors hover:bg-accent"
          >
            <Settings2 className="size-4" aria-hidden="true" />
            <span className="sr-only">Commute settings</span>
          </button>
        </div>
      </div>
    </header>
  );
});
