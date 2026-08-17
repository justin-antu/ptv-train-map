import { NumberTicker } from "./ui/number-ticker";
import { cn } from "../lib/utils";

interface EtaTextProps {
  timeUtc: string;
  now: number;
  className?: string;
}

/** Formats a predicted ISO time as a short relative/absolute label, e.g. "Due", "4 min", "2:15 pm" — with the minute count animated via NumberTicker when applicable. */
export function EtaText({ timeUtc, now, className }: EtaTextProps) {
  const diffMs = Date.parse(timeUtc) - now;
  if (diffMs <= 30_000) {
    return <span className={className}>Due</span>;
  }
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) {
    return (
      <span className={cn("inline-flex items-baseline gap-1", className)}>
        <NumberTicker value={mins} className="text-inherit dark:text-inherit" />
        <span>min</span>
      </span>
    );
  }
  return <span className={className}>{new Date(timeUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>;
}
