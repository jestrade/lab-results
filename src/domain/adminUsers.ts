/**
 * Presentation rules for the account list (KAN-50, KAN-2).
 *
 * Everything here is pure, and everything here is about *accounts* rather than
 * about people's results. That boundary is deliberate: the admin console can
 * see who exists, what role they hold and whether they may sign in, and it has
 * no reason to see a laboratory value. `firestore.rules` grants an admin
 * `list` on `users/{userId}` and read on their `variableSeries`; this screen
 * uses the first and never the second.
 */

import type { Timestamp } from 'firebase/firestore';

import { readPage } from './pagination';
import type { UserProfile, UserRole } from './types';

/**
 * One row of the account list.
 *
 * A narrowing of `UserProfile` rather than the profile itself, and the reason
 * is what is missing from it: no consents, no health context, no preferences.
 * A type that carried them would put a person's date of birth and medication
 * list one property access away on a screen that has no business rendering
 * them, and the difference between "we do not show it" and "we do not read it"
 * is the difference an audit would care about.
 */
export interface AccountRow {
  uid: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  disabled: boolean;
  createdAt: Timestamp | null;
}

/** Reads a profile document into a row, keeping only what the console shows. */
export function toAccountRow(uid: string, data: Partial<UserProfile>): AccountRow {
  return {
    uid,
    email: typeof data.email === 'string' ? data.email : '',
    displayName:
      typeof data.displayName === 'string' && data.displayName.trim()
        ? data.displayName
        : null,
    // The stored role is a display mirror of the custom claim, and an
    // unrecognised value must read as the lesser privilege rather than the
    // greater — a corrupt field should not present as an admin.
    role: data.role === 'admin' ? 'admin' : 'user',
    disabled: data.disabled === true,
    createdAt: (data.createdAt as Timestamp | undefined) ?? null,
  };
}

export type RoleFilter = 'all' | UserRole;
export type AccessFilter = 'all' | 'active' | 'disabled';

export interface AccountFilters {
  query: string;
  role: RoleFilter;
  access: AccessFilter;
  /** Which page of the filtered list is on screen — see `adminCatalog`. */
  page: number;
}

/**
 * Filters live in the address bar, as they do on every other list in this app:
 * a refresh keeps the view, and "the disabled accounts" is a link that can be
 * sent to whoever asked about them.
 */
export function readFilters(params: URLSearchParams): AccountFilters {
  const role = params.get('role');
  const access = params.get('access');

  return {
    query: params.get('q') ?? '',
    role: role === 'admin' || role === 'user' ? role : 'all',
    access: access === 'active' || access === 'disabled' ? access : 'all',
    page: readPage(params),
  };
}

export function filterParams(filters: AccountFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('q', filters.query);
  if (filters.role !== 'all') params.set('role', filters.role);
  if (filters.access !== 'all') params.set('access', filters.access);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

export function hasActiveFilters(filters: AccountFilters): boolean {
  return filters.query.trim() !== '' || filters.role !== 'all' || filters.access !== 'all';
}

/**
 * The accounts a set of filters selects.
 *
 * Search matches the address, the name and the uid. The uid is in there for
 * one reason and it is the important one: a support conversation, a Sentry
 * event and a Cloud Logging line all name an account by uid and never by
 * email, so it is the identifier an admin most often arrives holding.
 */
export function filterAccounts(
  accounts: readonly AccountRow[],
  filters: AccountFilters,
): AccountRow[] {
  const query = filters.query.trim().toLowerCase();

  return accounts.filter((account) => {
    if (filters.role !== 'all' && account.role !== filters.role) return false;
    if (filters.access === 'active' && account.disabled) return false;
    if (filters.access === 'disabled' && !account.disabled) return false;
    if (!query) return true;

    return [account.email, account.displayName ?? '', account.uid].some((field) =>
      field.toLowerCase().includes(query),
    );
  });
}

/**
 * Newest registration first.
 *
 * The default because of what an admin is usually doing here: answering a
 * question about somebody who signed up recently. An account with no
 * `createdAt` — one written before the field existed, or mid-creation as the
 * server timestamp resolves — sorts last rather than being treated as
 * infinitely old and jumping to the top of the list.
 */
export function sortAccounts(accounts: readonly AccountRow[]): AccountRow[] {
  return [...accounts].sort((left, right) => {
    const a = left.createdAt?.toMillis?.() ?? 0;
    const b = right.createdAt?.toMillis?.() ?? 0;
    return b - a;
  });
}

/**
 * Whether this row is the admin looking at the screen.
 *
 * The console refuses to change your own role or disable your own account, and
 * both refusals are enforced server-side in `roles.ts` and `userAdmin.ts` —
 * this is what lets the interface explain the rule instead of offering a button
 * that returns an error. An admin who locks themselves out cannot unlock
 * themselves, and on a project with one admin that is every administrative
 * operation gone.
 */
export function isSelf(account: AccountRow, currentUid: string | null | undefined): boolean {
  return Boolean(currentUid) && account.uid === currentUid;
}
