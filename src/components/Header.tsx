import { memo } from "react";
import trainLogo from "../assets/train-logo.png";
import { APP_TITLE, NETWORK_SUBTITLE } from "../config";
import type { Theme } from "../hooks/useTheme";
import { AnimatedThemeToggler } from "./ui/animated-theme-toggler";
import { TextAnimate } from "./ui/text-animate";
import { DesktopNav } from "./layout/DesktopNav";
import { LiveStatusDot } from "./LiveStatusDot";
import { SearchableSelect, type SelectItem } from "./SearchableSelect";
import { DEFAULT_SECTION_ID, type SectionId } from "./layout/sections";

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
      {/* One row: identity, then the app-wide scope, then everything that acts
          on the app. The scope and the status used to occupy a second strip of
          their own, which read as leftover chrome rather than as controls. */}
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2.5 sm:gap-4 sm:px-6">
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
          className="-m-1 flex min-w-0 shrink items-center gap-2.5 rounded-lg p-1 transition-opacity duration-200 hover:opacity-75 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:opacity-100"
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
          {/* On a phone this row also carries the line scope and the two status
              controls, and the title is too long to share it. The anchor's own
              label still names the app for anyone who cannot see the logo. */}
          <div className="hidden min-w-0 sm:block">
            <TextAnimate className="type-heading truncate text-sm leading-tight sm:text-base" duration={0.28}>
              {APP_TITLE}
            </TextAnimate>
            {/* Monospace is wide, so the qualifier only appears once there is room. */}
            <p className="truncate text-2xs text-muted-foreground sm:text-xs">
              {NETWORK_SUBTITLE}
              <span className="hidden md:inline"> · live departures</span>
            </p>
          </div>
        </a>

        {/* `mx-auto` splits the leftover space evenly, so the scope sits between
            the masthead and the controls at whatever width they happen to be. */}
        <SearchableSelect
          items={lineItems}
          value={scopeLineId}
          onChange={onScopeLineChange}
          placeholder="All lines"
          emptyOption="All lines"
          label="Narrow the whole app to one line"
          size="sm"
          className="mx-auto w-[8.5rem] shrink-0 sm:w-[11rem]"
        />

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <DesktopNav activeSection={activeSection} onNavigate={onNavigate} />
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
