/**
 * Account deletion (KAN-23, spec §57).
 *
 * A hard delete, not a flag. When this returns, nothing that identifies the
 * account remains: no profile, no reports, no extracted results, no trend
 * series, no usage counter, no stored PDF, no audit entry naming them, and no
 * Firebase Auth record. `users/{uid}.deletedAt` is deliberately not written —
 * a tombstone carrying a uid and a date is still a record of the person, and
 * the point of this function is that there is nothing left to keep.
 *
 * ── Why it cannot be a client delete ──────────────────────────────────────
 *
 * `firestore.rules` denies `delete` on `users/{uid}` outright, and it has to:
 * the browser cannot delete a subcollection, cannot touch the `results` of a
 * report (which no client may write), and cannot remove the Auth record. The
 * Admin SDK bypasses the rules, which is exactly why every one of the checks
 * below runs before a single byte is removed.
 *
 * ── Order of operations ───────────────────────────────────────────────────
 *
 * Data first, Auth record last. If a step fails halfway, the user is still
 * signed in and can simply run it again — each step is idempotent, and deleting
 * what is already gone is a no-op. Reversing the order would leave orphaned
 * health data with no owner and no one able to retry.
 *
 * The usage counters are settled *before* the objects are removed. `usage.ts`
 * decrements on every `onObjectDeleted` event, so the naive order would race:
 * those triggers would fire after we had deleted `usage/{uid}` and recreate the
 * document with a merged write. Zeroing and deleting first makes each of those
 * triggers a no-op, because `applyDelta` ignores a delete event for an object
 * it has no ledger entry for. Whatever drift survives is corrected by the
 * nightly `reconcileUsage`, which recomputes from the bucket itself.
 */

import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import {
  SYSTEM_USAGE_COLLECTION,
  SYSTEM_USAGE_DOC,
  USAGE_COLLECTION,
} from './quotas';
import { REGION } from './region';

/**
 * The word the caller must send. Not security — a stolen ID token could send
 * it too — but it does mean nothing deletes an account by being called with an
 * empty body, which a mis-wired button or a stray retry can manage.
 */
export const CONFIRMATION_PHRASE = 'DELETE';

/**
 * How recently the caller must have proved who they are.
 *
 * Same reasoning as the password change in `services/account.ts`: someone who
 * finds an unlocked laptop with a live session must not be able to destroy the
 * owner's medical history in two clicks. Firebase already enforces recency on
 * `user.delete()`; this function does not go through it, so the check is made
 * here rather than inherited.
 */
export const REAUTH_MAX_AGE_SECONDS = 5 * 60;

/** Reports are deleted a page at a time so one huge account cannot exhaust memory. */
const REPORT_PAGE_SIZE = 100;

export interface DeletionSummary {
  reports: number;
  storageObjects: number;
  /** Audit entries deleted or stripped of this user's identifier. */
  auditEntries: number;
}

/**
 * Was the caller's session authenticated within the window?
 *
 * `auth_time` is when the credential was actually presented, not when the token
 * was minted — a refreshed token carries the original sign-in time, so an hour
 * of silent refreshes cannot age into permission to delete.
 */
export function isRecentlyAuthenticated(
  authTimeSeconds: unknown,
  nowSeconds: number,
  maxAgeSeconds: number = REAUTH_MAX_AGE_SECONDS,
): boolean {
  if (typeof authTimeSeconds !== 'number' || !Number.isFinite(authTimeSeconds)) return false;
  // A future auth_time means clock skew rather than a fresh sign-in; treat the
  // age as zero rather than letting a negative number pass every window.
  const age = Math.max(0, nowSeconds - authTimeSeconds);
  return age <= maxAgeSeconds;
}

/**
 * Settles the counters, then removes the user's usage document.
 *
 * The user's bytes are subtracted from the global total by hand because the
 * per-object delete triggers are about to be neutered — see the header note.
 */
async function releaseUsage(uid: string): Promise<void> {
  const db = getFirestore();
  const userRef = db.collection(USAGE_COLLECTION).doc(uid);
  const systemRef = db.collection(SYSTEM_USAGE_COLLECTION).doc(SYSTEM_USAGE_DOC);

  await db.runTransaction(async (tx) => {
    const [userSnap, systemSnap] = await Promise.all([tx.get(userRef), tx.get(systemRef)]);
    if (!userSnap.exists) return;

    const userBytes = (userSnap.data()?.storageBytes as number | undefined) ?? 0;
    const systemBytes = (systemSnap.data()?.storageBytes as number | undefined) ?? 0;

    tx.set(
      systemRef,
      {
        // Clamped for the same reason `applyDelta` clamps: a negative total
        // would silently hand every user unlimited space.
        storageBytes: Math.max(0, systemBytes - userBytes),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.delete(userRef);
  });
}

/**
 * Removes every object under `users/{uid}/`, not just the report PDFs.
 *
 * The prefix is wider than `parseReportPath` meters on purpose: anything ever
 * written under this user's tree goes, including paths a future feature adds
 * that this function has not been taught about.
 */
async function deleteStoredFiles(uid: string): Promise<number> {
  const bucket = getStorage().bucket();
  const prefix = `users/${uid}/`;

  const [files] = await bucket.getFiles({ prefix });
  if (files.length === 0) return 0;

  // `force` keeps going after an individual failure and then rejects with what
  // failed, rather than stopping at the first error and leaving the rest of the
  // user's files behind.
  await bucket.deleteFiles({ prefix, force: true });
  return files.length;
}

/**
 * Deletes the user's reports and, with them, the `results` subcollection that
 * holds every extracted value.
 *
 * `recursiveDelete` per document rather than one shared BulkWriter: the pages
 * are small, and a writer whose lifetime spans the loop is one more thing to
 * get wrong in a function whose failure mode is orphaned health data.
 */
async function deleteReports(uid: string): Promise<number> {
  const db = getFirestore();
  let deleted = 0;

  for (;;) {
    const page = await db
      .collection('reports')
      .where('ownerId', '==', uid)
      .limit(REPORT_PAGE_SIZE)
      .get();
    if (page.empty) return deleted;

    for (const doc of page.docs) {
      await db.recursiveDelete(doc.ref);
      deleted += 1;
    }
  }
}

/**
 * Takes this user's identifier out of the audit trail.
 *
 * An audit log is append-only everywhere else in this system, and this is the
 * one exception: a deletion that leaves `targetId: <uid>` behind has not
 * deleted the user's data, it has relocated it.
 *
 * The two cases are not the same, though, and treating them the same would be
 * a mistake:
 *
 *   the user was the TARGET — the entry is a record *about them*, so it goes.
 *   the user was the ACTOR  — the entry is a record about *someone else*, and
 *                             that person's audit history is not the departing
 *                             user's to erase. The identifier is cleared and
 *                             the entry stays.
 *
 * Target first, so an entry where the user is both (an admin promoting
 * themselves) is deleted rather than redacted.
 */
async function purgeAuditLogs(uid: string): Promise<number> {
  const db = getFirestore();
  let affected = 0;

  for (;;) {
    const page = await db.collection('auditLogs').where('targetId', '==', uid).limit(200).get();
    if (page.empty) break;

    const batch = db.batch();
    page.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    affected += page.size;
  }

  for (;;) {
    // Terminates because the update is what the query selects on: once an
    // entry's actorId is null it can never come back on the next page.
    const page = await db.collection('auditLogs').where('actorId', '==', uid).limit(200).get();
    if (page.empty) break;

    const batch = db.batch();
    page.docs.forEach((doc) =>
      batch.update(doc.ref, { actorId: null, actorRedactedAt: FieldValue.serverTimestamp() }),
    );
    await batch.commit();
    affected += page.size;
  }

  return affected;
}

/** Everything except the Auth record, which the caller removes last. */
export async function eraseUserData(uid: string): Promise<DeletionSummary> {
  await releaseUsage(uid);
  const storageObjects = await deleteStoredFiles(uid);
  const reports = await deleteReports(uid);
  // Takes the variableSeries subcollection with it — a trend series is a
  // history of the person's results, and is no more keepable than the results.
  await getFirestore().recursiveDelete(getFirestore().collection('users').doc(uid));
  const auditEntries = await purgeAuditLogs(uid);

  return { reports, storageObjects, auditEntries };
}

export const deleteAccount = onCall(
  { region: REGION, memory: '512MiB', timeoutSeconds: 540 },
  async (request): Promise<DeletionSummary> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }

    const { confirmation } = (request.data ?? {}) as { confirmation?: unknown };
    if (confirmation !== CONFIRMATION_PHRASE) {
      throw new HttpsError(
        'invalid-argument',
        `Send confirmation: "${CONFIRMATION_PHRASE}" to delete an account.`,
      );
    }

    if (
      !isRecentlyAuthenticated(request.auth.token.auth_time, Math.floor(Date.now() / 1000))
    ) {
      // The client catches this code specifically and re-authenticates, so the
      // wording has to survive being shown to whoever gets here another way.
      throw new HttpsError(
        'failed-precondition',
        'Sign in again before deleting your account.',
      );
    }

    // Deleting the account is the one thing a disabled or unverified user is
    // still entitled to do, so there is no further gate beyond identity.
    const uid = request.auth.uid;
    const summary = await eraseUserData(uid);

    // Last, and only once the data is gone. Doing this first would leave health
    // records behind with no owner and nobody able to retry the deletion.
    await getAuth().deleteUser(uid);

    // Deliberately anonymous. It records that a self-service deletion happened
    // and how much it removed — enough to spot a runaway loop or answer "did
    // the deletion actually run" — while naming nobody. Writing the uid here
    // would undo the entire function.
    await getFirestore().collection('auditLogs').add({
      action: 'account.deleted',
      actorId: null,
      targetId: null,
      selfService: true,
      reportsDeleted: summary.reports,
      objectsDeleted: summary.storageObjects,
      at: FieldValue.serverTimestamp(),
    });

    // No uid in the log line either — Cloud Logging retains these for 30 days.
    logger.info('Account deleted', {
      reports: summary.reports,
      storageObjects: summary.storageObjects,
      auditEntries: summary.auditEntries,
    });

    return summary;
  },
);
