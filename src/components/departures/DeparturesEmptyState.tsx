import { CalendarClock, MapPinned, RouteOff, SlidersHorizontal, Ban } from "lucide-react";
import { Button } from "../ui/button";

/**
 * Why the board is empty. Not one string but five, because "no departures" is
 * the same sentence for five unrelated situations, only one of which the rider
 * can do anything about — and the fix differs in each.
 */
export type EmptyReason =
  | { kind: "no-origin" }
  | { kind: "line-excludes-origin"; originName: string; lineName: string }
  | { kind: "line-excludes-destination"; destinationName: string; lineName: string }
  | { kind: "unreachable"; originName: string; destinationName: string }
  | { kind: "outside-window"; destinationName: string }
  | { kind: "all-cancelled"; originName: string; count: number }
  | { kind: "none"; originName: string };

interface DeparturesEmptyStateProps {
  reason: EmptyReason;
  onClearLine: () => void;
  onClearDestination: () => void;
  onOpenTimetable: () => void;
}

export function DeparturesEmptyState({
  reason,
  onClearLine,
  onClearDestination,
  onOpenTimetable,
}: DeparturesEmptyStateProps) {
  const content = describe(reason);

  return (
    <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-center">
      <content.Icon className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium">{content.title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{content.body}</p>
      {content.action && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 border border-border"
          onClick={
            content.action.kind === "clear-line"
              ? onClearLine
              : content.action.kind === "clear-destination"
                ? onClearDestination
                : onOpenTimetable
          }
        >
          {content.action.label}
        </Button>
      )}
    </div>
  );
}

type Action = { kind: "clear-line" | "clear-destination" | "open-timetable"; label: string };

function describe(reason: EmptyReason): {
  Icon: typeof MapPinned;
  title: string;
  body: string;
  action?: Action;
} {
  switch (reason.kind) {
    case "no-origin":
      return {
        Icon: MapPinned,
        title: "Pick your station",
        body: "Choose where you board above and your next departures appear here every time you open the app.",
      };

    // The escape hatch must name the filter to drop. "No results, try changing
    // your filters" leaves the rider to work out which of two they set is the
    // one contradicting the other.
    case "line-excludes-origin":
      return {
        Icon: SlidersHorizontal,
        title: `${reason.originName} is not on the ${reason.lineName} line`,
        body: `The ${reason.lineName} filter and this station cannot both apply. Drop the line filter to see everything departing from ${reason.originName}.`,
        action: { kind: "clear-line", label: `Show all lines` },
      };

    case "line-excludes-destination":
      return {
        Icon: SlidersHorizontal,
        title: `No ${reason.lineName} trains reach ${reason.destinationName}`,
        body: `The ${reason.lineName} filter rules out every service that stops at ${reason.destinationName}. Drop the line filter to see the ones that do.`,
        action: { kind: "clear-line", label: "Show all lines" },
      };

    case "unreachable":
      return {
        Icon: RouteOff,
        title: `No direct trains to ${reason.destinationName}`,
        body: `Nothing departing ${reason.originName} calls at ${reason.destinationName} without a change. Clear the destination to see where these trains do go.`,
        action: { kind: "clear-destination", label: "Show all destinations" },
      };

    case "outside-window":
      return {
        Icon: CalendarClock,
        title: `Nothing to ${reason.destinationName} in the next few hours`,
        body: "This board only covers the next few hours of service. The full timetable goes further ahead.",
        action: { kind: "open-timetable", label: "Open the timetable" },
      };

    case "all-cancelled":
      return {
        Icon: Ban,
        title: "Every matching service is cancelled",
        body: `All ${reason.count} upcoming ${reason.count === 1 ? "service" : "services"} from ${reason.originName} that match your filters have been cancelled. Check alerts for replacement arrangements.`,
        action: { kind: "clear-destination", label: "Show all destinations" },
      };

    case "none":
      return {
        Icon: CalendarClock,
        title: `No more departures from ${reason.originName}`,
        body: "Nothing else is scheduled from here in the current data. The timetable has the rest of the service day.",
        action: { kind: "open-timetable", label: "Open the timetable" },
      };
  }
}
