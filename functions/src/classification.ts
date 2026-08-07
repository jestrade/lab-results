/**
 * Result classification (KAN-10, spec §12, §40.4–40.7, §46).
 *
 * ── This file is deliberately not AI ──────────────────────────────────────
 *
 * Whether a value is low, normal, high or critical is decided here, by
 * arithmetic, against the reference range printed on that report. The language
 * model is never asked to classify anything — it is only ever asked to phrase a
 * decision this code has already made.
 *
 * That is the single most important safety property in the product. A model
 * that hallucinates can produce a wrong sentence; it cannot produce a wrong
 * classification, because it is never consulted about one. Everything else —
 * prompt instructions, safety preambles — is softer than this.
 *
 * The rules the spec imposes, each of which has a test:
 *
 *   - The range printed on the report wins. A general range may be used only
 *     when the report has none, and must be labelled as not lab-specific.
 *   - No usable range means `unknown`. Never guess, never borrow a range from
 *     another report, never fall back to a remembered "normal" value.
 *   - A non-numeric result ("Negative", "Trace") is not forced into a number.
 *   - `critical` requires an explicit critical threshold from the laboratory.
 *     We do not invent one by, say, treating "far outside the range" as
 *     critical — how far is far is a clinical judgement we are not making.
 */

export type ResultStatus = 'low' | 'normal' | 'high' | 'critical' | 'unknown';

export type ReferenceRangeSource = 'laboratory' | 'general' | 'unavailable';

export interface ReferenceRange {
  low: number | null;
  high: number | null;
  /** Preserved verbatim when the range is textual ("Negative", "< 5.7 %"). */
  text: string | null;
  source: ReferenceRangeSource;
  /** Laboratory-stated panic values. Only these can produce `critical`. */
  criticalLow?: number | null;
  criticalHigh?: number | null;
}

export interface ClassifyInput {
  /** Parsed numeric value, or null when the result is not numeric. */
  value: number | null;
  /** The result exactly as printed, always retained. */
  rawValue: string;
  range: ReferenceRange;
}

/**
 * Classifies one result.
 *
 * Total: every input produces a status, and anything that cannot be decided
 * produces `unknown` rather than a guess. `unknown` is a real, displayable
 * state in this product, not an error.
 */
export function classify({ value, rawValue, range }: ClassifyInput): ResultStatus {
  if (range.source === 'unavailable') return 'unknown';

  // A non-numeric result can still be classified when the range is textual and
  // the two agree — "Negative" against a reference of "Negative" is normal.
  // Anything less clear-cut is left unknown rather than interpreted.
  if (value === null) {
    if (range.text && normalise(rawValue) === normalise(range.text)) return 'normal';
    return 'unknown';
  }

  if (!Number.isFinite(value)) return 'unknown';

  // Critical first: a value can be both high and critical, and critical is the
  // one the user must see.
  if (isFiniteNumber(range.criticalHigh) && value >= range.criticalHigh) return 'critical';
  if (isFiniteNumber(range.criticalLow) && value <= range.criticalLow) return 'critical';

  // Bound to locals so the narrowing survives — `isFiniteNumber(range.high)`
  // stored in a boolean tells TypeScript nothing about `range.high` later.
  const low = isFiniteNumber(range.low) ? range.low : null;
  const high = isFiniteNumber(range.high) ? range.high : null;

  // A range with no bounds is not a range, whatever the source claims.
  if (low === null && high === null) return 'unknown';

  // Bounds are inclusive: a laboratory printing 13.0–17.0 means 13.0 is normal.
  if (high !== null && value > high) return 'high';
  if (low !== null && value < low) return 'low';
  return 'normal';
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Parses a printed value into a number where that is faithful, and null where
 * it is not.
 *
 * "<0.01" and ">1000" deliberately return null. They are bounds, not
 * measurements, and treating "<0.01" as 0.01 would classify a value the
 * laboratory declined to pin down. The raw string is always kept and shown.
 */
export function parseValue(rawValue: string): number | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (/^[<>≤≥]/.test(trimmed)) return null;

  // Accept both decimal separators, and thousands separators in either style.
  const cleaned = trimmed.replace(/\s/g, '').replace(/,(\d{3}\b)/g, '$1').replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export const OUT_OF_RANGE: readonly ResultStatus[] = ['low', 'high', 'critical'];

export function isOutOfRange(status: ResultStatus): boolean {
  return OUT_OF_RANGE.includes(status);
}
