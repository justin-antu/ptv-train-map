import { useEffect, useRef } from "react";
import { motion, useInView, useSpring, useTransform } from "motion/react";
import { Activity, AlertTriangle, MapPinned, TrainFront } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { BorderBeam } from "../ui/border-beam";

/**
 * Live network stats grid — adapted from Magic UI Pro's "stats-3" landing-page
 * block (spring-animated number cards via Motion's useSpring/useTransform,
 * triggered once the card scrolls into view) but wired to this app's real
 * live/static data instead of the block's hard-coded marketing placeholder
 * numbers. Lives in the right pane, which was previously just a "coming soon"
 * placeholder.
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
    <Card className="relative overflow-hidden border-border bg-card/60 py-4 backdrop-blur-sm">
      <BorderBeam size={80} duration={10} colorFrom="#38bdf8" colorTo="#818cf8" />
      <CardContent className="px-4">
        <p className="mb-3 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Live network stats</p>
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <AnimatedStat key={stat.label} {...stat} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface AnimatedStatProps {
  value: number;
  label: string;
  icon: React.ReactNode;
}

function AnimatedStat({ value, label, icon }: AnimatedStatProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const spring = useSpring(0, { duration: 1200 });
  const displayValue = useTransform(spring, (current) => Math.floor(current).toLocaleString());

  useEffect(() => {
    if (isInView) spring.set(value);
  }, [isInView, spring, value]);

  return (
    <div ref={ref} className="flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-background/40 py-3 text-center">
      {icon}
      <motion.span className="font-mono text-xl font-semibold tracking-tight text-foreground" initial={{ opacity: 0, y: 8 }} animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }} transition={{ duration: 0.4 }}>
        {displayValue}
      </motion.span>
      <span className="text-[10.5px] text-muted-foreground">{label}</span>
    </div>
  );
}
