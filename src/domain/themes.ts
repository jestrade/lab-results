/**
 * Colour themes, and the difference between what is chosen and what is shown.
 *
 * ── Two types, on purpose ─────────────────────────────────────────────────
 *
 * `ThemePreference` is what the reader picked: light, dark, or "follow my
 * device". `Theme` is what actually gets painted, which is only ever light or
 * dark. They are deliberately separate types rather than one union with three
 * members, because almost every bug in a theme switcher comes from conflating
 * them — storing `system` where a concrete theme is expected, or resolving to
 * a concrete theme too early and so freezing a reader's `system` choice at
 * whatever their device happened to say at that moment.
 *
 * The preference is what we persist. The theme is what we put on `<html>`.
 * `resolveTheme` is the only bridge between them, and it takes the device
 * answer as an argument so it stays pure and testable.
 */

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

/** What the reader chose. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** What is actually painted. Never `system`. */
export type Theme = 'light' | 'dark';

/**
 * The default for an account that has never chosen.
 *
 * `system` rather than `light`: someone whose device is set to dark has
 * already stated a preference, and ignoring it to show them our light theme
 * would be overriding a choice they made, not applying a default.
 */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

/**
 * What the device is asking for.
 *
 * Defaults to light when the query cannot be run at all — server rendering,
 * jsdom without a `matchMedia` stub, very old browsers. A reader whose device
 * prefers dark and whose browser cannot say so gets light, which is the same
 * thing they get everywhere else in that browser.
 */
export function detectSystemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The theme to paint for a preference, given what the device says. */
export function resolveTheme(preference: ThemePreference, system: Theme): Theme {
  return preference === 'system' ? system : preference;
}
