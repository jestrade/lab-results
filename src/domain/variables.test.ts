import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  describeSparkline,
  formatReferenceRange,
  groupByCategory,
  matchesQuery,
  MIN_POINTS_FOR_TREND,
  seriesInWindow,
  seriesName,
  sortSeries,
  sparklinePath,
  summariseSeries,
  withCatalog,
} from './variables';
import type {
  LabVariable,
  ReferenceRange,
  VariableCategory,
  VariableSeries,
} from './types';

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

describe('seriesInWindow', () => {
  const JAN_2024 = new Date('2024-01-15T00:00:00Z').getTime();
  const JUN_2026 = new Date('2026-06-01T00:00:00Z').getTime();
  const JUL_2026 = new Date('2026-07-12T00:00:00Z').getTime();

  const recent = makeSeries({
    latestObservedAt: stamp('2026-07-12T00:00:00Z'),
    resultCount: 2,
    points: [
      { value: 13.8, observedAt: stamp('2024-01-15T00:00:00Z') },
      { value: 14.2, observedAt: stamp('2026-07-12T00:00:00Z') },
    ],
  });

  it('keeps a variable measured inside the window', () => {
    expect(seriesInWindow(recent, JUN_2026, JUL_2026)).not.toBeNull();
  });

  it('drops one whose newest result predates the window', () => {
    // Drawing a 2024 value as the current one under "last 12 months" would be
    // the card misrepresenting itself.
    const stale = makeSeries({
      latestObservedAt: stamp('2024-01-15T00:00:00Z'),
      points: [{ value: 13.8, observedAt: stamp('2024-01-15T00:00:00Z') }],
    });
    expect(seriesInWindow(stale, JUN_2026, JUL_2026)).toBeNull();
  });

  it('keeps a qualitative result, which has no plottable points at all', () => {
    // "Negative" measured last week would otherwise vanish from every window
    // but "all time".
    const qualitative = makeSeries({
      latestValue: null,
      latestRawValue: 'Negative',
      latestObservedAt: stamp('2026-07-12T00:00:00Z'),
      points: [],
    });
    expect(seriesInWindow(qualitative, JUN_2026, JUL_2026)).not.toBeNull();
  });

  it('trims the points to the window and moves the count with them', () => {
    // The count is the length of the point list, so leaving it would print
    // "2 results" under a line drawn from one.
    const windowed = seriesInWindow(recent, JUN_2026, JUL_2026)!;
    expect(windowed.points).toHaveLength(1);
    expect(windowed.resultCount).toBe(1);
  });

  it('returns the same object when the window removes nothing', () => {
    // The default view has to be exactly what it was before windows existed.
    expect(seriesInWindow(recent, JAN_2024, JUL_2026)).toBe(recent);
  });

  it('leaves the original untouched when it trims', () => {
    seriesInWindow(recent, JUN_2026, JUL_2026);
    expect(recent.points).toHaveLength(2);
    expect(recent.resultCount).toBe(2);
  });

  it('keeps a series with no usable timestamp rather than hiding it', () => {
    // A missing instant is a gap in our record, not evidence the test is old.
    const undated = makeSeries({ latestObservedAt: undefined as never, points: [] });
    expect(seriesInWindow(undated, JUN_2026, JUL_2026)).not.toBeNull();
  });
});

describe('sortSeries', () => {
  const hemoglobin = makeSeries({
    variableId: 'hgb',
    canonicalName: 'Hemoglobin',
    latestStatus: 'normal',
    latestObservedAt: stamp('2026-07-12T00:00:00Z'),
  });
  const potassium = makeSeries({
    variableId: 'k',
    canonicalName: 'Potassium',
    category: 'electrolytes',
    latestStatus: 'critical',
    latestObservedAt: stamp('2025-01-04T00:00:00Z'),
  });
  const ldl = makeSeries({
    variableId: 'ldl',
    canonicalName: 'LDL',
    category: 'lipid_profile',
    latestStatus: 'high',
    latestObservedAt: stamp('2026-07-12T00:00:00Z'),
  });

  it('puts the newest measurement first', () => {
    // "What came back in my last report" — the question a reader arrives with
    // the day after uploading one.
    const order = sortSeries([potassium, hemoglobin, ldl], 'recent').map((s) => s.variableId);
    expect(order.at(-1)).toBe('k');
    expect(order.slice(0, 2).sort()).toEqual(['hgb', 'ldl']);
  });

  it('breaks a shared instant by name rather than by arrival', () => {
    // A panel run on one day shares an instant; leaving those in input order
    // would reshuffle a dozen cards on every snapshot.
    const order = sortSeries([ldl, hemoglobin], 'recent').map((s) => s.variableId);
    expect(order).toEqual(['hgb', 'ldl']);
  });

  it('brings the worst status to the top', () => {
    const order = sortSeries([hemoglobin, ldl, potassium], 'flagged').map((s) => s.variableId);
    expect(order).toEqual(['k', 'ldl', 'hgb']);
  });

  it('ranks high and low together', () => {
    // Which is more serious is a clinical judgement, and ordering one above the
    // other would be this application making it.
    const low = makeSeries({ variableId: 'na', canonicalName: 'Sodium', latestStatus: 'low' });
    const high = makeSeries({ variableId: 'ca', canonicalName: 'Calcium', latestStatus: 'high' });
    const order = sortSeries([low, high], 'flagged').map((s) => s.variableId);
    // Same rank, so the tiebreakers decide — never the status.
    expect(order.sort()).toEqual(['ca', 'na']);
  });

  it('sorts by displayed name in category mode', () => {
    const order = sortSeries([potassium, hemoglobin, ldl], 'category').map((s) => s.variableId);
    expect(order).toEqual(['hgb', 'ldl', 'k']);
  });

  it('does not mutate the list it was given', () => {
    const input = [potassium, hemoglobin];
    sortSeries(input, 'flagged');
    expect(input.map((s) => s.variableId)).toEqual(['k', 'hgb']);
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

  it('labels the groups in the reader’s language', () => {
    const series = [makeSeries({ category: 'complete_blood_count' })];

    expect(groupByCategory(series, 'en')[0]!.label).toBe('Complete blood count');
    // The panel name a Spanish-language laboratory prints, not a word-for-word
    // translation of the English phrase.
    expect(groupByCategory(series, 'es')[0]!.label).toBe('Biometría hemática');
  });

  it('sorts by the name actually shown, not by the English one', () => {
    // In Spanish the pair reverses: "Potasio" before "Sodio", but "Sodium"
    // before... nothing — the point is the order follows what is on screen.
    const groups = groupByCategory(
      [
        makeSeries({
          variableId: 'na',
          canonicalName: 'Sodium',
          names: { en: 'Sodium', es: 'Sodio' },
          category: 'electrolytes',
        }),
        makeSeries({
          variableId: 'k',
          canonicalName: 'Potassium',
          names: { en: 'Potassium', es: 'Potasio' },
          category: 'electrolytes',
        }),
      ],
      'es',
    );

    expect(groups[0]!.series.map((entry) => entry.names!.es)).toEqual(['Potasio', 'Sodio']);
  });
});

describe('withCatalog', () => {
  function entry(overrides: Partial<LabVariable> = {}): LabVariable {
    return {
      id: 'uric-acid',
      canonicalName: 'Uric Acid',
      names: { en: 'Uric Acid', es: 'Ácido Úrico' },
      descriptions: {},
      aliases: ['Uric Acid', 'Ácido Úrico'],
      category: 'kidney_function',
      defaultUnit: 'mg/dL',
      origin: 'catalog',
      needsEnrichment: false,
      createdAt: stamp('2026-08-05T00:00:00Z'),
      ...overrides,
    };
  }

  const catalog = new Map<string, LabVariable>([['uric-acid', entry()]]);

  it('re-labels a series that still carries the laboratory’s own wording', () => {
    // This is the real case: the series was written before the catalog
    // existed, so its denormalised name is whatever the report printed.
    const stale = makeSeries({
      variableId: 'uric-acid',
      canonicalName: 'Ácido úrico sérico',
      names: { en: 'Ácido úrico sérico' },
      category: 'other',
    });

    const [merged] = withCatalog([stale], catalog);

    expect(merged!.canonicalName).toBe('Uric Acid');
    expect(seriesName(merged!, 'es')).toBe('Ácido Úrico');
    expect(merged!.category).toBe('kidney_function');
  });

  it('leaves the user’s own measurements untouched', () => {
    // Only presentation comes from the catalog. Values, ranges and history are
    // the user's and must survive the join byte for byte.
    const original = makeSeries({ variableId: 'uric-acid', latestValue: 7.4, resultCount: 5 });
    const [merged] = withCatalog([original], catalog);

    expect(merged!.latestValue).toBe(7.4);
    expect(merged!.resultCount).toBe(5);
    expect(merged!.points).toEqual(original.points);
    expect(merged!.referenceRange).toEqual(original.referenceRange);
    expect(merged!.latestStatus).toBe(original.latestStatus);
  });

  it('keeps a series the catalog has never heard of', () => {
    // A variable missing from the catalog is still a result the user owns.
    // Dropping it would hide their own data.
    const orphan = makeSeries({ variableId: 'not-in-catalog', canonicalName: 'Some Assay' });
    const [merged] = withCatalog([orphan], catalog);

    expect(merged!.canonicalName).toBe('Some Assay');
    expect(merged).toEqual(orphan);
  });

  it('falls back to the series when the catalog could not be read', () => {
    const original = makeSeries();
    expect(withCatalog([original], null)).toEqual([original]);
    expect(withCatalog([original], new Map())).toEqual([original]);
  });

  it('merges both alias lists so either vocabulary is searchable', () => {
    const stale = makeSeries({
      variableId: 'uric-acid',
      canonicalName: 'Ácido úrico sérico',
      aliases: ['Ácido úrico sérico'],
    });

    const [merged] = withCatalog([stale], catalog);

    expect(matchesQuery(merged!, 'ácido úrico sérico')).toBe(true);
    expect(matchesQuery(merged!, 'uric acid')).toBe(true);
  });

  it('groups a re-labelled series under its catalog category', () => {
    const stale = makeSeries({
      variableId: 'uric-acid',
      canonicalName: 'Ácido úrico sérico',
      category: 'other',
    });

    const groups = groupByCategory(withCatalog([stale], catalog), 'en');

    expect(groups).toHaveLength(1);
    expect(groups[0]!.category).toBe('kidney_function');
    expect(groups[0]!.label).toBe('Kidney function');
  });
});

describe('seriesName', () => {
  it('returns the localised name when the catalog supplied one', () => {
    const series = makeSeries({ names: { en: 'Hemoglobin', es: 'Hemoglobina' } });
    expect(seriesName(series, 'es')).toBe('Hemoglobina');
  });

  it('falls back to the canonical name for a series written before the catalog', () => {
    // These documents genuinely have no names map. Showing the laboratory's
    // own wording beats showing nothing.
    const series = makeSeries();
    delete (series as { names?: unknown }).names;
    expect(seriesName(series, 'es')).toBe('Hemoglobin');
  });
});

describe('matchesQuery — across languages', () => {
  it('finds a variable by its Spanish name while the interface is English', () => {
    // A bilingual reader types whichever name comes to mind, and their own
    // report is where the vocabulary comes from.
    const series = makeSeries({ names: { en: 'Glucose', es: 'Glucosa' } });
    expect(matchesQuery(series, 'glucosa')).toBe(true);
    expect(matchesQuery(series, 'glucose')).toBe(true);
  });

  it('ignores accents in either the query or the stored name', () => {
    const series = makeSeries({
      canonicalName: 'Triglycerides',
      names: { en: 'Triglycerides', es: 'Triglicéridos' },
      aliases: [],
    });

    expect(matchesQuery(series, 'triglicéridos')).toBe(true);
    expect(matchesQuery(series, 'trigliceridos')).toBe(true);
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

describe('MIN_POINTS_FOR_TREND', () => {
  it('matches the threshold the trend engine actually enforces', async () => {
    // The UI explains this rule to the user ("a direction needs at least
    // three measurements"). If the engine's threshold moves and this copy does
    // not, the page states a rule the backend is not following.
    const engine = await readFile(
      resolve(process.cwd(), 'functions/src/trends.ts'),
      'utf8',
    );
    const declared = /MIN_POINTS_FOR_TREND = (\d+)/.exec(engine)?.[1];
    expect(declared).toBeDefined();
    expect(Number(declared)).toBe(MIN_POINTS_FOR_TREND);
  });
});
