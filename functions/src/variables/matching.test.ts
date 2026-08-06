import { describe, expect, it } from 'vitest';

import {
  discriminators,
  findMatch,
  normaliseName,
  similarity,
  variableId,
  type MatchCandidate,
} from './matching';

function candidate(canonicalName: string, ...aliases: string[]): MatchCandidate {
  return {
    id: variableId(canonicalName),
    key: normaliseName(canonicalName),
    aliasKeys: aliases.map(normaliseName),
  };
}

const CATALOG: MatchCandidate[] = [
  candidate('Hemoglobin', 'Hemoglobina', 'Hgb', 'HB'),
  candidate('HDL Cholesterol', 'Colesterol HDL'),
  candidate('LDL Cholesterol', 'Colesterol LDL'),
  candidate('Total Cholesterol', 'Colesterol total'),
  candidate('Glucose', 'Glucosa'),
  candidate('Vitamin B12', 'Vitamina B12', 'Cobalamin'),
  candidate('Vitamin B6', 'Vitamina B6'),
  candidate('Free T4', 'T4 libre'),
  candidate('Total T4', 'T4 total'),
  candidate('Triglycerides', 'Triglicéridos'),
  candidate('Creatinine', 'Creatinina'),
];

describe('normaliseName', () => {
  it('is unchanged by word order, punctuation, case and accents', () => {
    const variants = [
      'Total Cholesterol',
      'Cholesterol, Total',
      'CHOLESTEROL (TOTAL)',
      'cholesterol - total',
    ];
    const keys = new Set(variants.map(normaliseName));
    expect(keys.size).toBe(1);
  });

  it('drops the specimen and method words a laboratory adds', () => {
    expect(normaliseName('Glucose, serum')).toBe(normaliseName('Glucose'));
    expect(normaliseName('Glucosa en suero')).toBe(normaliseName('Glucosa'));
    expect(normaliseName('Platelet count')).toBe(normaliseName('Platelets'.slice(0, 8)));
  });

  it('drops the adjectival specimen forms Spanish reports actually use', () => {
    // Real reports say "Creatinina sérica" far more often than "Creatinina en
    // suero". Stripping the noun but not its adjective leaves the same
    // specimen word surviving half the time.
    expect(normaliseName('Creatinina sérica')).toBe(normaliseName('Creatinina'));
    expect(normaliseName('Ácido úrico sérico')).toBe(normaliseName('Ácido úrico'));
    expect(normaliseName('Glucosa plasmática')).toBe(normaliseName('Glucosa'));
  });

  it('keeps a name made entirely of noise words rather than emptying it', () => {
    // Two such names must stay distinguishable; normalising both to '' would
    // make every one of them match every other.
    expect(normaliseName('Serum level')).not.toBe('');
    expect(normaliseName('Serum level')).not.toBe(normaliseName('Plasma level'));
  });
});

describe('discriminators', () => {
  it('treats qualifiers, numbered tokens and short abbreviations as distinguishing', () => {
    expect(discriminators('Free T4')).toEqual(new Set(['free', 't4']));
    expect(discriminators('Vitamin B12')).toEqual(new Set(['b12']));
    expect(discriminators('HDL Cholesterol')).toEqual(new Set(['hdl']));
  });

  it('ignores specimen noise', () => {
    expect(discriminators('Glucose, serum')).toEqual(discriminators('Glucose'));
  });
});

describe('similarity', () => {
  it('scores identical strings 1 and unrelated ones low', () => {
    expect(similarity('hemoglobin', 'hemoglobin')).toBe(1);
    expect(similarity('hemoglobin', 'creatinine')).toBeLessThan(0.5);
  });
});

describe('findMatch — the merges it must make', () => {
  it('matches an exact canonical name', () => {
    expect(findMatch('Hemoglobin', CATALOG)?.entry.id).toBe('hemoglobin');
  });

  it('matches a Spanish name to the same variable as its English one', () => {
    expect(findMatch('Hemoglobina', CATALOG)?.entry.id).toBe('hemoglobin');
    expect(findMatch('Glucosa', CATALOG)?.entry.id).toBe('glucose');
    expect(findMatch('Creatinina', CATALOG)?.entry.id).toBe('creatinine');
  });

  it('matches an abbreviation the catalog lists', () => {
    expect(findMatch('Hgb', CATALOG)?.entry.id).toBe('hemoglobin');
  });

  it('ignores the specimen, case and punctuation a laboratory prints', () => {
    expect(findMatch('GLUCOSE, SERUM', CATALOG)?.entry.id).toBe('glucose');
    expect(findMatch('Glucosa (en suero)', CATALOG)?.entry.id).toBe('glucose');
  });

  it('matches an accented name typed without its accent', () => {
    expect(findMatch('Triglicéridos', CATALOG)?.entry.id).toBe('triglycerides');
    expect(findMatch('Trigliceridos', CATALOG)?.entry.id).toBe('triglycerides');
  });

  it('tolerates the spelling drift between laboratories', () => {
    // A doubled consonant and a singular/plural, which is the whole class of
    // difference the fuzzy pass exists for.
    expect(findMatch('Triglyceride', CATALOG)?.entry.id).toBe('triglycerides');
  });

  it('matches regardless of the order the qualifier is printed in', () => {
    expect(findMatch('Cholesterol, HDL', CATALOG)?.entry.id).toBe('hdl-cholesterol');
    expect(findMatch('T4 Free', CATALOG)?.entry.id).toBe('free-t4');
  });
});

describe('findMatch — the merges it must refuse', () => {
  it('keeps the cholesterol fractions apart', () => {
    expect(findMatch('HDL Cholesterol', CATALOG)?.entry.id).toBe('hdl-cholesterol');
    expect(findMatch('LDL Cholesterol', CATALOG)?.entry.id).toBe('ldl-cholesterol');
    expect(findMatch('Total Cholesterol', CATALOG)?.entry.id).toBe('total-cholesterol');
  });

  it('will not merge a fraction into an unlisted sibling', () => {
    // VLDL is not in the catalog. The right answer is "no match, create it",
    // not "close enough to LDL" — the strings are 95% identical.
    expect(findMatch('VLDL Cholesterol', CATALOG)).toBeNull();
  });

  it('keeps vitamins that differ only by their number apart', () => {
    expect(findMatch('Vitamin B12', CATALOG)?.entry.id).toBe('vitamin-b12');
    expect(findMatch('Vitamin B6', CATALOG)?.entry.id).toBe('vitamin-b6');
    expect(findMatch('Vitamina B6', CATALOG)?.entry.id).toBe('vitamin-b6');
  });

  it('keeps free and total fractions of the same analyte apart', () => {
    expect(findMatch('Free T4', CATALOG)?.entry.id).toBe('free-t4');
    expect(findMatch('Total T4', CATALOG)?.entry.id).toBe('total-t4');
    expect(findMatch('T4 libre', CATALOG)?.entry.id).toBe('free-t4');
  });

  it('does not match an unrelated test to the nearest string', () => {
    expect(findMatch('Ferritin', CATALOG)).toBeNull();
    expect(findMatch('Thyroid stimulating hormone', CATALOG)).toBeNull();
  });

  it('keeps VLDL out of LDL despite a 0.93 string similarity', () => {
    // Observed on real data: without the discriminator guard this merges, and
    // VLDL values land in the LDL history with a trend computed across both.
    const catalog = [candidate('LDL Cholesterol', 'Colesterol LDL')];
    expect(similarity(normaliseName('Colesterol VLDL'), normaliseName('Colesterol LDL')))
      .toBeGreaterThan(0.9);
    expect(findMatch('Colesterol VLDL', catalog)).toBeNull();
  });

  it('keeps an absolute count apart from a percentage of the same cell', () => {
    // "Linfocitos (No. absoluto)" and "Linfocitos (porcentaje)" are different
    // numbers with different ranges, printed on the same report.
    const catalog = [candidate('Lymphocytes', 'Linfocitos')];
    expect(findMatch('Linfocitos (No. absoluto)', catalog)).toBeNull();
  });
});

describe('findMatch — how it reports what it did', () => {
  it('reports an exact hit as such, at full score', () => {
    const match = findMatch('Hemoglobin', CATALOG);
    expect(match?.via).toBe('id');
    expect(match?.score).toBe(1);
  });

  it('reports an alias hit separately from a fuzzy one', () => {
    expect(findMatch('Hemoglobina', CATALOG)?.via).toBe('alias');
    expect(findMatch('Creatinin', CATALOG)?.via).toBe('similarity');
  });

  it('scores a fuzzy match so a bad merge can be traced afterwards', () => {
    const match = findMatch('Creatinin', CATALOG);
    expect(match?.entry.id).toBe('creatinine');
    expect(match?.score).toBeGreaterThanOrEqual(0.86);
    expect(match?.score).toBeLessThan(1);
  });
});

describe('variableId', () => {
  it('keeps printed word order so the URL reads naturally', () => {
    expect(variableId('HDL Cholesterol')).toBe('hdl-cholesterol');
    expect(variableId('Glucosa en suero')).toBe('glucosa');
  });

  it('never returns an empty id', () => {
    expect(variableId('---')).toBe('unnamed-variable');
    expect(variableId('')).toBe('unnamed-variable');
  });
});
