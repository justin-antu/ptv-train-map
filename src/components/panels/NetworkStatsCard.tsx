import { Activity, AlertTriangle, MapPinned, TrainFront } from "lucide-react";
import { Card, CardContent } from "../ui/card";

/**
 * Live network stats grid, wired to this app's real live/static data. Lives
 * in the right pane, which was previously just a "coming soon" placeholder.
 *
 * Deliberately static (no per-mount spring/count-up animation, no animated
 * border): the underlying numbers already refresh every ~30s from the live
 * data poll, so a plain, instantly-readable number is both cheaper and more
 * honest than a decorative animation with no functional purpose.
 */
export interface NetworkStatsCardProps {
  trainsRunning: number;
  linesActive: number;
  stationCount: number;
  disruptionCount: number;
}

const STAT_ICON_CLASS = "size-4 text-primary";

export function NetworkStatsCard({ trainsRunning, linesActive, stationCount, disruptionCount }: NetworkStatsCardProps) {
  const stats = [
    { value: trainsRunning, label: "Trains running", icon: <TrainFront className={STAT_ICON_CLASS} /> },
    { value: linesActive, label: "Lines active", icon: <Activity className={STAT_ICON_CLASS} /> },
    { value: stationCount, label: "Stations", icon: <MapPinned className={STAT_ICON_CLASS} /> },
    { value: disruptionCount, label: "Alerts now", icon: <AlertTriangle className={STAT_ICON_CLASS} /> },
  ];

  return (
    <Card className="relative overflow-hidden border-t-2 border-border border-t-sky-400 bg-card/60 py-4 backdrop-blur-sm">
      <CardContent className="px-4">
        <p className="mb-3 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Live network stats</p>
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-background/40 py-3 text-center">
              {stat.icon}
              <span className="font-mono text-xl font-semibold tracking-tight text-foreground">{stat.value.toLocaleString()}</span>
              <span className="text-[10.5px] text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
