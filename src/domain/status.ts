/**
 * Status presentation (KAN-38, KAN-25).
 *
 * Every status the user can see is described here as a triple: a **label**, an
 * **icon** and a **colour token**. Components read this table rather than
 * choosing their own, which is what makes the "never colour alone" rule
 * (spec §60, KAN-25, KAN-53) structural instead of a thing each page has to
 * remember. A status pill built from this table is readable in greyscale, in
 * a screen reader and on paper.
 *
 * The icon names are Phosphor duotone classes, matching the design board.
 *
 * ── Why the tables hold keys rather than words (KAN-8) ────────────────────
 *
 * The label and description are `MessageKey`s, resolved against the reader's
 * locale by the accessors below. Keeping the words themselves in the catalog
 * rather than here means the rule this file exists to enforce — that a status
 * always carries text, not just a colour — holds in every language, and is
 * checked by the compiler in every language.
 */

import type { Locale } from './locales';
import { messageFor } from '@/i18n/catalogs';
import type { MessageKey } from '@/i18n/messages';
import type {
  ExtractionConfidence,
  ReferenceRangeSource,
  ReportStatus,
  ResultStatus,
  TrendDirection,
} from './types';

/** The table entry: what to look up and what to draw. */
export interface StatusEntry {
  labelKey: MessageKey;
  /** Phosphor icon class, e.g. `ph-check-circle`. Decorative; label carries it. */
  icon: string;
  descriptionKey: MessageKey;
}

/** The resolved form a component renders. */
export interface StatusPresentation {
  /** Visible text. Never omitted — this is the non-colour carrier. */
  label: string;
  icon: string;
  /**
   * Longer form announced to assistive tech and used in tooltips, where the
   * pill's two words are not enough on their own.
   */
  description: string;
}

export const RESULT_STATUS: Record<ResultStatus, StatusEntry> = {
  normal: {
    labelKey: 'status.result.normal',
    icon: 'ph-check-circle',
    descriptionKey: 'status.result.normal.description',
  },
  low: {
    labelKey: 'status.result.low',
    icon: 'ph-arrow-down',
    descriptionKey: 'status.result.low.description',
  },
  high: {
    labelKey: 'status.result.high',
    icon: 'ph-arrow-up',
    descriptionKey: 'status.result.high.description',
  },
  critical: {
    labelKey: 'status.result.critical',
    icon: 'ph-warning-octagon',
    descriptionKey: 'status.result.critical.description',
  },
  unknown: {
    labelKey: 'status.result.unknown',
    icon: 'ph-question',
    descriptionKey: 'status.result.unknown.description',
  },
};

export const REPORT_STATUS: Record<
  ReportStatus,
  StatusEntry & { tone: 'neutral' | 'accent' | 'warning' | 'danger' }
> = {
  uploaded: {
    labelKey: 'status.report.uploaded',
    icon: 'ph-check',
    tone: 'neutral',
    descriptionKey: 'status.report.uploaded.description',
  },
  queued: {
    labelKey: 'status.report.queued',
    icon: 'ph-hourglass',
    tone: 'neutral',
    descriptionKey: 'status.report.queued.description',
  },
  processing: {
    labelKey: 'status.report.processing',
    icon: 'ph-spinner-gap',
    tone: 'accent',
    descriptionKey: 'status.report.processing.description',
  },
  processed: {
    labelKey: 'status.report.processed',
    icon: 'ph-check-circle',
    tone: 'neutral',
    descriptionKey: 'status.report.processed.description',
  },
  partially_processed: {
    labelKey: 'status.report.partiallyProcessed',
    icon: 'ph-warning',
    tone: 'warning',
    descriptionKey: 'status.report.partiallyProcessed.description',
  },
  failed: {
    labelKey: 'status.report.failed',
    icon: 'ph-x-circle',
    tone: 'danger',
    descriptionKey: 'status.report.failed.description',
  },
};

export const TREND: Record<TrendDirection, StatusEntry> = {
  increasing: {
    labelKey: 'status.trend.increasing',
    icon: 'ph-trend-up',
    descriptionKey: 'status.trend.increasing.description',
  },
  decreasing: {
    labelKey: 'status.trend.decreasing',
    icon: 'ph-trend-down',
    descriptionKey: 'status.trend.decreasing.description',
  },
  stable: {
    labelKey: 'status.trend.stable',
    icon: 'ph-arrows-left-right',
    descriptionKey: 'status.trend.stable.description',
  },
  insufficient_data: {
    labelKey: 'status.trend.insufficient',
    icon: 'ph-minus',
    descriptionKey: 'status.trend.insufficient.description',
  },
};

export const CONFIDENCE: Record<ExtractionConfidence, StatusEntry> = {
  high: {
    labelKey: 'status.confidence.high',
    icon: 'ph-seal-check',
    descriptionKey: 'status.confidence.high.description',
  },
  medium: {
    labelKey: 'status.confidence.medium',
    icon: 'ph-seal-question',
    descriptionKey: 'status.confidence.medium.description',
  },
  low: {
    labelKey: 'status.confidence.low',
    icon: 'ph-warning',
    descriptionKey: 'status.confidence.low.description',
  },
};

/** Resolves any table entry into the words a component renders. */
export function present(entry: StatusEntry, locale: Locale): StatusPresentation {
  return {
    label: messageFor(locale, entry.labelKey),
    icon: entry.icon,
    description: messageFor(locale, entry.descriptionKey),
  };
}

/**
 * How a reference range must be labelled. The spec is strict here: a general
 * range may never be presented as if the laboratory had printed it.
 *
 * `laboratory` maps to null rather than to a key: a range the laboratory
 * printed carries no qualifier, and inventing one ("laboratory reference")
 * would put words next to the only range that needs none.
 */
export const RANGE_SOURCE_KEY: Record<ReferenceRangeSource, MessageKey | null> = {
  laboratory: null,
  general: 'range.general',
  unavailable: 'range.unavailable',
};

export function rangeSourceLabel(
  source: ReferenceRangeSource,
  locale: Locale,
): string | null {
  const key = RANGE_SOURCE_KEY[source];
  return key ? messageFor(locale, key) : null;
}

/** Statuses that mean "this value is not inside its range". */
export const OUT_OF_RANGE_STATUSES: readonly ResultStatus[] = ['low', 'high', 'critical'];

export function isOutOfRange(status: ResultStatus): boolean {
  return OUT_OF_RANGE_STATUSES.includes(status);
}
