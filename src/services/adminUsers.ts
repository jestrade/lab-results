/**
 * Reading and changing accounts (KAN-50, KAN-2).
 *
 * Reads go straight to Firestore, which `firestore.rules` permits: `users/{userId}`
 * allows `list` to an admin. Writes do not, and the asymmetry is the point —
 * the rules would let an admin write `role` and `disabled` on a profile
 * document directly, and both would be lies. The claim inside the ID token is
 * what grants admin, and the flag on the Auth record is what blocks a sign-in;
 * the profile fields are mirrors of each, maintained by the callables that set
 * the real thing. Writing a mirror from here would produce a console that
 * disagrees with the system it is administering.
 */

import {
  collection,
  limit as limitTo,
  onSnapshot,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { getDb, getFunctionsClient } from '@/lib/firebase';
import { toAccountRow, type AccountRow } from '@/domain/adminUsers';
import type { UserProfile, UserRole } from '@/domain/types';

const USERS = 'users';

/** How many accounts one subscription carries before the admin asks for more. */
export const ACCOUNT_PAGE_SIZE = 100;

/**
 * Accounts, live.
 *
 * Bounded, unlike the variable catalog subscription next door. The catalog is
 * reference data with a known ceiling; this collection grows with the product,
 * and an unbounded listener on it would eventually mean every admin page load
 * reading every account that has ever registered. `limit` is raised by the
 * page rather than fixed, so "show more" costs one larger query instead of
 * cursor state that has to survive a live snapshot reordering itself.
 *
 * ── Why this does not order by `createdAt` in the query ──────────────────
 *
 * It used to, so that the limit and the ordering cut the list at the same
 * place and the window was the *newest* hundred rather than an arbitrary
 * hundred. That is the better window, and it cost an account its visibility.
 *
 * Firestore omits a document that lacks the ordered field entirely — not
 * sorts it last, omits it. A profile written without `createdAt` therefore
 * did not appear in this console at all: no row, no count, and a search for
 * the address coming back empty for an account that demonstrably exists.
 * That is the one wrong answer this screen must not give, and it is worse by
 * a wide margin than showing a hundred accounts in an unhelpful order.
 *
 * The comment that used to sit here said such a profile was unreachable
 * because `ensureUserProfile` always writes the field. Then
 * `grant-admin.mjs` created an admin by writing the mirror directly, and the
 * account that could not be seen was the one belonging to the person looking.
 * An invariant that depends on every future writer remembering is not an
 * invariant; ordering on a field every document is guaranteed to have — the
 * implicit `__name__` this query now falls back on — is.
 *
 * The ordering the reader sees is `sortAccounts`, applied in the page over
 * whatever has been loaded, and it puts a dateless account last rather than
 * nowhere.
 */
export function subscribeToAccounts(
  count: number,
  onChange: (accounts: AccountRow[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(getDb(), USERS), limitTo(count)),
    (snapshot) =>
      onChange(
        snapshot.docs.map((entry) =>
          toAccountRow(entry.id, entry.data() as Partial<UserProfile>),
        ),
      ),
    (error) => onError?.(error),
  );
}

export interface RoleChange {
  userId: string;
  role: UserRole;
  previousRole: UserRole;
}

/**
 * Grants or removes admin (KAN-2).
 *
 * The callable sets the `role` custom claim, which is what `firestore.rules`
 * and `storage.rules` trust, and mirrors it onto the profile afterwards. It
 * refuses to remove the caller's own admin rights — see `functions/src/roles.ts`.
 *
 * The change reaches the target's open sessions on their next token refresh,
 * within the hour. There is no way to shorten that from here, so the dialog
 * says it rather than implying the change is instant.
 */
export async function setUserRole(userId: string, role: UserRole): Promise<RoleChange> {
  const call = httpsCallable<{ userId: string; role: UserRole }, RoleChange>(
    getFunctionsClient(),
    'setUserRole',
  );
  const { data } = await call({ userId, role });
  return data;
}

export interface AccessChange {
  userId: string;
  disabled: boolean;
  previouslyDisabled: boolean;
}

/**
 * Blocks or restores sign-in for one account (KAN-50).
 *
 * A callable because disabling is an Auth operation: the flag that actually
 * stops a sign-in lives on the Firebase Auth record, which no browser can
 * write. `functions/src/userAdmin.ts` sets it, revokes the account's refresh
 * tokens, mirrors the state onto the profile and writes the audit entry.
 *
 * `reason` is optional and goes to the audit log beside who did it and when.
 * It is never shown to the account holder.
 */
export async function setUserDisabled(
  userId: string,
  disabled: boolean,
  reason?: string,
): Promise<AccessChange> {
  const call = httpsCallable<
    { userId: string; disabled: boolean; reason?: string },
    AccessChange
  >(getFunctionsClient(), 'setUserDisabled');
  const { data } = await call({ userId, disabled, ...(reason ? { reason } : {}) });
  return data;
}
