/**
 * Authentication and authorization context (KAN-1, KAN-2).
 *
 * Holds the single source of truth for "who is signed in, and what may they
 * do". Two details worth knowing:
 *
 * **Role comes from the ID token, not from Firestore.** The `role` custom
 * claim is set server-side and travels inside the signed token, so it cannot
 * be forged by a client that can write its own profile document. The profile
 * doc mirrors it for display; this provider never trusts that mirror.
 *
 * **`loading` starts true and means "we do not know yet".** Firebase resolves
 * the persisted session asynchronously, so a guard that treats "no user yet"
 * as "signed out" will bounce a signed-in user to the login page on every hard
 * refresh. Guards must wait for `loading` to clear.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';

import { getAuthClient, googleProvider } from '@/lib/firebase';
import { setMonitoringUser } from '@/lib/sentry';
import { ensureUserProfile, recordConsents } from '@/services/profiles';
import type { UserRole } from '@/domain/types';
import { AuthContext, type AuthContextValue, type RegistrationConsents } from './AuthContext';


function roleFromClaims(claims: Record<string, unknown>): UserRole {
  return claims.role === 'admin' ? 'admin' : 'user';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onIdTokenChanged rather than onAuthStateChanged: it also fires when the
    // token is refreshed, which is how a newly granted admin claim reaches the
    // UI without the user signing out and back in.
    const unsubscribe = onIdTokenChanged(getAuthClient(), async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        const token = await nextUser.getIdTokenResult();
        setRole(roleFromClaims(token.claims));
      } else {
        setRole(null);
      }
      setMonitoringUser(nextUser?.uid ?? null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(getAuthClient(), email, password);
    await ensureUserProfile(credential.user);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const credential = await signInWithPopup(getAuthClient(), googleProvider());
    // A Google account arrives already verified, and the provider has already
    // shown its own consent screen — but our AI-processing consent is ours to
    // collect, so the profile records what we know and the app asks for the
    // rest on first upload.
    await ensureUserProfile(credential.user);
  }, []);

  const register = useCallback(
    async ({
      name,
      email,
      password,
      acceptedTerms,
      acceptedAiProcessing,
    }: { name: string; email: string; password: string } & RegistrationConsents) => {
      const credential = await createUserWithEmailAndPassword(
        getAuthClient(),
        email,
        password,
      );
      if (name.trim()) {
        await updateProfile(credential.user, { displayName: name.trim() });
      }
      await ensureUserProfile(credential.user);
      await recordConsents(credential.user.uid, { acceptedTerms, acceptedAiProcessing });
      await sendEmailVerification(credential.user);
    },
    [],
  );

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(getAuthClient(), email);
  }, []);

  const resendVerification = useCallback(async () => {
    const current = getAuthClient().currentUser;
    if (!current) throw new Error('No signed-in user to verify.');
    await sendEmailVerification(current);
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(getAuthClient());
  }, []);

  const refresh = useCallback(async () => {
    const current = getAuthClient().currentUser;
    if (!current) return;
    await current.reload();
    const token = await current.getIdTokenResult(true);
    setRole(roleFromClaims(token.claims));
    // reload() mutates the User in place; copy the reference so React re-renders
    // with the new emailVerified value.
    setUser(getAuthClient().currentUser);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      loading,
      isAuthenticated: user !== null,
      isEmailVerified: user?.emailVerified ?? false,
      isAdmin: role === 'admin',
      signInWithEmail,
      signInWithGoogle,
      register,
      sendPasswordReset,
      resendVerification,
      signOutUser,
      refresh,
    }),
    [
      user,
      role,
      loading,
      signInWithEmail,
      signInWithGoogle,
      register,
      sendPasswordReset,
      resendVerification,
      signOutUser,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
