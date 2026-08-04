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
import { deleteObject, getDownloadURL, ref } from 'firebase/storage';

import { getDb, getStorageClient } from '@/lib/firebase';
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

/** Whether a report has finished processing and has results worth opening. */
export function hasResults(report: Report): boolean {
  return report.status === 'processed' || report.status === 'partially_processed';
}

/** Report date if extraction found one, upload date otherwise. */
export function effectiveDate(report: Report): Date | null {
  const stamp = report.reportDate ?? report.uploadedAt;
  return stamp?.toDate ? stamp.toDate() : null;
}

export function formatDate(value: Date | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

/**
 * The grey line under the filename. Prefers whatever is most useful *now*:
 * a failure reason if it failed, progress if it is working, provenance once
 * it is done.
 */
export function reportSubtitle(report: Report): { text: string; tone: 'muted' | 'danger' } {
  if (report.status === 'failed') {
    const reason = report.warnings[0]?.message;
    return { text: reason ?? 'Processing failed. Try uploading the file again.', tone: 'danger' };
  }
  if (report.status === 'processing' || report.status === 'queued') {
    return { text: 'Extracting results…', tone: 'muted' };
  }

  const parts: string[] = [];
  if (report.laboratoryName) parts.push(report.laboratoryName);
  if (report.pageCount) parts.push(`${report.pageCount} page${report.pageCount === 1 ? '' : 's'}`);
  if (report.status === 'partially_processed' && report.warnings.length > 0) {
    parts.push(report.warnings[0]!.message);
  }
  return { text: parts.join(' · '), tone: 'muted' };
}
