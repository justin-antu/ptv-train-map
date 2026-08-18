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
 * class and browser `theme-color`. The MapLibre basemap remains light in both
 * interface themes.
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
