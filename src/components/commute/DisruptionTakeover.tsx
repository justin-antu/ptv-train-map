import { useId, useState } from "react";
import { AlertTriangle, ArrowRight, Minus, Plus } from "lucide-react";
import type { AggregatedDisruption } from "../../data/disruptions";

interface DisruptionTakeoverProps {
  incident: AggregatedDisruption;
  lineName: string;
  onViewAlerts: () => void;
}

/** A critical alert on this ride becomes the hero, not a badge on another tab. */
export function DisruptionTakeover({ incident, lineName, onViewAlerts }: DisruptionTakeoverProps) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  return (
    <div className="rounded-sm border border-destructive-border bg-destructive-surface px-5 py-4 text-left sm:px-8">
      <div className="flex items-center gap-3">
        <p className="type-label flex min-w-0 flex-1 items-center gap-2 text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            Major disruption · {lineName}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={open ? "Collapse disruption" : "Expand disruption"}
          className="flex size-8 shrink-0 items-center justify-center rounded-sm text-destructive hover:bg-destructive/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {open ? <Minus className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div id={detailsId}>
          <h2 className="type-display mt-4 text-3xl text-foreground sm:text-5xl">
            {incident.headline}
          </h2>
          {incident.disruption.description && (
            <p className="mt-4 max-w-2xl font-mono text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {incident.disruption.description}
            </p>
          )}
          <button
            type="button"
            onClick={onViewAlerts}
            className="mt-6 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-destructive underline-offset-4 hover:underline"
          >
            View alerts
            <ArrowRight className="size-3" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
