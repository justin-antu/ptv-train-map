import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface BoardBlockProps {
  /** Official line colour for the left strip, same as the home departure card. */
  accent?: string;
  className?: string;
  children: ReactNode;
}

/** The paper block used on Home: sharp edge, thin border, optional line strip. */
export function BoardBlock({ accent, className, children }: BoardBlockProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-sm border border-border/70 bg-background/40",
        className,
      )}
    >
      {accent && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2" style={{ background: accent }} />
      )}
      {children}
    </div>
  );
}
