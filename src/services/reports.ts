/**
 * Report upload (KAN-3, KAN-4).
 *
 * The order of operations matters: bytes go to Storage first, and only once
 * they are safely there does the Firestore record get written. Doing it the
 * other way round would leave a report row pointing at a file that never
 * arrived, and the reports list has no way to tell that apart from a file
 * still uploading.
 */

import { Timestamp, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { deleteObject, ref, uploadBytesResumable } from 'firebase/storage';

import { getDb, getStorageClient } from '@/lib/firebase';
// One number, one place (spec §79) — config/quotas.json also drives the
// literal in storage.rules, and a drift test keeps the two in step.
import { MAX_FILE_BYTES, formatBytes } from '@/domain/quotas';
import { DEFAULT_LOCALE, type Locale } from '@/domain/locales';
import { messageFor } from '@/i18n/catalogs';

export { MAX_FILE_BYTES, formatBytes };

export const ACCEPTED_MIME = 'application/pdf';

export type FileRejectionReason = 'not-a-pdf' | 'too-large' | 'empty';

export interface FileRejection {
  reason: FileRejectionReason;
  /** Ready-to-display sentence, phrased as the design board specifies. */
  message: string;
}

/**
 * Client-side validation of a chosen file.
 *
 * This exists to give the user an instant, specific answer — not to secure
 * anything. `storage.rules` enforces the same two limits server-side, and that
 * is the check that counts.
 */
export function validateFile(file: File, locale: Locale = DEFAULT_LOCALE): FileRejection | null {
  if (file.size === 0) {
    return {
      reason: 'empty',
      message: messageFor(locale, 'fileError.empty', { file: file.name }),
    };
  }
  const looksLikePdf =
    file.type === ACCEPTED_MIME || file.name.toLowerCase().endsWith('.pdf');
  if (!looksLikePdf) {
    return {
      reason: 'not-a-pdf',
      message: messageFor(locale, 'fileError.notPdf', { file: file.name }),
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      reason: 'too-large',
      message: messageFor(locale, 'fileError.tooLarge', {
        file: file.name,
        size: formatBytes(file.size),
        limit: formatBytes(MAX_FILE_BYTES),
      }),
    };
  }
  return null;
}

/**
 * SHA-256 of the file bytes, used to spot a report the user already uploaded
 * (KAN-28). Computed in the browser so the duplicate check can happen before
 * the bytes are sent, rather than after.
 */
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Strips anything that could confuse a storage path or leak into a URL, and
 * caps the length. The user's original name is preserved separately on the
 * Firestore record, so nothing is lost by sanitising the stored object name.
 */
export function safeObjectName(fileName: string): string {
  const base = fileName
    .replace(/\.pdf$/i, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    // Trim leading/trailing separators, so a name made only of them (`///.pdf`)
    // collapses to empty and takes the fallback rather than becoming `-.pdf`.
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 80);
  return `${base || 'report'}.pdf`;
}

export interface UploadHandle {
  /** Resolves with the new report's document id once the record is written. */
  done: Promise<string>;
  /** Aborts the transfer. The partially written object is removed. */
  cancel: () => void;
}

export interface UploadOptions {
  file: File;
  ownerId: string;
  /**
   * The day the tests were taken, as the user declared it on the upload form.
   *
   * Required, and deliberately not defaulted. Extraction used to supply this
   * and got it wrong often enough to misplace whole reports on the trend
   * charts — see `domain/reportDate.ts`. A default here would quietly
   * reintroduce a guess under a field whose entire value is that it is not
   * one.
   */
  reportDate: Date;
  userLabel?: string | null;
  /**
   * The file's SHA-256, when the caller has already computed it.
   *
   * The duplicate check (KAN-28) hashes every file before the upload starts,
   * and hashing a 25 MB PDF a second time to store the same string would be
   * pure repeated work on the main thread. Omitted, this hashes the file
   * itself, so a caller that does not care keeps working unchanged.
   */
  contentHash?: string;
  onProgress?: (percent: number) => void;
}

export function uploadReport({
  file,
  ownerId,
  reportDate,
  userLabel = null,
  contentHash: knownHash,
  onProgress,
}: UploadOptions): UploadHandle {
  // The id is minted up front so the storage path and the Firestore record
  // agree, and so `storage.rules` can check the path against the caller's uid.
  const reportId = crypto.randomUUID();
  const objectName = safeObjectName(file.name);
  const storagePath = `users/${ownerId}/reports/${reportId}/${objectName}`;

  const task = uploadBytesResumable(ref(getStorageClient(), storagePath), file, {
    contentType: ACCEPTED_MIME,
    // Firebase would otherwise mint a permanent public download token for the
    // object. Health documents get short-lived signed URLs instead.
    customMetadata: { ownerId, originalFileName: file.name },
  });

  let cancelled = false;

  const done = (async () => {
    const contentHash = knownHash ?? (await hashFile(file));

    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          if (!onProgress || snapshot.totalBytes === 0) return;
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        },
        reject,
        resolve,
      );
    });

    if (cancelled) throw new Error('Upload cancelled');

    // Only fields the client is allowed to set — see `firestore.rules`. The
    // pipeline adds laboratoryName, counts and warnings later; `reportDate` is
    // the user's own and the pipeline no longer overwrites it.
    const docRef = await addDoc(collection(getDb(), 'reports'), {
      ownerId,
      storagePath,
      originalFileName: file.name,
      fileSize: file.size,
      reportDate: Timestamp.fromDate(reportDate),
      contentHash,
      status: 'uploaded',
      userLabel,
      pageCount: null,
      supersededBy: null,
      version: 1,
      uploadedAt: serverTimestamp(),
    });

    return docRef.id;
  })();

  return {
    done,
    cancel: () => {
      cancelled = true;
      task.cancel();
      // Best-effort cleanup; a cancelled resumable upload can still have left
      // a partial object behind, and nothing else will ever reference it.
      void deleteObject(ref(getStorageClient(), storagePath)).catch(() => undefined);
    },
  };
}
