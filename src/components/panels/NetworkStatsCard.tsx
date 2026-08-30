import { Activity, AlertTriangle, MapPinned, TrainFront } from "lucide-react";
import { Card, CardContent } from "../ui/card";

/**
 * Live network statistics grid. Values update with the 30-second data poll;
 * static rendering avoids decorative animation on every refresh.
 */
export interface NetworkStatsCardProps {
  trainsRunning: number;
  linesActive: number;
  stationCount: number;
  disruptionCount: number;
}

export function NetworkStatsCard({ trainsRunning, linesActive, stationCount, disruptionCount }: NetworkStatsCardProps) {
  const stats = [
    { value: trainsRunning, label: "Trains running", icon: <TrainFront className="size-4 text-brand" /> },
    { value: linesActive, label: "Lines active", icon: <Activity className="size-4 text-success" /> },
    { value: stationCount, label: "Stations", icon: <MapPinned className="size-4 text-brand" /> },
    { value: disruptionCount, label: "Alerts now", icon: <AlertTriangle className="size-4 text-warning" /> },
  ];

  return (
    <Card className="relative overflow-hidden border-t-2 border-border border-t-brand bg-card/60 py-4 backdrop-blur-sm dark:bg-card/80">
      <CardContent className="px-4">
        <p className="type-label mb-3 text-muted-foreground">Live network stats</p>
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-background/40 py-3 text-center dark:bg-background/70">
              {stat.icon}
              <span className="type-data text-xl font-semibold tracking-tight text-foreground">{stat.value.toLocaleString()}</span>
              <span className="text-[11px] text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
