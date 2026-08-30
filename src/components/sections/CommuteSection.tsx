import { useMemo, useState } from "react";
import { AlertTriangle, Bell, BellOff, Info, MapPinned, Settings2 } from "lucide-react";
import { SectionCard } from "../layout/SectionCard";
import { useSectionNavigation } from "../layout/sectionNavigation";
import { DepartureBoard } from "../panels/DepartureBoard";
import { Button } from "../ui/button";
import { SegmentedControl } from "../ui/segmented-control";
import { useNow } from "../../hooks/useNow";
import { LIVE_DATA_STALE_AFTER_MS } from "../../config";
import { COMMUTE_DIRECTIONS, COMMUTE_DIRECTION_LABELS, defaultCommuteDirection } from "../../shared/commute";
import { cn } from "../../lib/utils";
import type { DisruptionSeverity, LineDisruptionSummary } from "../../data/disruptions";
import type { CommuteDirection, CommutePreferencesController } from "../../hooks/useCommutePreferences";
import type { FavouriteLineFilter } from "../../hooks/useFavouriteLineFilter";
import type { LiveRun, StationStatic } from "../../shared/types";

/** Banner treatment per severity, so a suspension never looks like a works notice. */
const BANNER_STYLES: Record<DisruptionSeverity, { card: string; body: string; heading: string; icon: typeof AlertTriangle }> = {
  critical: {
    card: "border-destructive-border/70 bg-destructive-surface text-destructive hover:border-destructive",
    body: "text-destructive/80",
    heading: "Major disruption on your lines",
    icon: AlertTriangle,
  },
  warning: {
    card: "border-warning-border/60 bg-warning-surface text-warning-foreground hover:border-warning-border",
    body: "text-warning-foreground/80",
    heading: "Delays on your lines",
    icon: AlertTriangle,
  },
  info: {
    card: "border-info-border/60 bg-info-surface text-info-foreground hover:border-info-border",
    body: "text-info-foreground/80",
    heading: "Alerts on your lines",
    icon: Info,
  },
};

interface CommuteSectionProps {
  commute: CommutePreferencesController;
  stationsById: Map<string, StationStatic>;
  runs: LiveRun[];
  lineNameById: Map<string, string>;
  lineColorById: Map<string, string>;
  lineFilter: FavouriteLineFilter;
  /** Current alert state across the lines relevant to this commuter. */
  disruptionSummary: LineDisruptionSummary;
  notificationsEnabled: boolean;
  generatedAtUtc: string | null;
  isDemo: boolean;
  onOpenSettings: () => void;
  onStationClick: (station: StationStatic) => void;
}

function freshnessLabel(generatedAtUtc: string | null, now: number): { text: string; stale: boolean } {
  const generatedAt = generatedAtUtc ? Date.parse(generatedAtUtc) : Number.NaN;
  if (!Number.isFinite(generatedAt)) return { text: "Waiting for live data…", stale: true };

  const ageMs = now - generatedAt;
  const stale = ageMs > LIVE_DATA_STALE_AFTER_MS;
  if (ageMs < 90_000) return { text: "Updated just now", stale };
  const minutes = Math.round(ageMs / 60_000);
  if (minutes < 60) return { text: `Updated ${minutes} min ago`, stale };
  return {
    text: `Updated ${new Date(generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
    stale,
  };
}

/**
 * The default landing area. Answers "when is my next train?" before anything
 * else, then surfaces alerts affecting the commuter's own lines.
 */
export function CommuteSection({
  commute,
  stationsById,
  runs,
  lineNameById,
  lineColorById,
  lineFilter,
  disruptionSummary,
  notificationsEnabled,
  generatedAtUtc,
  isDemo,
  onOpenSettings,
  onStationClick,
}: CommuteSectionProps) {
  const navigate = useSectionNavigation();
  const now = useNow(30_000);
  // The morning leg is the useful default before midday, the return leg after.
  const [direction, setDirection] = useState<CommuteDirection>(() => defaultCommuteDirection());

  const freshness = useMemo(() => freshnessLabel(generatedAtUtc, now), [generatedAtUtc, now]);

  const banner = disruptionSummary.worstSeverity ? BANNER_STYLES[disruptionSummary.worstSeverity] : null;
  // Name the worst-hit lines first, since those decide whether to travel at all.
  const bannerLineNames = useMemo(() => {
    const ordered = [
      ...disruptionSummary.criticalLineIds,
      ...disruptionSummary.lineIds.filter((lineId) => !disruptionSummary.criticalLineIds.includes(lineId)),
    ];
    return ordered.map((lineId) => lineNameById.get(lineId) ?? lineId).join(" · ");
  }, [disruptionSummary, lineNameById]);

  const stationId = commute.stationIdFor(direction);
  const station = stationId ? stationsById.get(stationId) : undefined;

  return (
    <SectionCard
      id="commute"
      title="My commute"
      description="Live departures from your stations"
      actions={
        <Button variant="outline" size="sm" onClick={onOpenSettings}>
          <Settings2 aria-hidden="true" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {isDemo && (
          <p
            role="status"
            className="flex items-start gap-2.5 rounded-lg border border-warning-border/60 bg-warning-surface px-3 py-2.5 text-xs text-warning-foreground"
          >
            <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">Sample data — do not plan a trip with this.</span> Live departures are
              unavailable right now, so the times below are made up.
            </span>
          </p>
        )}

        {commute.hasCommute ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SegmentedControl
                label="Commute direction"
                options={COMMUTE_DIRECTIONS.map((candidate) => ({ value: candidate, label: COMMUTE_DIRECTION_LABELS[candidate] }))}
                value={direction}
                onChange={setDirection}
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className={cn("flex items-center gap-1.5", freshness.stale ? "text-warning" : "text-muted-foreground")}>
                  <span className={cn("size-1.5 rounded-full", isDemo || freshness.stale ? "bg-warning" : "bg-success")} />
                  {isDemo ? "Sample preview" : freshness.text}
                </span>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {notificationsEnabled ? <Bell className="size-3" aria-hidden="true" /> : <BellOff className="size-3" aria-hidden="true" />}
                  Alerts {notificationsEnabled ? "on" : "off"}
                </button>
              </div>
            </div>

            {!isDemo && freshness.stale && <p className="text-[11px] text-warning">Departures may be out of date.</p>}

            {station ? (
              <DepartureBoard
                station={station}
                runs={runs}
                lineNameById={lineNameById}
                lineColorById={lineColorById}
                includesLine={lineFilter.includes}
                onStationClick={() => {
                  navigate("network");
                  onStationClick(station);
                }}
                onChangeStation={onOpenSettings}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background/40 p-5 text-center">
                <p className="text-sm font-medium">No {COMMUTE_DIRECTION_LABELS[direction].toLowerCase()} station yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Add one to see both legs of your commute here.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={onOpenSettings}>
                  Set station
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-center">
            <MapPinned className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">Set your commute stations</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Choose where you board heading into the city and heading home. Your next departures then appear here every
              time you open the app.
            </p>
            <Button size="sm" className="mt-4" onClick={onOpenSettings}>
              Choose stations
            </Button>
          </div>
        )}

        {banner && (
          <button
            type="button"
            onClick={() => navigate("alerts")}
            className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors", banner.card)}
          >
            <banner.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-xs">
              <span className="font-semibold">{banner.heading}</span>
              <span className={cn("block truncate", banner.body)}>{bannerLineNames}</span>
            </span>
            <span className="shrink-0 text-[11px] font-medium underline underline-offset-2">View</span>
          </button>
        )}
      </div>
    </SectionCard>
  );
}
