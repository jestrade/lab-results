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
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from './useAuth';
import { FullPageSpinner } from '@/components/Spinner';
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
  if (currentRole !== role) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Sends an already-signed-in user away from the public auth screens. */
export function RedirectIfSignedIn() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <FullPageSpinner label="Checking your session" />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
