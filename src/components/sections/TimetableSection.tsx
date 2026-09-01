import { SectionCard } from "../layout/SectionCard";
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
 * Scheduled services. The card supplies the heading; this only bounds the
 * height so the departure list and the grid have a scroll container.
 */
export function TimetableSection({ data, loading, error, scopeLineId, onClearScope, focus }: TimetableSectionProps) {
  return (
    <SectionCard
      id="timetable"
      title="Timetable"
      description="Every scheduled service, by station"
      bodyClassName="h-[34rem] lg:h-[40rem]"
    >
      <LineTimetable
        data={data}
        loading={loading}
        error={error}
        scopeLineId={scopeLineId}
        onClearScope={onClearScope}
        focus={focus}
      />
    </SectionCard>
  );
}
