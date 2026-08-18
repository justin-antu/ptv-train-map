import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "wimt:theme";
const THEME_COLOR_BY_THEME: Record<Theme, string> = {
  light: "#152c6b",
  dark: "#000000",
};

function loadInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage disabled/inaccessible — use the default theme.
  }
  return "light";
}

function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore write failures — theme still applies for this session.
  }
}

/**
 * Tracks the light/dark theme preference, persisted in `localStorage`
 * (consistent with how the legend/favourite preferences are persisted), and
 * keeps the `<html>` element's `dark` class + the mobile browser chrome's
 * `theme-color` meta tag in sync so Tailwind's `dark:` variants react to it.
 * Deliberately does NOT affect the MapLibre basemap — the map stays on a
 * single, permanently light basemap regardless of UI theme (see `map.ts`).
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(loadInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLOR_BY_THEME[theme]);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    saveTheme(next);
  }, []);

  return [theme, setTheme];
}
