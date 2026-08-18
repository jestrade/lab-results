/**
 * Where an account belongs after signing in (KAN-18, KAN-2).
 *
 * Two roles, two homes, and they are genuinely different screens rather than
 * one screen with more on it for some people:
 *
 *   user   → /variables, their own results
 *   admin  → /admin, the state of the system holding everybody's
 *
 * One function rather than the same ternary in the sign-in form, the guards and
 * the legacy `/dashboard` redirect. Three copies of a routing rule is three
 * places for it to be changed twice and forgotten once, and the failure it
 * produces — an admin landing on the reader's page, or worse, a reader sent to
 * an admin route they are then bounced out of — looks like a broken app rather
 * than like a stale branch.
 *
 * A `null` role is a reader's path, not an admin's. It is what a session in the
 * middle of resolving reports, and defaulting the unknown case to the
 * privileged screen would mean flashing the admin dashboard at everybody.
 */

import type { UserRole } from '@/domain/types';

export const USER_HOME = '/variables';
export const ADMIN_HOME = '/admin';

export function landingPathFor(role: UserRole | null | undefined): string {
  return role === 'admin' ? ADMIN_HOME : USER_HOME;
}
