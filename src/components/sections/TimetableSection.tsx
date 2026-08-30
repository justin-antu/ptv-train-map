import { SectionCard } from "../layout/SectionCard";
import { LineTimetable } from "../panels/LineTimetable";
import type { LineDisruption, NetworkTimetableData } from "../../shared/types";

interface TimetableSectionProps {
  data: NetworkTimetableData | null;
  loading: boolean;
  error: Error | null;
  disruptionsByLine: Record<string, LineDisruption[]>;
}

/**
 * Scheduled services. The card supplies the heading; this only bounds the
 * height so the virtualized grid has a scroll container to work against.
 */
export function TimetableSection({ data, loading, error, disruptionsByLine }: TimetableSectionProps) {
  return (
    <SectionCard
      id="timetable"
      title="Line timetable"
      description="Scheduled daily services"
      bodyClassName="h-[34rem] lg:h-[40rem]"
    >
      <LineTimetable data={data} loading={loading} error={error} disruptionsByLine={disruptionsByLine} />
    </SectionCard>
  );
}
