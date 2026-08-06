import { describe, expect, it } from 'vitest';

import {
  MAX_RETRIES,
  RETRY_COOLDOWN_MS,
  STALE_PROCESSING_MS,
  isPermanentFailure,
  retryDecision,
} from './retry';

/**
 * The callable itself is a thin shell around `processReport`; what is worth
 * testing is the policy that decides whether a user's report is run through
 * the pipeline a second time — and, more to the point, when it is not.
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
