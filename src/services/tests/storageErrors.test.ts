import { describe, expect, it } from 'vitest';

import { toStorageErrorMessage } from '../storageErrors';

/**
 * These exist because the app once reported an HTTP 403 as "check your
 * connection". The connection was fine; the server had refused the request.
 * Misattributing a failure is worse than admitting ignorance of it, because it
 * sends the person reading it somewhere useless.
 */
describe('toStorageErrorMessage', () => {
  it('never blames the network for a permission failure', () => {
    const denied = toStorageErrorMessage({ code: 'storage/unauthorized' });
    expect(denied.message).not.toMatch(/connection|network|offline/i);
    expect(denied.message).toMatch(/refused/i);
    expect(denied.retryable).toBe(false);
  });

  it('does not blame the user or their file for a server refusal', () => {
    // By this point size, type and quota were already checked client-side, so
    // a refusal here is almost always our configuration — telling them to try
    // another file wastes their time.
    const denied = toStorageErrorMessage({ code: 'storage/unauthorized' });
    expect(denied.message).toMatch(/configuration problem on our side/i);
  });

  it('does blame the network when the network is actually the problem', () => {
    expect(toStorageErrorMessage({ code: 'storage/retry-limit-exceeded' }).message).toMatch(
      /connection/i,
    );
  });

  it('recognises our own cancellation, which has no storage code', () => {
    expect(toStorageErrorMessage(new Error('Upload cancelled')).message).toMatch(/cancelled/i);
  });

  it('surfaces an unmapped code instead of inventing an explanation', () => {
    const unknown = toStorageErrorMessage({ code: 'storage/some-future-code' });
    expect(unknown.code).toBe('storage/some-future-code');
    expect(unknown.message).toContain('storage/some-future-code');
  });

  it('always states that nothing was stored', () => {
    // The single most useful thing to know after a failed upload.
    for (const code of [
      'storage/unauthorized',
      'storage/quota-exceeded',
      'storage/retry-limit-exceeded',
      'storage/some-future-code',
    ]) {
      expect(toStorageErrorMessage({ code }).message, code).toMatch(/nothing was stored/i);
    }
  });
});
