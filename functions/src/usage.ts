/**
 * Storage usage accounting (spec §79).
 *
 * These two triggers are what make the quota real: `storage.rules` denies an
 * upload by reading counters, and these keep the counters true.
 *
 * Both run inside a Firestore transaction over two documents — the user's and
 * the global one — so concurrent finalizations cannot lose an increment. The
 * transaction is the reason the counters are trustworthy after the fact; it is
 * *not* a fix for the race described in config/quotas.json, which happens
 * earlier, at the rules check, before any of this runs.
 *
 * Idempotency matters here. Cloud Functions guarantees at-least-once delivery,
 * so a retried finalize event would double-count without protection. Each
 * object's contribution is therefore recorded in a `ledger` subdocument keyed
 * by object name, and an event whose key is already present is a no-op.
 */

import * as logger from 'firebase-functions/logger';
import { onObjectDeleted, onObjectFinalized } from 'firebase-functions/v2/storage';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';

import {
  SYSTEM_USAGE_COLLECTION,
  SYSTEM_USAGE_DOC,
  USAGE_COLLECTION,
  currentUploadPeriod,
  parseReportPath,
} from './quotas';
import { REGION } from './region';


/** Firestore forbids `/` in a document id and dislikes it in a field key. */
function ledgerKey(objectName: string): string {
  return objectName.replace(/[./]/g, '_');
}

async function applyDelta(
  objectName: string,
  userId: string,
  deltaBytes: number,
  countsAsUpload: boolean,
): Promise<void> {
  const db = getFirestore();
  const userRef = db.collection(USAGE_COLLECTION).doc(userId);
  const systemRef = db.collection(SYSTEM_USAGE_COLLECTION).doc(SYSTEM_USAGE_DOC);
  const key = ledgerKey(objectName);

  await db.runTransaction(async (tx) => {
    const [userSnap, systemSnap] = await Promise.all([tx.get(userRef), tx.get(systemRef)]);

    const ledger = (userSnap.data()?.ledger ?? {}) as Record<string, number>;
    const alreadyCounted = Object.prototype.hasOwnProperty.call(ledger, key);

    // Adding an object we already counted, or removing one we never counted,
    // is a duplicate delivery. Drop it rather than corrupting the total.
    if (deltaBytes > 0 && alreadyCounted) {
      logger.debug('Duplicate finalize event ignored', { objectName });
      return;
    }
    if (deltaBytes < 0 && !alreadyCounted) {
      logger.debug('Delete event for an uncounted object ignored', { objectName });
      return;
    }

    const period = currentUploadPeriod();
    const userData = userSnap.data() ?? {};
    const priorBytes = (userData.storageBytes as number | undefined) ?? 0;
    const priorPeriod = userData.uploadPeriod as string | undefined;
    const priorUploads = (userData.uploadsThisMonth as number | undefined) ?? 0;

    // A counter from a previous month restarts at zero — the same lazy reset
    // the rules and the web app apply, so all three agree without a cron job.
    const uploadsBase = priorPeriod === period ? priorUploads : 0;

    // Clamp at zero: a negative total would silently hand the user unlimited
    // space, which is the worst possible direction for this bug to fail in.
    const nextBytes = Math.max(0, priorBytes + deltaBytes);

    tx.set(
      userRef,
      {
        userId,
        storageBytes: nextBytes,
        uploadPeriod: period,
        uploadsThisMonth: uploadsBase + (countsAsUpload ? 1 : 0),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // The ledger is written separately, because a merged write cannot REMOVE a
    // map key — it only adds and overwrites. Handing `set(…, {merge: true})` a
    // map with the key filtered out leaves the key exactly where it was, so
    // deletes would never clear their entry and the document would grow until
    // it hit Firestore's 1 MiB limit. Every upload reads this document through
    // `storage.rules`, so an unbounded map is not harmless.
    //
    // FieldPath with literal segments rather than a dotted string: object names
    // can contain `~`, `*`, `[` and `]`, all of which are special in a field
    // path expression and would otherwise need escaping.
    if (deltaBytes > 0) {
      tx.set(userRef, { ledger: { [key]: deltaBytes } }, { merge: true });
    } else {
      tx.update(userRef, new FieldPath('ledger', key), FieldValue.delete());
    }

    const priorSystemBytes = (systemSnap.data()?.storageBytes as number | undefined) ?? 0;
    tx.set(
      systemRef,
      {
        storageBytes: Math.max(0, priorSystemBytes + deltaBytes),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export const onReportUploaded = onObjectFinalized(
  { region: REGION, memory: '256MiB', retry: false },
  async (event) => {
    const parsed = parseReportPath(event.data.name);
    // Anything outside users/{uid}/reports/ is not metered — and nothing else
    // should be writing to this bucket in the first place.
    if (!parsed) return;

    const size = Number(event.data.size ?? 0);
    if (!Number.isFinite(size) || size <= 0) {
      logger.warn('Finalize event with no usable size', { name: event.data.name });
      return;
    }

    await applyDelta(event.data.name, parsed.userId, size, true);
    logger.info('Storage usage incremented', {
      userId: parsed.userId,
      reportId: parsed.reportId,
      bytes: size,
    });
  },
);

export const onReportDeleted = onObjectDeleted(
  { region: REGION, memory: '256MiB', retry: false },
  async (event) => {
    const parsed = parseReportPath(event.data.name);
    if (!parsed) return;

    const size = Number(event.data.size ?? 0);
    if (!Number.isFinite(size) || size <= 0) return;

    // Freeing space returns bytes but never refunds an upload operation —
    // the operation was spent, and letting delete-then-reupload reset the
    // monthly counter would make it trivially bypassable.
    await applyDelta(event.data.name, parsed.userId, -size, false);
    logger.info('Storage usage decremented', {
      userId: parsed.userId,
      reportId: parsed.reportId,
      bytes: size,
    });
  },
);
