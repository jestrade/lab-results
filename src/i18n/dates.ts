/**
 * Dates in the reader's language.
 *
 * ── Why `undefined` was not good enough ───────────────────────────────────
 *
 * `new Intl.DateTimeFormat(undefined, …)` formats in the *browser's* locale.
 * That was right while the browser was the only input, and is wrong the moment
 * a reader can choose: someone on an English-configured machine who switches
 * the app to Spanish would get "15 de marzo de 2026" nowhere and "15 March
 * 2026" everywhere, inside Spanish sentences.
 *
 * So formatting takes the chosen locale explicitly. Every call site that shows
 * a date to a human goes through here.
 *
 * ── What is deliberately *not* localised ──────────────────────────────────
 *
 * The `<input type="date">` on the profile form still exchanges ISO
 * `YYYY-MM-DD`, and the value stored in Firestore stays ISO. Only the display
 * changes. A date of birth that reads differently depending on the language
 * the account is in would be a data problem wearing a presentation problem's
 * clothes.
 */

import { DEFAULT_LOCALE, type Locale } from '@/domain/locales';

/**
 * Region-neutral tags.
 *
 * `es` alone resolves to Spain's conventions in most engines, which is fine:
 * day-month-year with a lowercase month is shared across the Spanish-speaking
 * world. What matters is not picking `es-ES` or `es-MX` in a way that would
 * make one region's readers feel addressed and another's overlooked.
 */
const INTL_TAG: Record<Locale, string> = {
  en: 'en-GB',
  es: 'es',
};

export function intlTag(locale: Locale): string {
  return INTL_TAG[locale] ?? INTL_TAG[DEFAULT_LOCALE];
}

/** "15 March 2026" / "15 de marzo de 2026". */
export function formatLongDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag(locale), { dateStyle: 'long' }).format(date);
}

/** "15 Mar 2026" / "15 mar 2026" — for table cells and chart axes. */
export function formatShortDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * "15 Mar 2026, 14:03" — a date with the time of day.
 *
 * For the administration console, where the thing being shown is an instant a
 * machine recorded rather than a day: two extraction attempts on the same
 * afternoon are a different picture from two on the same date, and a cell that
 * showed only the date would flatten them into each other.
 */
export function formatDateTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * ── Dates that are calendar dates, not instants ───────────────────────────
 *
 * A report's date is stored as UTC midnight of the day the laboratory printed
 * on it, and every measurement taken from that report inherits it. Rendering
 * it in the reader's own zone moves a 1 June report to 31 May for everyone
 * west of UTC: the date on the screen stops matching the date on the paper,
 * and on a chart the point lands in the wrong month.
 *
 * So anything that says *when a measurement was taken* formats in UTC, while
 * anything that says when something happened to the account — an upload, a
 * password change — stays in the reader's zone, because those really are
 * instants. `TrendChart` makes the same choice for its axis.
 */
export function formatObservedDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** The same date spelled out, for prose and accessible names. */
export function formatObservedLongDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/** The full weekday line in the application top bar. */
export function formatWeekdayDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
