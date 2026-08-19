/**
 * Account access management (KAN-50, KAN-2).
 *
 * Disabling an account is an Auth operation, not a Firestore one. `users/{uid}`
 * carries a `disabled` field and `firestore.rules` lets an admin write it — but
 * writing it is a note about the account, not a lock on it. What actually stops
 * someone signing in is the `disabled` flag on the Firebase Auth record, which
 * only the Admin SDK can set. A console that flipped the mirror alone would
 * show every admin a disabled account that could still sign in and upload.
 *
 * So this callable owns both halves, in an order chosen for what survives a
 * failure: Auth first, then the mirror. If the mirror write fails afterwards,
 * the account is locked and the console shows it as active — visibly wrong, and
 * fixed by running it again. The reverse order would show it as disabled while
 * the account kept working, which nobody would think to check.
 *
 * ── What "disabled" does and does not reach ───────────────────────────────
 *
 * Disabling blocks new sign-ins and refuses to refresh an expiring token, and
 * `revokeRefreshTokens` below makes every existing session unable to renew. It
 * does not reach into an ID token that has already been minted: `firestore.rules`
 * validates the token's signature and claims, not the current state of the Auth
 * record, so a session open at the moment of disabling can keep reading its own
 * data until that token expires — an hour at the outside. This is the same
 * property `roles.ts` documents from the other direction, where a new admin
 * claim reaches a session on its next refresh.
 *
 * The interface says so rather than promising an instant lock it cannot
 * deliver. For an account that must lose access *now*, delete it (KAN-23).
 */

import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { REGION } from './region';

/**
 * How much of a reason is kept.
 *
 * Long enough for a sentence naming the ticket or the report that prompted it,
 * short enough that the audit collection cannot be used as free storage by
 * whoever holds an admin token.
 */
export const MAX_REASON_LENGTH = 500;

/**
 * The reason as it will be stored, or null.
 *
 * An empty or whitespace-only reason becomes `null` rather than `''`: the audit
 * entry should say "no reason was given", and a stored empty string is a reason
 * that exists and says nothing.
 */
export function normaliseReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const reason = value.trim().slice(0, MAX_REASON_LENGTH);
  return reason || null;
}

export interface AccessChange {
  userId: string;
  disabled: boolean;
  /** What it was before, so the caller can tell a change from a no-op. */
  previouslyDisabled: boolean;
}

export const setUserDisabled = onCall(
  { region: REGION, memory: '256MiB' },
  async (request): Promise<AccessChange> => {
    if (request.auth?.token.role !== 'admin') {
      // Same message for an unauthenticated caller as for a signed-in
      // non-admin: neither learns whether this function exists. Matches
      // `setUserRole`, which guards the other half of this screen.
      throw new HttpsError('permission-denied', 'Not permitted.');
    }

    const { userId, disabled, reason } = (request.data ?? {}) as {
      userId?: unknown;
      disabled?: unknown;
      reason?: unknown;
    };

    if (typeof userId !== 'string' || userId.length === 0) {
      throw new HttpsError('invalid-argument', 'userId is required.');
    }
    if (typeof disabled !== 'boolean') {
      throw new HttpsError('invalid-argument', 'disabled must be a boolean.');
    }
    if (userId === request.auth.uid) {
      // An admin who locks themselves out cannot unlock themselves, and on a
      // project with one admin that is the end of every administrative
      // operation until someone reaches for a service account. Same reasoning
      // as the self-demotion guard in `roles.ts`.
      throw new HttpsError('failed-precondition', 'You cannot disable your own account.');
    }

    const user = await getAuth().getUser(userId);
    const previouslyDisabled = user.disabled === true;

    await getAuth().updateUser(userId, { disabled });

    if (disabled) {
      // Ends the ability to renew a session. Existing ID tokens still run out
      // their remaining lifetime — see the header note.
      await getAuth().revokeRefreshTokens(userId);
    }

    const db = getFirestore();
    // Display only. The Auth record above is the actual lock; this is what the
    // admin console reads, and `firestore.rules` forbids the account itself
    // from writing it.
    await db
      .collection('users')
      .doc(userId)
      .set({ disabled, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // KAN-21. Written here rather than by the caller, so the record cannot be
    // omitted by whoever performed the change.
    await db.collection('auditLogs').add({
      action: disabled ? 'user.disabled' : 'user.enabled',
      actorId: request.auth.uid,
      targetId: userId,
      reason: normaliseReason(reason),
      at: FieldValue.serverTimestamp(),
    });

    logger.info('Account access changed', {
      actorId: request.auth.uid,
      targetId: userId,
      disabled,
      previouslyDisabled,
    });

    return { userId, disabled, previouslyDisabled };
  },
);
