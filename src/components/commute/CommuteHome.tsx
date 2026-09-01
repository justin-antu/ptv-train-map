import { useMemo, useRef } from "react";
import { useNow } from "../../hooks/useNow";
import { useSectionNavigation } from "../layout/sectionNavigation";
import {
  departureRowsForStation,
  describeStoppingPattern,
} from "../../data/departures";
import type { AggregatedDisruption } from "../../data/disruptions";
import type { CommuteController } from "../../hooks/useCommute";
import type { LineStatic, LiveRun, StationStatic } from "../../shared/types";
import { CountAnnouncer } from "../CountAnnouncer";
import { DeparturesEmptyState } from "../departures/DeparturesEmptyState";
import { DeparturesSkeleton } from "../departures/DeparturesSkeleton";
import { HeroNextTrain } from "./HeroNextTrain";
import { LaterTrains } from "./LaterTrains";
import { DisruptionTakeover } from "./DisruptionTakeover";
import { ShareService } from "./ShareService";
import { NetworkStatsCard } from "../panels/NetworkStatsCard";
import { useInstallHint } from "../../hooks/useInstallHint";
import { usePushNotifications } from "../../hooks/usePushNotifications";

const LATER_COUNT = 3;

interface CommuteHomeProps {
  lines: LineStatic[];
  stationsById: Map<string, StationStatic>;
  runs: LiveRun[];
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  commute: CommuteController;
  criticalIncident: AggregatedDisruption | null;
  isInitialising: boolean;
  freshnessDetail?: string;
  trainsRunning: number;
  linesActive: number;
}

export function CommuteHome({
  lines,
  stationsById,
  runs,
  lineNameById,
  lineColorById,
  commute,
  criticalIncident,
  isInitialising,
  freshnessDetail,
  trainsRunning,
  linesActive,
}: CommuteHomeProps) {
  const navigate = useSectionNavigation();
  const now = useNow(1000);
  const cardRef = useRef<HTMLElement>(null);
  const install = useInstallHint();
  const push = usePushNotifications();

  const origin = commute.originStationId ? stationsById.get(commute.originStationId) : undefined;
  const destination = commute.destinationStationId
    ? stationsById.get(commute.destinationStationId)
    : undefined;
  const linesById = useMemo(() => new Map(lines.map((line) => [line.id, line])), [lines]);
  const stationNamesById = useMemo(
    () => new Map([...stationsById.entries()].map(([id, station]) => [id, station.name])),
    [stationsById],
  );

  const rows = useMemo(() => {
    if (!origin) return [];
    return departureRowsForStation(origin, runs, now, {
      destinationStationId: destination?.id,
    });
  }, [origin, destination, runs, now]);

  const hero = rows[0];
  const later = rows.slice(1, 1 + LATER_COUNT);
  const nextAlternative = hero?.isCancelled
    ? rows.find((candidate) => !candidate.isCancelled && candidate.lineId === hero.lineId)
    : undefined;

  const empty = !origin
    ? { kind: "no-origin" as const }
    : !isInitialising && rows.length === 0
      ? { kind: "none" as const, originName: origin.name }
      : null;

  const takeoverLineName = criticalIncident
    ? (lineNameById.get(criticalIncident.lineIds[0] ?? "") ?? "Your line")
    : "";

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <CountAnnouncer
          message={
            origin
              ? `${rows.length} ${rows.length === 1 ? "departure" : "departures"} from ${origin.name}${destination ? ` stopping at ${destination.name}` : ""}`
              : "No commute set"
          }
        />
        {freshnessDetail && <p className="font-mono text-xs text-warning">{freshnessDetail}</p>}
        {criticalIncident && (
          <DisruptionTakeover
            incident={criticalIncident}
            lineName={takeoverLineName}
            onViewAlerts={() => navigate("alerts")}
          />
        )}

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(16rem,0.9fr)] lg:items-start lg:gap-16">
          <div className="flex flex-col gap-4">
            {isInitialising && !hero ? (
              <DeparturesSkeleton />
            ) : empty ? (
              <DeparturesEmptyState
                reason={empty}
                onClearLine={() => commute.setLine(null)}
                onClearDestination={commute.reset}
                onOpenTimetable={() => navigate("timetable")}
              />
            ) : hero && origin ? (
              <>
                <HeroNextTrain
                  ref={cardRef}
                  row={hero}
                  now={now}
                  originName={origin.name}
                  destinationName={destination?.name ?? hero.destinationName}
                  destinationStationId={destination?.id}
                  lineName={lineNameById.get(hero.lineId) ?? hero.lineId}
                  lineColor={lineColorById.get(hero.lineId) ?? "#152C6B"}
                  pattern={describeStoppingPattern(hero, stationNamesById, linesById.get(hero.lineId), hero.stationId)}
                  nextAlternative={nextAlternative}
                />
                <div className="flex items-center justify-between gap-2 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => void push.toggle()}
                    className="min-w-0 flex-1 text-left font-mono text-[clamp(0.625rem,2.7vw,0.75rem)] uppercase leading-snug tracking-widest text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {push.enabled ? "Background alerts on" : "Alert me"}
                  </button>
                  <ShareService cardRef={cardRef} />
                </div>
              </>
            ) : null}
            {install.visible && (
              <p className="font-mono text-xs text-muted-foreground">
                Add this to your home screen for the next weekday.
                <button type="button" className="ml-2 underline-offset-4 hover:underline" onClick={install.dismiss}>
                  Dismiss
                </button>
              </p>
            )}
            {push.message && <p className="font-mono text-xs text-muted-foreground">{push.message}</p>}
          </div>

          <aside className="flex flex-col gap-8">
            <LaterTrains
              rows={later}
              now={now}
              lineColorById={lineColorById}
            />
          </aside>
        </div>
      </div>

      <NetworkStatsCard trainsRunning={trainsRunning} linesActive={linesActive} />
    </div>
  );
}
