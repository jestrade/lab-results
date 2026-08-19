import { describe, expect, it } from 'vitest';

import {
  CRITICAL_RESULT_NOTICE,
  MEDICAL_DISCLAIMER,
  MEDICAL_DISCLAIMER_SHORT,
  PARTIAL_PROCESSING_NOTICE,
} from '../disclaimers';

/**
 * The disclaimer text is regulated copy quoted from the spec. These tests pin
 * the phrases that carry the legal weight, so an innocent-looking edit to
 * "tighten the wording" fails loudly instead of silently changing what the
 * product claims about itself.
 */
describe('medical disclaimer', () => {
  it('matches spec §26 verbatim', () => {
    expect(MEDICAL_DISCLAIMER).toBe(
      'This application provides AI-generated informational analysis of laboratory results for ' +
        'educational purposes only. It is not a medical device and does not provide medical ' +
        'diagnoses, treatment recommendations, or professional medical advice. AI-generated ' +
        'information may be incomplete or inaccurate and should not be used as a substitute for ' +
        'consultation with a qualified healthcare professional. Always discuss your laboratory ' +
        'results and health concerns with your doctor or another qualified healthcare provider.',
    );
  });

  it('keeps the load-bearing denials in the short form too', () => {
    for (const phrase of [
      'not a medical device',
      'does not provide medical diagnoses',
      'qualified healthcare professional',
    ]) {
      expect(MEDICAL_DISCLAIMER_SHORT.toLowerCase()).toContain(phrase);
    }
  });
});

describe('critical result notice', () => {
  it('matches spec §46 verbatim', () => {
    expect(CRITICAL_RESULT_NOTICE).toBe(
      'This result is outside the expected range and may require prompt medical attention. ' +
        'Please contact your healthcare provider or follow the instructions provided by the ' +
        'laboratory.',
    );
  });

  it('directs the reader to a person, not to the app', () => {
    expect(CRITICAL_RESULT_NOTICE).toMatch(/healthcare provider/);
  });
});

describe('partial processing notice', () => {
  it('matches spec §40.10 verbatim', () => {
    expect(PARTIAL_PROCESSING_NOTICE).toBe(
      'We successfully extracted most results from this report, but some values could not be ' +
        'reliably identified.',
    );
  });
});
