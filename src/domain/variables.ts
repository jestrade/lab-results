/**
 * Presentation rules for laboratory variables (KAN-45, spec §11, §40.5–40.7).
 *
 * The formatting here is not cosmetic. How a reference range is written, and
 * whether it is labelled as the laboratory's or a general one, is a spec
 * requirement — a general range presented as if the lab had printed it is a
 * misrepresentation of the result.
 */

import { RANGE_SOURCE_LABEL, TREND } from './status';
import type {
  ReferenceRange,
  VariableCategory,
  VariableSeries,
} from './types';

export const CATEGORY_LABEL: Record<VariableCategory, string> = {
  complete_blood_count: 'Complete blood count',
  lipid_profile: 'Lipid profile',
  glucose_metabolism: 'Glucose metabolism',
  liver_function: 'Liver function',
  kidney_function: 'Kidney function',
  thyroid: 'Thyroid',
  electrolytes: 'Electrolytes',
  vitamins: 'Vitamins',
  hormones: 'Hormones',
  inflammation: 'Inflammation',
  urinalysis: 'Urinalysis',
  other: 'Other',
};

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
export function formatReferenceRange(range: ReferenceRange): FormattedRange {
  const note = RANGE_SOURCE_LABEL[range.source];

  if (range.source === 'unavailable') {
    return { text: null, note: RANGE_SOURCE_LABEL.unavailable };
  }
  if (range.text) return { text: range.text, note };

  const { low, high } = range;
  if (low !== null && high !== null) return { text: `${low}–${high}`, note };
  if (high !== null) return { text: `< ${high}`, note };
  if (low !== null) return { text: `> ${low}`, note };

  // Source says a range exists but neither bound nor text survived. Claiming
  // one would be worse than admitting the gap.
  return { text: null, note: RANGE_SOURCE_LABEL.unavailable };
}

/** The card's meta line: range · count · trend. */
export function summariseSeries(series: VariableSeries): string {
  const range = formatReferenceRange(series.referenceRange);
  const parts: string[] = [];

  parts.push(range.text ? `Range ${range.text}` : 'Reference range unavailable');
  if (range.text && range.note) parts.push(range.note);
  parts.push(`${series.resultCount} result${series.resultCount === 1 ? '' : 's'}`);
  if (series.trend !== 'insufficient_data') parts.push(TREND[series.trend].label);

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
export function describeSparkline(series: VariableSeries): string {
  const { points, canonicalName, unit } = series;
  const suffix = unit ? ` ${unit}` : '';

  if (points.length < 2) {
    return `${canonicalName}: not enough measurements to show a trend.`;
  }

  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  const count = points.length;

  const movement =
    series.trend === 'increasing'
      ? 'rose'
      : series.trend === 'decreasing'
        ? 'fell'
        : 'changed little';

  return `${canonicalName} ${movement} from ${first}${suffix} to ${last}${suffix} across ${count} measurements.`;
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

export function matchesQuery(series: VariableSeries, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  // Aliases are searchable because a user looks for the name printed on their
  // report ("Hgb"), not the canonical one we chose ("Hemoglobin").
  return (
    series.canonicalName.toLowerCase().includes(needle) ||
    series.aliases.some((alias) => alias.toLowerCase().includes(needle))
  );
}

export interface CategoryGroup {
  category: VariableCategory;
  label: string;
  series: VariableSeries[];
}

export function groupByCategory(all: VariableSeries[]): CategoryGroup[] {
  const buckets = new Map<VariableCategory, VariableSeries[]>();
  for (const series of all) {
    const bucket = buckets.get(series.category) ?? [];
    bucket.push(series);
    buckets.set(series.category, bucket);
  }

  return CATEGORY_ORDER.filter((category) => buckets.has(category)).map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    series: buckets
      .get(category)!
      .slice()
      .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)),
  }));
}
