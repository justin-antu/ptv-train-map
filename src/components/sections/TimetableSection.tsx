import { BoardBlock } from "../layout/BoardBlock";
import { LineTimetable } from "../panels/LineTimetable";
import type { NetworkTimetableData } from "../../shared/types";
import type { TimetableFocus } from "../../shared/timetableFocus";

interface TimetableSectionProps {
  data: NetworkTimetableData | null;
  loading: boolean;
  error: Error | null;
  scopeLineId: string | null;
  onClearScope: () => void;
  focus: TimetableFocus | null;
}

/**
 * Scheduled services in the same paper block as the home departure card.
 */
export function TimetableSection({ data, loading, error, scopeLineId, onClearScope, focus }: TimetableSectionProps) {
  const accent = (scopeLineId && data?.lines.find((line) => line.id === scopeLineId)?.color)
    || "hsl(var(--brand))";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="type-label text-muted-foreground">Timetable</p>
        <p className="mt-1 text-sm text-muted-foreground">Every scheduled service, by station</p>
      </div>
      <BoardBlock accent={accent} className="flex h-[34rem] flex-col lg:h-[40rem]">
        <div className="flex min-h-0 flex-1 flex-col p-3 pl-5 sm:p-4">
          <LineTimetable
            data={data}
            loading={loading}
            error={error}
            scopeLineId={scopeLineId}
            onClearScope={onClearScope}
            focus={focus}
          />
        </div>
      </BoardBlock>
    </div>
  );
}
