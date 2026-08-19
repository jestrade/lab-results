/**
 * Presentation rules for laboratory variables (KAN-45, spec §11, §40.5–40.7).
 *
 * The formatting here is not cosmetic. How a reference range is written, and
 * whether it is labelled as the laboratory's or a general one, is a spec
 * requirement — a general range presented as if the lab had printed it is a
 * misrepresentation of the result.
 */

import { messageFor } from '@/i18n/catalogs';
import type { MessageKey } from '@/i18n/messages';
import { DEFAULT_LOCALE, translate, type Locale, type Translated } from './locales';
import { present, rangeSourceLabel, TREND } from './status';
import type {
  LabVariable,
  ReferenceRange,
  ResultStatus,
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
  coagulation: { en: 'Coagulation', es: 'Pruebas de coagulación' },
  lipid_profile: { en: 'Lipid profile', es: 'Perfil de lípidos' },
  glucose_metabolism: { en: 'Glucose metabolism', es: 'Metabolismo de la glucosa' },
  liver_function: { en: 'Liver function', es: 'Función hepática' },
  kidney_function: { en: 'Kidney function', es: 'Función renal' },
  thyroid: { en: 'Thyroid', es: 'Tiroides' },
  electrolytes: { en: 'Electrolytes', es: 'Electrolitos' },
  iron_metabolism: { en: 'Iron studies', es: 'Metabolismo del hierro' },
  vitamins: { en: 'Vitamins', es: 'Vitaminas' },
  hormones: { en: 'Hormones', es: 'Hormonas' },
  inflammation: { en: 'Inflammation', es: 'Inflamación' },
  allergy: { en: 'Allergy (IgE)', es: 'Perfil de alergias (IgE)' },
  tumour_markers: { en: 'Tumour markers', es: 'Marcadores tumorales' },
  urinalysis: { en: 'Urinalysis', es: 'Examen general de orina' },
  faecal: { en: 'Stool', es: 'Coprológico' },
  semen_analysis: { en: 'Semen analysis', es: 'Espermatograma' },
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
  'coagulation',
  'lipid_profile',
  'glucose_metabolism',
  'liver_function',
  'kidney_function',
  'thyroid',
  'electrolytes',
  'iron_metabolism',
  'vitamins',
  'hormones',
  'inflammation',
  'allergy',
  'tumour_markers',
  'urinalysis',
  'faecal',
  'semen_analysis',
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
 * Used by the variable page's period buttons and by its zoom. Kept here rather
 * than in the page because the sparkline on the grid answers the same question
 * over the same history, and a window computed two ways is a window that
 * eventually disagrees with itself.
 *
 * `months` is null for "all time". The window never starts before the earliest
 * measurement: a period wider than the history should show the history, not an
 * empty stretch of axis leading up to it.
 */
export type Period = '12m' | '3y' | 'all';

/**
 * The periods offered, defined once.
 *
 * The grid and the variable page both offer these, and they have to mean the
 * same stretch of time on both — a reader who narrows to "last 12 months" on
 * the grid and opens a card should not find a different twelve months there.
 */
export const PERIODS: { id: Period; label: MessageKey; months: number | null }[] = [
  { id: 'all', label: 'period.all', months: null },
  { id: '3y', label: 'period.3y', months: 36 },
  { id: '12m', label: 'period.12m', months: 12 },
];

export function monthsFor(period: Period): number | null {
  return PERIODS.find((option) => option.id === period)?.months ?? null;
}

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

/**
 * One series as it looks through a time window, or null if it is not in it.
 *
 * ── Membership is decided by the latest measurement, not by the points ─────
 *
 * A card whose newest result predates the window is out: "last 12 months"
 * showing a value from 2023 as the current one would be the card lying about
 * what it is. But it cannot be decided by the plotted points either, because a
 * qualitative series — "Negative", "Trace" — has no plottable points at all
 * and would vanish from every window but "all time" despite having been
 * measured last week. The latest instant is the one fact every series has.
 *
 * ── Why the count moves with the points ───────────────────────────────────
 *
 * `resultCount` is the length of the stored point list (see `updateSeries` in
 * the pipeline), so trimming the points and leaving the count would print "5
 * results" under a line drawn from two. When the window removes nothing the
 * series is returned untouched, so the default view is exactly as before.
 */
export function seriesInWindow(
  series: VariableSeries,
  from: number,
  to: number,
): VariableSeries | null {
  const latest = series.latestObservedAt?.toMillis?.();
  // A series with no usable instant is kept rather than hidden: a missing
  // timestamp is a gap in our record, not evidence the test is old.
  if (typeof latest === 'number' && (latest < from || latest > to)) return null;

  const kept = series.points.filter((point) => {
    const at = point.observedAt?.toMillis?.();
    return typeof at !== 'number' || (at >= from && at <= to);
  });

  if (kept.length === series.points.length) return series;
  return { ...series, points: kept, resultCount: kept.length };
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
/**
 * How the grid on the home page is ordered.
 *
 * `category` is the default and the only one that groups; the other two are
 * flat, because their whole purpose is to bring a card to the top from
 * wherever in the alphabet its panel put it.
 */
export type VariableSort = 'category' | 'recent' | 'flagged';

/**
 * The orderings offered, defined once — the same shape as `PERIODS`, and here
 * for the same reason: the chips render from this list and `readFilters`
 * validates against it, so a new ordering cannot appear in one without the
 * other learning to accept it.
 */
export const SORTS: { id: VariableSort; label: MessageKey }[] = [
  { id: 'category', label: 'variables.sort.category' },
  { id: 'recent', label: 'variables.sort.recent' },
  { id: 'flagged', label: 'variables.sort.flagged' },
];

/** Worst first. Ties inside a rank fall through to the next comparison. */
const STATUS_RANK: Record<ResultStatus, number> = {
  critical: 0,
  high: 1,
  low: 1,
  unknown: 2,
  normal: 3,
};

/**
 * Orders the grid for a reader who has more variables than fit on a screen.
 *
 * An account tracking a hundred tests cannot be read by scrolling, and the two
 * questions people actually arrive with are "what came back in my last report"
 * and "what is outside its range". Category order answers neither: it puts
 * whatever the newest report contained wherever the alphabet happens to place
 * it, several screens apart.
 *
 * `high` and `low` deliberately share a rank. Which of the two is more serious
 * is a clinical judgement, and ordering one above the other would be this
 * application making it.
 */
export function sortSeries(
  all: VariableSeries[],
  sort: VariableSort,
  locale: Locale = DEFAULT_LOCALE,
): VariableSeries[] {
  const collator = new Intl.Collator(locale);
  const byName = (a: VariableSeries, b: VariableSeries) =>
    collator.compare(seriesName(a, locale), seriesName(b, locale));
  const measuredAt = (series: VariableSeries) => series.latestObservedAt?.toMillis?.() ?? 0;

  const sorted = all.slice();

  if (sort === 'recent') {
    // Newest measurement first, and alphabetical within one report — a panel
    // run on one day shares an instant, and leaving those in arrival order
    // would shuffle a dozen cards on every render.
    return sorted.sort((a, b) => measuredAt(b) - measuredAt(a) || byName(a, b));
  }

  if (sort === 'flagged') {
    return sorted.sort(
      (a, b) =>
        STATUS_RANK[a.latestStatus] - STATUS_RANK[b.latestStatus] ||
        measuredAt(b) - measuredAt(a) ||
        byName(a, b),
    );
  }

  return sorted.sort(byName);
}

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

/** Everything the home grid's controls decide about what is on screen. */
export interface VariableFilters {
  query: string;
  category: VariableCategory | 'all';
  outOfRangeOnly: boolean;
  sort: VariableSort;
  period: Period;
}

/**
 * What the grid shows before anyone touches a control.
 *
 * `all` for both the category and the period: a grid that opened narrowed
 * would be hiding results before the reader knew a filter existed. `category`
 * for the sort because it is the layout of the report they are holding.
 */
export const DEFAULT_FILTERS: VariableFilters = {
  query: '',
  category: 'all',
  outOfRangeOnly: false,
  sort: 'category',
  period: 'all',
};

/**
 * The query-string names. Short because this ends up in a URL people copy into
 * a message, and stable because links already sent stop working if they change.
 */
const PARAM = {
  query: 'q',
  category: 'category',
  outOfRangeOnly: 'flagged',
  sort: 'sort',
  period: 'period',
} as const;

/**
 * The filters a URL asks for, with anything unrecognised falling back to its
 * default.
 *
 * Every value here arrives from outside the application — a hand-edited
 * address bar, a link from a build where a sort had a different name, a URL
 * truncated by whatever pasted it. None of those should be an error the reader
 * sees. Falling back per field rather than per URL means `?period=zzz&q=iron`
 * still honours the search: one unreadable field is not a reason to discard
 * the ones next to it.
 *
 * The category is checked against the catalog's own list, not against the
 * categories this account has results in. Those are not known until the
 * subscription delivers, and validating against them here would drop a
 * legitimate `?category=thyroid` on the first render, before the data it
 * refers to had arrived.
 */
export function readFilters(params: URLSearchParams): VariableFilters {
  const category = params.get(PARAM.category);
  const sort = params.get(PARAM.sort);
  const period = params.get(PARAM.period);

  return {
    query: params.get(PARAM.query) ?? DEFAULT_FILTERS.query,
    category: CATEGORY_ORDER.includes(category as VariableCategory)
      ? (category as VariableCategory)
      : DEFAULT_FILTERS.category,
    // Present and "1" — not merely present. `?flagged=0` reads as off to
    // anyone who writes it, and honouring presence alone would turn it on.
    outOfRangeOnly: params.get(PARAM.outOfRangeOnly) === '1',
    sort: SORTS.some((option) => option.id === sort)
      ? (sort as VariableSort)
      : DEFAULT_FILTERS.sort,
    period: PERIODS.some((option) => option.id === period)
      ? (period as Period)
      : DEFAULT_FILTERS.period,
  };
}

/**
 * The query string for a set of filters.
 *
 * Defaults are omitted rather than written out, so an untouched grid has a
 * bare `/variables` in the address bar. A URL carrying `?q=&category=all&
 * sort=category` for a page nobody has filtered is noise in the one place the
 * user is most likely to read and share.
 *
 * A whitespace-only search is dropped for the same reason: it filters nothing,
 * so it should not be in a link.
 */
export function filterParams(filters: VariableFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query.trim() !== '') params.set(PARAM.query, filters.query);
  if (filters.category !== 'all') params.set(PARAM.category, filters.category);
  if (filters.outOfRangeOnly) params.set(PARAM.outOfRangeOnly, '1');
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set(PARAM.sort, filters.sort);
  if (filters.period !== DEFAULT_FILTERS.period) params.set(PARAM.period, filters.period);
  return params;
}

/**
 * Whether anything is being hidden — the cue for the "showing N of M" line.
 *
 * The sort is deliberately not counted. It reorders the grid and removes
 * nothing from it, so a line explaining an absence would be explaining one
 * that is not there.
 */
export function hasActiveFilters(filters: VariableFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.category !== 'all' ||
    filters.outOfRangeOnly ||
    filters.period !== 'all'
  );
}
