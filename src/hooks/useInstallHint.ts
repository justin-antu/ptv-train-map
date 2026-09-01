import { useEffect, useState } from "react";
import { melbourneDateString } from "../shared/melbourneTime";

const OPENS_KEY = "wimt:weekdayOpens";
const DISMISSED_KEY = "wimt:installHintDismissed";

function weekdayOpens(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OPENS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

/**
 * After two distinct weekday opens, suggest installing. Never on first paint.
 */
export function useInstallHint(): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY) === "1") return;
      if (window.matchMedia("(display-mode: standalone)").matches) return;
      const today = melbourneDateString();
      const weekday = new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Melbourne",
        weekday: "short",
      }).format(new Date());
      if (weekday === "Sat" || weekday === "Sun") return;
      const opens = weekdayOpens();
      if (!opens.includes(today)) {
        const next = [...opens, today].slice(-8);
        localStorage.setItem(OPENS_KEY, JSON.stringify(next));
        if (next.length >= 2) setVisible(true);
      } else if (opens.length >= 2) {
        setVisible(true);
      }
    } catch {
      // Storage disabled — no hint.
    }
  }, []);

  return {
    visible,
    dismiss: () => {
      try {
        localStorage.setItem(DISMISSED_KEY, "1");
      } catch {
        // Ignore.
      }
      setVisible(false);
    },
  };
}
