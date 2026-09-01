import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

const TONE_CLASS = {
  // Same green in both themes — light `--success` is a darker forest that
  // reads dull next to the night-platform live dot.
  success: "text-[hsl(152_55%_48%)]",
  warning: "text-warning",
  muted: "text-muted-foreground",
  destructive: "text-destructive",
} as const;

interface LiveStatusDotProps {
  /** The freshness wording, e.g. "Live · updated just now". */
  label: string;
  tone: "success" | "muted" | "warning" | "destructive";
  trainCount: number;
}

/**
 * The whole-app data status, as a single dot.
 *
 * The wording used to sit inline in the masthead, where it was a sentence of
 * chrome that changed every minute and was read once. As a dot it is glanceable
 * — green is fine, amber is not — and the sentence is still one hover or tap
 * away for anyone who wants the actual time.
 *
 * The reveal is hand-rolled rather than a Tooltip because it has to answer to
 * both hover and click: a Radix tooltip closes on click, so a tap would open
 * and immediately dismiss it, which is the one input this needs to serve.
 */
export function LiveStatusDot({ label, tone, trainCount }: LiveStatusDotProps) {
  const [pinned, setPinned] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // A panel opened by tapping has no pointer to leave, so the next tap
  // elsewhere is the only thing that can close it.
  useEffect(() => {
    if (!pinned) return;
    const dismiss = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setPinned(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [pinned]);

  // Green pulses while we have a feed. Red pulses only after a day of silence.
  const isPulsing = tone === "success" || tone === "destructive";

  return (
    <div ref={containerRef} className="group relative">
      <button
        type="button"
        onClick={() => setPinned((prev) => !prev)}
        // No chrome of its own: the dot is the control. The button still holds
        // a full-size hit area around it so it stays tappable at 8px wide.
        className="flex size-8 shrink-0 items-center justify-center rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className={cn("relative flex size-2.5 items-center justify-center", TONE_CLASS[tone])}>
          {/* `ping` scales and fades a copy of the dot, so the animation stays
              on the compositor rather than repainting a growing box-shadow
              behind a sticky, blurred header. */}
          {isPulsing && (
            <span
              className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75 motion-reduce:hidden"
              aria-hidden="true"
            />
          )}
          <span className="relative inline-flex size-full rounded-full bg-current" aria-hidden="true" />
        </span>
        <span className="sr-only">
          {label}
          {trainCount > 0 && ` — ${trainCount} trains running`}
        </span>
      </button>

      {/* Purely a visual echo of the button's own accessible name, so it is
          hidden from assistive tech rather than read out a second time. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-full right-0 z-40 mt-2 w-max max-w-[15rem] rounded-lg border border-border bg-popover px-3 py-2 shadow-lg transition-opacity duration-150 motion-reduce:transition-none",
          "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          pinned && "opacity-100",
        )}
      >
        <p className={cn("text-2xs font-medium", tone === "destructive" ? "text-destructive" : "text-popover-foreground")}>
          {label}
        </p>
        {trainCount > 0 && <p className="text-2xs text-muted-foreground">{trainCount} trains running</p>}
      </div>
    </div>
  );
}
