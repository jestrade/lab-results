import { describe, expect, it } from 'vitest';

import {
  filterAccounts,
  filterParams,
  hasActiveFilters,
  isSelf,
  readFilters,
  sortAccounts,
  toAccountRow,
  type AccountRow,
} from './adminUsers';
import type { Timestamp } from 'firebase/firestore';

function stamp(iso: string): Timestamp {
  return { toMillis: () => new Date(iso).getTime() } as Timestamp;
}

function makeRow(overrides: Partial<AccountRow> = {}): AccountRow {
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

describe('toAccountRow', () => {
  it('reads a profile document', () => {
    const row = toAccountRow('u1', {
      email: 'ana@example.com',
      displayName: 'Ana Ruiz',
      role: 'admin',
      disabled: true,
    });

    expect(row).toMatchObject({
      uid: 'u1',
      email: 'ana@example.com',
      displayName: 'Ana Ruiz',
      role: 'admin',
      disabled: true,
    });
  });

  it('treats an unrecognised role as the lesser privilege', () => {
    // A corrupt or absent mirror must not present as an admin.
    expect(toAccountRow('u1', { role: 'root' as never }).role).toBe('user');
    expect(toAccountRow('u1', {}).role).toBe('user');
  });

  it('treats anything but an explicit true as not disabled', () => {
    expect(toAccountRow('u1', {}).disabled).toBe(false);
    expect(toAccountRow('u1', { disabled: false }).disabled).toBe(false);
  });

  it('reads a blank name as no name rather than as an empty one', () => {
    expect(toAccountRow('u1', { displayName: '   ' }).displayName).toBeNull();
    expect(toAccountRow('u1', {}).displayName).toBeNull();
  });

  it('keeps nothing a profile holds beyond the account itself', () => {
    // The console has no business rendering health context or consents, and a
    // row that carried them would put them one property access away.
    const row = toAccountRow('u1', {
      email: 'ana@example.com',
      healthContext: { dateOfBirth: '1990-01-01' } as never,
      consents: { documentsVersion: '2026-07-01' } as never,
    });

    expect(row).not.toHaveProperty('healthContext');
    expect(row).not.toHaveProperty('consents');
  });
});

describe('filterAccounts', () => {
  const ana = makeRow();
  const bruno = makeRow({
    uid: 'u2',
    email: 'bruno@example.com',
    displayName: null,
    role: 'admin',
    disabled: true,
  });
  const all = [ana, bruno];

  it('returns everything when nothing is set', () => {
    expect(filterAccounts(all, readFilters(new URLSearchParams()))).toHaveLength(2);
  });

  it('matches an address, a name or a uid', () => {
    const find = (query: string) =>
      filterAccounts(all, { ...readFilters(new URLSearchParams()), query }).map((a) => a.uid);

    expect(find('bruno@')).toEqual(['u2']);
    expect(find('ana ruiz')).toEqual(['u1']);
    // The identifier a log line or a Sentry event names — the one an admin
    // most often arrives holding.
    expect(find('u2')).toEqual(['u2']);
  });

  it('filters by role and by access', () => {
    const base = readFilters(new URLSearchParams());

    expect(filterAccounts(all, { ...base, role: 'admin' })).toEqual([bruno]);
    expect(filterAccounts(all, { ...base, access: 'disabled' })).toEqual([bruno]);
    expect(filterAccounts(all, { ...base, access: 'active' })).toEqual([ana]);
  });

  it('combines a search with a filter', () => {
    const found = filterAccounts(all, {
      ...readFilters(new URLSearchParams()),
      query: 'example.com',
      role: 'user',
    });

    expect(found).toEqual([ana]);
  });
});

describe('sortAccounts', () => {
  it('puts the newest registration first', () => {
    const older = makeRow({ uid: 'old', createdAt: stamp('2025-01-01T00:00:00Z') });
    const newer = makeRow({ uid: 'new', createdAt: stamp('2026-08-01T00:00:00Z') });

    expect(sortAccounts([older, newer]).map((a) => a.uid)).toEqual(['new', 'old']);
  });

  it('sorts an account with no registration date last', () => {
    // Mid-creation, or written before the field existed. Treating it as
    // infinitely old would jump it to the top of the list.
    const undated = makeRow({ uid: 'undated', createdAt: null });
    const dated = makeRow({ uid: 'dated' });

    expect(sortAccounts([undated, dated]).map((a) => a.uid)).toEqual(['dated', 'undated']);
  });

  it("leaves the caller's array alone", () => {
    const rows = [makeRow({ uid: 'a', createdAt: stamp('2025-01-01T00:00:00Z') }), makeRow({ uid: 'b' })];
    sortAccounts(rows);
    expect(rows.map((row) => row.uid)).toEqual(['a', 'b']);
  });
});

describe('filters in the address bar', () => {
  it('round-trips through the query string', () => {
    const filters = {
      query: 'ana',
      role: 'admin' as const,
      access: 'disabled' as const,
      page: 2,
    };
    expect(readFilters(filterParams(filters))).toEqual(filters);
  });

  it('leaves page one out of the URL', () => {
    const filters = readFilters(new URLSearchParams());
    expect(filters.page).toBe(1);
    expect(filterParams({ ...filters, page: 1 }).toString()).toBe('');
    expect(filterParams({ ...filters, page: 6 }).toString()).toBe('page=6');
  });

  it('leaves defaults out of the URL', () => {
    expect(filterParams(readFilters(new URLSearchParams())).toString()).toBe('');
  });

  it('falls back to the default for a value that is not one of ours', () => {
    const filters = readFilters(new URLSearchParams('role=root&access=maybe'));
    expect(filters.role).toBe('all');
    expect(filters.access).toBe('all');
  });

  it('knows when a view is narrowed', () => {
    expect(hasActiveFilters(readFilters(new URLSearchParams()))).toBe(false);
    expect(hasActiveFilters(readFilters(new URLSearchParams('access=disabled')))).toBe(true);
  });
});

describe('isSelf', () => {
  it('recognises the admin looking at the screen', () => {
    expect(isSelf(makeRow({ uid: 'u1' }), 'u1')).toBe(true);
    expect(isSelf(makeRow({ uid: 'u1' }), 'u2')).toBe(false);
  });

  it('is false when there is no signed-in uid to compare against', () => {
    expect(isSelf(makeRow(), null)).toBe(false);
    expect(isSelf(makeRow(), undefined)).toBe(false);
  });
});
