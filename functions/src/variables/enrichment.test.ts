import { describe, expect, it } from 'vitest';

import { ENRICHMENT_CHUNK, MAX_ENRICHMENT_BATCH, parseEnrichment } from './enrichment';

const REQUESTED = ['ferritin', 'glucose'];

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ferritin',
    nameEn: 'Ferritin',
    nameEs: 'Ferritina',
    descriptionEn: 'Ferritin reflects how much iron the body has in store.',
    descriptionEs: 'La ferritina refleja la cantidad de hierro almacenada.',
    category: 'other',
    unit: 'ng/mL',
    ...overrides,
  };
}

describe('parseEnrichment', () => {
  it('keeps a well-formed entry with both translations', () => {
    const [entry] = parseEnrichment({ entries: [row()] }, REQUESTED);

    expect(entry?.nameEn).toBe('Ferritin');
    expect(entry?.nameEs).toBe('Ferritina');
    expect(entry?.descriptionEs).toContain('hierro');
    expect(entry?.unit).toBe('ng/mL');
  });

  it('throws when the response has no entries array at all', () => {
    expect(() => parseEnrichment({}, REQUESTED)).toThrow();
    expect(() => parseEnrichment({ entries: 'none' }, REQUESTED)).toThrow();
  });

  it('drops an id nobody asked about', () => {
    // A hallucinated variable would otherwise be written into the catalog as
    // a document no report has ever mentioned.
    const entries = parseEnrichment(
      { entries: [row(), row({ id: 'unicorn-marker' })] },
      REQUESTED,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('ferritin');
  });

  it('drops a duplicated id rather than letting the last one win', () => {
    const entries = parseEnrichment(
      { entries: [row(), row({ nameEn: 'Something else' })] },
      REQUESTED,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.nameEn).toBe('Ferritin');
  });

  it('drops a row missing either translation, leaving the placeholder in place', () => {
    // Half a translation is worse than none: the card would read correctly in
    // one language and be silently English in the other.
    expect(parseEnrichment({ entries: [row({ nameEs: '' })] }, REQUESTED)).toHaveLength(0);
    expect(parseEnrichment({ entries: [row({ nameEn: null })] }, REQUESTED)).toHaveLength(0);
  });

  it('falls back to "other" for a category the app does not have', () => {
    const [entry] = parseEnrichment({ entries: [row({ category: 'haematology' })] }, REQUESTED);
    expect(entry?.category).toBe('other');
  });

  it('accepts a recognised category', () => {
    const [entry] = parseEnrichment({ entries: [row({ category: 'vitamins' })] }, REQUESTED);
    expect(entry?.category).toBe('vitamins');
  });

  it('keeps an entry whose descriptions were honestly withheld', () => {
    // The prompt tells the model to return null descriptions rather than
    // invent an explanation. That must survive as a named variable with no
    // description, not be discarded.
    const [entry] = parseEnrichment(
      { entries: [row({ descriptionEn: null, descriptionEs: null })] },
      REQUESTED,
    );

    expect(entry?.nameEn).toBe('Ferritin');
    expect(entry?.descriptionEn).toBeNull();
    expect(entry?.descriptionEs).toBeNull();
  });

  it('trims the whitespace a model pads its fields with', () => {
    const [entry] = parseEnrichment({ entries: [row({ nameEn: '  Ferritin \n' })] }, REQUESTED);
    expect(entry?.nameEn).toBe('Ferritin');
  });
});

describe('batch sizing', () => {
  it('keeps one AI call well inside its output budget', () => {
    // Each entry is two names plus two descriptions — roughly 170 tokens. A
    // chunk that overruns 8192 does not truncate one description, it makes
    // the whole response unparseable and loses every variable in it. This
    // happened at 40 per call; the margin exists so it cannot happen again.
    const TOKENS_PER_ENTRY = 170;
    const OUTPUT_BUDGET = 8192;

    expect(ENRICHMENT_CHUNK * TOKENS_PER_ENTRY).toBeLessThan(OUTPUT_BUDGET / 3);
  });

  it('bounds one invocation without shrinking below a chunk', () => {
    expect(MAX_ENRICHMENT_BATCH).toBeGreaterThanOrEqual(ENRICHMENT_CHUNK);
    expect(MAX_ENRICHMENT_BATCH % ENRICHMENT_CHUNK).toBe(0);
  });
});
