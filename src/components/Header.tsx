import { memo } from "react";
import { APP_TITLE } from "../config";
import type { Theme } from "../hooks/useTheme";
import { cn } from "../lib/utils";
import { AnimatedThemeToggler } from "./ui/animated-theme-toggler";
import { NumberTicker } from "./ui/number-ticker";
import { TextAnimate } from "./ui/text-animate";

interface HeaderProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  isDemo: boolean;
  generatedAtUtc: string | null;
  trainCount: number;
}

export const Header = memo(function Header({ theme, onThemeChange, isDemo, generatedAtUtc, trainCount }: HeaderProps) {
  return (
    <header className="relative z-20 flex items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-2.5 backdrop-blur-sm sm:px-6">
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
          <p className="truncate text-[11px] text-muted-foreground">Metro Trains Melbourne · live network map</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 sm:flex">
          <span className={cn("size-1.5 rounded-full", isDemo ? "bg-amber-500" : "bg-emerald-500")} />
          <span className="text-[11px] text-muted-foreground">
            {isDemo
              ? "Sample preview"
              : generatedAtUtc
                ? `Live · ${new Date(generatedAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
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
      </div>
    </header>
  );
});
