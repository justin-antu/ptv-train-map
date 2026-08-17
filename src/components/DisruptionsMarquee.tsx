import { AlertTriangle } from "lucide-react";
import { Marquee } from "./ui/marquee";
import type { LineDisruption } from "../shared/types";
import { cn } from "../lib/utils";

interface DisruptionsMarqueeProps {
  disruptionsByLine: Record<string, LineDisruption[]>;
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
}

/** Scrolling ticker of active PTV service alerts across every line — only rendered while at least one exists. */
export function DisruptionsMarquee({ disruptionsByLine, lineNameById, lineColorById }: DisruptionsMarqueeProps) {
  const items = Object.entries(disruptionsByLine).flatMap(([lineId, disruptions]) => disruptions.map((d) => ({ lineId, ...d })));
  if (items.length === 0) return null;

  return (
    <div className="relative z-10 border-b border-amber-300/50 bg-amber-50/90 dark:border-amber-900/50 dark:bg-amber-950/40">
      <Marquee pauseOnHover className="[--duration:32s] py-1.5">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.url ?? undefined}
            target={item.url ? "_blank" : undefined}
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 px-4 text-xs whitespace-nowrap text-amber-800 dark:text-amber-300",
              item.url ? "hover:underline" : "pointer-events-none",
            )}
          >
            <AlertTriangle className="size-3.5 shrink-0" />
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: lineColorById.get(item.lineId) ?? "#999" }} />
            <span className="font-semibold">{lineNameById.get(item.lineId) ?? item.lineId}:</span>
            <span>{item.title}</span>
          </a>
        ))}
      </Marquee>
    </div>
  );
}
