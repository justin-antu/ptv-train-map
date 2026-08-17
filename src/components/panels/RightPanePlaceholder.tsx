import { Compass, Sparkles } from "lucide-react";
import { DotPattern } from "../ui/dot-pattern";
import { PulsatingButton } from "../ui/pulsating-button";
import { NetworkStatsCard, type NetworkStatsCardProps } from "./NetworkStatsCard";
import { cn } from "../../lib/utils";

const UPCOMING = [
  { icon: Compass, title: "Trip planner", description: "Multi-leg journeys across the network." },
  { icon: Sparkles, title: "Your ideas here", description: "This space is reserved for what's next." },
];

interface RightPanePlaceholderProps {
  stats: NetworkStatsCardProps;
}

/**
 * Right-pane space: real live network stats up top (see `NetworkStatsCard`),
 * then a quiet "coming soon" teaser (dot-pattern backdrop + dashed preview
 * tiles) for the still-reserved remainder of the space.
 */
export function RightPanePlaceholder({ stats }: RightPanePlaceholderProps) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <DotPattern glow className="opacity-40 [mask-image:radial-gradient(400px_circle_at_center,white,transparent)]" />
      <div className="relative flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        <NetworkStatsCard {...stats} />

        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-3 text-center">
          <PulsatingButton
            disabled
            pulseColor="#38bdf8"
            className="cursor-default rounded-full bg-primary/10 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase shadow-none"
          >
            More on the way
          </PulsatingButton>
          <p className="max-w-[16rem] text-xs text-muted-foreground">This space is reserved for upcoming features — here's a peek at what might land here.</p>
          <div className="mt-2 grid w-full max-w-xs grid-cols-1 gap-2">
            {UPCOMING.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border border-dashed border-border/70 bg-card/40 p-3 text-left backdrop-blur-sm",
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-xs font-semibold text-foreground/80">{title}</div>
                  <div className="text-[10.5px] text-muted-foreground">{description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
