/**
 * The device's remembered theme.
 *
 * ── Why this exists next to the profile preference ────────────────────────
 *
 * The same reason the language has one (`@/i18n/storage`), plus a sharper one:
 * the account preference cannot be read until the profile arrives, and a theme
 * applied a round-trip late is not a late setting, it is a white flash in the
 * face of someone who chose dark. Reading it here is synchronous, so the very
 * first paint is already the right colour.
 *
 * It is also the only home the choice has on the signed-out pages — sign-in,
 * registration and the legal documents are all read by someone with no profile
 * to read a preference from.
 */

import { isThemePreference, type ThemePreference } from '@/domain/themes';

const KEY = 'labresults.theme';

/**
 * Reads the stored preference, or null when there is none.
 *
 * Storage access is wrapped because it throws outright in Safari's private
 * mode and when a browser is configured to block site data. Someone who has
 * turned off storage should get the device theme, not a crash before first
 * paint — this runs early enough that throwing here would take the app with it.
 */
export function readStoredThemePreference(): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return isThemePreference(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(KEY, preference);
  } catch {
    // Losing the preference between visits is a degraded experience; throwing
    // here would turn it into a theme switcher that appears to do nothing.
  }
}
