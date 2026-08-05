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
import { getStorage } from 'firebase-admin/storage';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';

import {
  GLOBAL_STORAGE_BYTES,
  PER_USER_STORAGE_BYTES,
  PER_USER_UPLOADS_PER_MONTH,
  SYSTEM_USAGE_COLLECTION,
  SYSTEM_USAGE_DOC,
  USAGE_COLLECTION,
  currentUploadPeriod,
  parseReportPath,
} from './quotas';
import { REGION } from './region';
import { AI_SECRETS } from './ai/config';
import { processReport } from './pipeline';


/** Firestore forbids `/` in a document id and dislikes it in a field key. */
function ledgerKey(objectName: string): string {
  return objectName.replace(/[./]/g, '_');
}

interface UsageAfter {
  userBytes: number;
  systemBytes: number;
  uploadsThisMonth: number;
}

async function applyDelta(
  objectName: string,
  userId: string,
  deltaBytes: number,
  countsAsUpload: boolean,
): Promise<UsageAfter | null> {
  const db = getFirestore();
  const userRef = db.collection(USAGE_COLLECTION).doc(userId);
  const systemRef = db.collection(SYSTEM_USAGE_COLLECTION).doc(SYSTEM_USAGE_DOC);
  const key = ledgerKey(objectName);

  return db.runTransaction<UsageAfter | null>(async (tx) => {
    const [userSnap, systemSnap] = await Promise.all([tx.get(userRef), tx.get(systemRef)]);

    const ledger = (userSnap.data()?.ledger ?? {}) as Record<string, number>;
    const alreadyCounted = Object.prototype.hasOwnProperty.call(ledger, key);

    // Adding an object we already counted, or removing one we never counted,
    // is a duplicate delivery. Drop it rather than corrupting the total.
    if (deltaBytes > 0 && alreadyCounted) {
      logger.debug('Duplicate finalize event ignored', { objectName });
      return null;
    }
    if (deltaBytes < 0 && !alreadyCounted) {
      logger.debug('Delete event for an uncounted object ignored', { objectName });
      return null;
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
    const nextSystemBytes = Math.max(0, priorSystemBytes + deltaBytes);
    tx.set(
      systemRef,
      {
        storageBytes: nextSystemBytes,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      userBytes: nextBytes,
      systemBytes: nextSystemBytes,
      uploadsThisMonth: uploadsBase + (countsAsUpload ? 1 : 0),
    };
  });
}

/**
 * Which cap, if any, this upload breached.
 *
 * These used to be enforced in `storage.rules`, which refused the upload
 * outright. That required cross-service rules and an IAM binding that CLI
 * deploys do not create, so every upload failed with an opaque 403. The checks
 * live here now: the object lands, and if it should not have, it is removed
 * immediately. See the header comment in storage.rules.
 */
function breachedCap(usage: UsageAfter): string | null {
  if (usage.userBytes > PER_USER_STORAGE_BYTES) return 'per-user-storage';
  if (usage.uploadsThisMonth > PER_USER_UPLOADS_PER_MONTH) return 'per-user-monthly-uploads';
  if (usage.systemBytes > GLOBAL_STORAGE_BYTES) return 'global-storage';
  return null;
}

/** Shown to the user on the rejected report, so the removal is not a mystery. */
const CAP_MESSAGES: Record<string, string> = {
  'per-user-storage':
    'This report would have taken you over your 400 MB storage allowance, so it was not kept. Delete a report you no longer need and upload it again.',
  'per-user-monthly-uploads':
    'You have used all your uploads for this month, so this report was not kept. Your allowance resets on the 1st.',
  'global-storage':
    'The service is at capacity, so this report could not be kept. Please try again later.',
};

export const onReportUploaded = onObjectFinalized(
  {
    region: REGION,
    // Larger than the delete trigger: this one parses a PDF and waits on two
    // model round trips.
    memory: '1GiB',
    timeoutSeconds: 540,
    secrets: AI_SECRETS,
    retry: false,
  },
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

    const usage = await applyDelta(event.data.name, parsed.userId, size, true);
    if (!usage) return; // duplicate delivery, already counted

    const breach = breachedCap(usage);
    if (breach) {
      // Remove it and let the delete trigger unwind the counters, so the
      // rejection leaves no trace in the user's usage. The Firestore report
      // record is marked rather than deleted: the user attempted this upload
      // and deserves to see why it did not survive.
      logger.warn('Upload breached a capacity cap and was removed', {
        userId: parsed.userId,
        reportId: parsed.reportId,
        breach,
        bytes: size,
      });
      await getStorage().bucket(event.data.bucket).file(event.data.name).delete()
        .catch((error: unknown) => logger.error('Failed to remove over-quota object', { error }));

      await getFirestore().collection('reports')
        .where('storagePath', '==', event.data.name).limit(1).get()
        .then((snap) => snap.docs[0]?.ref.set(
          {
            status: 'failed',
            warnings: [{ code: `quota/${breach}`, message: CAP_MESSAGES[breach] ?? 'Storage limit reached.' }],
          },
          { merge: true },
        ))
        .catch((error: unknown) => logger.error('Failed to mark report rejected', { error }));
      return;
    }

    logger.info('Storage usage incremented', {
      userId: parsed.userId,
      reportId: parsed.reportId,
      bytes: size,
    });

    // Only now — an object that breached a cap was removed above and must not
    // be processed, and processing before the counters moved would let a
    // burst of uploads bypass the budget entirely.
    const reportDoc = await getFirestore()
      .collection('reports')
      .where('storagePath', '==', event.data.name)
      .limit(1)
      .get();
    const report = reportDoc.docs[0];
    if (!report) {
      // The client writes the Firestore record only after the bytes land, so a
      // brief gap is normal rather than an error.
      logger.warn('No report record for finalized object yet', { name: event.data.name });
      return;
    }

    await processReport({
      id: report.id,
      ownerId: parsed.userId,
      storagePath: event.data.name,
      bucket: event.data.bucket,
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
