/**
 * Design-token contract for the interface theme.
 *
 * Tokens are the single source of truth for colour: `src/index.css` only holds
 * matching fallbacks for the first paint, and every component reads the
 * resulting CSS variables through Tailwind (`bg-card`, `text-brand`, …).
 */

/** Interface colour scheme. The MapLibre basemap stays light in both modes. */
export type ThemeMode = "light" | "dark";

/**
 * HSL channel triplet without the `hsl()` wrapper, e.g. `"225 66% 24%"`.
 * Stored unwrapped so Tailwind can compose alpha variants like `bg-primary/80`.
 */
export type HslTriplet = string;

export interface ThemeTokens {
  background: HslTriplet;
  foreground: HslTriplet;
  card: HslTriplet;
  cardForeground: HslTriplet;
  popover: HslTriplet;
  popoverForeground: HslTriplet;
  primary: HslTriplet;
  primaryForeground: HslTriplet;
  secondary: HslTriplet;
  secondaryForeground: HslTriplet;
  muted: HslTriplet;
  mutedForeground: HslTriplet;
  accent: HslTriplet;
  accentForeground: HslTriplet;
  /**
   * Decorative brand accent. Kept separate from `primary` because `primary`
   * inverts to near-white in dark mode for control contrast, which would
   * otherwise erase the brand colour from borders and highlights.
   */
  brand: HslTriplet;
  brandForeground: HslTriplet;
  /** Critical severity, also used for destructive controls. */
  destructive: HslTriplet;
  destructiveForeground: HslTriplet;
  destructiveSurface: HslTriplet;
  destructiveBorder: HslTriplet;
  /** Warning severity, e.g. minor delays. */
  warning: HslTriplet;
  warningForeground: HslTriplet;
  warningSurface: HslTriplet;
  warningMuted: HslTriplet;
  warningBorder: HslTriplet;
  /** Healthy severity, e.g. good service and on-time departures. */
  success: HslTriplet;
  successForeground: HslTriplet;
  successSurface: HslTriplet;
  successBorder: HslTriplet;
  /** Informational severity, e.g. planned works. */
  info: HslTriplet;
  infoForeground: HslTriplet;
  infoSurface: HslTriplet;
  infoBorder: HslTriplet;
  border: HslTriplet;
  input: HslTriplet;
  ring: HslTriplet;
}

export interface ThemeDefinition {
  name: string;
  /** Base corner rounding, applied through `--radius`. */
  radius: string;
  modes: Record<ThemeMode, ThemeTokens>;
  /** `<meta name="theme-color">` value per mode, as a `#rrggbb` string. */
  browserThemeColor: Record<ThemeMode, string>;
}
