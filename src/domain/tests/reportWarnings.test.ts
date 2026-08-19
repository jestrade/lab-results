import { describe, expect, it } from 'vitest';

import { warningText } from '../reportWarnings';

const warning = (code: string, message = 'Pipeline sentence.') => ({ code, message });

describe('warningText', () => {
  it('translates a known cause instead of showing the pipeline English', () => {
    expect(warningText(warning('extraction/rate-limited'), 'es')).toMatch(/límite de peticiones/i);
    expect(warningText(warning('extraction/rate-limited'), 'en')).toMatch(/request limit/i);
  });

  it('distinguishes the causes the pipeline used to collapse into one sentence', () => {
    const codes = [
      'extraction/rate-limited',
      'extraction/timeout',
      'extraction/unavailable',
      'extraction/unauthenticated',
      'extraction/blocked',
      'extraction/truncated',
      'extraction/invalid-response',
      'extraction/unknown',
    ];
    const sentences = codes.map((code) => warningText(warning(code), 'es'));

    expect(new Set(sentences).size).toBe(codes.length);
  });

  it('keeps the pipeline sentence for codes that carry their own detail', () => {
    // A duplicate notice names the other file and a quota refusal names the
    // allowance — an English sentence that says something beats a translated
    // one that does not.
    expect(warningText(warning('duplicate/likely', 'Same as march.pdf.'), 'es')).toBe(
      'Same as march.pdf.',
    );
  });
});
