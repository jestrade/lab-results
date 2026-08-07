import { describe, expect, it } from 'vitest';

import { calculateTrend, MIN_POINTS_FOR_TREND, type TrendPoint } from './trends';

const DAY = 86_400_000;
const series = (...values: number[]): TrendPoint[] =>
  values.map((value, index) => ({ value, at: index * 30 * DAY }));

describe('calculateTrend', () => {
  it('needs at least three points before naming a direction', () => {
    // Two measurements make a line, not a trend. Reporting the first repeat as
    // "increasing" reads as a finding when it is usually noise.
    expect(calculateTrend({ points: series(4, 6) })).toBe('insufficient_data');
    expect(MIN_POINTS_FOR_TREND).toBe(3);
  });

  it('names a rise and a fall', () => {
    expect(calculateTrend({ points: series(4.4, 5.2, 6.3), rangeLow: 3.5, rangeHigh: 5.1 })).toBe(
      'increasing',
    );
    expect(calculateTrend({ points: series(6.3, 5.2, 4.4), rangeLow: 3.5, rangeHigh: 5.1 })).toBe(
      'decreasing',
    );
  });

  it('calls small movement stable', () => {
    // 0.05 mmol/L across a 1.6-wide band is well inside ordinary variation.
    expect(
      calculateTrend({ points: series(4.4, 4.42, 4.45), rangeLow: 3.5, rangeHigh: 5.1 }),
    ).toBe('stable');
  });

  it('judges change against the reference band, not the value', () => {
    // The same absolute move means different things for different tests. A 0.4
    // rise across potassium's 1.6-wide band is a quarter of it; across
    // cholesterol's 100-wide band it is nothing.
    const points = series(4.0, 4.2, 4.4);
    expect(calculateTrend({ points, rangeLow: 3.5, rangeHigh: 5.1 })).toBe('increasing');
    expect(calculateTrend({ points, rangeLow: 0, rangeHigh: 100 })).toBe('stable');
  });

  it('falls back to the mean when the report gave no range', () => {
    // Still proportionate: a test with no printed range should not inherit an
    // absolute threshold that suits no test at all.
    expect(calculateTrend({ points: series(100, 130, 160) })).toBe('increasing');
    expect(calculateTrend({ points: series(100, 101, 102) })).toBe('stable');
  });

  it('is not flipped by a single outlier at one end', () => {
    // Least squares over the whole series, rather than first-versus-last.
    const flatWithSpike: TrendPoint[] = [
      { value: 5.0, at: 0 },
      { value: 5.0, at: 30 * DAY },
      { value: 5.0, at: 60 * DAY },
      { value: 5.0, at: 90 * DAY },
      { value: 5.4, at: 120 * DAY },
    ];
    expect(calculateTrend({ points: flatWithSpike, rangeLow: 3.5, rangeHigh: 5.1 })).toBe('stable');
  });

  it('treats several results from one instant as no trend', () => {
    // Repeats of one moment are not a series over time.
    const sameDay: TrendPoint[] = [
      { value: 4, at: 0 },
      { value: 5, at: 0 },
      { value: 6, at: 0 },
    ];
    expect(calculateTrend({ points: sameDay })).toBe('insufficient_data');
  });

  it('ignores unusable points rather than producing NaN', () => {
    const messy: TrendPoint[] = [
      { value: Number.NaN, at: 0 },
      { value: 4, at: DAY },
      { value: 5, at: 2 * DAY },
    ];
    // Two usable points remain, which is below the minimum.
    expect(calculateTrend({ points: messy })).toBe('insufficient_data');
  });

  it('sorts by time, so out-of-order points do not invert the answer', () => {
    const shuffled: TrendPoint[] = [
      { value: 6.3, at: 60 * DAY },
      { value: 4.4, at: 0 },
      { value: 5.2, at: 30 * DAY },
    ];
    expect(calculateTrend({ points: shuffled, rangeLow: 3.5, rangeHigh: 5.1 })).toBe('increasing');
  });

  it('never returns a word that judges the direction', () => {
    // The spec forbids implying a direction is good or bad, and the type is
    // what enforces it — this pins the vocabulary against a careless widening.
    const outcomes = new Set([
      calculateTrend({ points: series(1, 2, 3) }),
      calculateTrend({ points: series(3, 2, 1) }),
      calculateTrend({ points: series(2, 2, 2) }),
      calculateTrend({ points: series(1, 2) }),
    ]);
    for (const outcome of outcomes) {
      expect(['increasing', 'decreasing', 'stable', 'insufficient_data']).toContain(outcome);
    }
  });
});
