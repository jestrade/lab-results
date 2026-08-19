import { describe, expect, it } from 'vitest';

import { CRITICAL_RESULT_NOTICE, PARTIAL_PROCESSING_NOTICE } from '../copy';

/**
 * The web app holds the same strings in src/domain/disclaimers.ts. Both are
 * pinned to the spec wording here and there, so the duplication cannot drift.
 */
describe('regulated copy', () => {
  it('matches spec §46 verbatim', () => {
    expect(CRITICAL_RESULT_NOTICE).toBe(
      'This result is outside the expected range and may require prompt medical attention. ' +
        'Please contact your healthcare provider or follow the instructions provided by the ' +
        'laboratory.',
    );
  });

  it('matches spec §40.10 verbatim', () => {
    expect(PARTIAL_PROCESSING_NOTICE).toBe(
      'We successfully extracted most results from this report, but some values could not be ' +
        'reliably identified.',
    );
  });
});
