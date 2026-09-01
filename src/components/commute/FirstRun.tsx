import { useId, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpDown } from "lucide-react";
import trainLogo from "../../assets/train-logo.png";
import { APP_SHORT_TITLE, APP_TITLE } from "../../config";
import { CBD_QUICK_PICK_STATION_IDS } from "../../shared/commute";
import type { LineStatic, StationStatic } from "../../shared/types";
import { SearchableSelect, type SelectItem } from "../SearchableSelect";
import { Button } from "../ui/button";

interface FirstRunProps {
  stations: StationStatic[];
  lines: LineStatic[];
  initialHomeId?: string | null;
  initialWorkId?: string | null;
  onComplete: (homeStationId: string, workStationId: string) => void;
  /** Present when this is "change commute", so the rider can return to the board. */
  onCancel?: () => void;
}

/**
 * Official Metro colours for the stations in play. A hub like Flinders Street
 * carries many lines, so the strip is stacked rather than picking one.
 * Once both ends are set, shared lines come first — that is the commute.
 */
function accentColorsFor(
  home: StationStatic | undefined,
  work: StationStatic | undefined,
  colorByLineId: Map<string, string>,
): string[] {
  const shared = home && work
    ? home.lineIds.filter((id) => work.lineIds.includes(id))
    : [];
  const lineIds = shared.length > 0 ? shared : (home?.lineIds ?? work?.lineIds ?? []);
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const id of lineIds) {
    const color = colorByLineId.get(id);
    if (!color || seen.has(color)) continue;
    seen.add(color);
    colors.push(color);
  }
  return colors;
}

/**
 * The landing page. Two stations, one sentence, then the product.
 */
export function FirstRun({ stations, lines, initialHomeId, initialWorkId, onComplete, onCancel }: FirstRunProps) {
  const [homeId, setHomeId] = useState<string | null>(initialHomeId ?? null);
  const [workId, setWorkId] = useState<string | null>(initialWorkId ?? null);
  const homeFieldId = useId();
  const workFieldId = useId();

  const stationItems = useMemo<SelectItem[]>(
    () => stations.map((station) => ({ id: station.id, label: station.name })),
    [stations],
  );
  const colorByLineId = useMemo(() => new Map(lines.map((line) => [line.id, line.color])), [lines]);

  const home = homeId ? stations.find((station) => station.id === homeId) : undefined;
  const work = workId ? stations.find((station) => station.id === workId) : undefined;
  const accentColors = useMemo(
    () => accentColorsFor(home, work, colorByLineId),
    [home, work, colorByLineId],
  );

  const canContinue = Boolean(homeId && workId && homeId !== workId);

  return (
    <div className="relative mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-xl flex-col px-1 py-6">
      {accentColors.length > 0 && (
        <span
          aria-hidden="true"
          className="absolute inset-y-6 left-0 flex w-1.5 overflow-hidden rounded-full"
        >
          {accentColors.map((color) => (
            <span key={color} className="min-h-1 w-full flex-1" style={{ background: color }} />
          ))}
        </span>
      )}

      <div className={accentColors.length > 0 ? "flex min-h-0 flex-1 flex-col pl-5" : "flex min-h-0 flex-1 flex-col"}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mb-8 inline-flex items-center gap-1.5 self-start font-mono text-xs uppercase tracking-widest text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back
          </button>
        )}

        <div className="flex flex-1 flex-col justify-center py-4">
          <p className="type-label text-muted-foreground">Melbourne Metro</p>
          <div className="mt-4 flex items-center gap-3">
            <img src={trainLogo} alt="" width={193} height={108} className="h-10 w-auto select-none sm:h-12" />
            <h1 className="type-display text-4xl text-foreground sm:text-5xl">{APP_SHORT_TITLE}</h1>
          </div>
          <p className="mt-4 max-w-md text-base text-muted-foreground sm:text-lg">
            {onCancel
              ? "Pick a new home and destination, or go back to the board you already have."
              : "Tell it home and destination. After that, it is just your next train."}
          </p>
          <p className="sr-only">{APP_TITLE}</p>

          <div className="mt-10 flex flex-col">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={homeFieldId} className="type-label text-muted-foreground">
                Home
              </label>
              <SearchableSelect
                id={homeFieldId}
                items={stationItems}
                value={homeId}
                onChange={setHomeId}
                placeholder="Your station"
                quickPickIds={CBD_QUICK_PICK_STATION_IDS}
                label="Home station"
              />
            </div>
            <div className="flex justify-center py-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!homeId && !workId}
                onClick={() => {
                  setHomeId(workId);
                  setWorkId(homeId);
                }}
                aria-label="Swap home and destination"
              >
                <ArrowUpDown className="size-4" />
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={workFieldId} className="type-label text-muted-foreground">
                Destination
              </label>
              <SearchableSelect
                id={workFieldId}
                items={stationItems}
                value={workId}
                onChange={setWorkId}
                placeholder="Where you get off"
                quickPickIds={CBD_QUICK_PICK_STATION_IDS}
                label="Destination station"
              />
            </div>
          </div>

          <Button
            type="button"
            size="lg"
            disabled={!canContinue}
            onClick={() => {
              if (homeId && workId) onComplete(homeId, workId);
            }}
            className="mt-8 h-12 w-full text-sm font-semibold sm:w-auto"
          >
            Show my next train
          </Button>
        </div>
      </div>
    </div>
  );
}
