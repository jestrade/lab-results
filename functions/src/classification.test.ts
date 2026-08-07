import { describe, expect, it } from 'vitest';

import { classify, isOutOfRange, parseValue, type ReferenceRange } from './classification';

/**
 * These tests guard the product's central safety claim: classification is
 * arithmetic, in code, against the range printed on the report — never the
 * model's opinion. If this file goes green, a hallucination cannot change
 * whether a result reads as normal or critical.
 */

const labRange = (low: number | null, high: number | null): ReferenceRange => ({
  low,
  high,
  text: null,
  source: 'laboratory',
});

describe('classify', () => {
  it('calls a value inside the range normal', () => {
    expect(classify({ value: 14.2, rawValue: '14.2', range: labRange(13, 17) })).toBe('normal');
  });

  it('treats the bounds as inclusive', () => {
    // A laboratory printing 13.0–17.0 means 13.0 is a normal result. An
    // exclusive comparison here would flag healthy people at the boundary.
    expect(classify({ value: 13, rawValue: '13', range: labRange(13, 17) })).toBe('normal');
    expect(classify({ value: 17, rawValue: '17', range: labRange(13, 17) })).toBe('normal');
  });

  it('classifies outside the range', () => {
    expect(classify({ value: 12.9, rawValue: '12.9', range: labRange(13, 17) })).toBe('low');
    expect(classify({ value: 17.1, rawValue: '17.1', range: labRange(13, 17) })).toBe('high');
  });

  it('handles one-sided ranges', () => {
    expect(classify({ value: 141, rawValue: '141', range: labRange(null, 100) })).toBe('high');
    expect(classify({ value: 90, rawValue: '90', range: labRange(null, 100) })).toBe('normal');
    expect(classify({ value: 20, rawValue: '20', range: labRange(40, null) })).toBe('low');
  });

  describe('critical', () => {
    const withCritical: ReferenceRange = {
      ...labRange(3.5, 5.1),
      criticalLow: 2.5,
      criticalHigh: 6.0,
    };

    it('requires an explicit laboratory threshold', () => {
      expect(classify({ value: 6.3, rawValue: '6.3', range: withCritical })).toBe('critical');
      expect(classify({ value: 2.4, rawValue: '2.4', range: withCritical })).toBe('critical');
    });

    it('is never inferred from how far outside the range a value sits', () => {
      // "Far outside" is a clinical judgement. Without a stated panic value a
      // wildly abnormal result is high or low — flagged, but not escalated on
      // our own authority.
      expect(classify({ value: 99, rawValue: '99', range: labRange(3.5, 5.1) })).toBe('high');
      expect(classify({ value: 0.01, rawValue: '0.01', range: labRange(3.5, 5.1) })).toBe('low');
    });

    it('wins over high or low, since it is what the user must see', () => {
      expect(classify({ value: 6.0, rawValue: '6.0', range: withCritical })).toBe('critical');
    });
  });

  describe('missing or unusable ranges', () => {
    it('returns unknown when the report had no range', () => {
      const range: ReferenceRange = { low: null, high: null, text: null, source: 'unavailable' };
      expect(classify({ value: 24, rawValue: '24', range })).toBe('unknown');
    });

    it('returns unknown when a claimed range has no bounds', () => {
      // Source says laboratory but nothing survived extraction. Guessing here
      // would classify against a range that does not exist.
      expect(classify({ value: 24, rawValue: '24', range: labRange(null, null) })).toBe('unknown');
    });

    it('never borrows a plausible range to avoid saying unknown', () => {
      // Haemoglobin has a well-known range. The model knows it, and so does
      // every developer. It is still not this report's range.
      const range: ReferenceRange = { low: null, high: null, text: null, source: 'unavailable' };
      expect(classify({ value: 14.2, rawValue: '14.2', range })).toBe('unknown');
    });
  });

  describe('non-numeric results', () => {
    const textual: ReferenceRange = {
      low: null,
      high: null,
      text: 'Negative',
      source: 'laboratory',
    };

    it('matches a textual result against a textual range', () => {
      expect(classify({ value: null, rawValue: 'Negative', range: textual })).toBe('normal');
      expect(classify({ value: null, rawValue: ' negative ', range: textual })).toBe('normal');
    });

    it('returns unknown when a textual result does not match the range', () => {
      // "Positive" against a reference of "Negative" is clearly not normal —
      // but calling it "high" would be inventing a scale that does not exist.
      expect(classify({ value: null, rawValue: 'Positive', range: textual })).toBe('unknown');
    });

    it('returns unknown for a non-numeric result with a numeric range', () => {
      expect(classify({ value: null, rawValue: 'Trace', range: labRange(0, 5) })).toBe('unknown');
    });
  });

  it('returns unknown rather than throwing on a non-finite value', () => {
    expect(classify({ value: Number.NaN, rawValue: 'NaN', range: labRange(1, 2) })).toBe('unknown');
    expect(classify({ value: Infinity, rawValue: 'inf', range: labRange(1, 2) })).toBe('unknown');
  });
});

describe('parseValue', () => {
  it('parses ordinary numbers', () => {
    expect(parseValue('14.2')).toBe(14.2);
    expect(parseValue(' 139 ')).toBe(139);
    expect(parseValue('-0.5')).toBe(-0.5);
  });

  it('accepts a comma decimal separator', () => {
    expect(parseValue('14,2')).toBe(14.2);
  });

  it('accepts thousands separators', () => {
    expect(parseValue('1,200')).toBe(1200);
  });

  it('refuses to turn a bound into a measurement', () => {
    // "<0.01" means the laboratory declined to measure below a floor. Reading
    // it as 0.01 would classify a value nobody reported.
    expect(parseValue('<0.01')).toBeNull();
    expect(parseValue('>1000')).toBeNull();
    expect(parseValue('≤5')).toBeNull();
  });

  it('returns null for text', () => {
    for (const raw of ['Negative', 'Trace', 'See comment', '']) {
      expect(parseValue(raw), raw).toBeNull();
    }
  });
});

describe('isOutOfRange', () => {
  it('counts low, high and critical', () => {
    expect(['low', 'high', 'critical'].every(isOutOfRange)).toBe(true);
  });

  it('does not count unknown as out of range', () => {
    // "We could not classify it" is not "it is abnormal". Counting unknown
    // would inflate the out-of-range figure with values nobody has assessed.
    expect(isOutOfRange('unknown')).toBe(false);
    expect(isOutOfRange('normal')).toBe(false);
  });
});
