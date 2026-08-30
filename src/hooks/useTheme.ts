import { useCallback, useEffect, useState } from "react";
import { browserThemeColorFor } from "../theme/applyThemeTokens";
import type { ThemeMode } from "../theme/types";

export type Theme = ThemeMode;

const THEME_STORAGE_KEY = "wimt:theme";

function loadInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Use the default theme when storage is inaccessible.
  }
  return "light";
}

function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The in-memory theme remains active when storage writes fail.
  }
}

/**
 * Persists the light/dark interface preference and synchronizes the `<html>`
 * class and browser `theme-color`. Token values come from the theme stylesheet
 * installed by `installThemeTokens`, so the class toggle alone repaints the
 * interface. The MapLibre basemap remains light in both interface themes.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(loadInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", browserThemeColorFor(theme));
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    saveTheme(next);
  }, []);

  return [theme, setTheme];
}
