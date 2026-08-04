import { describe, expect, it } from 'vitest';

import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  describeSparkline,
  formatReferenceRange,
  groupByCategory,
  matchesQuery,
  sparklinePath,
  summariseSeries,
} from './variables';
import type { ReferenceRange, VariableCategory, VariableSeries } from './types';

function stamp(iso: string) {
  return { toDate: () => new Date(iso), toMillis: () => new Date(iso).getTime() } as never;
}

function makeSeries(overrides: Partial<VariableSeries> = {}): VariableSeries {
  return {
    variableId: 'hemoglobin',
    canonicalName: 'Hemoglobin',
    aliases: ['Hgb', 'Hb'],
    category: 'complete_blood_count',
    unit: 'g/dL',
    latestValue: 14.2,
    latestRawValue: '14.2',
    latestStatus: 'normal',
    latestObservedAt: stamp('2026-07-12T00:00:00Z'),
    referenceRange: { low: 13, high: 17, text: null, source: 'laboratory' },
    resultCount: 5,
    trend: 'stable',
    points: [
      { value: 13.8, observedAt: stamp('2024-03-01T00:00:00Z') },
      { value: 14.2, observedAt: stamp('2026-07-12T00:00:00Z') },
    ],
    ...overrides,
  };
}

describe('formatReferenceRange', () => {
  it('formats a two-sided laboratory range', () => {
    expect(formatReferenceRange({ low: 13, high: 17, text: null, source: 'laboratory' })).toEqual({
      text: '13–17',
      note: null,
    });
  });

  it('formats one-sided ranges', () => {
    expect(
      formatReferenceRange({ low: null, high: 100, text: null, source: 'laboratory' }).text,
    ).toBe('< 100');
    expect(
      formatReferenceRange({ low: 40, high: null, text: null, source: 'laboratory' }).text,
    ).toBe('> 40');
  });

  it('reproduces a textual range verbatim rather than converting it', () => {
    // "Negative" and "< 5.7 %" carry meaning a low/high pair cannot. Rewriting
    // them would invent precision the laboratory never stated (spec §40.5).
    for (const text of ['Negative', '< 5.7 %', 'Non-reactive']) {
      const range: ReferenceRange = { low: null, high: null, text, source: 'laboratory' };
      expect(formatReferenceRange(range).text).toBe(text);
    }
  });

  it('labels a general range as not lab-specific', () => {
    // Presenting a general range as if the lab had printed it misrepresents
    // the result (spec §40.6).
    const range: ReferenceRange = { low: 13, high: 17, text: null, source: 'general' };
    expect(formatReferenceRange(range).note).toBe('general reference, not lab-specific');
  });

  it('says so when no range was available rather than guessing one', () => {
    const range: ReferenceRange = { low: null, high: null, text: null, source: 'unavailable' };
    expect(formatReferenceRange(range)).toEqual({
      text: null,
      note: 'reference range unavailable',
    });
  });

  it('falls back to unavailable when a claimed range has no usable bounds', () => {
    // Source says laboratory but nothing survived extraction. Claiming a range
    // would be worse than admitting the gap.
    const range: ReferenceRange = { low: null, high: null, text: null, source: 'laboratory' };
    expect(formatReferenceRange(range).text).toBeNull();
  });
});

describe('summariseSeries', () => {
  it('reads range, count and trend', () => {
    expect(summariseSeries(makeSeries())).toBe('Range 13–17 · 5 results · Stable');
  });

  it('omits a trend that cannot be determined', () => {
    const summary = summariseSeries(
      makeSeries({ trend: 'insufficient_data', resultCount: 1, points: [] }),
    );
    expect(summary).toBe('Range 13–17 · 1 result');
    expect(summary).not.toMatch(/insufficient/i);
  });

  it('states a missing range instead of leaving a gap', () => {
    const summary = summariseSeries(
      makeSeries({
        referenceRange: { low: null, high: null, text: null, source: 'unavailable' },
      }),
    );
    expect(summary).toContain('Reference range unavailable');
  });
});

describe('describeSparkline', () => {
  it('describes movement in words for anyone who cannot see the chart', () => {
    const description = describeSparkline(makeSeries({ trend: 'increasing' }));
    expect(description).toBe('Hemoglobin rose from 13.8 g/dL to 14.2 g/dL across 2 measurements.');
  });

  it('never implies a direction is good or bad', () => {
    // The spec forbids value judgements: whether a rising value is welcome is
    // a clinical question this product does not answer.
    const forbidden = /\b(good|bad|better|worse|improv|deteriorat|healthy|concerning|worrying)/i;
    for (const trend of ['increasing', 'decreasing', 'stable'] as const) {
      expect(describeSparkline(makeSeries({ trend }))).not.toMatch(forbidden);
    }
  });

  it('says plainly when there is not enough data', () => {
    expect(describeSparkline(makeSeries({ points: [] }))).toMatch(/not enough measurements/i);
  });
});

describe('sparklinePath', () => {
  it('normalises points into a unit box, oldest first', () => {
    const path = sparklinePath(
      makeSeries({
        points: [
          { value: 10, observedAt: stamp('2024-01-01T00:00:00Z') },
          { value: 20, observedAt: stamp('2025-01-01T00:00:00Z') },
        ],
      }),
    );
    // y is inverted so a larger value sits higher on screen.
    expect(path).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ]);
  });

  it('centres a flat series rather than dividing by zero', () => {
    const path = sparklinePath(
      makeSeries({
        points: [
          { value: 5, observedAt: stamp('2024-01-01T00:00:00Z') },
          { value: 5, observedAt: stamp('2025-01-01T00:00:00Z') },
        ],
      }),
    );
    // Drawing a flat line at the top of the box would read as "high".
    expect(path.every((point) => point.y === 0.5)).toBe(true);
  });

  it('draws nothing from a single point', () => {
    expect(sparklinePath(makeSeries({ points: [{ value: 5, observedAt: stamp('2024-01-01') }] }))).toEqual(
      [],
    );
  });
});

describe('matchesQuery', () => {
  it('matches the canonical name', () => {
    expect(matchesQuery(makeSeries(), 'hemo')).toBe(true);
  });

  it('matches an alias, which is what the report actually printed', () => {
    // A user searches for "Hgb" because that is what is on their paper, not
    // the canonical name we happened to choose.
    expect(matchesQuery(makeSeries(), 'hgb')).toBe(true);
  });

  it('matches everything on an empty query', () => {
    expect(matchesQuery(makeSeries(), '   ')).toBe(true);
  });

  it('does not match an unrelated term', () => {
    expect(matchesQuery(makeSeries(), 'potassium')).toBe(false);
  });
});

describe('groupByCategory', () => {
  it('groups and orders categories consistently, not alphabetically', () => {
    // A fixed order keeps a variable where the user last saw it as their
    // panels change.
    const groups = groupByCategory([
      makeSeries({ variableId: 'k', canonicalName: 'Potassium', category: 'electrolytes' }),
      makeSeries({ variableId: 'ldl', canonicalName: 'LDL', category: 'lipid_profile' }),
      makeSeries({ variableId: 'hgb', canonicalName: 'Hemoglobin' }),
    ]);

    expect(groups.map((group) => group.category)).toEqual([
      'complete_blood_count',
      'lipid_profile',
      'electrolytes',
    ]);
  });

  it('sorts variables inside a group by name', () => {
    const groups = groupByCategory([
      makeSeries({ variableId: 'b', canonicalName: 'Sodium', category: 'electrolytes' }),
      makeSeries({ variableId: 'a', canonicalName: 'Chloride', category: 'electrolytes' }),
    ]);
    expect(groups[0]!.series.map((entry) => entry.canonicalName)).toEqual(['Chloride', 'Sodium']);
  });

  it('omits categories with nothing in them', () => {
    expect(groupByCategory([makeSeries()])).toHaveLength(1);
  });
});

describe('category metadata', () => {
  it('labels every category in the union', () => {
    for (const category of CATEGORY_ORDER) {
      expect(CATEGORY_LABEL[category], category).toBeTruthy();
    }
  });

  it('orders every category exactly once', () => {
    const labelled = Object.keys(CATEGORY_LABEL) as VariableCategory[];
    expect([...CATEGORY_ORDER].sort()).toEqual([...labelled].sort());
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
  });
});
