/**
 * Nightly usage reconciliation and the capacity kill switch (spec §79).
 *
 * The event-driven counters in `usage.ts` can drift: a dropped event, a
 * function that errored after the object landed, or an object deleted straight
 * from the console. Drift in the safe direction wastes quota; drift in the
 * unsafe direction hands out space that does not exist. Neither is acceptable
 * as a steady state, so once a day the truth is recomputed from the bucket
 * itself, which is the only authority on what is actually stored.
 *
 * This job is also what protects the *bill* rather than the quota: if real
 * usage has crossed the global cap despite everything, it flips
 * `uploadsDisabled`, which `storage.rules` honours immediately and without a
 * deploy.
 */

import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import {
  GLOBAL_STORAGE_BYTES,
  PER_USER_STORAGE_BYTES,
  SYSTEM_USAGE_COLLECTION,
  SYSTEM_USAGE_DOC,
  USAGE_COLLECTION,
  parseReportPath,
} from './quotas';
import { REGION } from './region';


/** Re-enable uploads automatically once usage falls back under this. */
const RESUME_BELOW_BYTES = Math.floor(GLOBAL_STORAGE_BYTES * 0.95);

interface Recomputed {
  perUser: Map<string, { bytes: number; ledger: Record<string, number> }>;
  total: number;
  objectCount: number;
}

async function recomputeFromBucket(): Promise<Recomputed> {
  const perUser = new Map<string, { bytes: number; ledger: Record<string, number> }>();
  let total = 0;
  let objectCount = 0;

  // Paged rather than a single getFiles(): the whole listing must never have
  // to fit in this function's memory, however large the bucket grows.
  // `nextQuery` is the library's own pagination handle and is null once the
  // listing is exhausted — more reliable than reading nextPageToken off the
  // raw API response, which is not always populated.
  //
  // The result is annotated rather than inferred: inference would make the
  // type of the returned query refer back to `nextQuery`, which TypeScript
  // rejects as circular.
  type PageQuery = Record<string, unknown>;
  type StorageFile = { name: string; metadata: { size?: string | number } };

  let nextQuery: PageQuery | null = {
    prefix: 'users/',
    maxResults: 1000,
    autoPaginate: false,
  };

  while (nextQuery) {
    const [files, following] = (await getStorage()
      .bucket()
      .getFiles(nextQuery)) as unknown as [StorageFile[], PageQuery | null];

    for (const file of files) {
      const parsed = parseReportPath(file.name);
      if (!parsed) continue;

      const size = Number(file.metadata.size ?? 0);
      if (!Number.isFinite(size) || size <= 0) continue;

      const entry = perUser.get(parsed.userId) ?? { bytes: 0, ledger: {} };
      entry.bytes += size;
      entry.ledger[file.name.replace(/[./]/g, '_')] = size;
      perUser.set(parsed.userId, entry);

      total += size;
      objectCount += 1;
    }

    nextQuery = following ?? null;
  }

  return { perUser, total, objectCount };
}

export async function reconcile(): Promise<{
  total: number;
  users: number;
  corrections: number;
  overQuotaUsers: string[];
  uploadsDisabled: boolean;
}> {
  const db = getFirestore();
  const { perUser, total, objectCount } = await recomputeFromBucket();

  let corrections = 0;
  const overQuotaUsers: string[] = [];

  // Every user who has ever had a usage document, so that someone who deleted
  // all their reports is corrected back to zero rather than left stale.
  const existing = await db.collection(USAGE_COLLECTION).get();
  const userIds = new Set<string>([
    ...perUser.keys(),
    ...existing.docs.map((doc) => doc.id),
  ]);

  for (const userId of userIds) {
    const actual = perUser.get(userId) ?? { bytes: 0, ledger: {} };
    const stored = existing.docs.find((doc) => doc.id === userId)?.data();
    const storedBytes = (stored?.storageBytes as number | undefined) ?? 0;

    if (storedBytes !== actual.bytes) {
      logger.warn('Corrected drifted usage counter', {
        userId,
        storedBytes,
        actualBytes: actual.bytes,
        driftBytes: actual.bytes - storedBytes,
      });
      corrections += 1;
    }

    if (actual.bytes > PER_USER_STORAGE_BYTES) overQuotaUsers.push(userId);

    // The upload counter is deliberately NOT rebuilt here: it counts
    // operations spent, and a deleted object still spent one. Only bytes and
    // the ledger are derived from what is actually in the bucket.
    const ref = db.collection(USAGE_COLLECTION).doc(userId);
    await ref.set(
      {
        userId,
        storageBytes: actual.bytes,
        reconciledAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    // Replaces the map wholesale. A merged write would only ever add keys, so
    // entries for objects that no longer exist would survive every
    // reconciliation — the opposite of what this job is for. `update` on a
    // single field replaces its value outright, and the `set` above guarantees
    // the document exists.
    await ref.update('ledger', actual.ledger);
  }

  const systemRef = db.collection(SYSTEM_USAGE_COLLECTION).doc(SYSTEM_USAGE_DOC);
  const systemSnap = await systemRef.get();
  const wasDisabled = (systemSnap.data()?.uploadsDisabled as boolean | undefined) ?? false;

  // Trip the switch when over cap; release it only once there is real room
  // again, so usage hovering on the line doesn't flap uploads on and off.
  const shouldDisable = total >= GLOBAL_STORAGE_BYTES;
  const uploadsDisabled = shouldDisable ? true : wasDisabled && total > RESUME_BELOW_BYTES;

  if (uploadsDisabled !== wasDisabled) {
    logger.warn('Upload kill switch changed', { from: wasDisabled, to: uploadsDisabled, total });
  }

  await systemRef.set(
    {
      storageBytes: total,
      objectCount,
      userCount: userIds.size,
      uploadsDisabled,
      uploadsDisabledReason: uploadsDisabled ? 'global-storage-cap-reached' : null,
      reconciledAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  logger.info('Reconciliation complete', {
    totalBytes: total,
    capBytes: GLOBAL_STORAGE_BYTES,
    percentOfCap: Math.round((total / GLOBAL_STORAGE_BYTES) * 100),
    objectCount,
    users: userIds.size,
    corrections,
    overQuotaUsers: overQuotaUsers.length,
  });

  return { total, users: userIds.size, corrections, overQuotaUsers, uploadsDisabled };
}

export const reconcileUsage = onSchedule(
  {
    region: REGION,
    // 03:15 UTC — off the hour, so it doesn't queue behind every other
    // midnight job in the project.
    schedule: '15 3 * * *',
    timeZone: 'Etc/UTC',
    memory: '512MiB',
    timeoutSeconds: 540,
    retryCount: 2,
  },
  async () => {
    await reconcile();
  },
);
