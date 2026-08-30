import { defaultTheme } from "./defaultTheme";
import type { ThemeDefinition, ThemeMode, ThemeTokens } from "./types";

const STYLE_ELEMENT_ID = "theme-tokens";

/** `cardForeground` -> `--card-foreground`. */
function cssVariableName(token: string): string {
  return `--${token.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`;
}

function declarations(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .map(([token, value]) => `${cssVariableName(token)}:${value};`)
    .join("");
}

/**
 * Publishes the theme as a stylesheet holding a `:root` and a `.dark` block.
 *
 * Emitting both modes up front (rather than writing the active mode's tokens
 * inline on `<html>`) keeps toggling purely class-based, so the View
 * Transitions API in `AnimatedThemeToggler` still snapshots the new colours
 * synchronously. The declarations in `src/index.css` remain the first-paint
 * fallback until this runs.
 */
export function installThemeTokens(theme: ThemeDefinition = defaultTheme): void {
  const css = [
    `:root{${declarations(theme.modes.light)}--radius:${theme.radius};}`,
    `.dark{${declarations(theme.modes.dark)}}`,
  ].join("\n");

  let style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    document.head.append(style);
  }
  style.textContent = css;
}

export function browserThemeColorFor(mode: ThemeMode, theme: ThemeDefinition = defaultTheme): string {
  return theme.browserThemeColor[mode];
}
