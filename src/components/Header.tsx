import { memo } from "react";
import trainLogo from "../assets/train-logo.png";
import { APP_TITLE, NETWORK_SUBTITLE } from "../config";
import type { Theme } from "../hooks/useTheme";
import { cn } from "../lib/utils";
import { AnimatedThemeToggler } from "./ui/animated-theme-toggler";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { NumberTicker } from "./ui/number-ticker";
import { TextAnimate } from "./ui/text-animate";
import { DesktopNav } from "./layout/DesktopNav";
import { SearchableSelect, type SelectItem } from "./SearchableSelect";
import { DEFAULT_SECTION_ID, type SectionId } from "./layout/sections";

const FRESHNESS_DOT_CLASS = {
  success: "bg-success",
  warning: "bg-warning",
  muted: "bg-muted-foreground",
} as const;

interface HeaderProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  /**
   * How live the times are, already worded by `describeFreshness`. Passed as
   * primitives rather than the whole object so this memoised header only
   * re-renders when the wording or the tone actually changes.
   */
  freshnessLabel: string;
  freshnessTone: "success" | "muted" | "warning";
  trainCount: number;
  activeSection: SectionId;
  onNavigate: (sectionId: SectionId) => void;
  /** Returns to the departures board and, on desktop, the top of the page. */
  onHome: () => void;
  /** Every in-scope line, for the app-wide scope control. */
  lineItems: SelectItem[];
  /** The line the whole app is currently narrowed to, or null for the whole network. */
  scopeLineId: string | null;
  onScopeLineChange: (lineId: string | null) => void;
}

export const Header = memo(function Header({
  theme,
  onThemeChange,
  freshnessLabel,
  freshnessTone,
  trainCount,
  activeSection,
  onNavigate,
  onHome,
  lineItems,
  scopeLineId,
  onScopeLineChange,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        {/* An anchor rather than a button: `a` has a transparent content model,
            so it may legally wrap the heading and its qualifier, and it gives
            the masthead a real href to share. */}
        <a
          href={`#${DEFAULT_SECTION_ID}`}
          onClick={(event) => {
            event.preventDefault();
            onHome();
          }}
          aria-label={`${APP_TITLE} — go to departures`}
          className="-m-1 flex min-w-0 items-center gap-2.5 rounded-lg p-1 transition-opacity duration-200 hover:opacity-75 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:opacity-100"
        >
          {/* Decorative: the adjacent heading already names the app. */}
          <img
            src={trainLogo}
            alt=""
            width={193}
            height={108}
            draggable={false}
            className="h-7 w-auto shrink-0 select-none sm:h-9"
          />
          <div className="min-w-0">
            <TextAnimate className="type-heading truncate text-sm leading-tight sm:text-base" duration={0.28}>
              {APP_TITLE}
            </TextAnimate>
            {/* Monospace is wide, so the qualifier only appears once there is room. */}
            <p className="truncate text-2xs text-muted-foreground sm:text-xs">
              {NETWORK_SUBTITLE}
              <span className="hidden sm:inline"> · live departures</span>
            </p>
          </div>
        </a>

        <DesktopNav activeSection={activeSection} onNavigate={onNavigate} />

        <div className="flex items-center gap-2 sm:gap-3">
          {/* The dot is the signal; the sentence lives on the departure board,
              which is the only place that shows it on a phone. Spelling it out
              here as well put two differently-worded freshness lines on one
              desktop screen. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "hidden items-center rounded-full border border-border bg-background/60 py-1 sm:flex",
                  // Overnight there is no count to show, so the pill collapses
                  // to a status light rather than a mostly empty bubble.
                  trainCount > 0 ? "gap-2 px-3" : "px-2",
                )}
              >
                <span className={cn("size-1.5 rounded-full", FRESHNESS_DOT_CLASS[freshnessTone])} aria-hidden="true" />
                <span className="sr-only">{freshnessLabel}</span>
                {trainCount > 0 && (
                  <span className="flex items-center gap-1 text-2xs font-semibold text-foreground">
                    <NumberTicker value={trainCount} className="text-foreground" /> trains
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>{freshnessLabel}</TooltipContent>
          </Tooltip>
          <AnimatedThemeToggler
            theme={theme}
            onThemeChange={onThemeChange}
            variant="circle"
            title="Toggle dark mode"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-foreground transition-colors hover:bg-accent [&_svg]:size-4"
          />
        </div>
      </div>

      {/* The line scope belongs to the app, not to one card. It used to be
          declared globally but rendered inside the departures board, so people
          changed it there and were surprised the timetable ignored it. */}
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 pb-2 sm:px-6">
        <span id="line-scope-label" className="type-label shrink-0 text-muted-foreground">
          Showing
        </span>
        <SearchableSelect
          items={lineItems}
          value={scopeLineId}
          onChange={onScopeLineChange}
          placeholder="All lines"
          emptyOption="All lines"
          label="Narrow the whole app to one line"
          size="sm"
          className="w-[11rem]"
        />
      </div>
    </header>
  );
});
