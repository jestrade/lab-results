/**
 * Password scoring and validation (KAN-1).
 *
 * Pure functions, kept apart from the meter that renders them so they can be
 * imported by forms and tested without a DOM.
 *
 * The *score* is language-independent — it counts characters and character
 * classes — so `scorePassword` takes no locale. Only the advice attached to
 * each band, and the validation message, are words.
 */

import { DEFAULT_LOCALE, type Locale } from '@/domain/locales';
import { messageFor } from '@/i18n/catalogs';
import type { MessageKey } from '@/i18n/messages';

export const MIN_PASSWORD_LENGTH = 10;

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

/**
 * Four coarse bands, weighted towards length — length is what actually resists
 * an offline attack, so a long passphrase must not score below a short string
 * with a punctuation mark in it.
 */
export function scorePassword(password: string): PasswordScore {
  if (!password) return 0;
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 2;
  else if (password.length >= 8) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4) as PasswordScore;
}

/** The hard minimum. The score above is advisory; this one blocks submission. */
export function validatePassword(password: string, locale: Locale = DEFAULT_LOCALE): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return messageFor(locale, 'password.tooShort', { min: MIN_PASSWORD_LENGTH });
  }
  return null;
}

const ADVICE_KEY: Record<PasswordScore, MessageKey> = {
  0: 'password.advice0',
  1: 'password.advice1',
  2: 'password.advice2',
  3: 'password.advice3',
  4: 'password.advice4',
};

export function passwordAdvice(score: PasswordScore, locale: Locale = DEFAULT_LOCALE): string {
  return messageFor(locale, ADVICE_KEY[score], { min: MIN_PASSWORD_LENGTH });
}
