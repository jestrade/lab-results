/**
 * Reprocessing a report that did not make it (KAN-7).
 *
 * `onReportUploaded` is declared with `retry: false` and runs exactly once. A
 * rate-limited provider, a cold model, or a finalize event that arrived before
 * the browser had written the Firestore record all leave a report stranded —
 * and until now the only way out was to upload the file again, which spends an
 * upload operation and a second copy of the bytes for a file the system
 * already has. This callable re-runs the pipeline over the object that is
 * already in the bucket.
 *
 * Three things make that safe to expose:
 *
 *   1. The claim is a transaction. Two tabs, or a double click, produce one
 *      run — the second sees `processing` with a fresh timestamp and is told
 *      the report is already working.
 *   2. Attempts are counted on the document and capped. Processing spends AI
 *      calls, and an unbounded retry button is an unbounded bill.
 *   3. Failures that cannot succeed on a second reading are refused rather
 *      than attempted (see config/retry.json).
 *
 * The caller is normally the report's owner. An admin is also allowed, and
 * only for one reason: the console's job list (KAN-20) shows reports stranded
 * across every account, and the person who could rescue them from their own
 * file list is exactly the person who cannot tell that anything is stuck. The
 * policy is not relaxed for them — same cap, same cooldown, same refusals —
 * and the act is written to the audit log, which an owner's own retry is not.
 *
 * The results subcollection is cleared before the new run. Result ids encode
 * the row's position on the report, so a second extraction that finds fewer
 * rows would otherwise leave the tail of the first one behind, mixed in with
 * the new values and indistinguishable from them.
 */

import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { AI_SECRETS } from './ai/config';
import { processReport } from './pipeline';
import { REGION } from './region';
import policy from './retry.generated.json';

/** Retries allowed per report, on top of the automatic first run. */
export const MAX_RETRIES = policy.maxRetriesPerReport;

export const RETRY_COOLDOWN_MS = policy.cooldownSeconds * 1000;

/** After this, an in-flight report is presumed to have lost its worker. */
export const STALE_PROCESSING_MS = policy.staleAfterMinutes * 60_000;

export const PERMANENT_FAILURE_CODES: readonly string[] = policy.permanentFailureCodes;
export const PERMANENT_FAILURE_PREFIXES: readonly string[] = policy.permanentFailurePrefixes;

/** Statuses where work was started and never finished. */
const IN_FLIGHT = new Set(['uploaded', 'queued', 'processing']);

/** Firestore batches cap at 500 writes; stay well under it. */
const DELETE_CHUNK = 400;

/**
 * Would a second attempt read the same file and fail the same way?
 *
 * Judged on the first warning because that is the one that stopped the run —
 * `processReport` writes the reason it gave up as a single-element array.
 */
export function isPermanentFailure(warnings: { code?: string }[] | undefined): boolean {
  const code = warnings?.[0]?.code;
  if (!code) return false;
  return (
    PERMANENT_FAILURE_CODES.includes(code) ||
    PERMANENT_FAILURE_PREFIXES.some((prefix) => code.startsWith(prefix))
  );
}

export interface RetryState {
  status: string;
  warnings?: { code?: string }[];
  retryCount?: number;
  /** When the last retry was *started*. */
  lastRetryAtMs?: number | null;
  /** When the current attempt started — `processingStartedAt`, else `uploadedAt`. */
  startedAtMs?: number | null;
}

export type RetryDecision =
  | { allowed: true }
  | {
      allowed: false;
      /** Maps onto an HttpsError code; every refusal here is the client's to fix or wait out. */
      reason:
        | 'nothing-to-retry'
        | 'permanent-failure'
        | 'still-processing'
        | 'limit-reached'
        | 'cooling-down';
      message: string;
    };

/**
 * The whole policy, as a pure function, so the rules that decide whether a
 * user's health record gets reprocessed can be read and tested without a
 * Firestore emulator.
 */
export function retryDecision(state: RetryState, nowMs: number): RetryDecision {
  const attempts = state.retryCount ?? 0;

  if (IN_FLIGHT.has(state.status)) {
    // No start time means the document predates `processingStartedAt`; treat
    // it as stale rather than as permanently unretryable, since an in-flight
    // status with no timestamp is exactly the stuck case this recovers.
    const age = state.startedAtMs == null ? Infinity : nowMs - state.startedAtMs;
    if (age < STALE_PROCESSING_MS) {
      return {
        allowed: false,
        reason: 'still-processing',
        message:
          'This report is being processed right now. Results appear as soon as it finishes.',
      };
    }
  } else if (state.status !== 'failed') {
    return {
      allowed: false,
      reason: 'nothing-to-retry',
      message: 'This report has already been processed.',
    };
  } else if (isPermanentFailure(state.warnings)) {
    return {
      allowed: false,
      reason: 'permanent-failure',
      message:
        'Reprocessing this file would fail the same way. Please upload a different copy of the report.',
    };
  }

  if (attempts >= MAX_RETRIES) {
    return {
      allowed: false,
      reason: 'limit-reached',
      message: `This report has already been retried ${MAX_RETRIES} times. Please upload it again, or contact support if it keeps failing.`,
    };
  }

  if (state.lastRetryAtMs != null && nowMs - state.lastRetryAtMs < RETRY_COOLDOWN_MS) {
    return {
      allowed: false,
      reason: 'cooling-down',
      message: 'This report was retried a moment ago. Give it a minute before trying again.',
    };
  }

  return { allowed: true };
}

const REFUSAL_STATUS = {
  'nothing-to-retry': 'failed-precondition',
  'permanent-failure': 'failed-precondition',
  'still-processing': 'failed-precondition',
  'limit-reached': 'resource-exhausted',
  'cooling-down': 'resource-exhausted',
} as const;

/** Either the refusal to raise, or what the run needs. Never both. */
interface ClaimResult {
  error?: HttpsError;
  ok?: { attempt: number; storagePath: string; ownerId: string };
}

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

/**
 * Removes the results of the previous attempt.
 *
 * `listDocuments` rather than `get`: the ids are all that is needed, and a
 * failed run can have left a partial set whose contents are of no interest.
 */
async function clearResults(reportId: string): Promise<number> {
  const db = getFirestore();
  const refs = await db.collection('reports').doc(reportId).collection('results').listDocuments();

  for (let index = 0; index < refs.length; index += DELETE_CHUNK) {
    const batch = db.batch();
    refs.slice(index, index + DELETE_CHUNK).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  return refs.length;
}

export const retryReport = onCall(
  {
    region: REGION,
    // Matches onReportUploaded: this runs the identical pipeline, PDF parsing
    // and model round trips included.
    memory: '1GiB',
    timeoutSeconds: 540,
    secrets: AI_SECRETS,
  },
  async (request): Promise<{ status: string; attempt: number }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }

    const { reportId } = (request.data ?? {}) as { reportId?: unknown };
    if (typeof reportId !== 'string' || reportId === '') {
      throw new HttpsError('invalid-argument', 'A reportId is required.');
    }

    const db = getFirestore();
    const ref = db.collection('reports').doc(reportId);
    const uid = request.auth.uid;
    // The claim the rules trust everywhere else. An admin reaches this for the
    // admin console's job list (KAN-20), where the whole point is rescuing a
    // report belonging to someone who cannot see it is stuck.
    const isAdmin = request.auth.token.role === 'admin';

    // ── claim ────────────────────────────────────────────────────────────
    //
    // Reading the state and marking the report as ours happen in one
    // transaction, so a second caller cannot pass the same checks before the
    // first has moved the status.
    const claim = await db.runTransaction<ClaimResult>(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: new HttpsError('not-found', 'That report does not exist.') };

      const data = snap.data()!;
      const ownerId = String(data.ownerId ?? '');
      if (ownerId !== uid && !isAdmin) {
        // Same answer a stranger gets from `firestore.rules` for a report they
        // do not own, and it does not confirm the id belongs to anybody.
        return {
          error: new HttpsError('permission-denied', 'That report does not belong to you.'),
        };
      }

      const attempt = ((data.retryCount as number | undefined) ?? 0) + 1;
      const decision = retryDecision(
        {
          status: String(data.status ?? ''),
          warnings: (data.warnings as { code?: string }[] | undefined) ?? [],
          retryCount: attempt - 1,
          lastRetryAtMs: millis(data.lastRetryAt),
          startedAtMs: millis(data.processingStartedAt) ?? millis(data.uploadedAt),
        },
        Date.now(),
      );
      if (!decision.allowed) {
        return { error: new HttpsError(REFUSAL_STATUS[decision.reason], decision.message) };
      }

      tx.set(
        ref,
        {
          status: 'processing',
          processingStartedAt: FieldValue.serverTimestamp(),
          retryCount: attempt,
          lastRetryAt: FieldValue.serverTimestamp(),
          // The previous reason is cleared now rather than when the new run
          // finishes: leaving it in place would show the user a stale failure
          // notice underneath a report that says it is processing.
          warnings: [],
        },
        { merge: true },
      );

      return {
        ok: {
          attempt,
          ownerId,
          storagePath: String(data.storagePath ?? ''),
        },
      };
    });

    if (claim.error) throw claim.error;
    const { attempt, ownerId, storagePath } = claim.ok!;

    // KAN-21. An admin reprocessing somebody else's report is an
    // administrative act on another person's health record, so it is recorded
    // with who did it — while an owner retrying their own upload is not, and
    // logging it would bury the entries that matter under everyday use.
    if (ownerId !== uid) {
      await db.collection('auditLogs').add({
        action: 'report.retried',
        actorId: uid,
        targetId: ownerId,
        reportId,
        attempt,
        at: FieldValue.serverTimestamp(),
      });
    }

    const bucket = getStorage().bucket();
    const [exists] = await bucket.file(storagePath).exists();
    if (!exists) {
      // Nothing to read: the object was removed, by a capacity rejection or by
      // a half-finished delete. Say so on the report rather than running the
      // pipeline into a download error.
      const message =
        'The uploaded file is no longer stored, so this report cannot be reprocessed. Please upload it again.';
      await ref.set(
        { status: 'failed', warnings: [{ code: 'storage/object-missing', message }] },
        { merge: true },
      );
      logger.warn('Retry refused: stored object is gone', { reportId, attempt });
      throw new HttpsError('failed-precondition', message);
    }

    const cleared = await clearResults(reportId);
    logger.info('Retrying report', { reportId, attempt, clearedResults: cleared, actorId: uid, ownerId });

    try {
      // The document's owner, not the caller. It decides whose AI-processing
      // consent is checked and whose variable series the results are written
      // to — passing the caller would have made an admin retry read the admin's
      // consent and land the values on the wrong account.
      await processReport({ id: reportId, ownerId, storagePath, bucket: bucket.name });
    } catch (error) {
      // `processReport` writes its own `failed` status for every outcome it
      // anticipates; this is for the ones it does not. Without it the report
      // would sit in `processing` until the staleness window let the user try
      // again — technically recoverable, but a quarter of an hour of looking
      // like it is still working.
      logger.error('Retry crashed', { reportId, attempt, error });
      await ref.set(
        {
          status: 'failed',
          warnings: [
            {
              code: 'processing/unexpected-error',
              message:
                'Something went wrong while reprocessing this report. Please try again in a few minutes.',
            },
          ],
        },
        { merge: true },
      );
      throw new HttpsError('internal', 'Reprocessing failed.');
    }

    // Read back rather than assumed: `processReport` handles its own failures
    // and returns normally after writing `failed`, so a caller told "success"
    // here would cheerfully announce a report that failed a second time.
    const after = await ref.get();
    const status = String(after.data()?.status ?? 'failed');
    logger.info('Retry finished', { reportId, attempt, status });

    return { status, attempt };
  },
);
