import { AlertTriangle, CalendarDays, House, MapPinned } from "lucide-react";

/**
 * Four areas, commute-first. Home is the product. The others are exits.
 * `#departures` still resolves to home so older shared links keep working.
 */
export const APP_SECTIONS = [
  { id: "home", label: "Home", description: "Your next train", icon: House },
  { id: "network", label: "Network", description: "Live map and line status", icon: MapPinned },
  { id: "timetable", label: "Timetable", description: "Full scheduled services", icon: CalendarDays },
  { id: "alerts", label: "Alerts", description: "Current service disruptions", icon: AlertTriangle },
] as const;

export type SectionId = (typeof APP_SECTIONS)[number]["id"];

export const DEFAULT_SECTION_ID: SectionId = "home";

export function isSectionId(value: string): value is SectionId {
  return APP_SECTIONS.some((section) => section.id === value);
}

export function sectionFromHash(value: string): SectionId {
  if (value === "departures" || value === "home") return "home";
  return isSectionId(value) ? value : DEFAULT_SECTION_ID;
}
