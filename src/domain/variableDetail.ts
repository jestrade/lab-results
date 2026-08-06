/**
 * One variable's measured history (KAN-14, KAN-46).
 *
 * ── Why the page does not read this off the series document ───────────────
 *
 * `variableSeries` carries `points`, and a point is a value and an instant —
 * nothing else. That is the right shape for a sparkline and for /trends, and
 * it is not enough here. The variable page has to say, of each measurement,
 * which report it came from, what that report's own reference range was, what
 * status it was given against that range, and what the laboratory printed when
 * the value was not a number at all. None of that survives into a point, so
 * this model is assembled from the stored results instead — the record, rather
 * than the cache of it.
 *
 * The vocabulary rule from `trends.ts` holds throughout: movement is described
 * as up, down or unchanged, never as better or worse.
 */

import { messageFor } from '@/i18n/catalogs';
import { DEFAULT_LOCALE, type Locale } from './locales';
import type {
  ExtractionConfidence,
  ReferenceRange,
  ResultAnalysis,
  ResultStatus,
} from './types';

/** One value for this variable, as one report reported it. */
export interface VariableMeasurement {
  /** `reportId/resultId` — unique across reports, stable as a list key. */
  id: string;
  reportId: string;
  reportFileName: string;
  /** The date the laboratory printed, when it printed one. */
  reportDate: Date | null;
  laboratoryName: string | null;
  /** When the sample was taken, falling back to the report's date. */
  observedAt: Date;
  /** What this laboratory called the test, kept because it is the evidence. */
  rawName: string;
  value: number | null;
  /** Verbatim, for results that were never numbers ("Negative", "Trace"). */
  rawValue: string;
  unit: string | null;
  /** This report's own range — never the one on the newest report. */
  referenceRange: ReferenceRange;
  status: ResultStatus;
  confidence: ExtractionConfidence;
  analysis: ResultAnalysis | null;
}

/** A measurement with a number in it — the only kind a line can carry. */
export type NumericMeasurement = VariableMeasurement & { value: number };

export function isNumeric(measurement: VariableMeasurement): measurement is NumericMeasurement {
  return typeof measurement.value === 'number' && Number.isFinite(measurement.value);
}

/**
 * Splits a history into the part that can be plotted and the part that cannot.
 *
 * "Negative", "Trace" and "Not detected" are results, not missing data, and
 * they must not be dropped for being unplottable — nor coerced onto a numeric
 * axis, which would invent an ordering the laboratory never stated. They get
 * their own presentation instead, and both halves keep their place in the
 * table.
 */
export function splitMeasurements(all: VariableMeasurement[]): {
  numeric: NumericMeasurement[];
  qualitative: VariableMeasurement[];
} {
  return {
    numeric: all.filter(isNumeric),
    qualitative: all.filter((measurement) => !isNumeric(measurement)),
  };
}

/** Oldest first — the order a chart and a history both read in. */
export function byObservedAt(a: VariableMeasurement, b: VariableMeasurement): number {
  return a.observedAt.getTime() - b.observedAt.getTime();
}

/**
 * The newest measurement that carries commentary.
 *
 * Newest rather than "the one on the newest report": analysis is only
 * generated for results worth commenting on (see `needsAnalysis` in the
 * pipeline), so the latest report may have none while an earlier one does.
 * Showing the most recent commentary there is beats showing none, as long as
 * the page dates it — which it does.
 */
export function latestAnalysed(all: VariableMeasurement[]): VariableMeasurement | null {
  return (
    all
      .filter((measurement) => measurement.analysis !== null)
      .sort(byObservedAt)
      .at(-1) ?? null
  );
}

/**
 * The trend in a sentence (spec §60, KAN-53).
 *
 * The spoken equivalent of the chart, and the only form of it available to a
 * screen reader. It states the latest value, and how it compares with the one
 * before it — movement only, with no suggestion that either direction is
 * welcome.
 */
export function describeChange(
  name: string,
  numeric: NumericMeasurement[],
  locale: Locale = DEFAULT_LOCALE,
): string {
  const ordered = [...numeric].sort(byObservedAt);
  const latest = ordered.at(-1);
  if (!latest) return messageFor(locale, 'variable.changeNone', { name });

  const previous = ordered.at(-2);
  const value = withUnit(latest.value, latest.unit);
  if (!previous) {
    return messageFor(locale, 'variable.changeFirst', { name, value });
  }

  // One key per direction rather than a verb slotted into a shared frame:
  // Spanish conjugates and agrees around it, so the sentences cannot share one.
  const key =
    latest.value > previous.value
      ? 'variable.changeUp'
      : latest.value < previous.value
        ? 'variable.changeDown'
        : 'variable.changeSame';

  return messageFor(locale, key, {
    name,
    value,
    previous: withUnit(previous.value, previous.unit),
  });
}

function withUnit(value: number, unit: string | null): string {
  return unit ? `${value} ${unit}` : String(value);
}

/**
 * How many of the user's reports one variable's history is assembled from.
 *
 * A ceiling rather than a page size: the history is gathered by asking each
 * report what it holds for this variable, so the cost is one query per report
 * and it is worth bounding. Fifty reports is more than a decade of twice-yearly
 * bloodwork, and the page says so out loud when it hits the limit rather than
 * quietly presenting a partial history as a whole one.
 */
export const MAX_REPORTS_SCANNED = 50;
