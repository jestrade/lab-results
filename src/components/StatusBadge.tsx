/**
 * Status badges (KAN-38, KAN-39, KAN-53).
 *
 * All four badges below are built from the presentation table in
 * `domain/status.ts`, so each one renders an icon *and* a text label, always.
 * That is the whole point: the design board colours these pills, but colour is
 * additive here — remove it and the pill still says "Critical" next to a
 * warning octagon.
 */

import {
  CONFIDENCE,
  REPORT_STATUS,
  RESULT_STATUS,
  TREND,
} from '@/domain/status';
import type {
  ExtractionConfidence,
  ReportStatus,
  ResultStatus,
  TrendDirection,
} from '@/domain/types';
import { Icon } from './Icon';

export interface ResultStatusBadgeProps {
  status: ResultStatus;
  /** Adds the longer explanation as a tooltip and to the accessible name. */
  describe?: boolean;
}

export function ResultStatusBadge({ status, describe = false }: ResultStatusBadgeProps) {
  const presentation = RESULT_STATUS[status];
  return (
    <span
      className="status-pill"
      data-status={status}
      title={describe ? presentation.description : undefined}
    >
      <Icon name={presentation.icon} size={13} />
      {presentation.label}
      {describe ? <span className="sr-only">. {presentation.description}</span> : null}
    </span>
  );
}

const REPORT_TONE_STATUS: Record<string, ResultStatus> = {
  neutral: 'normal',
  accent: 'low',
  warning: 'high',
  danger: 'critical',
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const presentation = REPORT_STATUS[status];
  return (
    <span
      className="status-pill"
      // Report tones reuse the result palette rather than introducing a second
      // colour system for the same four meanings.
      data-status={REPORT_TONE_STATUS[presentation.tone]}
      title={presentation.description}
    >
      <Icon name={presentation.icon} size={13} spin={status === 'processing'} />
      {presentation.label}
    </span>
  );
}

export function ConfidenceTag({ confidence }: { confidence: ExtractionConfidence }) {
  const presentation = CONFIDENCE[confidence];
  // High confidence is the expected case; badging it everywhere would add
  // noise and make the low-confidence flag harder to spot.
  if (confidence === 'high') return null;
  return (
    <span
      className="status-pill"
      data-status={confidence === 'low' ? 'high' : 'unknown'}
      title={presentation.description}
    >
      <Icon name={presentation.icon} size={13} />
      {presentation.label}
    </span>
  );
}

export function TrendBadge({ trend }: { trend: TrendDirection }) {
  const presentation = TREND[trend];
  return (
    <span className="status-pill" data-status="unknown" title={presentation.description}>
      <Icon name={presentation.icon} size={13} />
      {presentation.label}
    </span>
  );
}
