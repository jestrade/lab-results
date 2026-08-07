/**
 * Role management (KAN-2).
 *
 * The `role` custom claim is what `firestore.rules` and `storage.rules` trust,
 * so setting it is the single most privileged operation in the system. It
 * lives here, behind an admin-only callable, because a claim the client can
 * influence is not an authorization mechanism.
 *
 * Bootstrapping: the very first admin cannot be granted through this function
 * (there is no admin to call it). Grant it once from a trusted shell:
 *
 *   firebase functions:shell
 *   > admin.auth().setCustomUserClaims('<uid>', { role: 'admin' })
 *
 * or with the Admin SDK from a machine holding service-account credentials.
 */

import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { REGION } from './region';

const ROLES = ['user', 'admin'] as const;
type Role = (typeof ROLES)[number];

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export const setUserRole = onCall(
  { region: REGION, memory: '256MiB' },
  async (request) => {
    if (request.auth?.token.role !== 'admin') {
      // Same message either way: an unauthenticated caller learns nothing
      // about whether the function exists or what it would have needed.
      throw new HttpsError('permission-denied', 'Not permitted.');
    }

    const { userId, role } = (request.data ?? {}) as { userId?: unknown; role?: unknown };

    if (typeof userId !== 'string' || userId.length === 0) {
      throw new HttpsError('invalid-argument', 'userId is required.');
    }
    if (!isRole(role)) {
      throw new HttpsError('invalid-argument', `role must be one of: ${ROLES.join(', ')}.`);
    }
    if (userId === request.auth.uid && role !== 'admin') {
      // Removing your own admin rights can leave a project with no admins.
      throw new HttpsError('failed-precondition', 'You cannot remove your own admin role.');
    }

    const user = await getAuth().getUser(userId);
    const previousRole = (user.customClaims?.role as string | undefined) ?? 'user';

    await getAuth().setCustomUserClaims(userId, { ...user.customClaims, role });

    const db = getFirestore();
    // The profile mirror is display-only; the claim above is the real grant.
    await db.collection('users').doc(userId).set(
      { role, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    // KAN-21. Written here rather than by the caller so the record cannot be
    // omitted by whoever performed the change.
    await db.collection('auditLogs').add({
      action: 'role.changed',
      actorId: request.auth.uid,
      targetId: userId,
      previousRole,
      newRole: role,
      at: FieldValue.serverTimestamp(),
    });

    logger.info('Role changed', { actorId: request.auth.uid, targetId: userId, previousRole, role });

    // The claim reaches the target's session on their next token refresh —
    // within the hour, or immediately if they call getIdToken(true).
    return { userId, role, previousRole };
  },
);
