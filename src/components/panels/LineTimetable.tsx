import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, Clock3, TrainFront } from "lucide-react";
import { useNow } from "../../hooks/useNow";
import { cn } from "../../lib/utils";
import type {
  LineDisruption,
  NetworkTimetableData,
  TimetableService,
} from "../../shared/types";

const LINE_STORAGE_KEY = "wimt:timetableLine";
const ROW_HEIGHT = 44;
const OVERSCAN = 8;

interface LineTimetableProps {
  data: NetworkTimetableData | null;
  loading: boolean;
  error: Error | null;
  disruptionsByLine: Record<string, LineDisruption[]>;
}

function persistedLine(): string {
  try {
    return localStorage.getItem(LINE_STORAGE_KEY) || "lilydale";
  } catch {
    return "lilydale";
  }
}

function melbourneNow(timestamp: number): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minute: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function firstTime(service: TimetableService): number {
  return service.times.find((time): time is number => time !== null) ?? Number.POSITIVE_INFINITY;
}

function lastTime(service: TimetableService): number {
  for (let index = service.times.length - 1; index >= 0; index -= 1) {
    const time = service.times[index];
    if (time !== null) return time;
  }
  return Number.NEGATIVE_INFINITY;
}

function relevantServiceIndex(services: TimetableService[], nowMinute: number): number {
  const active = services.findIndex((service) => firstTime(service) <= nowMinute && lastTime(service) >= nowMinute);
  if (active >= 0) return active;
  const next = services.findIndex((service) => firstTime(service) >= nowMinute);
  return next >= 0 ? next : Math.max(0, services.length - 1);
}

export const LineTimetable = memo(function LineTimetable({
  data,
  loading,
  error,
  disruptionsByLine,
}: LineTimetableProps) {
  const nowTimestamp = useNow(60_000);
  const now = useMemo(() => melbourneNow(nowTimestamp), [nowTimestamp]);
  const [lineId, setLineId] = useState(persistedLine);
  const [date, setDate] = useState("");
  const [directionId, setDirectionId] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const line = data?.lines.find((candidate) => candidate.id === lineId) ?? data?.lines[0];
  const direction = line?.directions.find((candidate) => candidate.id === directionId) ?? line?.directions[0];
  const dateIndex = data?.availableDates.indexOf(date) ?? -1;
  const services = useMemo(
    () => dateIndex < 0 ? [] : (direction?.services ?? []).filter((service) => (service.dateMask & (1 << dateIndex)) !== 0),
    [dateIndex, direction],
  );
  const isCurrentDate = date === now.date;
  const highlightedIndex = isCurrentDate && services.length > 0 ? relevantServiceIndex(services, now.minute) : -1;

  useEffect(() => {
    if (!data || data.lines.length === 0) return;
    const nextLine = data.lines.some((candidate) => candidate.id === lineId) ? lineId : data.lines[0].id;
    if (nextLine !== lineId) setLineId(nextLine);
    if (!date) setDate(now.date);
  }, [data, date, lineId, now.date]);

  useEffect(() => {
    if (!line) return;
    if (!line.directions.some((candidate) => candidate.id === directionId)) {
      setDirectionId(line.directions[0]?.id ?? "");
    }
    setAlertsOpen(false);
  }, [line, directionId]);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Reposition only when the selection changes; minute ticks must not move the viewport.
  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const index = date === now.date && services.length > 0 ? relevantServiceIndex(services, now.minute) : 0;
    element.scrollTop = Math.max(0, index * ROW_HEIGHT - 80);
    setScrollTop(element.scrollTop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id, date, direction?.id]);

  if (loading) return <PanelMessage icon={<TrainFront />} title="Loading daily timetable…" />;
  if (error || !data) {
    return <PanelMessage icon={<AlertTriangle />} title="Timetable unavailable" detail={error?.message ?? "The scheduled data file could not be loaded."} />;
  }
  if (data.lines.length === 0 || !line) {
    return <PanelMessage icon={<AlertTriangle />} title="No timetable lines available" detail="The latest generation did not contain usable services." />;
  }

  const dateAvailable = data.availableDates.includes(date);
  const nearestDate = data.availableDates[0];
  const alerts = disruptionsByLine[line.id] ?? [];
  const staleMs = nowTimestamp - Date.parse(data.generatedAtUtc);
  const stale = Number.isFinite(staleMs) && staleMs > 36 * 60 * 60_000;
  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const visibleEnd = Math.min(services.length, visibleStart + visibleCount);
  const visibleServices = services.slice(visibleStart, visibleEnd);

  const chooseLine = (nextLineId: string) => {
    setLineId(nextLineId);
    try {
      localStorage.setItem(LINE_STORAGE_KEY, nextLineId);
    } catch {
      // Persistence is optional.
    }
  };

  return (
    <section aria-labelledby="line-timetable-title" className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="shrink-0 border-b border-border bg-card/95 px-3 py-3">
        <div className="type-label mb-1 flex items-center gap-1.5 text-muted-foreground">
          <Clock3 className="size-3" aria-hidden="true" />
          Scheduled daily services
        </div>
        <h2 id="line-timetable-title" className="type-heading text-lg leading-tight">Line timetable</h2>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label className="min-w-0">
            <span className="sr-only">Metro line</span>
            <span className="relative block">
              <span className="pointer-events-none absolute top-1/2 left-2.5 size-2.5 -translate-y-1/2 rounded-[3px]" style={{ backgroundColor: line.color }} />
              <select value={line.id} onChange={(event) => chooseLine(event.target.value)} className="h-9 w-full appearance-none rounded-md border border-input bg-background pr-7 pl-7 text-xs font-semibold">
                {data.lines.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            </span>
          </label>
          <label className="relative">
            <span className="sr-only">Service date</span>
            <CalendarDays className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <select value={date} onChange={(event) => setDate(event.target.value)} className="type-numeric h-9 appearance-none rounded-md border border-input bg-background pr-7 pl-7 text-xs">
              {!dateAvailable && date && <option value={date}>{formatDate(date)} unavailable</option>}
              {data.availableDates.map((candidate) => <option key={candidate} value={candidate}>{formatDate(candidate)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </label>
        </div>

        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5" role="tablist" aria-label="Direction">
          {line.directions.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={candidate.id === direction?.id}
              onClick={() => setDirectionId(candidate.id)}
              className={cn(
                "min-h-9 min-w-0 flex-1 rounded-md border px-2 py-1.5 text-[11px] leading-tight font-medium transition-colors",
                candidate.id === direction?.id ? "border-foreground/30 bg-foreground text-background" : "border-border bg-background hover:bg-accent",
              )}
            >
              {candidate.label}
            </button>
          ))}
        </div>

        {alerts.length > 0 && (
          <div className="mt-2 rounded-md border border-warning-border/60 bg-warning-surface">
            <button type="button" onClick={() => setAlertsOpen((value) => !value)} aria-expanded={alertsOpen} className="flex min-h-9 w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-medium text-warning-foreground">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span className="flex-1">{alerts.length} current line alert{alerts.length === 1 ? "" : "s"}</span>
              <ChevronDown className={cn("size-3 transition-transform", alertsOpen && "rotate-180")} />
            </button>
            {alertsOpen && <div className="space-y-2 border-t border-warning-border/50 px-2 py-2">{alerts.map((alert) => <p key={alert.id} className="text-[11px] leading-relaxed text-warning-foreground">{alert.title}</p>)}</div>}
          </div>
        )}

        {(data.source.partial || stale) && (
          <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
            {data.source.partial ? "Some timetable data was unavailable during generation." : "This timetable is older than expected; verify service times with PTV."}
          </p>
        )}
      </header>

      {!dateAvailable ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
          <CalendarDays className="mb-2 size-5 text-muted-foreground" />
          <p className="text-sm font-semibold">No timetable for {formatDate(date)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">The published artifact does not include this Melbourne date.</p>
          {nearestDate && <button type="button" onClick={() => setDate(nearestDate)} className="mt-3 rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-semibold hover:bg-accent">Use {formatDate(nearestDate)}</button>}
        </div>
      ) : !direction ? (
        <PanelMessage icon={<TrainFront />} title="No direction available" />
      ) : services.length === 0 ? (
        <PanelMessage icon={<TrainFront />} title="No scheduled services" detail={`No ${line.name} services are published for ${formatDate(date)} in this direction.`} />
      ) : (
        <div
          ref={scrollerRef}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          className="thin-scrollbar min-h-0 flex-1 overflow-auto"
          tabIndex={0}
          aria-label={`${line.name} ${direction.label} timetable for ${formatDate(date)}`}
        >
          <table className="type-numeric w-max min-w-full border-separate border-spacing-0 text-[11px]">
            <thead className="sticky top-0 z-20">
              <tr>
                <th scope="col" className="sticky left-0 z-30 min-w-[7.5rem] border-r border-b border-border bg-muted px-2 py-2 text-left font-semibold">Service</th>
                {direction.stationNames.map((station, index) => (
                  <th key={`${direction.stationIds[index]}-${index}`} scope="col" className="h-16 w-[4.75rem] min-w-[4.75rem] border-r border-b border-border bg-muted px-1 py-1 text-center align-bottom font-semibold">
                    <span className="inline-block max-w-[4.3rem] leading-tight">{station}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleStart > 0 && <tr aria-hidden="true"><td colSpan={direction.stationIds.length + 1} style={{ height: visibleStart * ROW_HEIGHT }} /></tr>}
              {visibleServices.map((service, localIndex) => {
                const index = visibleStart + localIndex;
                const highlighted = index === highlightedIndex;
                return (
                  <tr key={service.id} className={cn("h-11", highlighted && "bg-primary/10")} aria-current={highlighted ? "time" : undefined}>
                    <th scope="row" className={cn("sticky left-0 z-10 max-w-[7.5rem] border-r border-b border-border px-2 py-1.5 text-left", highlighted ? "bg-accent" : "bg-card")}>
                      <span className="type-data block font-medium">{formatTime(firstTime(service))}</span>
                      <span className="block truncate text-[11px] font-normal text-muted-foreground" title={`${service.origin} to ${service.destination}`}>to {service.destination}</span>
                    </th>
                    {service.times.map((time, stationIndex) => (
                      <td key={stationIndex} className="type-data border-r border-b border-border/70 px-1 py-1 text-center" aria-label={time === null ? `${direction.stationNames[stationIndex]}: service does not stop` : `${direction.stationNames[stationIndex]}: ${fullTimeLabel(date, time)}`}>
                        {time === null ? <span className="text-muted-foreground/60">—</span> : formatTime(time)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {visibleEnd < services.length && <tr aria-hidden="true"><td colSpan={direction.stationIds.length + 1} style={{ height: (services.length - visibleEnd) * ROW_HEIGHT }} /></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
});

function PanelMessage({ icon, title, detail }: { icon: React.ReactNode; title: string; detail?: string }) {
  return (
    <section className="flex h-full min-h-[18rem] flex-col items-center justify-center rounded-xl border border-border bg-card px-5 text-center shadow-sm">
      <span className="mb-2 text-muted-foreground [&>svg]:size-5">{icon}</span>
      <h2 className="type-heading text-sm">{title}</h2>
      {detail && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>}
    </section>
  );
}

function formatTime(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  const wholeMinutes = Math.floor(minutes);
  const hour = Math.floor(wholeMinutes / 60) % 24;
  const minute = wholeMinutes % 60;
  const suffix = hour >= 12 ? "pm" : "am";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")}${suffix}`;
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? date
    : new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(parsed);
}

function fullTimeLabel(serviceDate: string, minutes: number): string {
  const dayOffset = Math.floor(minutes / 1440);
  const date = new Date(`${serviceDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  const dateLabel = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  return `${formatTime(minutes)}, ${dateLabel} Melbourne time`;
}
