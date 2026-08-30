import { useMemo, useState } from "react";
import { SectionCard } from "../layout/SectionCard";
import { SegmentedControl } from "../ui/segmented-control";
import { EtaText } from "../EtaText";
import { useNow } from "../../hooks/useNow";
import { departureRowsForStation, departureStatus } from "../../data/departures";
import { COMMUTE_DIRECTIONS, COMMUTE_DIRECTION_LABELS } from "../../shared/commute";
import { cn } from "../../lib/utils";
import type { CommuteDirection, CommutePreferencesController } from "../../hooks/useCommutePreferences";
import type { FavouriteLineFilter } from "../../hooks/useFavouriteLineFilter";
import type { LiveRun, StationStatic } from "../../shared/types";

const MAX_ROWS = 12;

const STATUS_TONE_CLASS = {
  success: "text-success",
  warning: "text-warning",
  muted: "text-muted-foreground",
} as const;

interface LiveDeparturesSectionProps {
  commute: CommutePreferencesController;
  stationsById: Map<string, StationStatic>;
  runs: LiveRun[];
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  lineFilter: FavouriteLineFilter;
  initialDirection: CommuteDirection;
}

/**
 * Full departures table for a commute station: what is leaving, where it is
 * going, and whether it is running late.
 */
export function LiveDeparturesSection({
  commute,
  stationsById,
  runs,
  lineNameById,
  lineColorById,
  lineFilter,
  initialDirection,
}: LiveDeparturesSectionProps) {
  const now = useNow(1000);
  const [direction, setDirection] = useState<CommuteDirection>(initialDirection);

  const availableDirections = COMMUTE_DIRECTIONS.filter((candidate) => commute.stationIdFor(candidate) !== null);
  const activeDirection = commute.stationIdFor(direction) !== null ? direction : availableDirections[0];
  const stationId = activeDirection ? commute.stationIdFor(activeDirection) : null;
  const station = stationId ? stationsById.get(stationId) : undefined;

  const rows = useMemo(() => {
    if (!station) return [];
    return departureRowsForStation(station, runs, now)
      .filter((row) => lineFilter.includes(row.lineId))
      .slice(0, MAX_ROWS);
  }, [station, runs, now, lineFilter]);

  if (!station) return null;

  return (
    <SectionCard
      id="departures"
      title="Live departures"
      description={`Next services from ${station.name}`}
      actions={
        availableDirections.length > 1 && activeDirection ? (
          <SegmentedControl
            label="Commute direction"
            options={availableDirections.map((candidate) => ({ value: candidate, label: COMMUTE_DIRECTION_LABELS[candidate] }))}
            value={activeDirection}
            onChange={setDirection}
          />
        ) : undefined
      }
      bodyClassName="p-0 sm:p-0"
    >
      <div className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            No upcoming departures in the current data
            {lineFilter.hasPreference && " for your lines"}.
          </p>
        ) : (
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="type-label px-3 py-2.5 font-medium text-muted-foreground">
                    Departs
                  </th>
                  <th scope="col" className="type-label px-3 py-2.5 font-medium text-muted-foreground">
                    Destination
                  </th>
                  <th scope="col" className="type-label px-3 py-2.5 font-medium text-muted-foreground">
                    Line
                  </th>
                  <th scope="col" className="type-label px-3 py-2.5 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th scope="col" className="type-label px-3 py-2.5 text-right font-medium text-muted-foreground">
                    Expected
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const status = departureStatus(row);
                  return (
                    <tr key={`${row.lineId}:${row.runRef}:${row.timeUtc}`} className="border-b border-border/60 last:border-b-0">
                      <td className="type-numeric px-3 py-2.5 font-semibold whitespace-nowrap">
                        {new Date(row.scheduledTimeUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block max-w-[16rem] truncate font-medium">{row.destinationName}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {row.remainingStops === 0 ? "Terminates here" : `Calling at ${row.remainingStops} more stops`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: lineColorById.get(row.lineId) ?? "#999" }} />
                          <span className="max-w-[9.5rem] truncate">{lineNameById.get(row.lineId) ?? row.lineId}</span>
                        </span>
                      </td>
                      <td className={cn("px-3 py-2.5 font-medium whitespace-nowrap", STATUS_TONE_CLASS[status.tone])}>{status.label}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <EtaText timeUtc={row.timeUtc} now={now} className="font-semibold" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
