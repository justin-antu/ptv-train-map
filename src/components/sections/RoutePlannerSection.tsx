import { ArrowRight, Clock3, MapPin, Navigation } from "lucide-react";
import { SectionCard } from "../layout/SectionCard";
import { useSectionNavigation } from "../layout/sectionNavigation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/** Placeholder cards standing in for the three suggested journeys. */
const QUICK_VIEW_SLOTS = ["Fastest", "Fewest changes", "Leaving soon"];

/**
 * Layout for the planned journey search. The controls are intentionally inert:
 * planning needs an origin-to-destination service the app does not have yet, so
 * only the shape is committed here.
 */
export function RoutePlannerSection() {
  const navigate = useSectionNavigation();

  return (
    <SectionCard id="planner" title="Plan a trip" badge="Beta" description="Search any journey across the network">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,12rem)_auto]">
        <label className="min-w-0">
          <span className="type-label text-muted-foreground">From</span>
          <span className="relative mt-1 block">
            <MapPin className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input disabled placeholder="Departure station" className="h-10 pl-8" />
          </span>
        </label>

        <label className="min-w-0">
          <span className="type-label text-muted-foreground">To</span>
          <span className="relative mt-1 block">
            <Navigation className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input disabled placeholder="Destination station" className="h-10 pl-8" />
          </span>
        </label>

        <label className="min-w-0">
          <span className="type-label text-muted-foreground">Depart</span>
          <span className="relative mt-1 block">
            <Clock3 className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input disabled placeholder="Now" className="h-10 pl-8" />
          </span>
        </label>

        <div className="flex items-end">
          <Button disabled className="h-10 w-full lg:w-auto">
            Find trains
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Trip planning is not built yet.{" "}
        <button
          type="button"
          onClick={() => navigate("departures")}
          className="font-medium underline underline-offset-2 hover:text-foreground"
        >
          Check live departures
        </button>{" "}
        in the meantime.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {QUICK_VIEW_SLOTS.map((label) => (
          <div key={label} className="rounded-lg border border-dashed border-border bg-background/40 px-3 py-4">
            <p className="type-label text-muted-foreground">{label}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">Results will appear here.</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
