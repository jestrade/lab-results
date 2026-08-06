/**
 * Deciding whether two printed test names are the same variable (KAN-8).
 *
 * ── The asymmetry that shapes every threshold here ────────────────────────
 *
 * This module can be wrong in two directions, and they are not equally bad.
 *
 *   A false split — "Hemoglobina" and "Hemoglobin" landing in two variables —
 *   shows the user two cards where they expected one. It is untidy. Nothing
 *   they see is false.
 *
 *   A false merge — "HDL cholesterol" matched to "LDL cholesterol" — puts one
 *   test's values into another test's history, computes a trend across the
 *   two, and shows the result as though the laboratory had measured it. The
 *   user is told something untrue about their own blood, and there is nothing
 *   on the card to suggest it.
 *
 * So the matcher is deliberately timid. Where a cheap heuristic would merge
 * more names at the cost of occasionally merging the wrong ones, this takes
 * the extra card instead. The name-only grouping this replaced made the same
 * call for the same reason; this widens what matches without changing which way
 * it errs.
 *
 * ── How that timidity is enforced ─────────────────────────────────────────
 *
 * Fuzzy string distance alone cannot do this job. "Vitamin B12" and
 * "Vitamin B6" are 91% identical as strings and are different tests; so are
 * "T3"/"T4", "IgG"/"IgM", and "Free PSA"/"Total PSA". Every one of those pairs
 * differs only in a token that *carries the entire distinction*.
 *
 * `discriminators()` pulls those tokens out, and two names whose discriminator
 * sets differ can never match, at any similarity. Fuzziness is then allowed to
 * do what it is good at — plurals, accents, punctuation, word order, the
 * laboratory's spacing — on what is left.
 */

/**
 * Words that describe the specimen, the method or the grammar rather than the
 * analyte. Dropping them lets "Glucosa en suero" meet "Glucose".
 *
 * Nothing that narrows *what was measured* belongs in this list — see
 * `QUALIFIERS`, which is the deliberately opposite decision.
 */
const NOISE = new Set([
  // English: specimen, method and filler
  'serum',
  'plasma',
  'blood',
  'whole',
  'venous',
  'capillary',
  'level',
  'levels',
  'test',
  'panel',
  'count',
  'concentration',
  'measurement',
  'automated',
  'calculated',
  'in',
  'on',
  'of',
  'the',
  'by',
  // Spanish equivalents
  'suero',
  // The adjectival forms of "suero" and "plasma". Spanish reports use these
  // far more than the noun — "Creatinina sérica", "Ácido úrico sérico" — and
  // omitting them leaves the noun stripped while the adjective survives,
  // which is the same specimen word failing to be dropped half the time.
  'serico',
  'serica',
  'sericos',
  'sericas',
  'plasmatico',
  'plasmatica',
  'sangre',
  'sanguineo',
  'sanguinea',
  'venosa',
  'capilar',
  'nivel',
  'niveles',
  'prueba',
  'perfil',
  'recuento',
  'conteo',
  'concentracion',
  'medicion',
  'automatizado',
  'calculado',
  'en',
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'por',
]);

/**
 * Words that narrow which measurement is meant.
 *
 * These are the opposite of noise: two names that disagree on any of them are
 * different tests, however similar they look. "Free T4" and "Total T4" are
 * separately ordered, separately referenced and separately interpreted, and a
 * matcher that treated "free" as a decorative adjective would silently pool
 * them.
 *
 * Adding a word here can only ever cause a false split, never a false merge —
 * which is the direction this module is allowed to be wrong in.
 */
const QUALIFIERS = new Set([
  // English
  'total',
  'free',
  'bound',
  'direct',
  'indirect',
  'conjugated',
  'unconjugated',
  'fasting',
  'random',
  'postprandial',
  'absolute',
  'relative',
  'corrected',
  'ionized',
  'estimated',
  'ratio',
  'index',
  'clearance',
  'urine',
  'urinary',
  'csf',
  'saliva',
  'stool',
  'faecal',
  'fecal',
  // Spanish
  'libre',
  'ligada',
  'ligado',
  'directa',
  'directo',
  'indirecta',
  'indirecto',
  'conjugada',
  'conjugado',
  'ayuno',
  'azar',
  'postprandial',
  'absoluto',
  'absoluta',
  'relativo',
  'relativa',
  'corregido',
  'corregida',
  'ionizado',
  'ionizada',
  'estimado',
  'estimada',
  'indice',
  'razon',
  'depuracion',
  'orina',
  'urinario',
  'urinaria',
  'heces',
  'saliva',
]);

/**
 * Lowercase, unaccented, punctuation-free words.
 *
 * Accents go because laboratories are inconsistent about them within a single
 * report ("Bilirrubina" and "BILIRRUBINA TOTAL" on adjacent lines), not
 * because they are unimportant — the display name keeps them.
 */
export function tokenize(raw: string): string[] {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    // Separators a laboratory uses between analyte and qualifier.
    .replace(/[(),./\\[\]{}:;_+*"'`|-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The stable identity of a printed name: meaningful tokens, sorted.
 *
 * Sorted because word order is not information here — "Total cholesterol",
 * "Cholesterol total" and "Cholesterol, Total" are one test written three
 * ways, and every laboratory picks its own.
 */
export function normaliseName(raw: string): string {
  const kept = tokenize(raw).filter((token) => !NOISE.has(token));
  // A name made entirely of noise ("serum level") keeps its words rather than
  // normalising to the empty string, which would match every other such name.
  const tokens = kept.length > 0 ? kept : tokenize(raw);
  return [...new Set(tokens)].sort().join('-').slice(0, 80);
}

/**
 * Document id for a variable: readable, stable, and safe as a Firestore key.
 *
 * Keeps the printed word order, unlike `normaliseName`, because this ends up
 * in a URL that a person may read. Identity is decided by `normaliseName`;
 * this is only what the winning document is called.
 */
export function variableId(raw: string): string {
  const tokens = tokenize(raw).filter((token) => !NOISE.has(token));
  const id = (tokens.length > 0 ? tokens : tokenize(raw)).join('-').slice(0, 60);
  return id || 'unnamed-variable';
}

/**
 * Tokens that must agree exactly before any fuzzy comparison is allowed.
 *
 * Three kinds, all of which distinguish tests that otherwise read alike:
 *
 *   * anything from `QUALIFIERS` — free/total, direct/indirect, urine/serum
 *   * anything containing a digit — B12 vs B6, T3 vs T4, C3 vs C4, IgG vs IgG4
 *   * short alphabetic abbreviations of 2–4 letters — HDL, LDL, TSH, ALT, AST
 *
 * The third is the loosest and the one that earns its keep most often: it is
 * what stops "HDL cholesterol" and "LDL cholesterol", whose non-abbreviated
 * halves are identical, from being judged a 93% string match and merged.
 */
export function discriminators(raw: string): Set<string> {
  const found = new Set<string>();

  for (const token of tokenize(raw)) {
    if (NOISE.has(token)) continue;
    if (QUALIFIERS.has(token)) found.add(token);
    else if (/\d/.test(token)) found.add(token);
    else if (token.length >= 2 && token.length <= 4) found.add(token);
  }

  return found;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/** Levenshtein distance, iterative with a single row. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, substitution);
    }
    previous = current;
  }

  return previous[b.length]!;
}

/** 1 for identical strings, 0 for entirely different ones. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}

/**
 * How alike two normalised names must be to count as one variable.
 *
 * 0.86 admits the differences that are genuinely spelling — plurals
 * ("triglyceride"/"triglycerides"), a doubled consonant
 * ("bilirubina"/"bilirrubina"), a dropped letter — while a single distinct
 * short word pushes a pair below it. It is only ever consulted after the
 * discriminator check has already passed, so the pairs it can still get wrong
 * are ones that differ by nothing but ordinary word tokens.
 */
export const SIMILARITY_THRESHOLD = 0.86;

export interface MatchCandidate {
  id: string;
  /** `normaliseName(canonicalName)`. */
  key: string;
  /** `normaliseName` of every alias, in every locale. */
  aliasKeys: string[];
}

export interface MatchOutcome<T extends MatchCandidate> {
  entry: T;
  /** How it was found — recorded in logs so bad matches can be traced. */
  via: 'id' | 'alias' | 'similarity';
  score: number;
}

/**
 * The catalog entry a printed name belongs to, or null to create a new one.
 *
 * Exact matches win outright and cost nothing. Only when none exists does the
 * fuzzy pass run, and it returns the single best candidate rather than the
 * first one over the line — with a dozen cholesterol fractions in the catalog,
 * "first past the threshold" depends on document order, which is not a
 * property anything should depend on.
 */
export function findMatch<T extends MatchCandidate>(
  rawName: string,
  candidates: readonly T[],
): MatchOutcome<T> | null {
  const key = normaliseName(rawName);
  if (!key) return null;

  for (const entry of candidates) {
    if (entry.key === key) return { entry, via: 'id', score: 1 };
  }
  for (const entry of candidates) {
    if (entry.aliasKeys.includes(key)) return { entry, via: 'alias', score: 1 };
  }

  const wanted = discriminators(rawName);
  let best: MatchOutcome<T> | null = null;

  for (const entry of candidates) {
    // Compare against the canonical key and every alias: a Spanish report can
    // be nearest to the Spanish alias while being nowhere near the English
    // canonical name.
    for (const candidateKey of [entry.key, ...entry.aliasKeys]) {
      if (!sameSet(wanted, discriminators(candidateKey))) continue;

      const score = similarity(key, candidateKey);
      if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
        best = { entry, via: 'similarity', score };
      }
    }
  }

  return best;
}
