/**
 * User profile documents (KAN-2).
 *
 * The client creates its own profile on first sign-in and may then edit only
 * the parts that belong to the user. Note what is *absent* from the create
 * payload: `role`, `disabled` and `deletedAt` are never sent, because
 * `firestore.rules` rejects a create that carries them — that is what stops an
 * account from declaring itself an admin. A Cloud Function fills them in from
 * the custom claim.
 */

import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';

import { getDb } from '@/lib/firebase';
import { DOCUMENTS_VERSION } from '@/domain/disclaimers';
import type { UserConsents, UserProfile } from '@/domain/types';

const USERS = 'users';

export function userDocRef(uid: string) {
  return doc(getDb(), USERS, uid);
}

/**
 * Creates the profile document if this is the first time we have seen the
 * account. Safe to call on every sign-in: an existing profile is left alone,
 * so a returning user's preferences and consent history are never reset.
 */
export async function ensureUserProfile(user: User): Promise<void> {
  const ref = userDocRef(user.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) return;

  await setDoc(ref, {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName,
    consents: {
      termsAcceptedAt: null,
      aiProcessingAcceptedAt: null,
      documentsVersion: DOCUMENTS_VERSION,
    },
    preferences: {
      notifyOnProcessed: true,
      notifyOnCritical: true,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Records which documents the user accepted and when. Stored as timestamps
 * rather than booleans: "they ticked a box" is not evidence, "they accepted
 * version 2026-07-01 at this instant" is.
 */
export async function recordConsents(
  uid: string,
  { acceptedTerms, acceptedAiProcessing }: { acceptedTerms: boolean; acceptedAiProcessing: boolean },
): Promise<void> {
  await updateDoc(userDocRef(uid), {
    'consents.termsAcceptedAt': acceptedTerms ? serverTimestamp() : null,
    'consents.aiProcessingAcceptedAt': acceptedAiProcessing ? serverTimestamp() : null,
    'consents.documentsVersion': DOCUMENTS_VERSION,
    updatedAt: serverTimestamp(),
  });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(userDocRef(uid));
  if (!snapshot.exists()) return null;
  return { ...(snapshot.data() as Omit<UserProfile, 'uid'>), uid } as UserProfile;
}

export async function updateDisplayName(uid: string, displayName: string): Promise<void> {
  await updateDoc(userDocRef(uid), { displayName, updatedAt: serverTimestamp() });
}

/**
 * Live view of the consents on a profile (KAN-2, spec §54).
 *
 * Subscribed rather than fetched because consent can be granted in another tab
 * or on another device, and an upload gate that stays shut after the user has
 * agreed is indistinguishable from a broken app.
 */
export function subscribeToConsents(
  uid: string,
  onChange: (consents: UserConsents | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    userDocRef(uid),
    (snapshot) => {
      const data = snapshot.data();
      onChange((data?.consents as UserConsents | undefined) ?? null);
    },
    (error) => onError?.(error),
  );
}

/**
 * Records AI-processing consent on its own.
 *
 * Separate from `recordConsents` because the two are granted at different
 * moments: terms at registration, AI processing possibly much later — a Google
 * sign-up never passes through the registration form at all, so it reaches the
 * upload page having agreed to nothing about third-party AI.
 */
export async function withdrawAiProcessingConsent(uid: string): Promise<void> {
  // Cleared rather than deleted, so the field's absence still means "never
  // given" and a withdrawal is a distinct, observable event in the document's
  // history. Withdrawal has to be as easy as consent — the pipeline refuses to
  // send anything the moment this is null.
  await updateDoc(userDocRef(uid), {
    'consents.aiProcessingAcceptedAt': null,
    'consents.aiProcessingWithdrawnAt': serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function recordAiProcessingConsent(uid: string): Promise<void> {
  await updateDoc(userDocRef(uid), {
    'consents.aiProcessingAcceptedAt': serverTimestamp(),
    'consents.aiProcessingWithdrawnAt': null,
    'consents.documentsVersion': DOCUMENTS_VERSION,
    updatedAt: serverTimestamp(),
  });
}
