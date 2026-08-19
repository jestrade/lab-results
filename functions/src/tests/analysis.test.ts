import { describe, expect, it } from 'vitest';

import { enforceUrgency, needsAnalysis } from '../analysis';
import { CRITICAL_RESULT_NOTICE } from '../copy';

/**
 * Escalation is the one judgement this product refuses to delegate. Status is
 * computed arithmetically from the laboratory's own thresholds; the model
 * phrases it. These tests stop the model promoting a result to "seek help now"
 * on its own initiative — which it did, unprompted, in testing.
 */
describe('enforceUrgency', () => {
  it('appends the exact §46 notice to a critical result that lacks it', () => {
    const text = enforceUrgency('Your potassium is 6.3 mmol/L, above the range.', 'critical');
    expect(text).toContain(CRITICAL_RESULT_NOTICE);
  });

  it('does not duplicate the notice when the model already produced it', () => {
    const withNotice = `Above the range.\n\n${CRITICAL_RESULT_NOTICE}`;
    const occurrences = enforceUrgency(withNotice, 'critical').split('prompt medical attention');
    expect(occurrences).toHaveLength(2); // i.e. the phrase appears once
  });

  it('strips the critical notice from a merely high result', () => {
    // Observed for real: given a high potassium the model appended §46 itself.
    const overreach = `This is above the reference range.\n\n${CRITICAL_RESULT_NOTICE}`;
    const text = enforceUrgency(overreach, 'high');
    expect(text).not.toContain('prompt medical attention');
    expect(text).toContain('above the reference range');
  });

  it('discards an analysis that invents urgency in its own words', () => {
    // Stripping the known sentence cannot catch a paraphrase, so anything that
    // still asserts urgency is dropped. No commentary is safe; false urgency
    // is not.
    for (const invented of [
      'This is high. Seek immediate medical help.',
      'Contact a doctor urgently about this result.',
      'Go to the emergency department.',
    ]) {
      expect(enforceUrgency(invented, 'high'), invented).toBe('');
    }
  });

  it('leaves an ordinary non-critical analysis untouched', () => {
    const plain = 'Your result is 21 ng/mL, below the range of 30–100 on this report.';
    expect(enforceUrgency(plain, 'low')).toBe(plain);
  });
});

describe('needsAnalysis', () => {
  it('spends a call only where commentary adds something', () => {
    expect(needsAnalysis('critical')).toBe(true);
    expect(needsAnalysis('high')).toBe(true);
    expect(needsAnalysis('low')).toBe(true);
    expect(needsAnalysis('unknown')).toBe(true);
  });

  it('skips normal results, which the number and range already explain', () => {
    // A 24-result panel with 22 normals costs two calls, not 24.
    expect(needsAnalysis('normal')).toBe(false);
  });
});
