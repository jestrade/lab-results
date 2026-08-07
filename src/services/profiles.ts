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
  deleteField,
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
import { isLocale, type Locale } from '@/domain/locales';
import { isThemePreference, type ThemePreference } from '@/domain/themes';
import type { HealthContext, UserConsents, UserProfile } from '@/domain/types';

const USERS = 'users';

export function userDocRef(uid: string) {
  return doc(getDb(), USERS, uid);
}

/**
 * Creates the profile document if this is the first time we have seen the
 * account. Safe to call on every sign-in: an existing profile is left alone,
 * so a returning user's preferences and consent history are never reset.
 *
 * `locale` is the language the account was created in, so the choice made on
 * the registration page follows the user to their next device instead of
 * having to be made again there.
 */
export async function ensureUserProfile(user: User, locale?: Locale): Promise<void> {
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
      ...(locale ? { locale } : {}),
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Stores the chosen interface language (KAN-8).
 *
 * Written as a dotted field path rather than a whole `preferences` object, so
 * that changing the language cannot wipe the notification settings that live
 * beside it — a `updateDoc({ preferences: { locale } })` would replace the map.
 *
 * Permitted by the same `users/{uid}` update rule as the display name:
 * `preferences` is not in the forbidden list, and the owner check applies.
 */
export async function updateLocalePreference(uid: string, locale: Locale): Promise<void> {
  await updateDoc(userDocRef(uid), {
    'preferences.locale': locale,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Stores the chosen colour theme.
 *
 * A dotted field path for the same reason the language is: writing a whole
 * `preferences` object would replace the map and take the notification
 * settings and the locale with it.
 *
 * Stores the *preference*, so `system` is written as `system` rather than as
 * whichever theme the device happened to be showing when the choice was made.
 * Resolving before storing would mean a reader who chose "follow my device" on
 * a laptop in daylight arrives at their phone that evening locked to light.
 */
export async function updateThemePreference(
  uid: string,
  theme: ThemePreference,
): Promise<void> {
  await updateDoc(userDocRef(uid), {
    'preferences.theme': theme,
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
 * Live view of the whole profile.
 *
 * Subscribed for the same reason consent is: the display name shown in the
 * sidebar and the one on this form have to be the same value, and a profile
 * edited in another tab should not leave a stale copy behind.
 */
export function subscribeToProfile(
  uid: string,
  onChange: (profile: UserProfile | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    userDocRef(uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }
      onChange({ ...(snapshot.data() as Omit<UserProfile, 'uid'>), uid } as UserProfile);
    },
    (error) => onError?.(error),
  );
}

/**
 * Writes the optional health context (KAN-27, spec §51).
 *
 * Nulls are written, not omitted. Omitting a cleared field would leave the old
 * value in place, so "I removed my medication list" would silently mean "I
 * kept it" — the one behaviour that must not happen to a record the user is
 * trying to take back.
 *
 * Protected by exactly the rules that protect laboratory data: the `users/{uid}`
 * update rule in `firestore.rules` lets only the owner write, and forbids the
 * security-relevant fields entirely.
 */
export async function updateHealthContext(
  uid: string,
  context: Omit<HealthContext, 'updatedAt'>,
): Promise<void> {
  await updateDoc(userDocRef(uid), {
    healthContext: { ...context, updatedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
}

/**
 * Removes the health context entirely.
 *
 * `deleteField` rather than writing an object of nulls: a user who clears this
 * is asking for the data to be gone, and a document that still carries the
 * shape of a health record — with every value emptied — is not the same as one
 * that never had it.
 */
export async function clearHealthContext(uid: string): Promise<void> {
  await updateDoc(userDocRef(uid), {
    healthContext: deleteField(),
    updatedAt: serverTimestamp(),
  });
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
 * Live view of the stored language preference (KAN-8).
 *
 * Subscribed rather than fetched for the same reason consent is: the choice
 * belongs to the account, not to the tab it was made in. Changing the language
 * on a phone should reach the desktop session that is already open, and a
 * second tab left in English after the user switched is the kind of
 * inconsistency that reads as the setting not having saved.
 *
 * Emits `null` when the profile has no stored preference — an account created
 * before the picker existed, which must keep following the browser rather than
 * be forced to English.
 */
export function subscribeToLocalePreference(
  uid: string,
  onChange: (locale: Locale | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    userDocRef(uid),
    (snapshot) => {
      const preferences = snapshot.data()?.preferences as { locale?: unknown } | undefined;
      onChange(isLocale(preferences?.locale) ? preferences.locale : null);
    },
    (error) => onError?.(error),
  );
}

/**
 * Live view of the stored theme preference.
 *
 * Subscribed for the same reason the language is: the choice belongs to the
 * account, not to the tab it was made in. A second tab left in light after the
 * reader switched to dark is exactly the kind of inconsistency that reads as
 * the setting not having saved.
 *
 * Emits `null` when the profile has no stored preference — an account created
 * before the picker existed, which must keep following the device rather than
 * be forced to light.
 */
export function subscribeToThemePreference(
  uid: string,
  onChange: (theme: ThemePreference | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    userDocRef(uid),
    (snapshot) => {
      const preferences = snapshot.data()?.preferences as { theme?: unknown } | undefined;
      onChange(isThemePreference(preferences?.theme) ? preferences.theme : null);
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
