/**
 * Route guards (KAN-1, KAN-2).
 *
 * Each guard answers one question and renders `<Outlet />` when the answer is
 * yes. They are deliberately separate so a route can compose exactly the
 * conditions it needs — `RequireAuth` alone for browsing, plus
 * `RequireVerifiedEmail` for uploading, plus `RequireRole` for the admin area.
 *
 * These are a usability layer, not the security boundary: they decide what to
 * render, and `firestore.rules` / `storage.rules` decide what may be read and
 * written. A user who edits their way past a guard sees an empty page, not
 * someone else's results.
 *
 * ── Where the role comes from, and why that is the whole point ────────────
 *
 * `role` is read from the `role` custom claim inside the signed ID token (see
 * `AuthProvider`), never from the profile document. The profile mirrors it for
 * display, and the mirror is writable by an admin — so a guard that trusted it
 * would be an authorization check against a field the console edits. The claim
 * is set only by `setUserRole`, server-side, and travels signed.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from './useAuth';
import { FullPageSpinner } from '@/components/Spinner';
import { landingPathFor } from './landing';
import type { UserRole } from '@/domain/types';

export function RequireAuth() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner label="Checking your session" />;
  if (!isAuthenticated) {
    // Remember where they were headed so sign-in can return them there.
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

export function RequireVerifiedEmail() {
  const { isEmailVerified, loading } = useAuth();

  if (loading) return <FullPageSpinner label="Checking your session" />;
  if (!isEmailVerified) return <Navigate to="/verify-email" replace />;
  return <Outlet />;
}

export function RequireRole({ role }: { role: UserRole }) {
  const { role: currentRole, loading } = useAuth();

  if (loading) return <FullPageSpinner label="Checking your access" />;
  // Bounced to their own landing page rather than to a refusal. Someone who
  // followed a stale link to /admin is far more often a reader who should not
  // have been sent it than an attacker, and the rules — not this — are what
  // stop the second kind from reading anything either way.
  if (currentRole !== role) return <Navigate to={landingPathFor(currentRole)} replace />;
  return <Outlet />;
}

/** Sends an already-signed-in user away from the public auth screens. */
export function RedirectIfSignedIn() {
  const { isAuthenticated, role, loading } = useAuth();

  if (loading) return <FullPageSpinner label="Checking your session" />;
  if (isAuthenticated) return <Navigate to={landingPathFor(role)} replace />;
  return <Outlet />;
}

/**
 * The role-aware front door.
 *
 * Mounted at `/dashboard`, which is where sign-in sends anyone who was not
 * already heading somewhere specific. It exists because the destination cannot
 * be decided at the moment the credential is accepted: `onIdTokenChanged` has
 * to resolve the token before the claim inside it is readable, so a `navigate`
 * called straight after `signInWithEmail` would be choosing while the answer
 * was still `null` — and would send every admin to the reader's home page once
 * per sign-in.
 *
 * Landing on a route that waits for `loading` to clear moves the decision to
 * the first moment it can honestly be made.
 */
export function LandingRedirect() {
  const { role, loading } = useAuth();

  if (loading) return <FullPageSpinner label="Checking your session" />;
  return <Navigate to={landingPathFor(role)} replace />;
}
