/**
 * Turning the laboratory-variable spreadsheet into catalog documents (KAN-8).
 *
 * The source of truth for the catalog is a Google Sheet maintained by hand,
 * with the variables grouped into panels and named in both English and
 * Spanish. This module is the part that understands that sheet: CSV in,
 * validated catalog entries out. `import-variables.mjs` is what writes them.
 *
 * ── Why the column names are guessed rather than fixed ───────────────────
 *
 * A hand-maintained sheet gets edited. Columns are renamed, translated,
 * reordered, and given a stray trailing space. Hard-coding "name_en" would
 * mean the import breaks on a cosmetic edit and fails in the least helpful
 * way available — silently importing blanks. Matching a set of known headings,
 * accent- and case-insensitively, and reporting exactly which columns were
 * recognised, turns that failure into a message the maintainer can act on.
 */

/**
 * A minimal RFC 4180 parser.
 *
 * Written out rather than pulled in, because a laboratory description will
 * eventually contain a comma, a quoted phrase, or a line break inside a cell,
 * and `line.split(',')` handles none of those — it would corrupt exactly the
 * long free-text fields this import exists to carry.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  // A leading BOM survives Google Sheets' export and would otherwise become
  // part of the first header, making it match nothing.
  const input = text.replace(/^﻿/, '');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Swallow the \n of a \r\n pair rather than emitting a blank row.
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Lowercase, unaccented, alphanumeric-only — for comparing headings. */
function fold(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * What a heading is about, ignoring which language it says it in.
 *
 * Each word carries the locale it implies, or null when it implies none.
 * "Descripción" is Spanish and "Description" is English, so a sheet with both
 * needs no further labelling; "Variable" and "Name" are ambiguous and default
 * to English, which is the anchor locale.
 */
const HEADING_WORDS = {
  id: { id: null, key: null, slug: null, variableid: null, clave: null },
  category: {
    category: null,
    group: null,
    grupo: null,
    categoria: null,
    panel: null,
    seccion: null,
    section: null,
  },
  name: {
    name: null,
    variable: null,
    test: null,
    analyte: 'en',
    nombre: 'es',
    analito: 'es',
  },
  description: {
    description: 'en',
    explanation: 'en',
    definition: 'en',
    descripcion: 'es',
    explicacion: 'es',
    definicion: 'es',
  },
  unit: { unit: null, units: null, unidad: null, unidades: null, defaultunit: null },
  aliases: {
    aliases: null,
    alias: null,
    synonyms: null,
    sinonimos: null,
    abbreviation: null,
    abreviatura: null,
    siglas: null,
  },
};

/** Language tags a maintainer appends to say which column is which. */
const LOCALE_WORDS = {
  es: 'es',
  esp: 'es',
  espanol: 'es',
  spanish: 'es',
  castellano: 'es',
  en: 'en',
  eng: 'en',
  english: 'en',
  ingles: 'en',
};

/** Fields that exist once per locale rather than once per sheet. */
const LOCALISED = new Set(['name', 'description']);

/**
 * Splits a heading into the parts a maintainer meant as separate words.
 *
 * `Grupo / Group` is one column labelled twice, and `Explicación (ES)` is one
 * word plus a language tag. Both are the same idea — the heading carries more
 * than one token — so both are split and each part considered on its own.
 */
function headingParts(heading) {
  return String(heading ?? '')
    .split(/[/|·•]|[(),\[\]]/)
    .map((part) => fold(part))
    .filter(Boolean);
}

/**
 * Maps a sheet heading row onto field names.
 *
 * ── Why headings are parsed rather than looked up ────────────────────────
 *
 * The obvious implementation matches each heading against a list of known
 * spellings. It breaks on the first bilingual sheet, because `Grupo / Group`
 * is not a spelling of anything — it is two spellings in one cell, which is
 * how a sheet maintained for two audiences actually gets written. Listing
 * every combination is not possible: the cross-product of six field words,
 * two languages and four separators is not a list anyone will keep correct.
 *
 * So a heading is read instead: split into parts, each part is either a field
 * word or a language tag, and the two combine. `Explicación (ES)` is
 * description + Spanish; `Grupo / Group` is category, twice, in agreement.
 *
 * Returns the mapping and the headings it could not place, so the caller can
 * print both. "Recognised 6 of 8 columns, ignored: Notes, Source" is a report
 * a maintainer can check against the sheet; a silent partial import is not.
 */
export function mapColumns(header) {
  const mapping = {};
  const unknown = [];

  header.forEach((heading, index) => {
    const parts = headingParts(heading);
    if (parts.length === 0) return;

    let base = null;
    let locale = null;

    for (const part of parts) {
      if (LOCALE_WORDS[part]) {
        locale ??= LOCALE_WORDS[part];
        continue;
      }
      for (const [field, words] of Object.entries(HEADING_WORDS)) {
        if (!(part in words)) continue;
        // The first field word wins, so `Variable (ES)` is a name column
        // labelled Spanish rather than two competing claims.
        base ??= field;
        // A word that implies a language supplies one when no tag does.
        if (base === field) locale ??= words[part];
      }
    }

    if (!base) {
      unknown.push(String(heading).trim());
      return;
    }

    const field = LOCALISED.has(base)
      ? `${base}${(locale ?? 'en') === 'es' ? 'Es' : 'En'}`
      : base;

    // A second column claiming a field already taken is left alone and
    // reported, rather than silently overwriting the first.
    if (mapping[field] === undefined) mapping[field] = index;
    else unknown.push(String(heading).trim());
  });

  return { mapping, unknown };
}

/**
 * Free-text panel names, in both languages, mapped to the app's categories.
 *
 * The sheet groups variables the way a laboratory report does — "Biometría
 * hemática", "Perfil de lípidos" — and the app groups by a fixed enum, because
 * `CATEGORY_ORDER` has to produce the same layout every time. This is the
 * join between the two vocabularies.
 *
 * Matching is on substrings of the folded heading, so "PERFIL LIPÍDICO
 * COMPLETO" and "Lipid profile (fasting)" both land on `lipid_profile`.
 */
const CATEGORY_KEYWORDS = [
  ['complete_blood_count', ['biometriahematica', 'hemograma', 'citometriahematica', 'completebloodcount', 'cbc', 'bloodcount', 'hematologia', 'hematology']],
  ['lipid_profile', ['lipid', 'lipido', 'colesterol', 'cholesterol', 'trigliceri', 'triglyceri']],
  ['glucose_metabolism', ['glucosa', 'glucose', 'glucemia', 'diabet', 'hemoglobinaglucosilada', 'hba1c', 'insulin', 'metabolismodelaglucosa']],
  ['liver_function', ['hepatic', 'higado', 'liver', 'funcionhepatica', 'transaminas', 'bilirrubin', 'bilirubin']],
  ['kidney_function', ['renal', 'rinon', 'kidney', 'funcionrenal', 'creatinin', 'urea', 'nefro']],
  ['thyroid', ['tiroid', 'thyroid', 'tsh']],
  // "minerals" deliberately absent: the commonest panel heading containing it
  // is "Vitamins and Minerals", which belongs under vitamins. Electrolyte
  // panels are named for the electrolytes in practice.
  ['electrolytes', ['electrolit', 'electrolyt', 'ionograma']],
  ['vitamins', ['vitamin', 'vitamina', 'mineral']],
  ['hormones', ['hormon', 'endocrin', 'esteroid', 'steroid', 'fertilidad', 'fertility']],
  ['inflammation', ['inflamac', 'inflammat', 'reactantes', 'acutephase', 'pcr', 'crp', 'sedimentacion']],
  ['urinalysis', ['orina', 'urin', 'egopcompleto', 'ego', 'uroanalisis']],
];

const VALID_CATEGORIES = new Set([
  ...CATEGORY_KEYWORDS.map(([category]) => category),
  'other',
]);

/**
 * The app category for a sheet group heading.
 *
 * Returns `other` for anything unrecognised rather than picking the nearest
 * match. A variable in the wrong group is not a cosmetic error — the grid's
 * headings are how a reader finds a test, and a lipid marker filed under
 * thyroid reads as a claim about how the panel was ordered. `other` is
 * visibly a gap; a confident mis-grouping is not.
 */
export function toCategory(raw) {
  const folded = fold(raw);
  if (!folded) return 'other';
  if (VALID_CATEGORIES.has(String(raw).trim())) return String(raw).trim();

  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => folded.includes(keyword))) return category;
  }
  return 'other';
}

/** Splits an alias cell on the separators a person actually types. */
function splitAliases(value) {
  return String(value ?? '')
    .split(/[,;/|\n]+/)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

/**
 * The names hiding inside a curated one.
 *
 * Catalog names are written for a reader — "Mean Corpuscular Volume (MCV)",
 * "Urea (BUN)", "Leucocitos (Glóbulos Blancos)". Reports are not: they print
 * whichever half they prefer, usually the abbreviation. Both halves are
 * therefore names this variable answers to, and neither is derivable from the
 * other by any amount of string distance — "MCV" and "Mean Corpuscular
 * Volume" share three letters.
 *
 * Extracting them here is what lets a report saying "VCM" find a catalog entry
 * called "Volumen Corpuscular Medio (VCM)" exactly, instead of missing it and
 * creating a second variable for the same test.
 */
function nameVariants(name) {
  if (!name) return [];

  const variants = [name];
  const withoutParens = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (withoutParens && withoutParens !== name) variants.push(withoutParens);

  for (const [, inner] of name.matchAll(/\(([^)]*)\)/g)) {
    const trimmed = inner.trim();
    if (trimmed) variants.push(trimmed);
  }

  return variants;
}

function cell(row, index) {
  if (index === undefined) return '';
  return String(row[index] ?? '').trim();
}

/**
 * Document id: lowercase, unaccented, hyphenated.
 *
 * Derived from the English name so ids stay readable in URLs and stable if the
 * Spanish wording is revised. Mirrors `variableId` in `matching.ts`, minus the
 * noise-word stripping — a curated name has no specimen noise to strip.
 */
export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Reads the sheet into catalog entries.
 *
 * Two shapes of grouping are accepted, because hand-made sheets use both and
 * often both at once: a category column, and section-header rows — a row with
 * a single filled cell and no name, which sets the group for everything below
 * it until the next one. Where both are present, the column wins, since it is
 * the more explicit statement.
 *
 * Rows without an English name are skipped and counted rather than imported
 * under a blank heading; that covers blank spacer rows, notes, and the totals
 * line people leave at the bottom.
 */
export function readCatalog(csv) {
  const rows = parseCsv(csv).filter((row) => row.some((value) => String(value).trim() !== ''));
  if (rows.length === 0) throw new Error('The CSV is empty.');

  const { mapping, unknown } = mapColumns(rows[0]);
  if (mapping.nameEn === undefined && mapping.nameEs === undefined) {
    throw new Error(
      `No name column found. Recognised headings: ${JSON.stringify(rows[0])}. ` +
        'Expected one of: name, name_en, english, nombre, variable.',
    );
  }

  const entries = [];
  const skipped = [];
  const sectionRows = [];
  const ids = new Set();
  let section = '';

  for (const row of rows.slice(1)) {
    const nameEn = cell(row, mapping.nameEn);
    const nameEs = cell(row, mapping.nameEs);
    const filled = row.filter((value) => String(value).trim() !== '');

    // ── Section headings ────────────────────────────────────────────────
    //
    // A row holding one cell and nothing else *may* be a group heading. It
    // may equally be a variable whose other columns are blank, and nothing in
    // the row itself distinguishes the two — "Eritrocitos" alone on a line
    // looks exactly like "Biometría hemática" alone on a line.
    //
    // So the deciding test is not the shape of the row but the text: a
    // heading is a lone cell whose words name a panel `toCategory` knows.
    // That keeps a bare variable name as a variable, which is the failure
    // that would actually lose data — a mis-read heading only mis-groups one
    // row, a swallowed variable drops it entirely.
    //
    // Skipped when the sheet has a category column, since it is then saying
    // the group explicitly and has no reason to also use headings.
    if (filled.length === 1 && mapping.category === undefined) {
      const only = filled[0].trim();
      if (toCategory(only) !== 'other') {
        section = only;
        sectionRows.push(only);
        continue;
      }
    }

    if (!nameEn && !nameEs) {
      skipped.push(row.join(' ').trim().slice(0, 60));
      continue;
    }

    // English anchors the entry: it is the fallback locale and what the
    // matcher compares against. A Spanish-only row is still imported, under
    // its Spanish name, rather than dropped.
    const canonicalName = nameEn || nameEs;
    const explicitId = cell(row, mapping.id);
    // The parenthetical is dropped from the id but kept as an alias:
    // `mean-corpuscular-volume` reads better in a URL than
    // `mean-corpuscular-volume-mcv`, and matching does not use the id.
    const baseId = slugify(
      explicitId || canonicalName.replace(/\([^)]*\)/g, ' '),
    );

    let id = baseId || `variable-${entries.length + 1}`;
    if (ids.has(id)) {
      // Same id from two different rows means the sheet lists the test twice.
      // Neither row is discarded — a suffix keeps both and makes the
      // duplication visible in the output rather than silently resolving it.
      let suffix = 2;
      while (ids.has(`${id}-${suffix}`)) suffix += 1;
      id = `${id}-${suffix}`;
    }
    ids.add(id);

    const descriptionEn = cell(row, mapping.descriptionEn);
    const descriptionEs = cell(row, mapping.descriptionEs);
    const unit = cell(row, mapping.unit);

    entries.push({
      id,
      canonicalName,
      names: {
        en: canonicalName,
        ...(nameEs ? { es: nameEs } : {}),
      },
      descriptions: {
        ...(descriptionEn ? { en: descriptionEn } : {}),
        ...(descriptionEs ? { es: descriptionEs } : {}),
      },
      // Every form of both names is matchable — full, without its
      // parenthetical, and the parenthetical alone — plus whatever the sheet
      // lists explicitly.
      aliases: [
        ...new Set(
          [
            ...nameVariants(nameEn),
            ...nameVariants(nameEs),
            ...splitAliases(cell(row, mapping.aliases)),
          ].filter(Boolean),
        ),
      ],
      category: toCategory(cell(row, mapping.category) || section),
      defaultUnit: unit || null,
      origin: 'catalog',
      // Curated content. Nothing regenerates it, and the enrichment pass is
      // barred from touching an entry without this flag set.
      needsEnrichment: false,
    });
  }

  return {
    entries,
    skipped,
    unknownColumns: unknown,
    recognised: Object.keys(mapping),
    /** Rows read as group headings — printed so a misread one is visible. */
    sectionRows,
    sections: [...new Set(entries.map((entry) => entry.category))],
  };
}
