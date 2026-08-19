import { describe, expect, it } from 'vitest';

import {
  MAX_HEIGHT_CM,
  MAX_WEIGHT_KG,
  MIN_HEIGHT_CM,
  MIN_WEIGHT_KG,
  bodyMassIndex,
  isPlausibleHeightCm,
  isPlausibleWeightKg,
  parseMeasurement,
} from '../bmi';

describe('parseMeasurement', () => {
  it('reads a plain number', () => {
    expect(parseMeasurement('70')).toBe(70);
    expect(parseMeasurement('70.5')).toBe(70.5);
  });

  it('accepts a comma as the decimal separator', () => {
    // A Spanish keyboard produces this, and reading it as seventy would store
    // a weight half a kilogram out without saying so.
    expect(parseMeasurement('70,5')).toBe(70.5);
  });

  it('treats blank and whitespace as unanswered rather than as zero', () => {
    expect(parseMeasurement('')).toBeNull();
    expect(parseMeasurement('   ')).toBeNull();
    expect(parseMeasurement(null)).toBeNull();
  });

  it('returns NaN for text that is not a number, so the caller can say so', () => {
    // Distinct from null: "seventy" is a mistake worth reporting, an empty
    // field is a question the reader chose not to answer.
    expect(parseMeasurement('seventy')).toBeNaN();
    expect(parseMeasurement('70kg')).toBeNaN();
  });
});

describe('plausibility bounds', () => {
  it('accepts the extremes of the accepted range', () => {
    expect(isPlausibleWeightKg(MIN_WEIGHT_KG)).toBe(true);
    expect(isPlausibleWeightKg(MAX_WEIGHT_KG)).toBe(true);
    expect(isPlausibleHeightCm(MIN_HEIGHT_CM)).toBe(true);
    expect(isPlausibleHeightCm(MAX_HEIGHT_CM)).toBe(true);
  });

  it('rejects a height typed in metres', () => {
    // The mistake these bounds exist for: 1.7 instead of 170 would produce an
    // index of 24,000 and look like a broken app rather than a typo.
    expect(isPlausibleHeightCm(1.7)).toBe(false);
  });

  it('rejects zero, negatives and non-numbers', () => {
    expect(isPlausibleWeightKg(0)).toBe(false);
    expect(isPlausibleWeightKg(-70)).toBe(false);
    expect(isPlausibleWeightKg(Number.NaN)).toBe(false);
    expect(isPlausibleHeightCm(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('bodyMassIndex', () => {
  it('computes the ratio to one decimal place', () => {
    // 70 / 1.75² = 22.857…
    expect(bodyMassIndex(70, 175)).toBe(22.9);
    expect(bodyMassIndex(50, 160)).toBe(19.5);
    expect(bodyMassIndex(95, 180)).toBe(29.3);
  });

  it('has no index until both measurements are given', () => {
    expect(bodyMassIndex(70, null)).toBeNull();
    expect(bodyMassIndex(null, 175)).toBeNull();
    expect(bodyMassIndex(null, null)).toBeNull();
  });

  it('refuses to compute one from an implausible measurement', () => {
    // Showing an index of 24,221 would be arithmetic done faithfully on a
    // number nobody meant to type.
    expect(bodyMassIndex(70, 1.7)).toBeNull();
    expect(bodyMassIndex(0, 175)).toBeNull();
    expect(bodyMassIndex(Number.NaN, 175)).toBeNull();
  });
});
