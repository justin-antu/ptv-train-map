import { useEffect, useRef, useState } from "react";

/**
 * A polite live region that announces *how many* results there are, never the
 * results themselves.
 *
 * Two rules make this behave. The element is rendered empty on first paint and
 * only filled afterwards — a live region inserted into the DOM already
 * populated is silently ignored by most screen readers, and one populated
 * during the initial render competes with the page load announcement. And the
 * message must be derived from counts alone: a departure board re-renders
 * every second, so anything containing a countdown would turn the region into
 * a metronome.
 */
export function CountAnnouncer({ message }: { message: string }) {
  const [announced, setAnnounced] = useState("");
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setAnnounced(message);
  }, [message]);

  return (
    <p role="status" className="sr-only">
      {announced}
    </p>
  );
}
