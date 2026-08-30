import { AlertTriangle, CalendarDays, MapPinned, TrainFront } from "lucide-react";

/**
 * The app's four top-level areas, in commuter priority order. This single list
 * drives the mobile tab bar, the desktop nav links, and the desktop scroll
 * order, so the two layouts can never drift apart.
 */
export const APP_SECTIONS = [
  { id: "departures", label: "Departures", description: "Your next services and trip planner", icon: TrainFront },
  { id: "network", label: "Network", description: "Live map and line status", icon: MapPinned },
  { id: "timetable", label: "Timetable", description: "Full scheduled services", icon: CalendarDays },
  { id: "alerts", label: "Alerts", description: "Current service disruptions", icon: AlertTriangle },
] as const;

export type SectionId = (typeof APP_SECTIONS)[number]["id"];

export const DEFAULT_SECTION_ID: SectionId = "departures";

export function isSectionId(value: string): value is SectionId {
  return APP_SECTIONS.some((section) => section.id === value);
}
