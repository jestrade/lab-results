import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  getFirestore: vi.fn(),
  FieldValue: { serverTimestamp: () => 'ts' },
}));
const storage = vi.hoisted(() => ({ getStorage: vi.fn() }));
const auth = vi.hoisted(() => ({ getAuth: vi.fn() }));

vi.mock('firebase-admin/firestore', () => firestore);
vi.mock('firebase-admin/storage', () => storage);
vi.mock('firebase-admin/auth', () => auth);
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

import { REAUTH_MAX_AGE_SECONDS, eraseUserData, isRecentlyAuthenticated } from './deleteAccount';

/**
 * Every operation, in the order it happened. Deletion is one of the few places
 * where order is part of the contract rather than an implementation detail —
 * see the header comment in deleteAccount.ts — so the assertions below are
 * about sequence as much as about coverage.
 */
let journal: string[];

/** Pages each collection query returns, in order. An empty page ends the loop. */
let pages: Record<string, { id: string; path: string }[][]>;

function docRef(path: string) {
  return { path };
}

function queryFor(collection: string) {
  const query = {
    where: () => query,
    limit: () => query,
    get: async () => {
      const next = pages[collection]?.shift() ?? [];
      journal.push(`query:${collection}`);
      return {
        empty: next.length === 0,
        size: next.length,
        docs: next.map((entry) => ({ id: entry.id, ref: docRef(entry.path) })),
      };
    },
  };
  return query;
}

function makeDb(usageBytes: number | null, systemBytes: number) {
  return {
    collection: (name: string) => ({
      ...queryFor(name),
      doc: (id: string) => docRef(`${name}/${id}`),
      add: async (data: Record<string, unknown>) => {
        journal.push(`add:${name}:${String(data.action)}`);
        return docRef(`${name}/generated`);
      },
    }),
    runTransaction: async (
      body: (tx: {
        get: (ref: { path: string }) => Promise<unknown>;
        set: (ref: { path: string }, data: unknown, options: unknown) => void;
        delete: (ref: { path: string }) => void;
      }) => Promise<unknown>,
    ) =>
      body({
        get: async (ref) => ({
          exists: ref.path.startsWith('usage/') ? usageBytes !== null : true,
          data: () => ({
            storageBytes: ref.path.startsWith('usage/') ? (usageBytes ?? 0) : systemBytes,
          }),
        }),
        set: (ref, data) => {
          journal.push(`set:${ref.path}:${(data as { storageBytes?: number }).storageBytes}`);
        },
        delete: (ref) => journal.push(`delete:${ref.path}`),
      }),
    batch: () => ({
      delete: (ref: { path: string }) => journal.push(`batch-delete:${ref.path}`),
      update: (ref: { path: string }, data: Record<string, unknown>) =>
        journal.push(`batch-update:${ref.path}:actorId=${String(data.actorId)}`),
      commit: async () => journal.push('batch-commit'),
    }),
    recursiveDelete: async (ref: { path: string }) => {
      journal.push(`recursiveDelete:${ref.path}`);
    },
  };
}

function makeBucket(files: string[]) {
  return {
    getFiles: async ({ prefix }: { prefix: string }) => {
      journal.push(`list:${prefix}`);
      return [files.filter((name) => name.startsWith(prefix)).map((name) => ({ name }))];
    },
    deleteFiles: async ({ prefix }: { prefix: string }) => {
      journal.push(`deleteFiles:${prefix}`);
    },
  };
}

describe('isRecentlyAuthenticated', () => {
  const now = 1_800_000_000;

  it('accepts a session that proved itself within the window', () => {
    expect(isRecentlyAuthenticated(now - 60, now)).toBe(true);
  });

  it('rejects a session older than the window', () => {
    // The point of the check: a live session found on an unlocked laptop must
    // not be able to destroy someone's medical history without proving itself.
    expect(isRecentlyAuthenticated(now - REAUTH_MAX_AGE_SECONDS - 1, now)).toBe(false);
  });

  it('rejects a token with no usable auth_time rather than assuming it is fresh', () => {
    expect(isRecentlyAuthenticated(undefined, now)).toBe(false);
    expect(isRecentlyAuthenticated('recently', now)).toBe(false);
    expect(isRecentlyAuthenticated(Number.NaN, now)).toBe(false);
  });

  it('treats a future auth_time as clock skew, not as an unbounded window', () => {
    // A negative age would otherwise pass every window ever configured.
    expect(isRecentlyAuthenticated(now + 10_000, now)).toBe(true);
  });
});

describe('eraseUserData', () => {
  beforeEach(() => {
    journal = [];
    pages = {};
    firestore.getFirestore.mockReturnValue(makeDb(1000, 5000));
    storage.getStorage.mockReturnValue({ bucket: () => makeBucket([]) });
    auth.getAuth.mockReturnValue({ deleteUser: vi.fn() });
  });

  it('settles the usage counters before removing the objects they count', async () => {
    storage.getStorage.mockReturnValue({
      bucket: () => makeBucket(['users/u1/reports/r1/panel.pdf']),
    });

    await eraseUserData('u1');

    // Deleting the objects first would let the onObjectDeleted triggers fire
    // after usage/{uid} was gone and recreate it with a merged write.
    const settled = journal.indexOf('delete:usage/u1');
    const removed = journal.indexOf('deleteFiles:users/u1/');
    expect(settled).toBeGreaterThanOrEqual(0);
    expect(removed).toBeGreaterThan(settled);
    // The user's bytes come off the global total by hand, because those
    // triggers are about to become no-ops.
    expect(journal).toContain('set:systemUsage/global:4000');
  });

  it('leaves the global total at zero rather than negative when counters have drifted', async () => {
    firestore.getFirestore.mockReturnValue(makeDb(9000, 5000));
    await eraseUserData('u1');
    expect(journal).toContain('set:systemUsage/global:0');
  });

  it('deletes every report with its results subcollection, page after page', async () => {
    pages.reports = [
      [
        { id: 'r1', path: 'reports/r1' },
        { id: 'r2', path: 'reports/r2' },
      ],
      [{ id: 'r3', path: 'reports/r3' }],
    ];

    const summary = await eraseUserData('u1');

    // recursiveDelete rather than a plain delete: `reports/{id}/results` holds
    // the extracted values, and a subcollection outlives a deleted parent.
    expect(journal).toContain('recursiveDelete:reports/r1');
    expect(journal).toContain('recursiveDelete:reports/r3');
    expect(summary.reports).toBe(3);
  });

  it('takes the profile and its variableSeries history with it', async () => {
    await eraseUserData('u1');
    expect(journal).toContain('recursiveDelete:users/u1');
  });

  it('deletes audit entries about the user, but only redacts ones about someone else', async () => {
    pages.auditLogs = [
      // Queried by targetId: entries recording something done to this user.
      [{ id: 'a1', path: 'auditLogs/a1' }],
      [],
      // Queried by actorId: this user acting on somebody else's account.
      [{ id: 'a2', path: 'auditLogs/a2' }],
    ];

    const summary = await eraseUserData('u1');

    expect(journal).toContain('batch-delete:auditLogs/a1');
    // Deleting this one would erase the other person's audit history, which is
    // not the departing user's to erase — the identifier goes, the record stays.
    expect(journal).toContain('batch-update:auditLogs/a2:actorId=null');
    expect(journal).not.toContain('batch-delete:auditLogs/a2');
    expect(summary.auditEntries).toBe(2);
  });

  it('counts what it removed from storage, scoped to this user', async () => {
    storage.getStorage.mockReturnValue({
      bucket: () =>
        makeBucket([
          'users/u1/reports/r1/panel.pdf',
          'users/u1/reports/r2/lipids.pdf',
          'users/u2/reports/r9/other.pdf',
        ]),
    });

    const summary = await eraseUserData('u1');

    // Another user's tree is not in the blast radius.
    expect(summary.storageObjects).toBe(2);
    expect(journal).toContain('list:users/u1/');
  });

  it('is safe to run again after a partial failure', async () => {
    // Nothing left to find: no usage document, no files, no reports. Every step
    // has to be a no-op rather than an error, or a half-finished deletion could
    // never be completed.
    firestore.getFirestore.mockReturnValue(makeDb(null, 5000));

    const summary = await eraseUserData('u1');

    expect(summary).toEqual({ reports: 0, storageObjects: 0, auditEntries: 0 });
    expect(journal).not.toContain('delete:usage/u1');
  });
});
