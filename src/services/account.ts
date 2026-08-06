/**
 * Account credential operations (KAN-27, spec §78.4).
 *
 * Separate from `profiles.ts` because these touch Firebase Auth rather than
 * Firestore. A profile edit is a document write; a password change is a
 * credential change, and Firebase treats it as such — it refuses outright if
 * the session is more than a few minutes old.
 */

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

import { getFunctionsClient, googleProvider } from '@/lib/firebase';

/** Firebase's identifier for the email/password sign-in method. */
const PASSWORD_PROVIDER = 'password';

/**
 * Can this account change a password at all?
 *
 * A Google-only account has no password to change. Showing it the form would
 * be offering something that cannot work: `updatePassword` would fail, and the
 * error ("no current user credential") explains nothing to the person reading
 * it. Better to check first and say why.
 */
export function hasPasswordSignIn(user: User): boolean {
  // Defaulted rather than assumed present: a partially hydrated user should
  // hide the password form, not crash the whole profile page.
  return (user.providerData ?? []).some((provider) => provider?.providerId === PASSWORD_PROVIDER);
}

/**
 * Changes the password, proving the current one first.
 *
 * The re-authentication is not ceremony. Without it, anyone who finds an
 * unlocked laptop with a live session can lock the real owner out of their own
 * medical records in two clicks. Firebase enforces recency on this operation
 * anyway; asking for the current password is what turns its generic
 * `auth/requires-recent-login` failure into something the user can act on.
 */
export async function changePassword(
  user: User,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!user.email) {
    throw new Error('This account has no email address to re-authenticate with.');
  }

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  // Throws `auth/wrong-password` or `auth/invalid-credential`, which
  // `toAuthErrorMessage` already renders as "that password is not right" —
  // the same wording as a failed sign-in, because it is the same failure.
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

/**
 * Keeps the Auth display name in step with the profile document.
 *
 * Two copies exist whether we like it or not: Firestore holds the profile, and
 * Auth holds a `displayName` that Google sign-in populates and that the app
 * reads before the profile document has loaded. Writing only one leaves the
 * sidebar showing a name the user has already changed.
 */
export async function syncAuthDisplayName(user: User, displayName: string): Promise<void> {
  await updateProfile(user, { displayName });
}

/**
 * Proves the person at the keyboard is the account holder, whichever way they
 * sign in.
 *
 * Google accounts go through the provider's own popup rather than a password
 * field they do not have. Either way the effect is the same: the ID token's
 * `auth_time` moves to now, which is what `deleteAccount` checks server-side.
 */
export async function reauthenticate(user: User, password?: string): Promise<void> {
  if (!hasPasswordSignIn(user)) {
    await reauthenticateWithPopup(user, googleProvider());
    return;
  }

  if (!user.email) {
    throw new Error('This account has no email address to re-authenticate with.');
  }
  if (!password) {
    throw new Error('Enter your password to continue.');
  }
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
}

/**
 * The word the user types to confirm deletion, and the one the callable
 * demands. Exported so the form, its tests and the server all name the same
 * string rather than three copies that can drift.
 */
export const DELETION_CONFIRMATION = 'DELETE';

export interface DeletionSummary {
  reports: number;
  storageObjects: number;
  auditEntries: number;
}

/**
 * Deletes the account and everything belonging to it (KAN-23, spec §57).
 *
 * A callable rather than a client-side cascade, and not for convenience:
 * `firestore.rules` denies the browser a delete on `users/{uid}` outright, the
 * extracted results are Admin-SDK-only by design, and no client can remove its
 * own Firebase Auth record along with the Storage objects in one atomic-ish
 * unit. The whole workflow lives in functions/src/deleteAccount.ts.
 *
 * Call `reauthenticate` first. The server requires a session that proved itself
 * in the last few minutes and answers `failed-precondition` if it did not.
 */
export async function deleteAccountAndData(): Promise<DeletionSummary> {
  const call = httpsCallable<{ confirmation: string }, DeletionSummary>(
    getFunctionsClient(),
    'deleteAccount',
  );
  const { data } = await call({ confirmation: DELETION_CONFIRMATION });
  return data;
}
