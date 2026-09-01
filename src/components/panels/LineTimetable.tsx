import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownToLine, CalendarDays, ChevronDown, LayoutGrid, List, TrainFront } from "lucide-react";
import { SearchableSelect, type SelectItem } from "../SearchableSelect";
import { ScopeChip } from "../ScopeChip";
import { CountAnnouncer } from "../CountAnnouncer";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useNow } from "../../hooks/useNow";
import { melbourneDateString, melbourneMinutesOfDay } from "../../shared/melbourneTime";
import { cn } from "../../lib/utils";
import type { NetworkTimetableData, TimetableDirection, TimetableService } from "../../shared/types";
import type { TimetableFocus } from "../../shared/timetableFocus";

const STATION_STORAGE_KEY = "wimt:timetableStation";
/** Matches the breakpoint the layout toggle itself appears at. */
const GRID_QUERY = "(min-width: 1024px)";
const ROW_HEIGHT = 44;
const OVERSCAN = 8;

interface LineTimetableProps {
  data: NetworkTimetableData | null;
  loading: boolean;
  error: Error | null;
  /**
   * The app-wide line scope. The timetable used to keep its own line under a
   * private storage key, so narrowing the app to one line changed every section
   * except this one.
   */
  scopeLineId: string | null;
  onClearScope: () => void;
  focus: TimetableFocus | null;
}

function persistedStation(): string | null {
  try {
    return localStorage.getItem(STATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function firstTime(service: TimetableService): number {
  return service.times.find((time): time is number => time !== null) ?? Number.POSITIVE_INFINITY;
}

export const LineTimetable = memo(function LineTimetable({
  data,
  loading,
  error,
  scopeLineId,
  onClearScope,
  focus,
}: LineTimetableProps) {
  const nowTimestamp = useNow(60_000);
  const now = useMemo(
    () => ({ date: melbourneDateString(new Date(nowTimestamp)), minute: melbourneMinutesOfDay(new Date(nowTimestamp)) }),
    [nowTimestamp],
  );

  const [localLineId, setLocalLineId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [directionId, setDirectionId] = useState("");
  const [stationId, setStationId] = useState<string | null>(persistedStation);
  // Null until the reader picks a layout, so the default can follow the screen
  // without overriding them afterwards. The grid is only the default where the
  // toggle exists to escape it: below `lg` there is no control, and a
  // horizontally scrolling table would be the only thing on offer.
  const [viewChoice, setViewChoice] = useState<"station" | "matrix" | null>(null);
  const isWide = useMediaQuery(GRID_QUERY);
  const view = viewChoice ?? (isWide ? "matrix" : "station");

  const lineId = scopeLineId ?? localLineId;
  const line = data?.lines.find((candidate) => candidate.id === lineId) ?? data?.lines[0];
  const direction = line?.directions.find((candidate) => candidate.id === directionId) ?? line?.directions[0];
  const dateIndex = data?.availableDates.indexOf(date) ?? -1;

  const services = useMemo(
    () => (dateIndex < 0 ? [] : (direction?.services ?? []).filter((service) => (service.dateMask & (1 << dateIndex)) !== 0)),
    [dateIndex, direction],
  );

  useEffect(() => {
    if (!data || data.lines.length === 0) return;
    if (!scopeLineId && !data.lines.some((candidate) => candidate.id === localLineId)) setLocalLineId(data.lines[0].id);
    if (!date) setDate(now.date);
  }, [data, date, localLineId, scopeLineId, now.date]);

  useEffect(() => {
    if (line && !line.directions.some((candidate) => candidate.id === directionId)) {
      setDirectionId(line.directions[0]?.id ?? "");
    }
  }, [line, directionId]);

  // A station saved from another line, or one this direction does not serve,
  // silently produces an empty list; fall back to the direction's own busiest
  // end instead.
  useEffect(() => {
    if (!direction) return;
    if (!stationId || !direction.stationIds.includes(stationId)) {
      setStationId(direction.stationIds[0] ?? null);
    }
  }, [direction, stationId]);

  const chooseStation = useCallback((nextId: string | null) => {
    setStationId(nextId);
    try {
      if (nextId) localStorage.setItem(STATION_STORAGE_KEY, nextId);
    } catch {
      // Persistence is optional.
    }
  }, []);

  // A cross-link from a departure row sets every control at once.
  useEffect(() => {
    if (!focus || !data) return;
    if (!scopeLineId) setLocalLineId(focus.lineId);
    setDirectionId(focus.directionId);
    setStationId(focus.stationId);
    // A cross-link is about one station, and the station list is where the
    // linked service gets highlighted.
    setViewChoice("station");
    setDate(now.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.requestedAt]);

  if (loading) return <PanelMessage icon={<TrainFront />} title="Loading daily timetable…" />;
  if (error || !data) {
    return (
      <PanelMessage
        icon={<AlertTriangle />}
        title="Timetable unavailable"
        detail={error?.message ?? "The scheduled data file could not be loaded."}
      />
    );
  }
  if (data.lines.length === 0 || !line) {
    return <PanelMessage icon={<AlertTriangle />} title="No timetable lines available" detail="The latest generation did not contain usable services." />;
  }

  const dateAvailable = data.availableDates.includes(date);
  const nearestDate = data.availableDates[0];
  const staleMs = nowTimestamp - Date.parse(data.generatedAtUtc);
  const stale = Number.isFinite(staleMs) && staleMs > 36 * 60 * 60_000;

  const lineItems: SelectItem[] = data.lines.map((candidate) => ({ id: candidate.id, label: candidate.name, color: candidate.color }));
  const stationItems: SelectItem[] = (direction?.stationIds ?? []).map((id, index) => ({
    id,
    label: direction?.stationNames[index] ?? id,
  }));

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 space-y-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {scopeLineId ? (
            <ScopeChip label={`${line.name} line`} color={line.color} onClear={onClearScope} />
          ) : (
            <SearchableSelect
              items={lineItems}
              value={line.id}
              onChange={(next) => next && setLocalLineId(next)}
              placeholder="Choose a line"
              label="Metro line"
              size="sm"
              className="w-[10rem]"
            />
          )}

          <label className="relative">
            <span className="sr-only">Service date</span>
            <CalendarDays className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <select
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="type-numeric h-8 appearance-none rounded-md border border-input bg-background pr-7 pl-7 text-xs"
            >
              {!dateAvailable && date && <option value={date}>{formatDate(date)} unavailable</option>}
              {data.availableDates.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {formatDate(candidate)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </label>

          {/* The matrix is a data table, which WCAG 1.4.10 excepts from reflow.
              That permits a horizontally scrolling table on a wide screen; it
              does not make one a reasonable default on a phone. */}
          <div className="ml-auto hidden items-center gap-1 lg:flex" role="group" aria-label="Timetable layout">
            <ViewToggle current={view} value="station" onSelect={setViewChoice} icon={List} label="By station" />
            <ViewToggle current={view} value="matrix" onSelect={setViewChoice} icon={LayoutGrid} label="Full grid" />
          </div>
        </div>

        {/* A radio group, not a tablist: these buttons select a value, they do
            not reveal one of several panels, and the old markup declared
            role="tablist" without any of the tab semantics that implies. */}
        <div
          className="flex gap-1 overflow-x-auto pb-0.5"
          role="radiogroup"
          aria-label="Direction"
          onKeyDown={(event) => {
            const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
              : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1
                : 0;
            if (step === 0) return;
            event.preventDefault();
            const ids = line.directions.map((candidate) => candidate.id);
            const current = ids.indexOf(direction?.id ?? ids[0]);
            const next = ids[(current + step + ids.length) % ids.length];
            setDirectionId(next);
            event.currentTarget.querySelector<HTMLButtonElement>(`[data-direction="${next}"]`)?.focus();
          }}
        >
          {line.directions.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="radio"
              data-direction={candidate.id}
              aria-checked={candidate.id === direction?.id}
              // Roving tabindex: a radio group is one stop in the tab order,
              // and the arrow keys move within it.
              tabIndex={candidate.id === direction?.id ? 0 : -1}
              onClick={() => setDirectionId(candidate.id)}
              className={cn(
                "min-h-9 min-w-0 flex-1 rounded-md border px-2 py-1.5 text-2xs leading-tight font-medium transition-colors",
                candidate.id === direction?.id ? "border-foreground/30 bg-foreground text-background" : "border-border bg-background hover:bg-accent",
              )}
            >
              {candidate.label}
            </button>
          ))}
        </div>

        {view === "station" && direction && (
          <SearchableSelect
            items={stationItems}
            value={stationId}
            onChange={chooseStation}
            placeholder="Choose a station"
            label="Station"
            size="sm"
            className="w-full sm:w-[11rem]"
          />
        )}

        {(data.source.partial || stale) && (
          <p className="rounded-md border border-warning-border/60 bg-warning/10 px-2 py-1.5 text-2xs leading-snug text-warning">
            {data.source.partial
              ? "Some timetable data was unavailable during generation."
              : "This timetable is older than expected; verify service times with PTV."}
          </p>
        )}
      </header>

      {!dateAvailable ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
          <CalendarDays className="mb-2 size-5 text-muted-foreground" />
          <p className="text-sm font-semibold">No timetable for {formatDate(date)}</p>
          <p className="mt-1 text-2xs text-muted-foreground">The published artifact does not include this Melbourne date.</p>
          {nearestDate && (
            <button
              type="button"
              onClick={() => setDate(nearestDate)}
              className="mt-3 min-h-11 rounded-md border border-border bg-background px-3 text-2xs font-semibold hover:bg-accent"
            >
              Use {formatDate(nearestDate)}
            </button>
          )}
        </div>
      ) : !direction ? (
        <PanelMessage icon={<TrainFront />} title="No direction available" />
      ) : view === "matrix" ? (
        <MatrixView line={line} direction={direction} services={services} date={date} />
      ) : (
        <StationView
          key={`${line.id}:${direction.id}:${stationId}:${date}`}
          direction={direction}
          services={services}
          stationId={stationId}
          lineName={line.name}
          date={date}
          isToday={date === now.date}
          nowMinute={now.minute}
          focusServiceId={focus?.serviceId ?? null}
        />
      )}
    </div>
  );
});

function ViewToggle({
  current,
  value,
  onSelect,
  icon: Icon,
  label,
}: {
  current: string;
  value: "station" | "matrix";
  onSelect: (value: "station" | "matrix") => void;
  icon: typeof List;
  label: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(value)}
      className={cn(
        "flex min-h-8 items-center gap-1.5 rounded-md border px-2 text-2xs font-medium transition-colors",
        active ? "border-foreground/30 bg-foreground text-background" : "border-border bg-background hover:bg-accent",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

interface StationDeparture {
  service: TimetableService;
  minutes: number;
}

/**
 * The primary view: one station's departures as a single column of times.
 *
 * This also dissolves the express-labelling problem the matrix has. A service
 * that skips your station is simply absent from your list, which needs no
 * annotation and cannot be misread.
 */
function StationView({
  direction,
  services,
  stationId,
  lineName,
  date,
  isToday,
  nowMinute,
  focusServiceId,
}: {
  direction: TimetableDirection;
  services: TimetableService[];
  stationId: string | null;
  lineName: string;
  date: string;
  isToday: boolean;
  nowMinute: number;
  focusServiceId: string | null;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nowAnchorRef = useRef<HTMLLIElement>(null);

  const column = stationId ? direction.stationIds.indexOf(stationId) : -1;
  const stationName = column >= 0 ? direction.stationNames[column] : "";

  const departures = useMemo<StationDeparture[]>(() => {
    if (column < 0) return [];
    const result: StationDeparture[] = [];
    for (const service of services) {
      const minutes = service.times[column];
      if (minutes === null) continue;
      result.push({ service, minutes });
    }
    return result.sort((a, b) => a.minutes - b.minutes || a.service.id.localeCompare(b.service.id));
  }, [services, column]);

  /** Index of the first departure at or after now; where the "now" line goes. */
  const nowIndex = useMemo(
    () => (isToday ? departures.findIndex((departure) => departure.minutes >= nowMinute) : -1),
    [departures, isToday, nowMinute],
  );

  const jumpToNow = useCallback(() => {
    nowAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Positioned once for this selection, then left alone. Re-anchoring on every
  // minute tick would yank the list out from under anyone reading it — which is
  // why the jump control is persistent rather than automatic.
  useEffect(() => {
    const anchor = nowAnchorRef.current;
    const scroller = scrollerRef.current;
    if (!anchor || !scroller) return;
    scroller.scrollTop = Math.max(0, anchor.offsetTop - scroller.clientHeight / 3);
  }, []);

  if (column < 0) return <PanelMessage icon={<TrainFront />} title="Choose a station" detail="Pick a station to see its departures." />;

  if (departures.length === 0) {
    return (
      <PanelMessage
        icon={<TrainFront />}
        title={`No ${lineName} departures from ${stationName}`}
        detail={`Nothing is published for ${formatDate(date)} in this direction.`}
      />
    );
  }

  let lastHour = -1;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <CountAnnouncer
        message={`${departures.length} ${departures.length === 1 ? "departure" : "departures"} from ${stationName}, ${direction.label}, ${formatDate(date)}`}
      />
      <div
        ref={scrollerRef}
        className="thin-scrollbar min-h-0 flex-1 overflow-y-auto"
        // Focusable so the list can be scrolled without a pointer, and labelled
        // as a group so that stop is announced as something rather than as a
        // bare focus move.
        tabIndex={0}
        role="group"
        aria-label={`${lineName} departures from ${stationName}, ${direction.label}, ${formatDate(date)}`}
      >
        <ul className="pb-16">
          {departures.map((departure, index) => {
            const hour = Math.floor(departure.minutes / 60);
            const startsHour = hour !== lastHour;
            lastHour = hour;
            const isNext = index === nowIndex;
            const isPast = isToday && departure.minutes < nowMinute;
            const isFocused = focusServiceId !== null && departure.service.id === focusServiceId;

            return (
              <li key={departure.service.id} ref={isNext ? nowAnchorRef : undefined}>
                {startsHour && (
                  <p className="type-label sticky top-0 z-10 border-y border-border bg-muted px-3 py-1 text-muted-foreground">
                    {formatHour(hour)}
                  </p>
                )}
                {isNext && (
                  <p className="flex items-center gap-2 px-3 pt-2 text-2xs font-semibold text-brand">
                    <span className="h-px flex-1 bg-brand/40" aria-hidden="true" />
                    Now
                    <span className="h-px flex-1 bg-brand/40" aria-hidden="true" />
                  </p>
                )}
                <div
                  className={cn(
                    "flex min-h-11 items-center gap-3 border-b border-border/60 px-3 py-2",
                    isPast && "opacity-45",
                    isFocused && "bg-primary/10",
                  )}
                  aria-current={isFocused ? "true" : undefined}
                >
                  <span className="type-data w-16 shrink-0 text-sm font-semibold">{formatTime(departure.minutes)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{departure.service.destination}</span>
                    <span className="block truncate text-2xs text-muted-foreground">from {departure.service.origin}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {nowIndex >= 0 && (
        <button
          type="button"
          onClick={jumpToNow}
          className="absolute right-3 bottom-3 flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-2xs font-semibold shadow-lg transition-colors hover:bg-accent"
        >
          <ArrowDownToLine className="size-3.5" aria-hidden="true" />
          Jump to now
        </button>
      )}
    </div>
  );
}

/** The full service-by-station grid, kept for wide screens. */
function MatrixView({
  line,
  direction,
  services,
  date,
}: {
  line: { name: string };
  direction: TimetableDirection;
  services: TimetableService[];
  date: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (services.length === 0) {
    return (
      <PanelMessage
        icon={<TrainFront />}
        title="No scheduled services"
        detail={`No ${line.name} services are published for ${formatDate(date)} in this direction.`}
      />
    );
  }

  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const visibleEnd = Math.min(services.length, visibleStart + visibleCount);
  const visibleServices = services.slice(visibleStart, visibleEnd);

  return (
    <div
      ref={scrollerRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className="thin-scrollbar min-h-0 flex-1 overflow-auto"
      tabIndex={0}
      role="group"
      aria-label={`${line.name} line timetable grid, ${direction.label}, ${formatDate(date)}`}
    >
      <table className="type-numeric w-max min-w-full border-separate border-spacing-0 text-2xs">
        <caption className="sr-only">
          {line.name} line, {direction.label}, {formatDate(date)}. Departure times in Melbourne time; each row is one service and
          each column one station.
        </caption>
        <thead className="sticky top-0 z-20">
          <tr>
            <th scope="col" className="sticky left-0 z-30 min-w-[8.5rem] border-r border-b border-border bg-muted px-2 py-2 text-left font-semibold">
              Service
            </th>
            {direction.stationNames.map((station, index) => (
              <th
                key={`${direction.stationIds[index]}-${index}`}
                scope="col"
                className="h-16 w-[5.5rem] min-w-[5.5rem] border-r border-b border-border bg-muted px-1 py-1 text-center align-bottom font-semibold"
              >
                <span className="inline-block max-w-[5rem] leading-tight">{station}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleStart > 0 && (
            <tr aria-hidden="true">
              <td colSpan={direction.stationIds.length + 1} style={{ height: visibleStart * ROW_HEIGHT }} />
            </tr>
          )}
          {visibleServices.map((service) => (
            <tr key={service.id} className="h-11">
              <th scope="row" className="sticky left-0 z-10 max-w-[8.5rem] border-r border-b border-border bg-card px-2 py-1.5 text-left">
                <span className="type-data block font-medium">{formatTime(firstTime(service))}</span>
                <span className="block truncate text-2xs font-normal text-muted-foreground">to {service.destination}</span>
              </th>
              {/* No aria-label on the cells: several screen readers treat it as a
                  replacement for the cell's content rather than an addition, so
                  the time itself would stop being announced. The row and column
                  headers already supply the context. */}
              {service.times.map((time, stationIndex) => (
                <td key={stationIndex} className="type-data border-r border-b border-border/70 px-1 py-1 text-center">
                  {time === null ? (
                    <span className="text-muted-foreground/60">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">Does not stop</span>
                    </span>
                  ) : (
                    formatTime(time)
                  )}
                </td>
              ))}
            </tr>
          ))}
          {visibleEnd < services.length && (
            <tr aria-hidden="true">
              <td colSpan={direction.stationIds.length + 1} style={{ height: (services.length - visibleEnd) * ROW_HEIGHT }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PanelMessage({ icon, title, detail }: { icon: React.ReactNode; title: string; detail?: string }) {
  return (
    <div className="flex h-full min-h-[18rem] flex-col items-center justify-center px-5 text-center">
      <span className="mb-2 text-muted-foreground [&>svg]:size-5">{icon}</span>
      <p className="type-heading text-sm">{title}</p>
      {detail && <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{detail}</p>}
    </div>
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

/** Hour headings run past 24 because GTFS keeps after-midnight calls on their own service day. */
function formatHour(hour: number): string {
  const wrapped = hour % 24;
  const suffix = wrapped >= 12 ? "pm" : "am";
  const label = `${wrapped % 12 || 12} ${suffix}`;
  return hour >= 24 ? `${label} (next day)` : label;
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? date
    : new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(parsed);
}
