import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({ getFirestore: vi.fn() }));

vi.mock('firebase-admin/firestore', () => firestore);
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
// The callable is not exercised here — `onCall` would need the functions
// runtime — but importing the module defines it, so it still has to resolve.
vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_options: unknown, handler: unknown) => handler,
  HttpsError: class extends Error {},
}));

import { CONFIRMATION_PHRASE, clearVariableSeries } from '../clearVariables';

/** Every write, in the order it happened. */
let journal: string[];

function makeDb(seriesIds: string[]) {
  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        collection: (sub: string) => ({
          listDocuments: async () => {
            journal.push(`list:${name}/${id}/${sub}`);
            return seriesIds.map((seriesId) => ({ path: `${name}/${id}/${sub}/${seriesId}` }));
          },
        }),
      }),
    }),
    batch: () => ({
      delete: (ref: { path: string }) => journal.push(`delete:${ref.path}`),
      commit: async () => journal.push('commit'),
    }),
  };
}

describe('clearVariableSeries', () => {
  beforeEach(() => {
    journal = [];
  });

  it('deletes every series document belonging to the user', async () => {
    firestore.getFirestore.mockReturnValue(makeDb(['hemoglobin', 'potassium']));

    const cleared = await clearVariableSeries('u1');

    expect(journal).toEqual([
      'list:users/u1/variableSeries',
      'delete:users/u1/variableSeries/hemoglobin',
      'delete:users/u1/variableSeries/potassium',
      'commit',
    ]);
    expect(cleared).toBe(2);
  });

  it('is a no-op for an account with nothing tracked', async () => {
    firestore.getFirestore.mockReturnValue(makeDb([]));

    const cleared = await clearVariableSeries('u1');

    // No empty batch committed: a user clearing twice, or retrying a run that
    // half finished, should cost one list and nothing else.
    expect(journal).toEqual(['list:users/u1/variableSeries']);
    expect(cleared).toBe(0);
  });

  it('splits the deletes into batches Firestore will accept', async () => {
    // Firestore rejects a batch over 500 writes outright, so an account with
    // more tracked variables than the chunk size must not fail to clear.
    const ids = Array.from({ length: 900 }, (_, index) => `v${index}`);
    firestore.getFirestore.mockReturnValue(makeDb(ids));

    const cleared = await clearVariableSeries('u1');

    expect(cleared).toBe(900);
    expect(journal.filter((entry) => entry === 'commit')).toHaveLength(3);
    expect(journal.filter((entry) => entry.startsWith('delete:'))).toHaveLength(900);
  });
});

describe('CONFIRMATION_PHRASE', () => {
  it('is the word the web app sends', () => {
    // Named on both sides rather than written twice: the client constant is
    // `CLEAR_CONFIRMATION` in src/services/variables.ts.
    expect(CONFIRMATION_PHRASE).toBe('CLEAR');
  });
});
