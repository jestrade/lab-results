import { describe, expect, it } from 'vitest';

import { describeExtractionFailure, parseExtraction } from '../extraction';
import { AiProviderError } from '../ai/types';

/**
 * `parseExtraction` is the boundary where a model's output stops being a
 * string and starts being a laboratory result. Structured output constrains
 * the shape; it does not guarantee it. Everything here is about refusing to
 * promote a malformed row into data.
 */
describe('parseExtraction', () => {
  it('keeps a well-formed row exactly as printed', () => {
    const { output, dropped } = parseExtraction({
      laboratoryName: 'Quest Diagnostics',
      reportDate: '2026-07-12',
      results: [
        {
          rawName: 'Hemoglobin',
          rawValue: '14.2',
          unit: 'g/dL',
          referenceLow: 13,
          referenceHigh: 17,
          confidence: 'high',
        },
      ],
    });

    expect(dropped).toBe(0);
    expect(output.laboratoryName).toBe('Quest Diagnostics');
    expect(output.results[0]).toMatchObject({
      rawName: 'Hemoglobin',
      rawValue: '14.2',
      referenceLow: 13,
      referenceHigh: 17,
    });
  });

  it('preserves a non-numeric value rather than coercing it', () => {
    const { output } = parseExtraction({
      results: [{ rawName: 'Nitrites', rawValue: 'Negative', confidence: 'high' }],
    });
    expect(output.results[0]!.rawValue).toBe('Negative');
  });

  it('drops rows with no name or no value, and counts them', () => {
    // A row without both is not a result. Counting rather than discarding
    // silently is what produces `partially_processed` instead of a report that
    // looks complete but is short.
    const { output, dropped } = parseExtraction({
      results: [
        { rawName: 'Hemoglobin', rawValue: '14.2', confidence: 'high' },
        { rawName: '', rawValue: '5', confidence: 'high' },
        { rawName: 'Sodium', rawValue: '   ', confidence: 'high' },
        { rawValue: '9', confidence: 'high' },
      ],
    });
    expect(output.results).toHaveLength(1);
    expect(dropped).toBe(3);
  });

  it('treats an unrecognised confidence as low, not high', () => {
    // Failing towards "check this" is the safe direction for a value the user
    // may act on.
    const { output } = parseExtraction({
      results: [{ rawName: 'X', rawValue: '1', confidence: 'excellent' }],
    });
    expect(output.results[0]!.confidence).toBe('low');
  });

  it('ignores non-numeric range bounds instead of storing NaN', () => {
    const { output } = parseExtraction({
      results: [
        {
          rawName: 'X',
          rawValue: '1',
          referenceLow: 'thirteen',
          referenceHigh: null,
          confidence: 'high',
        },
      ],
    });
    expect(output.results[0]).not.toHaveProperty('referenceLow');
    expect(output.results[0]).not.toHaveProperty('referenceHigh');
  });

  it('ignores a malformed report date rather than storing a wrong one', () => {
    const { output } = parseExtraction({
      reportDate: '12 July 2026',
      results: [{ rawName: 'X', rawValue: '1', confidence: 'high' }],
    });
    expect(output.reportDate).toBeUndefined();
  });

  it('throws when there is no results array at all', () => {
    expect(() => parseExtraction({ laboratoryName: 'Quest' })).toThrow();
    expect(() => parseExtraction(null)).toThrow();
  });

  it('survives a response that is entirely unexpected', () => {
    expect(() => parseExtraction({ results: 'lots' })).toThrow();
  });
});

/**
 * The sentence a failed report shows is the only thing the user gets. It has
 * to name the cause, because the decision it feeds — wait, retry, or upload
 * something different — is different for each one.
 */
describe('describeExtractionFailure', () => {
  it('names the provider limit rather than saying "try again later"', () => {
    const failure = describeExtractionFailure(
      new AiProviderError('Gemini rate limit reached', 'rate-limited'),
    );

    expect(failure.code).toBe('extraction/rate-limited');
    expect(failure.message).toMatch(/request limit/i);
    expect(failure.message).toMatch(/wait a few minutes/i);
  });

  it('tells a report that ran out of output tokens to be split up', () => {
    const failure = describeExtractionFailure(
      new AiProviderError('Gemini hit the output token limit', 'truncated'),
    );

    expect(failure.code).toBe('extraction/truncated');
    expect(failure.message).toMatch(/output limit/i);
  });

  it('does not blame the file for a rejected API key', () => {
    const failure = describeExtractionFailure(
      new AiProviderError('Gemini rejected the API key', 'unauthenticated'),
    );

    expect(failure.code).toBe('extraction/unauthenticated');
    expect(failure.message).toMatch(/fault on our side/i);
  });

  it('falls back to one unknown cause for anything that is not a provider error', () => {
    const failure = describeExtractionFailure(new TypeError('boom'));

    expect(failure.code).toBe('extraction/unknown');
    expect(failure.message).toMatch(/unexpected fault/i);
  });
});
