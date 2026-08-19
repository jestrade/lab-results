import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import type { AccountRow } from '@/domain/adminUsers';
import type * as AdminUsersModule from '@/services/adminUsers';
import { AdminUsers } from '../AdminUsers';

const subscribeToAccounts = vi.hoisted(() => vi.fn());
const setUserRole = vi.hoisted(() =>
  vi.fn((userId: string, role: string) =>
    Promise.resolve({ userId, role, previousRole: 'user' }),
  ),
);
const setUserDisabled = vi.hoisted(() =>
  vi.fn((userId: string, disabled: boolean, _reason?: string) =>
    Promise.resolve({ userId, disabled, previouslyDisabled: !disabled }),
  ),
);

vi.mock('@/services/adminUsers', async (importOriginal) => {
  const actual = await importOriginal<typeof AdminUsersModule>();
  return { ...actual, subscribeToAccounts, setUserRole, setUserDisabled };
});

function stamp(iso: string) {
  return { toDate: () => new Date(iso), toMillis: () => new Date(iso).getTime() } as never;
}

function makeAccount(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    uid: 'u1',
    email: 'ana@example.com',
    displayName: 'Ana Ruiz',
    role: 'user',
    disabled: false,
    createdAt: stamp('2026-03-01T00:00:00Z'),
    ...overrides,
  };
}

const bruno = makeAccount({
  uid: 'u2',
  email: 'bruno@example.com',
  displayName: null,
  role: 'admin',
  disabled: true,
  createdAt: stamp('2025-11-02T00:00:00Z'),
});

/** The signed-in admin's own row — the one the page must not offer to change. */
const me = makeAccount({ uid: 'test-uid', email: 'admin@example.com', role: 'admin' });

function emit(accounts: AccountRow[]) {
  (subscribeToAccounts.mock.calls.at(-1)?.[1] as (a: AccountRow[]) => void)(accounts);
}

function fail() {
  (subscribeToAccounts.mock.calls.at(-1)?.[2] as (e: Error) => void)(new Error('denied'));
}

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderPage(route = '/admin/users') {
  return renderWithProviders(
    <>
      <AdminUsers />
      <Search />
    </>,
    { auth: signedInAuth({ role: 'admin', isAdmin: true }), route },
  );
}

beforeEach(() => {
  subscribeToAccounts.mockReset();
  subscribeToAccounts.mockReturnValue(() => {});
  setUserRole.mockClear();
  setUserDisabled.mockClear();
});

describe('AdminUsers', () => {
  it('lists the accounts, newest registration first', async () => {
    const { container } = renderPage();
    emit([bruno, makeAccount()]);

    expect(await screen.findByText('ana@example.com')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('ana@example.com')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('bruno@example.com')).toBeInTheDocument();

    await expectNoA11yViolations(container);
  });

  it('shows the role and the access state of each account', async () => {
    renderPage();
    emit([makeAccount(), bruno]);

    const disabled = (await screen.findByText('bruno@example.com')).closest('tr')!;
    expect(within(disabled).getByText('Admin')).toBeInTheDocument();
    expect(within(disabled).getByText('Disabled')).toBeInTheDocument();

    const active = screen.getByText('ana@example.com').closest('tr')!;
    expect(within(active).getByText('User')).toBeInTheDocument();
    expect(within(active).getByText('Active')).toBeInTheDocument();
  });

  it('names an account with no display name rather than leaving a blank', async () => {
    renderPage();
    emit([bruno]);

    expect(await screen.findByText('No name given')).toBeInTheDocument();
  });

  it('shows the uid, which is what a log line names an account by', async () => {
    renderPage();
    emit([makeAccount()]);

    expect(await screen.findByText('u1')).toBeInTheDocument();
  });

  it('reports a failed subscription', async () => {
    renderPage();
    fail();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The accounts could not be loaded.',
    );
  });

  it('searches by address, name or uid and keeps it in the address bar', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeAccount(), bruno]);

    await user.type(await screen.findByLabelText('Search accounts'), 'bruno');

    await waitFor(() => expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument());
    expect(screen.getByText('bruno@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('q=bruno');
  });

  it('restores the filters a URL carries', async () => {
    renderPage('/admin/users?access=disabled');
    emit([makeAccount(), bruno]);

    expect(await screen.findByText('bruno@example.com')).toBeInTheDocument();
    expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument();
  });

  it('filters by role', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeAccount(), bruno]);

    await user.click(await screen.findByRole('button', { name: 'Admin' }));

    expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument();
    expect(screen.getByText('bruno@example.com')).toBeInTheDocument();
  });
});

describe('the admin looking at the screen', () => {
  it('is marked, and offered neither action on themselves', async () => {
    renderPage();
    emit([me, makeAccount()]);

    const own = (await screen.findByText('admin@example.com')).closest('tr')!;
    expect(within(own).getByText('You cannot change your own role or access.')).toBeInTheDocument();
    // Both refusals are enforced in the callables; the interface explains the
    // rule rather than offering a button that comes back an error.
    expect(
      within(own).queryByRole('button', { name: /Change the role/ }),
    ).not.toBeInTheDocument();
    expect(within(own).queryByRole('button', { name: /Disable/ })).not.toBeInTheDocument();
  });
});

describe('changing a role', () => {
  it('says what admin can reach before it asks', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeAccount()]);

    await user.click(
      await screen.findByRole('button', { name: 'Change the role of ana@example.com' }),
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/can read every account in the system/)).toBeInTheDocument();
    // The change travels in the ID token, so it is not instant and the dialog
    // must not imply that it is.
    expect(within(dialog).getByText(/next time it refreshes/)).toBeInTheDocument();
  });

  it('grants admin only after the confirming click', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeAccount()]);

    await user.click(
      await screen.findByRole('button', { name: 'Change the role of ana@example.com' }),
    );
    expect(setUserRole).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Make admin' }));

    await waitFor(() => expect(setUserRole).toHaveBeenCalledWith('u1', 'admin'));
    expect(await screen.findByText('ana@example.com is now Admin.')).toBeInTheDocument();
  });

  it('offers to remove admin from an account that holds it', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([bruno]);

    await user.click(
      await screen.findByRole('button', { name: 'Change the role of bruno@example.com' }),
    );
    await user.click(screen.getByRole('button', { name: 'Make user' }));

    await waitFor(() => expect(setUserRole).toHaveBeenCalledWith('u2', 'user'));
  });

  it('keeps the dialog open and explains a refusal', async () => {
    const user = userEvent.setup();
    setUserRole.mockRejectedValueOnce(new Error('permission-denied'));
    renderPage();
    emit([makeAccount()]);

    await user.click(
      await screen.findByRole('button', { name: 'Change the role of ana@example.com' }),
    );
    await user.click(screen.getByRole('button', { name: 'Make admin' }));

    expect(await screen.findByText('The role could not be changed.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('disabling an account', () => {
  it('says what is kept and how long an open session survives', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeAccount()]);

    await user.click(await screen.findByRole('button', { name: 'Disable ana@example.com' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Nothing is deleted/)).toBeInTheDocument();
    // An already-minted token outlives the disabling, because the rules read
    // the token and not the Auth record.
    expect(within(dialog).getByText(/until its token expires/)).toBeInTheDocument();
  });

  it('sends the optional reason to the audit log', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeAccount()]);

    await user.click(await screen.findByRole('button', { name: 'Disable ana@example.com' }));
    await user.type(screen.getByLabelText('Reason (optional)'), 'abuse report KAN-99');
    await user.click(screen.getByRole('button', { name: 'Disable account' }));

    await waitFor(() =>
      expect(setUserDisabled).toHaveBeenCalledWith('u1', true, 'abuse report KAN-99'),
    );
    expect(await screen.findByText('ana@example.com can no longer sign in.')).toBeInTheDocument();
  });

  it('omits an empty reason rather than sending a blank one', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeAccount()]);

    await user.click(await screen.findByRole('button', { name: 'Disable ana@example.com' }));
    await user.click(screen.getByRole('button', { name: 'Disable account' }));

    await waitFor(() => expect(setUserDisabled).toHaveBeenCalledWith('u1', true, undefined));
  });

  it('re-enables a disabled account, and asks for no reason to do it', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([bruno]);

    await user.click(await screen.findByRole('button', { name: 'Re-enable bruno@example.com' }));
    expect(screen.queryByLabelText('Reason (optional)')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Re-enable account' }));

    await waitFor(() => expect(setUserDisabled).toHaveBeenCalledWith('u2', false, undefined));
    expect(await screen.findByText('bruno@example.com can sign in again.')).toBeInTheDocument();
  });

  it('explains a failure and leaves the account as it was', async () => {
    const user = userEvent.setup();
    setUserDisabled.mockRejectedValueOnce(new Error('offline'));
    renderPage();
    emit([makeAccount()]);

    await user.click(await screen.findByRole('button', { name: 'Disable ana@example.com' }));
    await user.click(screen.getByRole('button', { name: 'Disable account' }));

    expect(
      await screen.findByText('The account’s access could not be changed.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('the page limit', () => {
  it('says the list is truncated, so an empty search is not read as "no such account"', async () => {
    renderPage();
    emit(Array.from({ length: 100 }, (_, index) => makeAccount({ uid: `u${index}`, email: `u${index}@example.com` })));

    // The wording no longer promises "most recent": the query stopped ordering
    // on `createdAt`, because ordering on a field a document can lack is what
    // made an account invisible in the first place.
    expect(await screen.findByText(/Showing 100 accounts/)).toBeInTheDocument();
  });

  it('asks for a larger page rather than paging with a cursor', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(Array.from({ length: 100 }, (_, index) => makeAccount({ uid: `u${index}`, email: `u${index}@example.com` })));

    await user.click(await screen.findByRole('button', { name: 'Load more accounts' }));

    await waitFor(() => expect(subscribeToAccounts.mock.calls.at(-1)?.[0]).toBe(200));
  });

  it('stays quiet when every account already fits', async () => {
    renderPage();
    emit([makeAccount()]);

    await screen.findByText('ana@example.com');
    expect(screen.queryByRole('button', { name: 'Load more accounts' })).not.toBeInTheDocument();
  });
});

describe('paging the accounts', () => {
  /** 30 accounts — enough to need a second page at 25 per page. */
  function manyAccounts() {
    return Array.from({ length: 30 }, (_, index) =>
      makeAccount({
        uid: `u${String(index + 1).padStart(2, '0')}`,
        email: `person${String(index + 1).padStart(2, '0')}@example.com`,
        // Descending registration order matches the table's initial sort, so
        // the assertions below are about the page and not about the sort.
        createdAt: stamp(`2026-06-${String(30 - index).padStart(2, '0')}T00:00:00Z`),
      }),
    );
  }

  it('shows one page at a time and says how much of the list that is', async () => {
    renderPage();
    emit(manyAccounts());

    expect(await screen.findByText('person01@example.com')).toBeInTheDocument();
    expect(screen.queryByText('person26@example.com')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1–25 of 30')).toBeInTheDocument();
  });

  it('puts the page in the address bar', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(manyAccounts());

    await user.click(await screen.findByRole('button', { name: 'Go to page 2' }));

    expect(screen.getByText('person26@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('page=2');
  });

  it('opens on the page a URL carries', async () => {
    renderPage('/admin/users?page=2');
    emit(manyAccounts());

    expect(await screen.findByText('person26@example.com')).toBeInTheDocument();
  });

  it('returns to the first page when a filter changes', async () => {
    const user = userEvent.setup();
    renderPage('/admin/users?page=2');
    emit(manyAccounts());

    await user.type(await screen.findByLabelText('Search accounts'), 'person01');

    await waitFor(() => expect(screen.getByTestId('search')).not.toHaveTextContent('page=2'));
    expect(screen.getByText('person01@example.com')).toBeInTheDocument();
  });

  it('pages what is loaded, while Load more widens what is loaded at all', async () => {
    // Two different bounds: one makes a long list readable, the other reaches
    // accounts the query has not fetched yet.
    const user = userEvent.setup();
    renderPage();
    emit(Array.from({ length: 100 }, (_, index) =>
      makeAccount({ uid: `u${index}`, email: `u${index}@example.com` })));

    expect(await screen.findByText('Showing 1–25 of 100')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Account pages' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load more accounts' }));
    await waitFor(() => expect(subscribeToAccounts.mock.calls.at(-1)?.[0]).toBe(200));
  });

  it('does not draw a control when every account fits on one page', async () => {
    renderPage();
    emit([makeAccount(), bruno]);

    await screen.findByText('ana@example.com');
    expect(screen.queryByRole('navigation', { name: 'Account pages' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
  });
});

describe('an account whose profile has no registration date', () => {
  /**
   * The regression this exists for.
   *
   * `grant-admin.mjs` wrote the profile mirror directly, so the first admin of
   * a project had a `users/{uid}` document with no `createdAt`. The list query
   * ordered by that field, Firestore omits documents that lack the ordered
   * field entirely, and the account that could not be seen was the one
   * belonging to the person looking at the screen.
   */
  const dateless = makeAccount({
    uid: 'no-date',
    email: 'bootstrap@example.com',
    role: 'admin',
    createdAt: null,
  });

  it('is listed rather than omitted', async () => {
    renderPage();
    emit([makeAccount(), dateless]);

    expect(await screen.findByText('bootstrap@example.com')).toBeInTheDocument();
  });

  it('says the date is unknown instead of inventing one', async () => {
    renderPage();
    emit([dateless]);

    const row = (await screen.findByText('bootstrap@example.com')).closest('tr')!;
    expect(within(row).getByText('Unknown')).toBeInTheDocument();
  });

  it('sorts last rather than first, and still carries its actions', async () => {
    // Treating a missing date as epoch zero would jump it to the top under a
    // newest-first sort; treating it as absent must not cost it its row.
    renderPage();
    emit([dateless, makeAccount()]);

    await screen.findByText('ana@example.com');
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('ana@example.com')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('bootstrap@example.com')).toBeInTheDocument();
    expect(
      within(rows[1]!).getByRole('button', { name: /Change the role/ }),
    ).toBeInTheDocument();
  });

  it('is reachable by search like any other account', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeAccount(), dateless]);

    await user.type(await screen.findByLabelText('Search accounts'), 'bootstrap');

    expect(screen.getByText('bootstrap@example.com')).toBeInTheDocument();
    expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument();
  });
});
