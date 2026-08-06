/**
 * Clearing the tracked variable data (KAN-45, spec §57).
 *
 * `users/{uid}/variableSeries` is a denormalised history: the pipeline folds
 * every processed report into it, and the grid on /variables and the charts on
 * /trends read nothing else. Deleting a report removes the PDF and the record
 * that pointed at it — it cannot remove the report's contribution to a series,
 * because a series point carries a value and an instant and no trace of which
 * report produced it (see `updateSeries` in pipeline.ts).
 *
 * The user is therefore left looking at values from a report they deleted, with
 * no way to remove them. This callable is that way: it drops the whole series
 * collection for one account.
 *
 * ── Why the whole collection, and not just the deleted report's points ─────
 *
 * Because the points do not say where they came from, and inventing an answer
 * would be worse than the problem. Stamping a reportId onto every point from
 * now on would still leave every existing series unattributable, so a
 * per-report unwind would work for future uploads and silently do nothing for
 * the history the user is actually looking at. All-or-nothing is the honest
 * shape, and the dialog in the web app says so before anything is removed.
 *
 * ── Why it cannot be a client delete ──────────────────────────────────────
 *
 * `firestore.rules` denies every client write to `variableSeries`, and that
 * denial is what lets the grid present a trend as computed rather than claimed.
 * Opening it up for deletes would mean a browser could also delete a subset,
 * and "some of the history is gone" is a state nothing in this system can tell
 * apart from "that is the whole history".
 *
 * ── What this deliberately leaves alone ───────────────────────────────────
 *
 * The reports and their extracted `results`. Those are the record; the series
 * is the shape derived from it. A user who clears the series still has every
 * report and every value on its details page, and the account-wide erase
 * (`deleteAccount`) is what removes those.
 */

import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { REGION } from './region';

/**
 * The word the caller must send.
 *
 * Not security — a stolen ID token could send it too — but it does mean no
 * account loses its history to a call with an empty body, which a mis-wired
 * button or a stray retry can manage. Same reasoning as `deleteAccount`.
 */
export const CONFIRMATION_PHRASE = 'CLEAR';

/** Firestore batches cap at 500 writes; stay well under it. */
const DELETE_CHUNK = 400;

export interface ClearSummary {
  /** Series documents removed — one per tracked variable. */
  cleared: number;
}

/**
 * Deletes every series document belonging to one user.
 *
 * `listDocuments` rather than `get`: only the references are needed, and this
 * way a series document is never read into memory just to be thrown away.
 * Deleting what is already gone is a no-op, so a half-finished run is fixed by
 * running it again.
 */
export async function clearVariableSeries(uid: string): Promise<number> {
  const db = getFirestore();
  const refs = await db
    .collection('users')
    .doc(uid)
    .collection('variableSeries')
    .listDocuments();

  for (let index = 0; index < refs.length; index += DELETE_CHUNK) {
    const batch = db.batch();
    refs.slice(index, index + DELETE_CHUNK).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  return refs.length;
}

export const clearVariableData = onCall(
  { region: REGION, memory: '256MiB', timeoutSeconds: 120 },
  async (request): Promise<ClearSummary> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }

    const { confirmation } = (request.data ?? {}) as { confirmation?: unknown };
    if (confirmation !== CONFIRMATION_PHRASE) {
      throw new HttpsError(
        'invalid-argument',
        `Send confirmation: "${CONFIRMATION_PHRASE}" to clear variable data.`,
      );
    }

    // Only ever the caller's own subcollection. There is no target parameter
    // for the same reason `deleteAccount` has none: a uid in the payload is a
    // uid an attacker gets to choose.
    const uid = request.auth.uid;
    const cleared = await clearVariableSeries(uid);

    // No uid in the log line — Cloud Logging retains these for 30 days, and
    // "this account tracks 34 variables" is health data by itself.
    logger.info('Variable data cleared', { cleared });

    return { cleared };
  },
);
