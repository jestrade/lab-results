import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({ getFirestore: vi.fn() }));
const enrichment = vi.hoisted(() => ({
  enrichVariables: vi.fn(),
  MAX_ENRICHMENT_BATCH: 48,
}));
const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => firestore);
vi.mock('firebase-functions/logger', () => logger);
vi.mock('./enrichment', () => enrichment);
// The schedule is not exercised here — `onSchedule` needs the functions
// runtime — but importing the module defines it, so it still has to resolve.
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_options: unknown, handler: unknown) => handler,
}));

import { SWEEP_LIMIT, sweepPendingVariables } from './sweep';

/** The query the sweep builds, and what it was asked for. */
let asked: { field?: string; value?: unknown; limit?: number };

function makeDb(docs: { id: string; canonicalName?: unknown }[]) {
  const query = {
    where: (field: string, _op: string, value: unknown) => {
      asked.field = field;
      asked.value = value;
      return query;
    },
    limit: (n: number) => {
      asked.limit = n;
      return query;
    },
    get: async () => ({
      empty: docs.length === 0,
      docs: docs.map((d) => ({ id: d.id, data: () => ({ canonicalName: d.canonicalName }) })),
    }),
  };
  return { collection: () => query };
}

beforeEach(() => {
  asked = {};
  enrichment.enrichVariables.mockReset().mockResolvedValue(0);
  logger.info.mockReset();
  logger.warn.mockReset();
});

describe('sweepPendingVariables', () => {
  it('asks only for entries still carrying the flag', async () => {
    firestore.getFirestore.mockReturnValue(makeDb([{ id: 'ferritina', canonicalName: 'Ferritina' }]));
    enrichment.enrichVariables.mockResolvedValue(1);

    await sweepPendingVariables();

    expect(asked.field).toBe('needsEnrichment');
    expect(asked.value).toBe(true);
  });

  it('bounds the read as well as the spend', async () => {
    // Reading four hundred flagged documents to enrich forty-eight of them is
    // three hundred and fifty reads spent on nothing.
    firestore.getFirestore.mockReturnValue(makeDb([]));
    await sweepPendingVariables();
    expect(asked.limit).toBe(SWEEP_LIMIT);
  });

  it('sends the laboratory’s printed name, which is all the model has', async () => {
    firestore.getFirestore.mockReturnValue(
      makeDb([
        { id: 'ferritina-serica', canonicalName: 'Ferritina sérica' },
        { id: 'ade', canonicalName: 'ADE.' },
      ]),
    );
    enrichment.enrichVariables.mockResolvedValue(2);

    await sweepPendingVariables();

    expect(enrichment.enrichVariables).toHaveBeenCalledWith([
      { id: 'ferritina-serica', rawName: 'Ferritina sérica' },
      { id: 'ade', rawName: 'ADE.' },
    ]);
  });

  it('falls back to the id when a placeholder has no name', async () => {
    firestore.getFirestore.mockReturnValue(makeDb([{ id: 'unnamed-variable' }]));
    enrichment.enrichVariables.mockResolvedValue(0);

    await sweepPendingVariables();

    expect(enrichment.enrichVariables).toHaveBeenCalledWith([
      { id: 'unnamed-variable', rawName: 'unnamed-variable' },
    ]);
  });

  it('spends nothing when there is nothing pending', async () => {
    firestore.getFirestore.mockReturnValue(makeDb([]));

    const summary = await sweepPendingVariables();

    // The common case by far, and it must not cost an AI call.
    expect(enrichment.enrichVariables).not.toHaveBeenCalled();
    expect(summary).toEqual({ pending: 0, enriched: 0 });
  });

  it('reports what it found as well as what it finished', async () => {
    firestore.getFirestore.mockReturnValue(
      makeDb([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
    );
    enrichment.enrichVariables.mockResolvedValue(1);

    const summary = await sweepPendingVariables();

    // The gap between the two is the only signal that the provider is
    // refusing work; reporting only the successes hides a failing sweep.
    expect(summary).toEqual({ pending: 3, enriched: 1 });
    expect(logger.info).toHaveBeenCalledWith('Catalog sweep finished', {
      pending: 3,
      enriched: 1,
    });
  });

  it('leaves the backlog alone when the provider completes none of it', async () => {
    firestore.getFirestore.mockReturnValue(makeDb([{ id: 'a' }, { id: 'b' }]));
    enrichment.enrichVariables.mockResolvedValue(0);

    const summary = await sweepPendingVariables();

    // Nothing is deleted, downgraded or marked done — the entries stay flagged
    // and the next run tries again.
    expect(summary).toEqual({ pending: 2, enriched: 0 });
  });

  it('honours a smaller limit when one is given', async () => {
    firestore.getFirestore.mockReturnValue(makeDb([]));
    await sweepPendingVariables(5);
    expect(asked.limit).toBe(5);
  });
});
