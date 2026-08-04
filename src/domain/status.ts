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
 */

import type {
  ExtractionConfidence,
  ReferenceRangeSource,
  ReportStatus,
  ResultStatus,
  TrendDirection,
} from './types';

export interface StatusPresentation {
  /** Visible text. Never omitted — this is the non-colour carrier. */
  label: string;
  /** Phosphor icon class, e.g. `ph-check-circle`. Decorative; label carries it. */
  icon: string;
  /**
   * Longer form announced to assistive tech and used in tooltips, where the
   * pill's two words are not enough on their own.
   */
  description: string;
}

export const RESULT_STATUS: Record<ResultStatus, StatusPresentation> = {
  normal: {
    label: 'Normal',
    icon: 'ph-check-circle',
    description: 'Within the reference range printed on this report.',
  },
  low: {
    label: 'Low',
    icon: 'ph-arrow-down',
    description: 'Below the reference range printed on this report.',
  },
  high: {
    label: 'High',
    icon: 'ph-arrow-up',
    description: 'Above the reference range printed on this report.',
  },
  critical: {
    label: 'Critical',
    icon: 'ph-warning-octagon',
    description:
      'Outside the critical thresholds stated by the laboratory. May require prompt medical attention.',
  },
  unknown: {
    label: 'Unknown',
    icon: 'ph-question',
    description:
      'No usable reference range was available on this report, so the value was not classified.',
  },
};

export const REPORT_STATUS: Record<
  ReportStatus,
  StatusPresentation & { tone: 'neutral' | 'accent' | 'warning' | 'danger' }
> = {
  uploaded: {
    label: 'Uploaded',
    icon: 'ph-check',
    tone: 'neutral',
    description: 'The file is stored and waiting to enter the processing queue.',
  },
  queued: {
    label: 'Queued',
    icon: 'ph-hourglass',
    tone: 'neutral',
    description: 'Waiting for a processing slot.',
  },
  processing: {
    label: 'Processing',
    icon: 'ph-spinner-gap',
    tone: 'accent',
    description: 'Results are being extracted from the report.',
  },
  processed: {
    label: 'Processed',
    icon: 'ph-check-circle',
    tone: 'neutral',
    description: 'All results were extracted successfully.',
  },
  partially_processed: {
    label: 'Partially processed',
    icon: 'ph-warning',
    tone: 'warning',
    description: 'Most results were extracted; some values could not be read reliably.',
  },
  failed: {
    label: 'Failed',
    icon: 'ph-x-circle',
    tone: 'danger',
    description: 'The report could not be processed.',
  },
};

export const TREND: Record<TrendDirection, StatusPresentation> = {
  increasing: {
    label: 'Increasing',
    icon: 'ph-trend-up',
    description: 'The value has risen across recent reports.',
  },
  decreasing: {
    label: 'Decreasing',
    icon: 'ph-trend-down',
    description: 'The value has fallen across recent reports.',
  },
  stable: {
    label: 'Stable',
    icon: 'ph-arrows-left-right',
    description: 'The value has not moved meaningfully across recent reports.',
  },
  insufficient_data: {
    label: 'Insufficient data',
    icon: 'ph-minus',
    description: 'There are not enough measurements yet to describe a direction.',
  },
};

export const CONFIDENCE: Record<ExtractionConfidence, StatusPresentation> = {
  high: {
    label: 'High confidence',
    icon: 'ph-seal-check',
    description: 'This value was read clearly from the report.',
  },
  medium: {
    label: 'Medium confidence',
    icon: 'ph-seal-question',
    description: 'This value was read with some uncertainty. Check it against the report.',
  },
  low: {
    label: 'Low confidence',
    icon: 'ph-warning',
    description:
      'This value could not be read reliably. Check it against the original report before relying on it.',
  },
};

/**
 * How a reference range must be labelled. The spec is strict here: a general
 * range may never be presented as if the laboratory had printed it.
 */
export const RANGE_SOURCE_LABEL: Record<ReferenceRangeSource, string | null> = {
  laboratory: null,
  general: 'general reference, not lab-specific',
  unavailable: 'reference range unavailable',
};

/** Statuses that mean "this value is not inside its range". */
export const OUT_OF_RANGE_STATUSES: readonly ResultStatus[] = ['low', 'high', 'critical'];

export function isOutOfRange(status: ResultStatus): boolean {
  return OUT_OF_RANGE_STATUSES.includes(status);
}
