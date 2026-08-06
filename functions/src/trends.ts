/**
 * Trend calculation (KAN-11, spec §15, §43, §44).
 *
 * ── The vocabulary is the point ───────────────────────────────────────────
 *
 * A trend here is a direction of travel and nothing more: increasing,
 * decreasing, stable, or not enough data to say. It is never "improving",
 * "worsening", "good" or "concerning", because whether a rising value is
 * welcome is a clinical question this product does not answer — and cannot,
 * since it knows nothing about the person beyond the numbers on their reports.
 *
 * Two decisions worth understanding:
 *
 *   Three points minimum. Two measurements make a line, not a trend. A single
 *   repeat that happens to differ would otherwise be reported as "increasing",
 *   which reads as a finding rather than as noise.
 *
 *   Change is judged against the reference range, not against the value. A
 *   0.3 mmol/L move in potassium (range 3.5–5.1) is a quarter of the whole
 *   normal band; the same absolute move in cholesterol is nothing. Using the
 *   range as the yardstick is what makes one threshold work for every test.
 *
 *   The slope is Theil–Sen, not least squares. Laboratory series are short and
 *   spiky — a single high reading after four identical ones is common, and
 *   least squares turns that one point into "increasing". Theil–Sen takes the
 *   median of every pairwise slope, so a lone outlier moves the answer barely
 *   at all. The spike is not hidden by this: it is the latest value, carries
 *   its own status, and is drawn on the chart. It just does not get to rename
 *   four stable months as a rising trend.
 */

import type { Timestamp } from 'firebase-admin/firestore';

export type TrendDirection = 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';

export interface TrendPoint {
  value: number;
  /** Milliseconds since epoch. */
  at: number;
}

/** Fewer than this and we say so rather than guessing at a direction. */
export const MIN_POINTS_FOR_TREND = 3;

/**
 * Total drift below this fraction of the yardstick counts as stable.
 *
 * 10% of the reference band. Below that, the movement is comfortably inside
 * the analytical and biological variation of an ordinary blood test, and
 * calling it a direction would be reporting noise as signal.
 */
const STABLE_FRACTION = 0.1;

export interface TrendInput {
  points: TrendPoint[];
  /** The reference band, when the report gave one. Used as the yardstick. */
  rangeLow?: number | null;
  rangeHigh?: number | null;
}

/**
 * Direction of travel across the supplied points.
 */
export function calculateTrend({ points, rangeLow, rangeHigh }: TrendInput): TrendDirection {
  const usable = points
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.at))
    .sort((a, b) => a.at - b.at);

  if (usable.length < MIN_POINTS_FOR_TREND) return 'insufficient_data';

  const first = usable[0]!;
  const last = usable[usable.length - 1]!;
  const elapsed = last.at - first.at;

  // Several results from one day carry no direction — they are one moment
  // measured repeatedly, not a series over time.
  if (elapsed <= 0) return 'insufficient_data';

  const slope = theilSenSlope(usable);
  if (slope === null) return 'insufficient_data';

  // Drift over the observed period, in the value's own units.
  const drift = slope * elapsed;
  const scale = yardstick(usable, rangeLow, rangeHigh);
  if (scale <= 0) return 'stable';

  const relative = drift / scale;
  if (Math.abs(relative) < STABLE_FRACTION) return 'stable';
  return relative > 0 ? 'increasing' : 'decreasing';
}

/**
 * What "a meaningful amount of change" means for this variable.
 *
 * The reference band when there is one. Otherwise the mean of the observed
 * values, so a test with no printed range still gets a proportionate
 * threshold rather than an absolute one that would suit no test at all.
 */
function yardstick(
  points: TrendPoint[],
  rangeLow?: number | null,
  rangeHigh?: number | null,
): number {
  if (
    typeof rangeLow === 'number' &&
    typeof rangeHigh === 'number' &&
    Number.isFinite(rangeLow) &&
    Number.isFinite(rangeHigh) &&
    rangeHigh > rangeLow
  ) {
    return rangeHigh - rangeLow;
  }

  const mean = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  return Math.abs(mean);
}

/**
 * Median of the slopes between every pair of points (Theil–Sen).
 *
 * Robust to roughly a third of the series being outliers, which matters more
 * here than efficiency: these series are a handful of points, and one odd
 * reading is the normal case rather than the exceptional one. O(n²) over
 * single-digit n is free.
 */
function theilSenSlope(points: TrendPoint[]): number | null {
  const slopes: number[] = [];

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i]!;
      const b = points[j]!;
      const dx = b.at - a.at;
      // Two results from the same instant have no slope between them; they are
      // one moment, not an interval.
      if (dx === 0) continue;
      slopes.push((b.value - a.value) / dx);
    }
  }

  if (slopes.length === 0) return null;

  slopes.sort((a, b) => a - b);
  const middle = Math.floor(slopes.length / 2);
  return slopes.length % 2 === 0 ? (slopes[middle - 1]! + slopes[middle]!) / 2 : slopes[middle]!;
}

/** One stored measurement in a variable's history. */
export interface SeriesPoint {
  value: number;
  observedAt: Timestamp;
}

export interface SeriesUpdate {
  variableId: string;
  canonicalName: string;
  unit: string | null;
  latestValue: number | null;
  latestRawValue: string;
  latestStatus: string;
  referenceRange: {
    low: number | null;
    high: number | null;
    text: string | null;
    source: string;
  };
  observedAt: Timestamp;
}

/**
 * Keeps at most this many points per variable.
 *
 * The series document is read whole every time the variables grid renders, so
 * it cannot grow without bound. Twenty measurements is more history than the
 * card or the trend chart can show meaningfully, and the underlying results
 * remain on their reports — this is a cache of the shape, not the record.
 */
export const MAX_SERIES_POINTS = 20;

/** Newest-last, capped, with same-instant duplicates collapsed. */
export function mergePoints(
  existing: { value: number; at: number }[],
  incoming: { value: number; at: number },
): { value: number; at: number }[] {
  const byInstant = new Map(existing.map((point) => [point.at, point]));
  // Re-processing a report must update its point rather than append a second
  // one, or a retry would double the history.
  byInstant.set(incoming.at, incoming);

  return [...byInstant.values()]
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_SERIES_POINTS);
}
