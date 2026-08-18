import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  getFirestore: vi.fn(),
  FieldValue: { serverTimestamp: () => 'ts' },
}));
const auth = vi.hoisted(() => ({ getAuth: vi.fn() }));

vi.mock('firebase-admin/firestore', () => firestore);
vi.mock('firebase-admin/auth', () => auth);
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
// `onCall` returns the handler itself here, so the guards below can be called
// directly. The functions runtime is what the emulator suite exercises.
vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_options: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  },
}));

import { MAX_REASON_LENGTH, normaliseReason, setUserDisabled } from './userAdmin';

/** Every effect, in the order it happened — order is part of the contract. */
let journal: string[];
let written: Record<string, unknown>[];

function makeAuth(existing: { disabled?: boolean } = {}) {
  return {
    getUser: async (uid: string) => {
      journal.push(`getUser:${uid}`);
      return { uid, disabled: existing.disabled === true };
    },
    updateUser: async (uid: string, update: { disabled: boolean }) => {
      journal.push(`updateUser:${uid}:disabled=${update.disabled}`);
    },
    revokeRefreshTokens: async (uid: string) => {
      journal.push(`revoke:${uid}`);
    },
  };
}

function makeDb() {
  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        set: async (data: Record<string, unknown>) => {
          journal.push(`set:${name}/${id}:disabled=${String(data.disabled)}`);
          written.push(data);
        },
      }),
      add: async (data: Record<string, unknown>) => {
        journal.push(`add:${name}:${String(data.action)}`);
        written.push(data);
      },
    }),
  };
}

/** A callable request, admin by default. */
function makeRequest(data: unknown, overrides: { uid?: string; role?: string } = {}) {
  return {
    auth: {
      uid: overrides.uid ?? 'admin-1',
      token: { role: overrides.role ?? 'admin' },
    },
    data,
  } as never;
}

const call = setUserDisabled as unknown as (request: unknown) => Promise<{
  userId: string;
  disabled: boolean;
  previouslyDisabled: boolean;
}>;

beforeEach(() => {
  journal = [];
  written = [];
  auth.getAuth.mockReturnValue(makeAuth());
  firestore.getFirestore.mockReturnValue(makeDb());
});

describe('normaliseReason', () => {
  it('keeps a written reason, trimmed', () => {
    expect(normaliseReason('  spam uploads  ')).toBe('spam uploads');
  });

  it('treats an empty or absent reason as none given', () => {
    // A stored '' is a reason that exists and says nothing.
    expect(normaliseReason('   ')).toBeNull();
    expect(normaliseReason(undefined)).toBeNull();
    expect(normaliseReason(42)).toBeNull();
  });

  it('caps the length, so an admin token cannot fill the audit collection', () => {
    expect(normaliseReason('x'.repeat(2000))).toHaveLength(MAX_REASON_LENGTH);
  });
});

describe('setUserDisabled', () => {
  it('refuses a caller who is not an admin', async () => {
    await expect(call(makeRequest({ userId: 'u1', disabled: true }, { role: 'user' })))
      .rejects.toThrow('Not permitted.');
    expect(journal).toEqual([]);
  });

  it('refuses an unauthenticated caller with the same message', async () => {
    // Neither caller learns whether this function exists.
    await expect(call({ data: { userId: 'u1', disabled: true } })).rejects.toThrow(
      'Not permitted.',
    );
  });

  it('requires a user id and a boolean', async () => {
    await expect(call(makeRequest({ disabled: true }))).rejects.toThrow('userId is required.');
    await expect(call(makeRequest({ userId: 'u1' }))).rejects.toThrow(
      'disabled must be a boolean.',
    );
    await expect(call(makeRequest({ userId: 'u1', disabled: 'yes' }))).rejects.toThrow(
      'disabled must be a boolean.',
    );
  });

  it('refuses to disable the caller', async () => {
    // An admin who locks themselves out cannot unlock themselves.
    await expect(
      call(makeRequest({ userId: 'admin-1', disabled: true })),
    ).rejects.toThrow('You cannot disable your own account.');
    expect(journal).toEqual([]);
  });

  it('locks the auth record before it writes the mirror', async () => {
    const result = await call(makeRequest({ userId: 'u1', disabled: true, reason: 'abuse' }));

    // Auth first: a failure after this point shows an account as active that
    // is actually locked, which is the visible half of the wrong pair.
    expect(journal).toEqual([
      'getUser:u1',
      'updateUser:u1:disabled=true',
      'revoke:u1',
      'set:users/u1:disabled=true',
      'add:auditLogs:user.disabled',
    ]);
    expect(result).toEqual({ userId: 'u1', disabled: true, previouslyDisabled: false });
  });

  it('records who did it, to whom, and why', async () => {
    await call(makeRequest({ userId: 'u1', disabled: true, reason: '  spam  ' }));

    expect(written.at(-1)).toMatchObject({
      action: 'user.disabled',
      actorId: 'admin-1',
      targetId: 'u1',
      reason: 'spam',
    });
  });

  it('does not revoke tokens when re-enabling', async () => {
    auth.getAuth.mockReturnValue(makeAuth({ disabled: true }));

    const result = await call(makeRequest({ userId: 'u1', disabled: false }));

    // Nothing to revoke, and doing it would sign out an account that is being
    // handed its access back.
    expect(journal).not.toContain('revoke:u1');
    expect(journal).toContain('updateUser:u1:disabled=false');
    expect(journal.at(-1)).toBe('add:auditLogs:user.enabled');
    expect(result.previouslyDisabled).toBe(true);
  });

  it('reports a no-op as one rather than pretending something changed', async () => {
    auth.getAuth.mockReturnValue(makeAuth({ disabled: true }));

    const result = await call(makeRequest({ userId: 'u1', disabled: true }));

    expect(result).toEqual({ userId: 'u1', disabled: true, previouslyDisabled: true });
  });
});
