const REPO_URL = "https://github.com/justin-antu/ptv-train-map";

/** lucide-react dropped brand icons a while back, so the GitHub mark is a tiny inline SVG instead of a dependency. */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12.26c0 5.2 3.29 9.6 7.86 11.16.57.11.78-.26.78-.57 0-.28-.01-1.02-.02-2-3.2.72-3.88-1.59-3.88-1.59-.52-1.36-1.28-1.72-1.28-1.72-1.04-.73.08-.71.08-.71 1.15.08 1.76 1.22 1.76 1.22 1.03 1.8 2.7 1.28 3.36.98.1-.76.4-1.28.73-1.58-2.55-.3-5.24-1.32-5.24-5.86 0-1.29.44-2.35 1.16-3.18-.12-.3-.5-1.52.11-3.17 0 0 .95-.31 3.12 1.21a10.6 10.6 0 0 1 5.68 0c2.17-1.52 3.11-1.21 3.11-1.21.62 1.65.24 2.87.12 3.17.72.83 1.16 1.89 1.16 3.18 0 4.55-2.7 5.55-5.26 5.85.41.37.78 1.09.78 2.2 0 1.59-.01 2.87-.01 3.26 0 .31.21.69.79.57A11.5 11.5 0 0 0 23.5 12.26 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-border bg-card/60 px-4 py-2.5 text-center text-[11px] leading-relaxed text-muted-foreground backdrop-blur-sm sm:px-6">
      <p className="mx-auto max-w-4xl">
        Live departures & disruptions:{" "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://www.vic.gov.au/public-transport-timetable-api"
          target="_blank"
          rel="noopener noreferrer"
        >
          PTV Timetable API
        </a>{" "}
        · Station/route data:{" "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://opendata.transport.vic.gov.au/dataset/gtfs-schedule"
          target="_blank"
          rel="noopener noreferrer"
        >
          Victorian GTFS Schedule
        </a>{" "}
        · Basemap:{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">
          CARTO
        </a>{" "}
        ©{" "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap
        </a>{" "}
        contributors ·{" "}
        <a
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <GithubMark className="size-3" /> Source on GitHub
        </a>
      </p>
    </footer>
  );
}
