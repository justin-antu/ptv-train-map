import { Activity, TrainFront } from "lucide-react";

/**
 * Two glanceable network figures. They sit on Home as their own tiles,
 * not attached to the map.
 */
export interface NetworkStatsCardProps {
  trainsRunning: number;
  linesActive: number;
}

export function NetworkStatsCard({ trainsRunning, linesActive }: NetworkStatsCardProps) {
  const stats = [
    { value: trainsRunning, label: "Trains running", icon: <TrainFront className="size-4 text-brand" /> },
    { value: linesActive, label: "Lines active", icon: <Activity className="size-4 text-[hsl(152_55%_48%)]" /> },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-col items-center gap-1.5 rounded-sm border border-border/70 bg-card/60 px-3 py-4 text-center"
        >
          {stat.icon}
          <span className="type-data text-xl font-semibold tracking-tight text-foreground">
            {stat.value.toLocaleString()}
          </span>
          <span className="text-2xs text-muted-foreground">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
