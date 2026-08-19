import { describe, expect, it } from 'vitest';

import { mapColumns, parseCsv, readCatalog, slugify, toCategory } from '../sheet-catalog.mjs';
import { readSeed, CATEGORIES_SEED } from '../seeds.mjs';

/**
 * The panel keywords as a fresh project has them.
 *
 * Read from the seed rather than invented here: these tests assert that a
 * real sheet's Spanish headings land on the right panels, and a fixture
 * written to match the code would pass while the shipped keywords were wrong.
 */
const CATEGORIES = readSeed(CATEGORIES_SEED, 'categories');

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a comma inside a quoted description', () => {
    const [, row] = parseCsv('name,description\nFerritin,"Iron stores, measured in blood"');
    expect(row?.[1]).toBe('Iron stores, measured in blood');
  });

  it('keeps a line break inside a quoted cell', () => {
    const [, row] = parseCsv('name,description\nFerritin,"First line\nSecond line"');
    expect(row?.[1]).toBe('First line\nSecond line');
  });

  it('unescapes a doubled quote', () => {
    const [, row] = parseCsv('name,note\nA,"He said ""hello"""');
    expect(row?.[1]).toBe('He said "hello"');
  });

  it('handles CRLF without emitting blank rows', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips the BOM Google Sheets exports', () => {
    const [header] = parseCsv('﻿name,unit\nFerritin,ng/mL');
    expect(header?.[0]).toBe('name');
  });
});

describe('mapColumns', () => {
  it('recognises English and Spanish headings, ignoring case and accents', () => {
    const { mapping } = mapColumns(['Grupo', 'Variable (English)', 'Nombre', 'Unidades']);
    expect(mapping.category).toBe(0);
    expect(mapping.unit).toBe(3);
  });

  it('reports headings it does not recognise instead of guessing', () => {
    const { unknown } = mapColumns(['name', 'Source', 'Reviewed by']);
    expect(unknown).toEqual(['Source', 'Reviewed by']);
  });

  it('reads a heading labelled in both languages at once', () => {
    // "Grupo / Group" is not a spelling of anything — it is one column
    // labelled twice, which is how a bilingual sheet gets written.
    const { mapping, unknown } = mapColumns(['Grupo / Group', 'Unidad / Unit']);
    expect(mapping.category).toBe(0);
    expect(mapping.unit).toBe(1);
    expect(unknown).toEqual([]);
  });

  it('reads a language tag in parentheses', () => {
    const { mapping } = mapColumns([
      'Variable (ES)',
      'Variable (EN)',
      'Explicación (ES)',
      'Explanation (EN)',
    ]);

    expect(mapping).toEqual({
      nameEs: 0,
      nameEn: 1,
      descriptionEs: 2,
      descriptionEn: 3,
    });
  });

  it('infers the locale from the heading’s own language when untagged', () => {
    const { mapping } = mapColumns(['Nombre', 'Name', 'Descripción', 'Description']);
    expect(mapping).toEqual({
      nameEs: 0,
      nameEn: 1,
      descriptionEs: 2,
      descriptionEn: 3,
    });
  });

  it('treats an ambiguous, untagged name column as the English anchor', () => {
    expect(mapColumns(['Variable']).mapping).toEqual({ nameEn: 0 });
  });

  it('reports a second column claiming a field rather than overwriting', () => {
    const { mapping, unknown } = mapColumns(['Name', 'Name']);
    expect(mapping.nameEn).toBe(0);
    expect(unknown).toEqual(['Name']);
  });
});

describe('toCategory', () => {
  it('maps Spanish panel names to the app categories', () => {
    expect(toCategory('Biometría hemática', CATEGORIES)).toBe('complete_blood_count');
    expect(toCategory('Perfil de lípidos', CATEGORIES)).toBe('lipid_profile');
    expect(toCategory('Función renal', CATEGORIES)).toBe('kidney_function');
    expect(toCategory('Examen general de orina', CATEGORIES)).toBe('urinalysis');
  });

  it('maps English panel names too', () => {
    expect(toCategory('Complete Blood Count', CATEGORIES)).toBe('complete_blood_count');
    expect(toCategory('Liver function tests', CATEGORIES)).toBe('liver_function');
    expect(toCategory('Thyroid panel', CATEGORIES)).toBe('thyroid');
  });

  it('accepts a category id written directly in the sheet', () => {
    expect(toCategory('glucose_metabolism', CATEGORIES)).toBe('glucose_metabolism');
  });

  it('reads a group value labelled in both languages', () => {
    expect(toCategory('Hemograma / Complete Blood Count (CBC)', CATEGORIES)).toBe('complete_blood_count');
    expect(toCategory('Metabolismo y Glucosa / Metabolism and Glucose', CATEGORIES)).toBe(
      'glucose_metabolism',
    );
    expect(toCategory('Marcadores Inflamatorios / Inflammatory Markers', CATEGORIES)).toBe('inflammation');
  });

  it('files "Vitamins and Minerals" under vitamins, not electrolytes', () => {
    // The word "minerals" appears in the commonest vitamin panel heading, so
    // claiming it for electrolytes mis-files the whole group.
    expect(toCategory('Vitaminas y Minerales / Vitamins and Minerals', CATEGORIES)).toBe('vitamins');
    expect(toCategory('Electrolitos / Electrolytes', CATEGORIES)).toBe('electrolytes');
  });

  it('falls back to "other" rather than picking the nearest group', () => {
    // A wrong group is a claim about how the panel was ordered. "other" is a
    // visible gap; a confident mis-grouping is not.
    expect(toCategory('Marcadores tumorales', CATEGORIES)).toBe('other');
    expect(toCategory('', CATEGORIES)).toBe('other');
  });
});

describe('readCatalog', () => {
  const SHEET = [
    'Grupo,Variable (English),Nombre (Español),Description,Descripción,Unidad,Siglas',
    'Biometría hemática,Hemoglobin,Hemoglobina,Oxygen-carrying protein.,Proteína que transporta oxígeno.,g/dL,"Hgb, HB"',
    'Biometría hemática,Platelets,Plaquetas,Cells that help clotting.,Células que ayudan a la coagulación.,10^3/µL,PLT',
    'Perfil de lípidos,HDL Cholesterol,Colesterol HDL,,,mg/dL,HDL',
  ].join('\n');

  it('reads every variable with both names', () => {
    const { entries } = readCatalog(SHEET, CATEGORIES);

    expect(entries).toHaveLength(3);
    expect(entries[0]?.canonicalName).toBe('Hemoglobin');
    expect(entries[0]?.names).toEqual({ en: 'Hemoglobin', es: 'Hemoglobina' });
  });

  it('carries both descriptions through', () => {
    const [hemoglobin] = readCatalog(SHEET, CATEGORIES).entries;
    expect(hemoglobin?.descriptions.en).toBe('Oxygen-carrying protein.');
    expect(hemoglobin?.descriptions.es).toBe('Proteína que transporta oxígeno.');
  });

  it('omits a description nobody wrote rather than storing an empty one', () => {
    const hdl = readCatalog(SHEET, CATEGORIES).entries.find((entry) => entry.id === 'hdl-cholesterol');
    expect(hdl?.descriptions).toEqual({});
  });

  it('maps the group column onto app categories', () => {
    const { entries } = readCatalog(SHEET, CATEGORIES);
    expect(entries[0]?.category).toBe('complete_blood_count');
    expect(entries[2]?.category).toBe('lipid_profile');
  });

  it('makes both names and the listed abbreviations matchable', () => {
    const [hemoglobin] = readCatalog(SHEET, CATEGORIES).entries;
    expect(hemoglobin?.aliases).toEqual(
      expect.arrayContaining(['Hemoglobin', 'Hemoglobina', 'Hgb', 'HB']),
    );
  });

  it('makes the abbreviation inside a curated name matchable on its own', () => {
    // Reports print "MCV" or "VCM"; the catalog says "Mean Corpuscular Volume
    // (MCV)". Neither abbreviation is reachable from the full name by string
    // distance, so both have to be extracted as aliases.
    const sheet = [
      'Variable (EN),Variable (ES)',
      'Mean Corpuscular Volume (MCV),Volumen Corpuscular Medio (VCM)',
    ].join('\n');

    const [entry] = readCatalog(sheet, CATEGORIES).entries;

    expect(entry?.aliases).toEqual(
      expect.arrayContaining([
        'Mean Corpuscular Volume (MCV)',
        'Mean Corpuscular Volume',
        'MCV',
        'Volumen Corpuscular Medio',
        'VCM',
      ]),
    );
  });

  it('keeps the parenthetical out of the id but the id readable', () => {
    const sheet = ['Variable (EN),Variable (ES)', 'Urea (BUN),Urea'].join('\n');
    expect(readCatalog(sheet, CATEGORIES).entries[0]?.id).toBe('urea');
  });

  it('marks imported entries as curated, so enrichment cannot rewrite them', () => {
    const { entries } = readCatalog(SHEET, CATEGORIES);
    expect(entries.every((entry) => entry.origin === 'catalog')).toBe(true);
    expect(entries.every((entry) => entry.needsEnrichment === false)).toBe(true);
  });

  it('carries a section-header row forward as the group', () => {
    const sectioned = [
      'Variable,Nombre',
      'Biometría hemática',
      'Hemoglobin,Hemoglobina',
      'Perfil de lípidos',
      'Triglycerides,Triglicéridos',
    ].join('\n');

    const { entries } = readCatalog(sectioned, CATEGORIES);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.category).toBe('complete_blood_count');
    expect(entries[1]?.category).toBe('lipid_profile');
  });

  it('keeps both rows when the sheet lists a test twice', () => {
    // Silently collapsing them would hide a duplicate in the source sheet,
    // which is something the maintainer needs to see and fix there.
    const duplicated = [
      'Variable,Nombre',
      'Hemoglobin,Hemoglobina',
      'Hemoglobin,Hemoglobina',
    ].join('\n');

    const { entries } = readCatalog(duplicated, CATEGORIES);
    expect(entries.map((entry) => entry.id)).toEqual(['hemoglobin', 'hemoglobin-2']);
  });

  it('skips and counts rows with no name', () => {
    const withJunk = ['Variable,Nombre,Unidad', 'Hemoglobin,Hemoglobina,g/dL', ',,mg/dL'].join('\n');
    const { entries, skipped } = readCatalog(withJunk, CATEGORIES);

    expect(entries).toHaveLength(1);
    expect(skipped).toHaveLength(1);
  });

  it('imports a Spanish-only row under its Spanish name', () => {
    const spanishOnly = ['Variable (English),Nombre', ',Eritrocitos'].join('\n');
    const [entry] = readCatalog(spanishOnly, CATEGORIES).entries;

    expect(entry?.canonicalName).toBe('Eritrocitos');
    expect(entry?.names.en).toBe('Eritrocitos');
  });

  it('refuses a sheet with no name column at all', () => {
    expect(() => readCatalog('Grupo,Unidad\nBiometría,g/dL', CATEGORIES)).toThrow(/name column/i);
  });

  it('refuses an empty sheet', () => {
    expect(() => readCatalog('', CATEGORIES)).toThrow(/empty/i);
  });
});

describe('slugify', () => {
  it('produces readable, accent-free ids', () => {
    expect(slugify('Colesterol HDL')).toBe('colesterol-hdl');
    expect(slugify('Triglicéridos')).toBe('trigliceridos');
    expect(slugify('  Vitamin B12  ')).toBe('vitamin-b12');
  });
});
