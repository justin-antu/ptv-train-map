import { Badge } from "./ui/badge";
import { NumberTicker } from "./ui/number-ticker";
import { cn } from "../lib/utils";

const DELAYED_THRESHOLD_MIN = 3;

interface DelayBadgeProps {
  delayMin: number;
  className?: string;
}

/** Small "+N min" pill shown for meaningfully-late trains; on-time/early trains render nothing. */
export function DelayBadge({ delayMin, className }: DelayBadgeProps) {
  if (delayMin < DELAYED_THRESHOLD_MIN) return null;
  return (
    <Badge
      variant="outline"
      className={cn("gap-0.5 border-warning-border/60 bg-warning/15 px-1.5 font-semibold text-warning", className)}
    >
      +<NumberTicker value={delayMin} className="text-warning" /> min
    </Badge>
  );
}
