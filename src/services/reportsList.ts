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
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref } from 'firebase/storage';

import { getDb, getFunctionsClient, getStorageClient } from '@/lib/firebase';
import { canRetryReport } from '@/domain/retry';
import { warningText } from '@/domain/reportWarnings';
import { DEFAULT_LOCALE, type Locale } from '@/domain/locales';
import { messageFor } from '@/i18n/catalogs';
import { formatShortDate } from '@/i18n/dates';
import type { Report, ReportStatus, ReportWarning } from '@/domain/types';

/**
 * Live list of one user's reports.
 *
 * Ordered by `uploadedAt`, not `reportDate`. Every report uploaded since the
 * date became a required field on the upload form carries one, but the ones
 * from before it do not, and ordering on a field that is null for part of the
 * collection puts those reports wherever Firestore happens to sort nulls.
 * Upload time always exists, for every report ever stored. Sorting by report
 * date is offered in the UI and done client-side, over a list that is already
 * small by construction.
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
    duplicateOf: (data.duplicateOf as string | null) ?? null,
    version: Number(data.version ?? 1),
  };
}

/**
 * How far back the metadata comparison looks.
 *
 * The hash query below is exhaustive — an exact re-upload is caught however
 * old the original is. This second query exists only for the weaker
 * name-and-size signal, and reading a user's entire history to run it would
 * cost a document read per report on every file they choose. A duplicate the
 * user is about to create by hand is almost always of something recent, and
 * the server-side content check (functions/src/duplicates.ts) catches the rest
 * after extraction, where the comparison is a good deal better than a
 * filename.
 */
const METADATA_SCAN_LIMIT = 50;

/**
 * Reports that might be the file the user just chose (KAN-28, spec §40.2).
 *
 * Two queries rather than one, because they answer different questions and
 * only one of them can be answered exactly:
 *
 *   by hash — complete, over the user's whole history, and certain when it
 *             hits. `firestore.indexes.json` carries the ownerId+contentHash
 *             index this needs.
 *   by date — the most recent reports, filtered in memory for name and size.
 *             A composite index per signal would be the alternative, and the
 *             signals are heuristics that will change.
 *
 * Deduplicated by id: a re-uploaded file matches both queries, and the dialog
 * must not list the same report twice.
 *
 * Failures are not swallowed here — the caller decides, and the Upload page
 * treats "we could not check" as "no warning" rather than blocking an upload
 * on a check that is itself only advisory.
 */
export async function fetchDuplicateCandidates(
  ownerId: string,
  contentHash: string,
): Promise<Report[]> {
  const reports = collection(getDb(), 'reports');

  const [byHash, recent] = await Promise.all([
    contentHash
      ? getDocs(query(reports, where('ownerId', '==', ownerId), where('contentHash', '==', contentHash)))
      : null,
    getDocs(
      query(
        reports,
        where('ownerId', '==', ownerId),
        orderBy('uploadedAt', 'desc'),
        limit(METADATA_SCAN_LIMIT),
      ),
    ),
  ]);

  const byId = new Map<string, Report>();
  for (const snapshot of [byHash, recent]) {
    for (const entry of snapshot?.docs ?? []) byId.set(entry.id, toReport(entry.id, entry.data()));
  }
  return [...byId.values()];
}

/**
 * Corrects the date on a report the user already uploaded (KAN-13).
 *
 * A direct document write rather than a callable, because this is the one
 * piece of a report that belongs to the user rather than to the pipeline:
 * they read it off the paper, and `firestore.rules` lets the owner — and only
 * the owner — change it.
 *
 * The stored results keep the `observedAt` the pipeline gave them. Rewriting
 * every result and every point of every affected variable series from the
 * browser is not something the rules allow, and should not be: correcting a
 * date has to move the whole report's history together or not at all, which
 * is a server-side job. Reprocessing the report (the retry button) is what
 * puts the values back on the corrected day, and the copy on the dialog says
 * so rather than leaving the reader to discover it.
 */
export async function updateReportDate(reportId: string, date: Date): Promise<void> {
  await updateDoc(doc(getDb(), 'reports', reportId), {
    reportDate: Timestamp.fromDate(date),
  });
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

export interface BulkDeleteOutcome {
  /** Reports that are gone, and the bytes they were occupying. */
  deleted: Report[];
  /** Reports still there, because their delete failed. */
  failed: Report[];
}

/**
 * Deletes several reports, reporting honestly on a partial result.
 *
 * ── Why this is not a transaction, and why that is stated ─────────────────
 *
 * Each report is a Storage object plus a Firestore document, in two different
 * services. There is no atomic delete across the two, let alone across a
 * dozen reports, so "delete these nine" can genuinely end with seven gone and
 * two still there. `allSettled` rather than `all` is the point: one failure
 * must not abandon the deletes that would have succeeded, and the caller is
 * given both lists so it can say what actually happened rather than "done".
 *
 * Run together rather than one after another. Each delete is independent, and
 * a user who selected a dozen reports should not wait a dozen round trips —
 * selections are bounded by what fits on the page, so there is no fan-out here
 * worth throttling.
 */
export async function deleteReports(reports: Report[]): Promise<BulkDeleteOutcome> {
  const results = await Promise.allSettled(reports.map((report) => deleteReport(report)));

  const deleted: Report[] = [];
  const failed: Report[] = [];
  results.forEach((result, index) => {
    (result.status === 'fulfilled' ? deleted : failed).push(reports[index]!);
  });

  return { deleted, failed };
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

/**
 * The date to file this report under: the one its owner declared, falling back
 * to the upload date for reports stored before that field existed.
 */
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
    // Translated from the warning's code where we know the cause, so the line
    // says *why* — rate limit, safety block, scan with no text — rather than
    // "it failed". Codes we do not have a translation for keep the pipeline's
    // own English sentence, which still says more than the fallback.
    const warning = report.warnings[0];
    const reason = warning ? warningText(warning, locale) : undefined;
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
    parts.push(warningText(report.warnings[0]!, locale));
  }
  return { text: parts.join(' · '), tone: 'muted' };
}
