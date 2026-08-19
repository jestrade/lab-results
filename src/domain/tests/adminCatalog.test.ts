import { describe, expect, it } from 'vitest';

import {
  compareKey,
  deriveId,
  draftToDocument,
  emptyDraft,
  filterCatalog,
  filterParams,
  hasActiveFilters,
  hasErrors,
  parseAliases,
  readFilters,
  toDraft,
  validateDraft,
  type CatalogDraft,
} from '../adminCatalog';
import type { LabVariable } from '../types';

function makeVariable(overrides: Partial<LabVariable> = {}): LabVariable {
  return {
    id: 'hemoglobin',
    canonicalName: 'Hemoglobin',
    names: { en: 'Hemoglobin', es: 'Hemoglobina' },
    descriptions: { en: 'Carries oxygen around the body.' },
    aliases: ['Hgb', 'Hb'],
    category: 'complete_blood_count',
    defaultUnit: 'g/dL',
    origin: 'catalog',
    needsEnrichment: false,
    createdAt: null as never,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<CatalogDraft> = {}): CatalogDraft {
  return {
    ...emptyDraft(),
    id: 'ferritin',
    canonicalName: 'Ferritin',
    names: { en: 'Ferritin', es: 'Ferritina' },
    ...overrides,
  };
}

describe('deriveId', () => {
  it('slugs a printed name', () => {
    expect(deriveId('Mean Corpuscular Volume')).toBe('mean-corpuscular-volume');
  });

  it('drops accents rather than carrying them into a document key', () => {
    expect(deriveId('Ácido úrico')).toBe('acido-urico');
  });

  it('collapses punctuation and trims the hyphens it leaves behind', () => {
    expect(deriveId('Cholesterol, Total (mg/dL)')).toBe('cholesterol-total-mg-dl');
    expect(deriveId('  --HDL--  ')).toBe('hdl');
  });

  it('never returns an empty id', () => {
    // An id is a document key; the empty string is not one, and a save that
    // produced it would fail deep inside the SDK rather than in the form.
    expect(deriveId('///')).toBe('unnamed-variable');
    expect(deriveId('')).toBe('unnamed-variable');
  });

  it('truncates without leaving a trailing hyphen', () => {
    const id = deriveId('a'.repeat(58) + ' bbbbb');
    expect(id.length).toBeLessThanOrEqual(60);
    expect(id.endsWith('-')).toBe(false);
  });
});

describe('parseAliases', () => {
  it('reads one alias per line, ignoring blanks and surrounding space', () => {
    expect(parseAliases('Hgb\n  Hb  \n\nHemoglobina\n')).toEqual(['Hgb', 'Hb', 'Hemoglobina']);
  });

  it('keeps a comma inside an alias', () => {
    // "Cholesterol, Total" is one printed name. Splitting on commas would make
    // it two aliases that match nothing.
    expect(parseAliases('Cholesterol, Total')).toEqual(['Cholesterol, Total']);
  });

  it('collapses case-insensitive duplicates, keeping the first spelling', () => {
    expect(parseAliases('Hgb\nHGB\nhgb')).toEqual(['Hgb']);
  });

  it('preserves the order they were typed in', () => {
    expect(parseAliases('Zeta\nAlpha')).toEqual(['Zeta', 'Alpha']);
  });
});

describe('validateDraft', () => {
  it('accepts a complete draft', () => {
    const problems = validateDraft(makeDraft(), [makeVariable()]);
    expect(hasErrors(problems)).toBe(false);
    expect(problems.duplicateOf).toBeNull();
  });

  it('requires an id, a canonical name and an English name', () => {
    const problems = validateDraft(
      makeDraft({ id: '  ', canonicalName: ' ', names: { en: '', es: 'Ferritina' } }),
      [],
    );

    expect(problems.errors.id).toBe('required');
    expect(problems.errors.canonicalName).toBe('required');
    // English is the fallback for every locale and the matcher's anchor, so a
    // Spanish-only entry would be both blank and unmatchable.
    expect(problems.errors.nameEn).toBe('required');
  });

  it('rejects an id that is not a legal, readable document key', () => {
    expect(validateDraft(makeDraft({ id: 'Ferritin' }), []).errors.id).toBe('invalidId');
    expect(validateDraft(makeDraft({ id: 'a/b' }), []).errors.id).toBe('invalidId');
    expect(validateDraft(makeDraft({ id: '-leading' }), []).errors.id).toBe('invalidId');
  });

  it('rejects an id another entry already holds', () => {
    const problems = validateDraft(makeDraft({ id: 'hemoglobin' }), [makeVariable()]);
    expect(problems.errors.id).toBe('idTaken');
  });

  it('does not call an entry a collision with itself', () => {
    const existing = makeVariable();
    const problems = validateDraft(toDraft(existing), [existing], existing.id);

    expect(hasErrors(problems)).toBe(false);
    expect(problems.duplicateOf).toBeNull();
  });

  it('warns, without blocking, when a name matches an existing entry', () => {
    // Deliberately not an error: two genuinely distinct tests can be printed
    // under near-identical names, and only a person can tell.
    const problems = validateDraft(
      makeDraft({ id: 'hemoglobina', canonicalName: 'HEMOGLOBINA' }),
      [makeVariable()],
    );

    expect(problems.duplicateOf).toBe('hemoglobin');
    expect(hasErrors(problems)).toBe(false);
  });

  it('spots a collision that only an alias reveals', () => {
    const problems = validateDraft(
      makeDraft({ id: 'hb', canonicalName: 'Haemoglobin', aliases: 'Hgb' }),
      [makeVariable()],
    );

    expect(problems.duplicateOf).toBe('hemoglobin');
  });
});

describe('draftToDocument', () => {
  it('writes only the translations that were filled in', () => {
    const document = draftToDocument(
      makeDraft({ names: { en: 'Ferritin', es: '' }, descriptions: { en: ' ', es: 'Hierro.' } }),
    );

    // An empty string would be a stored translation that says nothing, which
    // reads in the console exactly like one somebody wrote and left blank.
    expect(document.names).toEqual({ en: 'Ferritin' });
    expect(document.descriptions).toEqual({ es: 'Hierro.' });
  });

  it('trims the unit and stores a missing one as null', () => {
    expect(draftToDocument(makeDraft({ defaultUnit: ' ng/mL ' })).defaultUnit).toBe('ng/mL');
    expect(draftToDocument(makeDraft({ defaultUnit: '   ' })).defaultUnit).toBeNull();
  });

  it('marks the entry reviewed, whatever it was before', () => {
    // An admin has read and saved it: it is no longer an unreviewed
    // placeholder, and leaving the flag would let enrichment overwrite them.
    const document = draftToDocument(makeDraft());
    expect(document.origin).toBe('catalog');
    expect(document.needsEnrichment).toBe(false);
  });

  it('never carries a createdAt', () => {
    // It belongs to the document, not to the edit — a save that restamped it
    // would rewrite when the entry came into being.
    expect(draftToDocument(makeDraft())).not.toHaveProperty('createdAt');
  });
});

describe('toDraft', () => {
  it('round-trips an entry through the editor unchanged', () => {
    const variable = makeVariable();
    const document = draftToDocument(toDraft(variable));

    expect(document.canonicalName).toBe(variable.canonicalName);
    expect(document.names).toEqual(variable.names);
    expect(document.aliases).toEqual(variable.aliases);
    expect(document.category).toBe(variable.category);
    expect(document.defaultUnit).toBe(variable.defaultUnit);
  });

  it('presents aliases one per line', () => {
    expect(toDraft(makeVariable()).aliases).toBe('Hgb\nHb');
  });
});

describe('filterCatalog', () => {
  const hemoglobin = makeVariable();
  const ferritin = makeVariable({
    id: 'ferritin',
    canonicalName: 'Ferritin',
    names: { en: 'Ferritin', es: 'Ferritina' },
    aliases: [],
    category: 'other',
    origin: 'discovered',
    needsEnrichment: true,
  });
  const all = [hemoglobin, ferritin];

  it('returns everything when nothing is set', () => {
    expect(filterCatalog(all, readFilters(new URLSearchParams()))).toHaveLength(2);
  });

  it('matches a search against the id, every name and every alias', () => {
    const find = (query: string) =>
      filterCatalog(all, { ...readFilters(new URLSearchParams()), query }).map((e) => e.id);

    expect(find('hgb')).toEqual(['hemoglobin']);
    expect(find('Hemoglobina')).toEqual(['hemoglobin']);
    expect(find('ferritin')).toEqual(['ferritin']);
  });

  it('ignores accents and case in a search', () => {
    const found = filterCatalog(all, {
      ...readFilters(new URLSearchParams()),
      query: 'FERRITINA',
    });
    expect(found.map((entry) => entry.id)).toEqual(['ferritin']);
  });

  it('filters by category, origin and review state', () => {
    const base = readFilters(new URLSearchParams());

    expect(filterCatalog(all, { ...base, category: 'complete_blood_count' })).toEqual([hemoglobin]);
    expect(filterCatalog(all, { ...base, origin: 'discovered' })).toEqual([ferritin]);
    expect(filterCatalog(all, { ...base, needsReview: true })).toEqual([ferritin]);
  });
});

describe('filters in the address bar', () => {
  it('round-trips through the query string', () => {
    const filters = {
      query: 'ferritin',
      category: 'vitamins' as const,
      origin: 'discovered' as const,
      needsReview: true,
      page: 3,
    };

    expect(readFilters(filterParams(filters))).toEqual(filters);
  });

  it('leaves page one out of the URL, so a pristine view has a clean one', () => {
    const filters = readFilters(new URLSearchParams());
    expect(filters.page).toBe(1);
    expect(filterParams({ ...filters, page: 1 }).toString()).toBe('');
    expect(filterParams({ ...filters, page: 4 }).toString()).toBe('page=4');
  });

  it('does not count the page as a narrowing of the view', () => {
    // Moving through a result does not change what is in it.
    expect(hasActiveFilters(readFilters(new URLSearchParams('page=5')))).toBe(false);
  });

  it('leaves defaults out of the URL', () => {
    expect(filterParams(readFilters(new URLSearchParams())).toString()).toBe('');
  });

  it('falls back to the default for a value that is not one of ours', () => {
    // The origin is a closed set and stays checked. The category is not: the
    // ids are Firestore documents, so an id is taken as written and simply
    // selects nothing if the catalog has no entries under it.
    const filters = readFilters(new URLSearchParams('category=haematology&origin=guessed'));
    expect(filters.category).toBe('haematology');
    expect(filters.origin).toBe('all');
  });

  it('knows when a view is narrowed', () => {
    expect(hasActiveFilters(readFilters(new URLSearchParams()))).toBe(false);
    expect(hasActiveFilters(readFilters(new URLSearchParams('q=iron')))).toBe(true);
  });
});

describe('compareKey', () => {
  it('reduces the spellings that mean the same thing', () => {
    expect(compareKey('Ácido Úrico')).toBe(compareKey('acido urico'));
    expect(compareKey('Cholesterol, Total')).toBe('cholesterol total');
  });
});
