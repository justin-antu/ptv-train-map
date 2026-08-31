import { Activity, TrainFront } from "lucide-react";
import { Card, CardContent } from "../ui/card";

/**
 * Live network statistics grid. Values update with the 30-second data poll;
 * static rendering avoids decorative animation on every refresh.
 *
 * Only figures that actually move and are not already in the chrome. A station
 * count is a constant, and an alert count here read from the unscoped total, so
 * it disagreed with the alerts feed below whenever a line scope was set.
 */
export interface NetworkStatsCardProps {
  trainsRunning: number;
  linesActive: number;
}

export function NetworkStatsCard({ trainsRunning, linesActive }: NetworkStatsCardProps) {
  const stats = [
    { value: trainsRunning, label: "Trains running", icon: <TrainFront className="size-4 text-brand" /> },
    { value: linesActive, label: "Lines active", icon: <Activity className="size-4 text-success" /> },
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
              <span className="text-2xs text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
