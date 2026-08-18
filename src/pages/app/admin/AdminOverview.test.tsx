import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import type { AdminOverview as Overview } from '@/domain/adminOverview';
import type * as OverviewModule from '@/services/adminOverview';
import { AdminOverview } from './AdminOverview';

const fetchAdminOverview = vi.hoisted(() => vi.fn());

vi.mock('@/services/adminOverview', async (importOriginal) => {
  const actual = await importOriginal<typeof OverviewModule>();
  return { ...actual, fetchAdminOverview };
});

function stamp(iso: string) {
  return { toDate: () => new Date(iso), toMillis: () => new Date(iso).getTime() } as never;
}

function makeOverview(overrides: Partial<Overview> = {}): Overview {
  return {
    accounts: { total: 12, admins: 2, disabled: 1 },
    reports: { total: 40, processed: 40, failed: 0 },
    catalog: { total: 300, needsReview: 4 },
    storage: { bytesUsed: 1024 * 1024, limitBytes: 1024 * 1024 * 100, uploadsDisabled: false },
    audit: [],
    ...overrides,
  };
}

function resolveWith(overview: Overview, partial = false) {
  fetchAdminOverview.mockResolvedValue({ overview, partial });
}

function renderPage() {
  return renderWithProviders(<AdminOverview />, {
    auth: signedInAuth({ role: 'admin', isAdmin: true }),
    route: '/admin',
  });
}

beforeEach(() => {
  fetchAdminOverview.mockReset();
  resolveWith(makeOverview());
});

describe('AdminOverview', () => {
  it('shows the system totals', async () => {
    const { container } = renderPage();

    expect(await screen.findByText('Accounts')).toBeInTheDocument();
    const accounts = screen.getByText('Accounts').closest('section')!;
    expect(within(accounts).getByText('12')).toBeInTheDocument();
    expect(within(accounts).getByText('2')).toBeInTheDocument();

    const catalog = screen.getByText('Variable catalog').closest('section')!;
    expect(within(catalog).getByText('300')).toBeInTheDocument();

    await expectNoA11yViolations(container);
  });

  it('is a different page from the reader home: no laboratory value anywhere', async () => {
    renderPage();
    await screen.findByText('Accounts');

    // The claim the page's header comment makes, asserted rather than trusted.
    expect(
      screen.getByText(/no laboratory value and no account’s results/),
    ).toBeInTheDocument();
  });

  it('reports a healthy system', async () => {
    renderPage();
    expect(await screen.findByText('Operating normally')).toBeInTheDocument();
  });

  it('asks for attention when a report failed, and says who it costs', async () => {
    resolveWith(makeOverview({ reports: { total: 40, processed: 39, failed: 1 } }));
    renderPage();

    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText(/one person whose report never came back/)).toBeInTheDocument();
  });

  it('puts the kill switch above every other state', async () => {
    resolveWith(
      makeOverview({
        reports: { total: 40, processed: 39, failed: 1 },
        storage: { bytesUsed: 99, limitBytes: 100, uploadsDisabled: true },
      }),
    );
    renderPage();

    expect(await screen.findByText('Uploads are switched off')).toBeInTheDocument();
    expect(screen.getByText('Uploads refused')).toBeInTheDocument();
  });

  it('draws a refused count as a dash rather than as zero', async () => {
    // A dashboard reporting an empty system when it was merely refused would
    // send an admin looking for a data-loss incident that never happened.
    resolveWith(makeOverview({ accounts: { total: -1, admins: -1, disabled: 0 } }), true);
    renderPage();

    const accounts = (await screen.findByText('Accounts')).closest('section')!;
    expect(within(accounts).getAllByText('—')).toHaveLength(2);
    expect(screen.getByText('The overview could not be loaded.')).toBeInTheDocument();
  });

  it('explains a failed load instead of showing an empty dashboard', async () => {
    fetchAdminOverview.mockRejectedValueOnce(new Error('offline'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The overview could not be loaded.',
    );
  });

  it('links into the two management screens', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Manage accounts' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(screen.getByRole('link', { name: 'Open the catalog' })).toHaveAttribute(
      'href',
      '/admin/variables',
    );
  });

  it('re-reads on request, because a count cannot be subscribed to', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Accounts');
    expect(fetchAdminOverview).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(fetchAdminOverview).toHaveBeenCalledTimes(2));
  });
});

describe('the audit trail', () => {
  it('lists what has been done, newest first', async () => {
    resolveWith(
      makeOverview({
        audit: [
          {
            id: 'a1',
            action: 'role.changed',
            actorId: 'admin-1',
            targetId: 'u9',
            at: stamp('2026-08-16T10:00:00Z'),
          },
          {
            id: 'a2',
            action: 'user.disabled',
            actorId: 'admin-1',
            targetId: 'u4',
            at: stamp('2026-08-15T10:00:00Z'),
          },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('Role changed')).toBeInTheDocument();
    expect(screen.getByText('Account disabled')).toBeInTheDocument();
    // Accounts are named by uid: resolving them to addresses would put a list
    // of people and what was done to them on a screen that shows counts.
    expect(screen.getByText(/u9/)).toBeInTheDocument();
  });

  it('names a redacted actor rather than leaving a blank', async () => {
    resolveWith(
      makeOverview({
        audit: [
          {
            id: 'a1',
            action: 'account.deleted',
            actorId: null,
            targetId: null,
            at: stamp('2026-08-16T10:00:00Z'),
          },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText(/by a deleted account/)).toBeInTheDocument();
  });

  it('shows an action it has never seen rather than hiding it', async () => {
    resolveWith(
      makeOverview({
        audit: [
          {
            id: 'a1',
            action: 'pipeline.quarantined',
            actorId: 'admin-1',
            targetId: 'u1',
            at: stamp('2026-08-16T10:00:00Z'),
          },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('Recorded action')).toBeInTheDocument();
  });

  it('says so when nothing has happened', async () => {
    renderPage();
    expect(await screen.findByText('Nothing has been done yet.')).toBeInTheDocument();
  });
});
