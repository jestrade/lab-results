/**
 * The date a report's tests were taken, as the user declares it.
 *
 * ── Why the user declares it at all ───────────────────────────────────────
 *
 * This used to be read out of the PDF by the extraction model, and it was the
 * one extracted field that could not be checked against anything. A report
 * prints several dates — collection, reception, analysis, printing, the
 * doctor's signature — in whatever format the laboratory prefers, and picking
 * the wrong one puts every value on that report at the wrong point on every
 * chart. Nothing downstream can notice: the number is plausible, so a
 * misdated report simply tells the reader a false story about their own
 * history.
 *
 * The person holding the report knows which date is the right one. So they
 * declare it before the file is sent, it is stored as written, and the
 * pipeline no longer overwrites it. What the model reads is kept alongside it
 * for reference, never in its place.
 *
 * ── Calendar days, not instants ───────────────────────────────────────────
 *
 * A report date is a day on a piece of paper, so it is stored as UTC midnight
 * of that day and rendered in UTC (see `formatObservedDate`). Building it from
 * a local-midnight `Date` would move a 1 June report to 31 May for every
 * reader west of UTC, which is exactly the class of bug this field exists to
 * remove.
 */

/**
 * The oldest date worth accepting.
 *
 * Not a clinical judgement — it is a typo guard. `0202-07-14` is a slipped
 * keystroke, not a laboratory report, and `<input type="date">` will hand it
 * over without complaint.
 */
export const EARLIEST_REPORT_YEAR = 1900;

export type ReportDateProblem = 'required' | 'malformed' | 'future' | 'tooOld';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** UTC midnight of a `YYYY-MM-DD` day, or null if that is not what it is. */
export function parseReportDate(value: string): Date | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // Round-trip check: `Date.UTC` happily rolls 31 February over into March,
  // and a date the user never picked must not be accepted as one they did.
  return toIsoDate(date) === match[0] ? date : null;
}

/** `YYYY-MM-DD` of a date's UTC day — the form the date input exchanges. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Today as the reader's own calendar sees it.
 *
 * The ceiling for a report date has to be the day on the reader's wall, not
 * the day in UTC: someone in Auckland picking today would otherwise be told
 * their report is in the future for the eleven hours their date runs ahead of
 * UTC's.
 */
export function localToday(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * What is wrong with a declared date, or null if nothing is.
 *
 * Returns the problem rather than a sentence: the wording belongs to the
 * translation catalogs, and this module is imported by both the upload page
 * and the reports list, which phrase the same refusal differently.
 */
export function checkReportDate(
  value: string,
  today: string = localToday(),
): ReportDateProblem | null {
  const trimmed = value.trim();
  if (!trimmed) return 'required';

  const parsed = parseReportDate(trimmed);
  if (!parsed) return 'malformed';
  // Compared as strings: both sides are zero-padded ISO days, so this is the
  // calendar comparison we want without a timezone entering into it.
  if (trimmed > today) return 'future';
  if (parsed.getUTCFullYear() < EARLIEST_REPORT_YEAR) return 'tooOld';
  return null;
}
