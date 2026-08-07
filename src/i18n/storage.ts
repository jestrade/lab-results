/**
 * The device's remembered language.
 *
 * ── Why this exists next to the profile preference ────────────────────────
 *
 * The account is the real home for the choice, but it cannot be the only one.
 * The sign-in page, the registration form and the legal documents are all read
 * by someone with no profile to read a preference from — and on a signed-in
 * page the profile arrives a round-trip after first paint, so trusting it
 * alone would render the app in English and then swap it to Spanish in front
 * of the reader. This is what makes the choice survive the reload it was made
 * before, and what makes the first paint already correct.
 */

import { isLocale, type Locale } from '@/domain/locales';

const KEY = 'labresults.locale';

/**
 * Reads the stored locale, or null when there is none.
 *
 * Storage access is wrapped because it throws outright in Safari's private
 * mode and when a browser is configured to block site data. A reader who has
 * turned off storage should get the browser's language, not a blank page.
 */
export function readStoredLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(KEY, locale);
  } catch {
    // Losing the preference between visits is a degraded experience; throwing
    // here would turn it into a broken language picker.
  }
}
