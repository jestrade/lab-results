/**
 * Reading and removing reports (KAN-13, KAN-43).
 *
 * Kept apart from `reports.ts`, which owns the upload path. That file is about
 * getting bytes safely into Storage; this one is about the list the user then
 * looks at.
 */

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref } from 'firebase/storage';

import { getDb, getFunctionsClient, getStorageClient } from '@/lib/firebase';
import { canRetryReport } from '@/domain/retry';
import { DEFAULT_LOCALE, type Locale } from '@/domain/locales';
import { messageFor } from '@/i18n/catalogs';
import { formatShortDate } from '@/i18n/dates';
import type { Report, ReportStatus, ReportWarning } from '@/domain/types';

/**
 * Live list of one user's reports.
 *
 * Ordered by `uploadedAt`, not `reportDate`. The report date is extracted from
 * the PDF and is therefore null until processing finishes — ordering on it
 * would put every new upload in an unpredictable position depending on how
 * Firestore sorts nulls, which is exactly when the user is looking for it.
 * Upload time always exists. Sorting by report date is offered in the UI and
 * done client-side, over a list that is already small by construction.
 */
export function subscribeToReports(
  ownerId: string,
  onChange: (reports: Report[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getDb(), 'reports'),
    where('ownerId', '==', ownerId),
    orderBy('uploadedAt', 'desc'),
  );

  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((entry) => toReport(entry.id, entry.data()))),
    (error) => onError?.(error),
  );
}

function toReport(id: string, data: Record<string, unknown>): Report {
  return {
    id,
    ownerId: String(data.ownerId ?? ''),
    storagePath: String(data.storagePath ?? ''),
    originalFileName: String(data.originalFileName ?? ''),
    fileSize: Number(data.fileSize ?? 0),
    contentHash: String(data.contentHash ?? ''),
    status: (data.status as ReportStatus) ?? 'uploaded',
    reportDate: (data.reportDate as Timestamp | null) ?? null,
    laboratoryName: (data.laboratoryName as string | null) ?? null,
    userLabel: (data.userLabel as string | null) ?? null,
    pageCount: (data.pageCount as number | null) ?? null,
    resultCount: (data.resultCount as number | null) ?? null,
    outOfRangeCount: (data.outOfRangeCount as number | null) ?? null,
    warnings: (data.warnings as ReportWarning[] | undefined) ?? [],
    uploadedAt: data.uploadedAt as Timestamp,
    processedAt: (data.processedAt as Timestamp | null) ?? null,
    processingStartedAt: (data.processingStartedAt as Timestamp | null) ?? null,
    retryCount: Number(data.retryCount ?? 0),
    lastRetryAt: (data.lastRetryAt as Timestamp | null) ?? null,
    supersededBy: (data.supersededBy as string | null) ?? null,
    version: Number(data.version ?? 1),
  };
}

/**
 * A short-lived URL for the original PDF.
 *
 * Fetched on demand rather than stored on the document: a URL kept in
 * Firestore would be a durable, shareable handle to a health record, and the
 * point of `storage.rules` is that reaching the file requires being the owner
 * at the moment of asking.
 */
export async function getReportDownloadUrl(report: Report): Promise<string> {
  return getDownloadURL(ref(getStorageClient(), report.storagePath));
}

/**
 * Deletes a report and its stored PDF.
 *
 * Storage first, Firestore second, and the order is the whole design. Both
 * steps can fail, so the question is which orphan is preferable:
 *
 *   Firestore first  → an orphaned object in Storage. Invisible to the user,
 *                      still consuming their quota, and impossible for them to
 *                      remove because the row that pointed at it is gone.
 *   Storage first    → a row pointing at a missing file. Visible, and the user
 *                      can simply press delete again.
 *
 * The second is recoverable, so it is the one we risk. A missing object is
 * treated as success for the same reason — retrying a half-completed delete
 * must be able to finish.
 */
export async function deleteReport(report: Report): Promise<void> {
  try {
    await deleteObject(ref(getStorageClient(), report.storagePath));
  } catch (caught) {
    const code = (caught as { code?: string }).code;
    if (code !== 'storage/object-not-found') throw caught;
  }

  await deleteDoc(doc(getDb(), 'reports', report.id));
}

/**
 * Runs the pipeline over a report's stored PDF again (KAN-7).
 *
 * A callable, not a client write: `firestore.rules` denies the browser any
 * change to `status`, and it has to — the retry budget lives on the same
 * document, and reprocessing spends AI calls. The server re-checks everything
 * this UI checked before offering the button, and answers a refusal as a
 * sentence meant to be read (see `retryErrorMessage`).
 *
 * Resolves when reprocessing has finished, which for a full panel is tens of
 * seconds, with the status the report ended on — including `failed`, when the
 * second attempt went the way of the first. The subscription shows the same
 * outcome; the return value is what lets the caller say the right thing about
 * it rather than assuming a retry that returned is a retry that worked.
 */
export async function retryReport(reportId: string): Promise<ReportStatus> {
  const call = httpsCallable<{ reportId: string }, { status: string; attempt: number }>(
    getFunctionsClient(),
    'retryReport',
  );
  const { data } = await call({ reportId });
  return data.status as ReportStatus;
}

/**
 * Refusals the server phrased for the user, told apart from failures it did not.
 *
 * A callable error's `message` is whatever the server put in the `HttpsError`
 * — but only for the codes we raise deliberately. Everything else (a dropped
 * connection, an unhandled throw) arrives as `internal` with a message like
 * "INTERNAL", which is not something to show anybody.
 */
const SPOKEN_CODES = [
  'functions/failed-precondition',
  'functions/resource-exhausted',
  'functions/not-found',
  'functions/permission-denied',
  'functions/unauthenticated',
];

export function retryErrorMessage(error: unknown, locale: Locale = DEFAULT_LOCALE): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  // A deliberate refusal is passed through as the server wrote it. Those
  // sentences are still English: they are composed in `functions/`, which has
  // no locale to compose them in. Translating them client-side would mean
  // parsing prose to work out which refusal it is — see the note in
  // `functions/src/copy.ts`.
  if (code && SPOKEN_CODES.includes(code) && message) return message;
  return messageFor(locale, 'reports.retryFailed');
}

/** Whether a report has finished processing and has results worth opening. */
export function hasResults(report: Report): boolean {
  return report.status === 'processed' || report.status === 'partially_processed';
}

/** Report date if extraction found one, upload date otherwise. */
export function effectiveDate(report: Report): Date | null {
  const stamp = report.reportDate ?? report.uploadedAt;
  return stamp?.toDate ? stamp.toDate() : null;
}

export function formatDate(value: Date | null, locale: Locale = DEFAULT_LOCALE): string {
  if (!value) return '—';
  return formatShortDate(value, locale);
}

/**
 * The grey line under the filename. Prefers whatever is most useful *now*:
 * a failure reason if it failed, progress if it is working, provenance once
 * it is done.
 */
export function reportSubtitle(
  report: Report,
  locale: Locale = DEFAULT_LOCALE,
): { text: string; tone: 'muted' | 'danger' } {
  if (report.status === 'failed') {
    // The warning text comes from the pipeline and is English whatever the
    // reader chose; our own fallback is not, and is what most failures show.
    const reason = report.warnings[0]?.message;
    // The fallback no longer sends the user back to the upload page: when a
    // retry is on offer it costs them nothing, and re-uploading costs an
    // upload operation out of their monthly allowance.
    const fallback = messageFor(
      locale,
      canRetryReport(report) ? 'reports.failedRetryable' : 'reports.failedReupload',
    );
    return { text: reason ?? fallback, tone: 'danger' };
  }
  if (report.status === 'processing' || report.status === 'queued') {
    return { text: messageFor(locale, 'reports.extracting'), tone: 'muted' };
  }

  const parts: string[] = [];
  if (report.laboratoryName) parts.push(report.laboratoryName);
  if (report.pageCount) {
    parts.push(
      messageFor(locale, report.pageCount === 1 ? 'reports.pageOne' : 'reports.pageMany', {
        count: report.pageCount,
      }),
    );
  }
  if (report.status === 'partially_processed' && report.warnings.length > 0) {
    parts.push(report.warnings[0]!.message);
  }
  return { text: parts.join(' · '), tone: 'muted' };
}
