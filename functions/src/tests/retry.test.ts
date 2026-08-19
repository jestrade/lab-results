import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  getFirestore: vi.fn(),
  FieldValue: { serverTimestamp: () => 'ts' },
  // A real class, because `millis()` narrows with `instanceof`. Nothing below
  // needs a resolved timestamp, so the documents carry plain values and every
  // `millis()` answers null — the shape a report written before
  // `processingStartedAt` existed has, and the one the policy treats as stale.
  Timestamp: class Timestamp {},
}));
const storage = vi.hoisted(() => ({ getStorage: vi.fn() }));
const pipeline = vi.hoisted(() => ({ processReport: vi.fn() }));

vi.mock('firebase-admin/firestore', () => firestore);
vi.mock('firebase-admin/storage', () => storage);
vi.mock('../pipeline', () => pipeline);
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
// `onCall` returns the handler itself here, so it can be called directly —
// same arrangement as `userAdmin.test.ts`.
vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_options: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

import {
  MAX_RETRIES,
  RETRY_COOLDOWN_MS,
  STALE_PROCESSING_MS,
  isPermanentFailure,
  retryDecision,
  retryReport,
} from '../retry';

/**
 * Most of the callable is a thin shell around `processReport`; what is worth
 * testing is the policy that decides whether a user's report is run through
 * the pipeline a second time — and, more to the point, when it is not.
 *
 * The shell is exercised at one point, and it is the one where getting it
 * wrong is a privacy failure rather than an inconvenience: who is allowed to
 * ask for somebody else's report to be reprocessed, and what is written down
 * when they do (KAN-20).
 */

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);
const ago = (ms: number) => NOW - ms;

describe('isPermanentFailure', () => {
  it('recognises failures a second reading cannot fix', () => {
    expect(isPermanentFailure([{ code: 'extraction/no-text-layer' }])).toBe(true);
    expect(isPermanentFailure([{ code: 'extraction/unreadable' }])).toBe(true);
  });

  it('treats every quota rejection as permanent, whichever cap it was', () => {
    // usage.ts deletes the object before writing these, so there is nothing
    // left in the bucket for a retry to read.
    expect(isPermanentFailure([{ code: 'quota/per-user-storage' }])).toBe(true);
    expect(isPermanentFailure([{ code: 'quota/global-storage' }])).toBe(true);
  });

  it('does not include a missing consent — granting it is what makes the retry work', () => {
    expect(isPermanentFailure([{ code: 'consent/ai-processing-missing' }])).toBe(false);
  });

  it('treats a provider failure as worth another attempt', () => {
    expect(isPermanentFailure([{ code: 'extraction/rate-limited' }])).toBe(false);
    expect(isPermanentFailure([{ code: 'extraction/unavailable' }])).toBe(false);
    expect(isPermanentFailure([])).toBe(false);
    expect(isPermanentFailure(undefined)).toBe(false);
  });
});

describe('retryDecision', () => {
  const failed = { status: 'failed', warnings: [{ code: 'extraction/timeout' }] };

  it('allows a report that failed for a transient reason', () => {
    expect(retryDecision(failed, NOW)).toEqual({ allowed: true });
  });

  it('refuses a report that succeeded', () => {
    for (const status of ['processed', 'partially_processed']) {
      const decision = retryDecision({ status }, NOW);
      expect(decision.allowed).toBe(false);
      expect(decision).toMatchObject({ reason: 'nothing-to-retry' });
    }
  });

  it('refuses a failure the same file would reproduce', () => {
    const decision = retryDecision(
      { status: 'failed', warnings: [{ code: 'extraction/no-text-layer' }] },
      NOW,
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'permanent-failure' });
  });

  it('protects a run that is still working', () => {
    const decision = retryDecision(
      { status: 'processing', startedAtMs: ago(STALE_PROCESSING_MS - 1000) },
      NOW,
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'still-processing' });
  });

  it('releases a run whose worker is past saving', () => {
    expect(
      retryDecision({ status: 'processing', startedAtMs: ago(STALE_PROCESSING_MS) }, NOW),
    ).toEqual({ allowed: true });
  });

  it('releases an upload the trigger never picked up', () => {
    // The finalize event can arrive before the browser has written the report
    // record, in which case usage.ts logs and returns and nothing ever runs.
    expect(
      retryDecision({ status: 'uploaded', startedAtMs: ago(STALE_PROCESSING_MS) }, NOW),
    ).toEqual({ allowed: true });
    expect(retryDecision({ status: 'queued', startedAtMs: null }, NOW)).toEqual({ allowed: true });
  });

  it('caps the attempts, because each one spends AI calls', () => {
    expect(retryDecision({ ...failed, retryCount: MAX_RETRIES - 1 }, NOW)).toEqual({
      allowed: true,
    });
    const decision = retryDecision({ ...failed, retryCount: MAX_RETRIES }, NOW);
    expect(decision).toMatchObject({ allowed: false, reason: 'limit-reached' });
    // The number in the sentence is the number that was enforced.
    expect(decision.allowed === false && decision.message).toContain(String(MAX_RETRIES));
  });

  it('caps a stranded report too, so a dead worker cannot be retried forever', () => {
    expect(
      retryDecision(
        { status: 'processing', startedAtMs: null, retryCount: MAX_RETRIES },
        NOW,
      ),
    ).toMatchObject({ allowed: false, reason: 'limit-reached' });
  });

  it('holds off a second attempt made seconds after the last', () => {
    const decision = retryDecision(
      { ...failed, retryCount: 1, lastRetryAtMs: ago(RETRY_COOLDOWN_MS - 1) },
      NOW,
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'cooling-down' });
  });

  it('measures the cooldown from the start of the last attempt, not its end', () => {
    // A retry that genuinely took two minutes has already served the wait.
    expect(
      retryDecision({ ...failed, retryCount: 1, lastRetryAtMs: ago(RETRY_COOLDOWN_MS) }, NOW),
    ).toEqual({ allowed: true });
  });

  it('checks the file before the clock', () => {
    // A permanent failure is refused as permanent even while cooling down —
    // otherwise the user waits a minute to be told it was never going to work.
    const decision = retryDecision(
      {
        status: 'failed',
        warnings: [{ code: 'extraction/unreadable' }],
        retryCount: 1,
        lastRetryAtMs: NOW,
      },
      NOW,
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'permanent-failure' });
  });
});

/**
 * Who may ask for a report to be reprocessed.
 *
 * The console's job list (KAN-20) shows work stranded across every account,
 * so an admin has to be able to act on a report they do not own — and that is
 * the only widening. The policy, the budget and the refusals are the same for
 * them as for the account holder, the run is performed as the *owner*, and the
 * act is written to the audit trail.
 */
describe('retryReport, as a caller', () => {
  /** Every effect, in the order it happened — order is part of the contract. */
  let journal: string[];
  let added: Record<string, unknown>[];
  let report: Record<string, unknown>;

  function makeDb() {
    const ref = { id: 'r1' };
    return {
      collection: (name: string) => ({
        doc: () => ({
          ...ref,
          collection: () => ({ listDocuments: async () => [] }),
          set: async (data: Record<string, unknown>) => {
            journal.push(`set:${name}/r1:status=${String(data.status)}`);
          },
          get: async () => ({ exists: true, data: () => report }),
        }),
        add: async (data: Record<string, unknown>) => {
          journal.push(`add:${name}:${String(data.action)}`);
          added.push(data);
        },
      }),
      runTransaction: async (work: (tx: unknown) => Promise<unknown>) =>
        work({
          get: async () => ({ exists: true, data: () => report }),
          set: (_ref: unknown, data: Record<string, unknown>) => {
            journal.push(`claim:status=${String(data.status)}:attempt=${String(data.retryCount)}`);
          },
        }),
    };
  }

  function call(auth: { uid: string; token: Record<string, unknown> }) {
    return (retryReport as unknown as (request: unknown) => Promise<{ status: string }>)({
      auth,
      data: { reportId: 'r1' },
    });
  }

  const owner = { uid: 'owner-1', token: {} };
  const admin = { uid: 'admin-1', token: { role: 'admin' } };
  const stranger = { uid: 'stranger-1', token: {} };

  beforeEach(() => {
    journal = [];
    added = [];
    report = {
      ownerId: 'owner-1',
      status: 'failed',
      warnings: [{ code: 'extraction/timeout' }],
      storagePath: 'users/owner-1/reports/r1.pdf',
      retryCount: 0,
    };
    firestore.getFirestore.mockReturnValue(makeDb());
    storage.getStorage.mockReturnValue({
      bucket: () => ({ name: 'bucket', file: () => ({ exists: async () => [true] }) }),
    });
    pipeline.processReport.mockReset();
    pipeline.processReport.mockResolvedValue(undefined);
  });

  it('refuses a signed-in stranger', async () => {
    await expect(call(stranger)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(pipeline.processReport).not.toHaveBeenCalled();
  });

  it('lets an admin rescue a report they do not own', async () => {
    await call(admin);
    expect(pipeline.processReport).toHaveBeenCalledTimes(1);
  });

  it('runs as the owner, not as the admin who pressed the button', async () => {
    // Whose AI-processing consent is checked, and whose variable series the
    // results land on. Passing the caller would have read the admin's consent
    // and written somebody else's blood work onto the admin's account.
    await call(admin);
    expect(pipeline.processReport).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'owner-1' }),
    );
  });

  it('records an admin acting on somebody else’s record', async () => {
    await call(admin);

    expect(journal).toContain('add:auditLogs:report.retried');
    expect(added[0]).toMatchObject({
      action: 'report.retried',
      actorId: 'admin-1',
      targetId: 'owner-1',
      reportId: 'r1',
      attempt: 1,
    });
  });

  it('writes no audit entry when the owner retries their own report', async () => {
    // Everyday use of a feature the owner already has on their file list.
    // Logging it would bury the entries that matter under the ones that do not.
    await call(owner);

    expect(journal).not.toContain('add:auditLogs:report.retried');
    expect(pipeline.processReport).toHaveBeenCalledTimes(1);
  });

  it('gives an admin no exemption from the attempt cap', async () => {
    report.retryCount = MAX_RETRIES;
    await expect(call(admin)).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(pipeline.processReport).not.toHaveBeenCalled();
  });

  it('gives an admin no exemption from a failure a second reading cannot fix', async () => {
    report.warnings = [{ code: 'extraction/no-text-layer' }];
    await expect(call(admin)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(pipeline.processReport).not.toHaveBeenCalled();
  });
});
