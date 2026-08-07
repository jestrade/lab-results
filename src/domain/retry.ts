/**
 * When to offer to run a report through processing again (KAN-7).
 *
 * This decides whether a button appears. It does not decide whether the report
 * is reprocessed — `functions/src/retry.ts` makes that call, over the stored
 * document, and refuses with a sentence the UI shows verbatim. The two read the
 * same policy from `config/retry.json`, which is what keeps a button that is
 * offered from being a button that is refused.
 *
 * The cooldown is deliberately not mirrored here: hiding the control for a
 * minute after a failure reads as the feature disappearing, and the server's
 * "give it a minute" is a better answer than a control that is not there.
 */

import policy from '../../config/retry.json';
import type { Report, ReportWarning } from './types';

/** Retries allowed per report, on top of the automatic first run. */
export const MAX_RETRIES = policy.maxRetriesPerReport;

/** After this, an in-flight report is presumed to have lost its worker. */
export const STALE_PROCESSING_MS = policy.staleAfterMinutes * 60_000;

const PERMANENT_CODES: readonly string[] = policy.permanentFailureCodes;
const PERMANENT_PREFIXES: readonly string[] = policy.permanentFailurePrefixes;

/** Statuses where work was started and never finished. */
const IN_FLIGHT: readonly string[] = ['uploaded', 'queued', 'processing'];

/**
 * Would a second attempt read the same file and fail the same way? A scanned
 * page will still be a scanned page, and a report rejected on capacity no
 * longer has an object to read.
 */
export function isPermanentFailure(warnings: ReportWarning[]): boolean {
  const code = warnings[0]?.code;
  if (!code) return false;
  return (
    PERMANENT_CODES.includes(code) || PERMANENT_PREFIXES.some((prefix) => code.startsWith(prefix))
  );
}

/**
 * Whether this report is worth offering a retry for.
 *
 * Two cases, and the second is the one users cannot otherwise escape: a report
 * that failed for a reason a second attempt could survive, and a report stuck
 * in an in-flight status long past the point where its worker could still be
 * alive. The trigger runs once and does not retry itself, so without this a
 * stranded report stays stranded.
 */
export function canRetryReport(report: Report, now: number = Date.now()): boolean {
  if ((report.retryCount ?? 0) >= MAX_RETRIES) return false;

  if (IN_FLIGHT.includes(report.status)) {
    const startedAt = report.processingStartedAt ?? report.uploadedAt;
    const startedAtMs = startedAt?.toMillis?.();
    // No timestamp at all means the document predates this field, which on an
    // in-flight status is precisely the stuck report we want to rescue.
    return startedAtMs === undefined || now - startedAtMs >= STALE_PROCESSING_MS;
  }

  return report.status === 'failed' && !isPermanentFailure(report.warnings);
}

/**
 * What to say under a failed report, given that "upload it again" is the wrong
 * advice when a button can do it without spending an upload.
 */
export function retryHint(report: Report): string {
  if (canRetryReport(report)) return '';
  if (report.status === 'failed' && (report.retryCount ?? 0) >= MAX_RETRIES) {
    return `Retried ${MAX_RETRIES} times without success.`;
  }
  return '';
}
