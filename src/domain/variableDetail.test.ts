import { describe, expect, it } from 'vitest';

import {
  byObservedAt,
  describeChange,
  isNumeric,
  latestAnalysed,
  splitMeasurements,
  type VariableMeasurement,
} from './variableDetail';
import { timeWindow } from './variables';

function measurement(overrides: Partial<VariableMeasurement> = {}): VariableMeasurement {
  return {
    id: 'report-1/000-glucose',
    reportId: 'report-1',
    reportFileName: 'march.pdf',
    reportDate: new Date('2026-03-01T00:00:00Z'),
    laboratoryName: 'Labcorp',
    observedAt: new Date('2026-03-01T00:00:00Z'),
    rawName: 'Glucose',
    value: 92,
    rawValue: '92',
    unit: 'mg/dL',
    referenceRange: { low: 70, high: 99, text: null, source: 'laboratory' },
    status: 'normal',
    confidence: 'high',
    analysis: null,
    ...overrides,
  };
}

const analysis = {
  text: 'This value sits just above the range printed on your report.',
  provider: 'google',
  model: 'gemini-2.0-flash',
  promptVersion: 'v3',
  contentUsedForTraining: false,
  generatedAt: '2026-03-02T00:00:00Z',
};

describe('splitMeasurements', () => {
  it('keeps non-numeric results instead of dropping them', () => {
    // The failure this guards against is silent: a urinalysis reported as
    // "Negative" has no number, and a filter written as `value !== null` on
    // the way into a chart would remove the result from the page entirely.
    const { numeric, qualitative } = splitMeasurements([
      measurement({ id: 'a', value: 92, rawValue: '92' }),
      measurement({ id: 'b', value: null, rawValue: 'Negative' }),
    ]);

    expect(numeric.map((entry) => entry.id)).toEqual(['a']);
    expect(qualitative.map((entry) => entry.rawValue)).toEqual(['Negative']);
  });

  it('treats a non-finite value as unplottable rather than as a number', () => {
    // NaN is what a malformed stored value arrives as. Left in, it poisons the
    // y-axis: Math.min of anything with NaN is NaN, and the whole chart
    // collapses to nothing.
    const { numeric, qualitative } = splitMeasurements([
      measurement({ value: Number.NaN, rawValue: 'n/a' }),
    ]);

    expect(numeric).toHaveLength(0);
    expect(qualitative).toHaveLength(1);
    expect(isNumeric(measurement({ value: Number.NaN }))).toBe(false);
  });
});

describe('latestAnalysed', () => {
  it('takes the most recent commentary, not the most recent result', () => {
    // Analysis is only generated for results worth commenting on, so the
    // newest report routinely has none while an earlier one does.
    const latest = latestAnalysed([
      measurement({ id: 'old', observedAt: new Date('2025-01-01'), analysis }),
      measurement({ id: 'new', observedAt: new Date('2026-01-01'), analysis: null }),
    ]);

    expect(latest?.id).toBe('old');
  });

  it('is null when nothing has been analysed', () => {
    expect(latestAnalysed([measurement()])).toBeNull();
  });
});

describe('describeChange', () => {
  const older = measurement({
    id: 'older',
    observedAt: new Date('2026-01-01T00:00:00Z'),
    value: 88,
  });
  const newer = measurement({
    id: 'newer',
    observedAt: new Date('2026-06-01T00:00:00Z'),
    value: 104,
  });

  it('states the latest value and how it compares with the one before it', () => {
    const sentence = describeChange('Glucose', splitMeasurements([newer, older]).numeric);

    expect(sentence).toContain('104 mg/dL');
    expect(sentence).toContain('88 mg/dL');
    expect(sentence).toContain('up from');
  });

  it('describes movement without judging it', () => {
    // The spec forbids "improved"/"worsened" here, in either direction: this
    // application knows nothing about the person the numbers belong to.
    const up = describeChange('Glucose', splitMeasurements([newer, older]).numeric);
    const down = describeChange('Glucose', splitMeasurements([older, newer]).numeric.reverse());

    for (const sentence of [up, down]) {
      expect(sentence).not.toMatch(/better|worse|improv|concern|healthy|abnormal/i);
    }
  });

  it('compares against the previous measurement in time, not in array order', () => {
    // The history arrives sorted, but a caller that reversed it for display
    // must not be able to turn a rise into a fall.
    expect(describeChange('Glucose', splitMeasurements([older, newer]).numeric)).toEqual(
      describeChange('Glucose', splitMeasurements([newer, older]).numeric),
    );
  });

  it('says so when there is nothing to compare against', () => {
    expect(describeChange('Glucose', splitMeasurements([newer]).numeric)).toContain(
      'first measurement',
    );
  });

  it('reports an unchanged value as unchanged', () => {
    const same = measurement({ id: 'same', observedAt: new Date('2026-06-01'), value: 88 });
    expect(describeChange('Glucose', splitMeasurements([older, same]).numeric)).toContain(
      'unchanged',
    );
  });

  it('handles an empty history rather than throwing', () => {
    expect(describeChange('Glucose', [])).toContain('No measurements');
  });
});

describe('byObservedAt', () => {
  it('orders oldest first', () => {
    const ordered = [
      measurement({ id: 'b', observedAt: new Date('2026-06-01') }),
      measurement({ id: 'a', observedAt: new Date('2026-01-01') }),
    ].sort(byObservedAt);

    expect(ordered.map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});

describe('timeWindow', () => {
  const march = Date.parse('2026-03-01T00:00:00Z');
  const june = Date.parse('2026-06-01T00:00:00Z');
  const now = Date.parse('2026-08-01T00:00:00Z');

  it('spans the whole history when no period is set', () => {
    expect(timeWindow([june, march], null, now)).toEqual({ from: march, to: june });
  });

  it('never starts before the earliest measurement', () => {
    // A three-year window over four months of history should show the four
    // months, not thirty-two months of empty axis leading up to them.
    expect(timeWindow([march, june], 36, now)).toEqual({ from: march, to: june });
  });

  it('cuts the window back from the newest measurement, not from today', () => {
    const twelveMonths = timeWindow([Date.parse('2020-01-01T00:00:00Z'), june], 12, now);

    expect(twelveMonths.to).toBe(june);
    expect(new Date(twelveMonths.from).toISOString()).toBe('2025-06-01T00:00:00.000Z');
  });

  it('falls back to now when there is nothing to measure', () => {
    expect(timeWindow([], 12, now)).toEqual({ from: now, to: now });
  });
});
