/**
 * Presentation rules for laboratory variables (KAN-45, spec §11, §40.5–40.7).
 *
 * The formatting here is not cosmetic. How a reference range is written, and
 * whether it is labelled as the laboratory's or a general one, is a spec
 * requirement — a general range presented as if the lab had printed it is a
 * misrepresentation of the result.
 */

import { messageFor } from '@/i18n/catalogs';
import { DEFAULT_LOCALE, translate, type Locale, type Translated } from './locales';
import { present, rangeSourceLabel, TREND } from './status';
import type {
  LabVariable,
  ReferenceRange,
  VariableCategory,
  VariableSeries,
} from './types';

/**
 * The group headings on the variables grid, per locale.
 *
 * These are the panel names a laboratory prints — "Biometría hemática" is what
 * a Mexican report calls a complete blood count, not a literal translation of
 * the English phrase. Translating the words rather than naming the panel would
 * produce headings no Spanish-speaking reader recognises from their own report.
 */
export const CATEGORY_NAME: Record<VariableCategory, Translated> = {
  complete_blood_count: { en: 'Complete blood count', es: 'Biometría hemática' },
  lipid_profile: { en: 'Lipid profile', es: 'Perfil de lípidos' },
  glucose_metabolism: { en: 'Glucose metabolism', es: 'Metabolismo de la glucosa' },
  liver_function: { en: 'Liver function', es: 'Función hepática' },
  kidney_function: { en: 'Kidney function', es: 'Función renal' },
  thyroid: { en: 'Thyroid', es: 'Tiroides' },
  electrolytes: { en: 'Electrolytes', es: 'Electrolitos' },
  vitamins: { en: 'Vitamins', es: 'Vitaminas' },
  hormones: { en: 'Hormones', es: 'Hormonas' },
  inflammation: { en: 'Inflammation', es: 'Inflamación' },
  urinalysis: { en: 'Urinalysis', es: 'Examen general de orina' },
  other: { en: 'Other', es: 'Otros' },
};

export function categoryLabel(category: VariableCategory, locale: Locale): string {
  return translate(CATEGORY_NAME[category], locale);
}

/** English labels, for contexts with no locale to hand (tests, logs). */
export const CATEGORY_LABEL: Record<VariableCategory, string> = Object.fromEntries(
  (Object.keys(CATEGORY_NAME) as VariableCategory[]).map((category) => [
    category,
    CATEGORY_NAME[category][DEFAULT_LOCALE],
  ]),
) as Record<VariableCategory, string>;

/** The name to show for a series, in the reader's language. */
export function seriesName(series: VariableSeries, locale: Locale): string {
  return translate(series.names ?? { en: series.canonicalName }, locale);
}

/**
 * Re-labels a user's series from the catalog (KAN-8).
 *
 * ── Why the series' own copy is not trusted for display ──────────────────
 *
 * `variableSeries` carries a denormalised `canonicalName`, `names` and
 * `category`, written when a report was last processed. That is what makes the
 * grid cheap to draw, and it is also why the copy goes stale: a series written
 * before the catalog existed is headed with whatever the laboratory printed —
 * "Ácido úrico sérico", "Volúmen Corpuscular Promedio (VCM)" — and a catalog
 * entry corrected or translated afterwards does not reach it until that user
 * happens to upload another report.
 *
 * Joining here fixes both at read time, for the price the catalog was already
 * being fetched at. The denormalised copy stays as the fallback, which is what
 * it is genuinely good for: a variable the catalog does not have is still a
 * result the user owns, and it must render with the laboratory's own wording
 * rather than disappear.
 *
 * Only presentation is taken from the catalog. Values, ranges, statuses and
 * points are the user's own and are never touched.
 */
export function withCatalog(
  all: VariableSeries[],
  catalog: Map<string, LabVariable> | null,
): VariableSeries[] {
  if (!catalog || catalog.size === 0) return all;

  return all.map((series) => {
    const entry = catalog.get(series.variableId);
    if (!entry) return series;

    return {
      ...series,
      canonicalName: entry.canonicalName,
      names: entry.names,
      category: entry.category,
      // The catalog's aliases are what the *search* should match on; the
      // series' own are what this user's reports printed. Both are useful, so
      // neither replaces the other.
      aliases: [...new Set([...series.aliases, ...entry.aliases])],
    };
  });
}

/**
 * Display order for category groups. Fixed rather than alphabetical so the
 * grid does not reshuffle as a user's panels change — a variable should stay
 * where they last saw it.
 */
export const CATEGORY_ORDER: readonly VariableCategory[] = [
  'complete_blood_count',
  'lipid_profile',
  'glucose_metabolism',
  'liver_function',
  'kidney_function',
  'thyroid',
  'electrolytes',
  'vitamins',
  'hormones',
  'inflammation',
  'urinalysis',
  'other',
];

/**
 * Points below which no direction is reported.
 *
 * Mirrors `MIN_POINTS_FOR_TREND` in `functions/src/trends.ts`, which is where
 * the rule is actually enforced — this copy exists so the UI can explain the
 * rule rather than assert one of its own. The two must move together.
 */
export const MIN_POINTS_FOR_TREND = 3;

/**
 * The stretch of time a chart should draw.
 *
 * Shared by /trends, where one window governs several stacked charts, and by
 * the variable page, where it governs one — the arithmetic is the same and the
 * two must agree, or "last 12 months" would mean something different on each.
 *
 * `months` is null for "all time". The window never starts before the earliest
 * measurement: a period wider than the history should show the history, not an
 * empty stretch of axis leading up to it.
 */
export function timeWindow(
  observed: number[],
  months: number | null,
  now: number,
): { from: number; to: number } {
  const earliest = observed.length > 0 ? Math.min(...observed) : now;
  const latest = observed.length > 0 ? Math.max(...observed) : now;
  if (months === null) return { from: earliest, to: latest };

  const cutoff = new Date(latest);
  cutoff.setMonth(cutoff.getMonth() - months);
  return { from: Math.max(earliest, cutoff.getTime()), to: latest };
}

export interface FormattedRange {
  /** The range itself, or null when none was available. */
  text: string | null;
  /** Qualifier the spec requires — "general reference, not lab-specific". */
  note: string | null;
}

/**
 * Formats the range as the report expressed it.
 *
 * A textual range is reproduced verbatim and never converted: "Negative" and
 * "< 5.7 %" carry meaning that a low/high pair cannot, and rewriting them
 * would be inventing a precision the laboratory did not state.
 */
export function formatReferenceRange(
  range: ReferenceRange,
  locale: Locale = DEFAULT_LOCALE,
): FormattedRange {
  const note = rangeSourceLabel(range.source, locale);
  const unavailable = rangeSourceLabel('unavailable', locale);

  if (range.source === 'unavailable') {
    return { text: null, note: unavailable };
  }
  if (range.text) return { text: range.text, note };

  const { low, high } = range;
  if (low !== null && high !== null) return { text: `${low}–${high}`, note };
  if (high !== null) return { text: `< ${high}`, note };
  if (low !== null) return { text: `> ${low}`, note };

  // Source says a range exists but neither bound nor text survived. Claiming
  // one would be worse than admitting the gap.
  return { text: null, note: unavailable };
}

/** The card's meta line: range · count · trend. */
export function summariseSeries(series: VariableSeries, locale: Locale = DEFAULT_LOCALE): string {
  const range = formatReferenceRange(series.referenceRange, locale);
  const parts: string[] = [];

  parts.push(
    range.text
      ? messageFor(locale, 'series.range', { range: range.text })
      : messageFor(locale, 'series.rangeUnavailable'),
  );
  if (range.text && range.note) parts.push(range.note);
  // Singular and plural are separate keys rather than a suffixed 's': Spanish
  // pluralises the noun *and* has no bare-number idiom here, so a rule built
  // around appending a letter to the English word does not survive translation.
  parts.push(
    messageFor(locale, series.resultCount === 1 ? 'series.resultOne' : 'series.resultMany', {
      count: series.resultCount,
    }),
  );
  if (series.trend !== 'insufficient_data') {
    parts.push(present(TREND[series.trend], locale).label);
  }

  return parts.join(' · ');
}

/**
 * Text alternative for the sparkline (KAN-53, spec §60).
 *
 * Charts must carry an equivalent in words. Note the vocabulary: "rose",
 * "fell", "changed little" — movement, never merit. The spec forbids implying
 * that a direction is good or bad, because whether a rising value is welcome
 * is a clinical question this product does not answer.
 */
export function describeSparkline(
  series: VariableSeries,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { points, unit } = series;
  const suffix = unit ? ` ${unit}` : '';
  // The variable's name is localised even though this sentence is not: the
  // text alternative has to name the same thing the visible label does, or a
  // screen-reader user cannot tell which card they are on.
  const canonicalName = seriesName(series, locale);

  if (points.length < 2) {
    return messageFor(locale, 'sparkline.tooFew', { name: canonicalName });
  }

  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  const count = points.length;

  // One key per direction rather than a movement verb slotted into a shared
  // sentence: Spanish conjugates and agrees around the verb, so "subió" and
  // "apenas ha cambiado" cannot share a frame the way "rose" and "changed
  // little" can.
  const key =
    series.trend === 'increasing'
      ? 'sparkline.rose'
      : series.trend === 'decreasing'
        ? 'sparkline.fell'
        : 'sparkline.steady';

  return messageFor(locale, key, {
    name: canonicalName,
    from: `${first}${suffix}`,
    to: `${last}${suffix}`,
    count,
  });
}

/** Points mapped into a 0–1 box, oldest first. Empty when a line is meaningless. */
export function sparklinePath(series: VariableSeries): { x: number; y: number }[] {
  const values = series.points.map((point) => point.value);
  if (values.length < 2) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  return values.map((value, index) => ({
    x: index / (values.length - 1),
    // A flat series has zero span; centring it beats dividing by zero and
    // beats drawing it at the top of the box, which would read as "high".
    y: span === 0 ? 0.5 : 1 - (value - min) / span,
  }));
}

/**
 * Free-text search across every name this variable is known by.
 *
 * Searches all locales, not just the active one. A bilingual user types
 * whichever name comes to mind — "glucosa" while reading the English UI — and
 * restricting the haystack to the current locale would make their own report's
 * vocabulary unsearchable. Aliases are included for the same reason: people
 * look for the name printed on the page ("Hgb"), not the one we chose.
 */
export function matchesQuery(series: VariableSeries, query: string): boolean {
  const needle = fold(query);
  if (!needle) return true;

  const haystack = [
    series.canonicalName,
    ...Object.values(series.names ?? {}),
    ...series.aliases,
  ];

  return haystack.some((candidate) => fold(candidate).includes(needle));
}

/**
 * Lowercases and strips accents so "Hemoglobina" is found by "hemoglobina" and
 * by "hemoglobina" typed without the accent it does not have — and so that
 * "Vitamina D" is found by "vitamina d" regardless of how either was typed.
 */
function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export interface CategoryGroup {
  category: VariableCategory;
  label: string;
  series: VariableSeries[];
}

/**
 * Buckets the series into the fixed category order, labelled for the reader.
 *
 * Grouping is what makes the grid readable: two dozen ungrouped cards is a
 * wall, and the same cards under "Complete blood count" and "Lipid profile"
 * are a report. Within a group the sort is by the *displayed* name, so the
 * alphabetical order matches what the reader can actually see.
 */
export function groupByCategory(
  all: VariableSeries[],
  locale: Locale = DEFAULT_LOCALE,
): CategoryGroup[] {
  const buckets = new Map<VariableCategory, VariableSeries[]>();
  for (const series of all) {
    const bucket = buckets.get(series.category) ?? [];
    bucket.push(series);
    buckets.set(series.category, bucket);
  }

  const collator = new Intl.Collator(locale);

  return CATEGORY_ORDER.filter((category) => buckets.has(category)).map((category) => ({
    category,
    label: categoryLabel(category, locale),
    series: buckets
      .get(category)!
      .slice()
      .sort((a, b) => collator.compare(seriesName(a, locale), seriesName(b, locale))),
  }));
}
