/** Placeholder rows shown before the first snapshot arrives. */
const ROWS = 4;

/**
 * Stands in for the departures list while data is loading.
 *
 * It mirrors the real row's geometry — stripe, two-line body, right-aligned
 * countdown and platform — so the board does not reflow when the times land.
 * Deliberately not an empty state: an empty board and an unloaded one are
 * indistinguishable by row count, and saying "no more departures" while the
 * snapshot is still downloading tells a commuter their last train has gone.
 *
 * Hidden from assistive technology, which is told "Loading departures" once
 * through the board's existing live region rather than reading four stubs.
 */
export function DeparturesSkeleton() {
  return (
    <ul className="divide-y divide-border/60" aria-hidden="true">
      {Array.from({ length: ROWS }, (_, i) => (
        <li key={i} className="flex min-h-11 items-center gap-3 px-1 py-2.5">
          <span className="w-1 shrink-0 self-stretch rounded-full bg-muted motion-safe:animate-pulse" />

          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="flex items-center gap-2">
              {/* Varying widths read as a list of names rather than a table. */}
              <span
                className="block h-3.5 rounded bg-muted motion-safe:animate-pulse"
                style={{ width: `${[58, 44, 66, 50][i % 4]}%` }}
              />
              <span className="block h-2.5 w-14 rounded bg-muted/70 motion-safe:animate-pulse" />
            </span>
            <span className="block h-2.5 w-2/5 rounded bg-muted/70 motion-safe:animate-pulse" />
            <span className="block h-2.5 w-3/5 rounded bg-muted/50 motion-safe:animate-pulse" />
          </span>

          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className="block h-4 w-12 rounded bg-muted motion-safe:animate-pulse" />
            <span className="block h-3.5 w-14 rounded bg-muted/60 motion-safe:animate-pulse" />
          </span>
        </li>
      ))}
    </ul>
  );
}
