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
      className={cn(
        "gap-0.5 border-amber-500/40 bg-amber-500/15 px-1.5 font-semibold text-amber-700 dark:text-amber-400",
        className,
      )}
    >
      +<NumberTicker value={delayMin} className="text-amber-700 dark:text-amber-400" /> min
    </Badge>
  );
}
