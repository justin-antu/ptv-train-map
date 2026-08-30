import { SectionCard } from "../layout/SectionCard";
import { LineTimetable } from "../panels/LineTimetable";
import type { NetworkTimetableData } from "../../shared/types";

interface TimetableSectionProps {
  data: NetworkTimetableData | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Scheduled services. The card supplies the heading; this only bounds the
 * height so the virtualized grid has a scroll container to work against.
 */
export function TimetableSection({ data, loading, error }: TimetableSectionProps) {
  return (
    <SectionCard
      id="timetable"
      title="PTV Timetable"
      description="Scheduled daily services"
      bodyClassName="h-[34rem] lg:h-[40rem]"
    >
      <LineTimetable data={data} loading={loading} error={error} />
    </SectionCard>
  );
}
