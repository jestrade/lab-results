/**
 * One report and the results extracted from it (KAN-13, KAN-44).
 *
 * Results are written only by the extraction pipeline through the Admin SDK —
 * `firestore.rules` denies every client write to this subcollection. That is
 * what lets the details page present a value as "what the laboratory reported"
 * rather than "what someone put in the database".
 */

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

import { getDb } from '@/lib/firebase';
import { DEFAULT_LOCALE, type Locale } from '@/domain/locales';
import { formatLongDate } from '@/i18n/dates';
import type {
  ExtractionConfidence,
  ReferenceRange,
  Report,
  ResultAnalysis,
  ResultStatus,
} from '@/domain/types';

/** A stored result, plus the AI commentary if any was generated for it. */
export interface ReportResult {
  id: string;
  variableId: string;
  rawName: string;
  value: number | null;
  rawValue: string;
  unit: string | null;
  referenceRange: ReferenceRange;
  status: ResultStatus;
  confidence: ExtractionConfidence;
  sourcePage: number | null;
  /** When the sample was taken. Null on results written before it was stored. */
  observedAt: Timestamp | null;
  analysis: ResultAnalysis | null;
}

/**
 * Re-exported so this file stays the one import for "a result on a report".
 * The shape itself is a stored field and lives with the rest of the model, in
 * `domain/types.ts` — the variable page (KAN-46) reads the same field.
 */
export type { ResultAnalysis };

export function subscribeToReport(
  reportId: string,
  onChange: (report: Report | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getDb(), 'reports', reportId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }
      const data = snapshot.data();
      onChange({ ...(data as Omit<Report, 'id'>), id: snapshot.id });
    },
    (error) => onError?.(error),
  );
}

export function subscribeToResults(
  reportId: string,
  onChange: (results: ReportResult[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    // Document ids are index-prefixed by the pipeline, so this restores the
    // order the tests appeared in on the page — which is how the reader will
    // compare the screen against the paper in front of them.
    query(collection(getDb(), 'reports', reportId, 'results'), orderBy('__name__')),
    (snapshot) => onChange(snapshot.docs.map((entry) => readResult(entry.id, entry.data()))),
    (error) => onError?.(error),
  );
}

/**
 * Reads one stored result document.
 *
 * Exported because the variable history (KAN-46) reads the same documents
 * through a different query. Two readers would mean two sets of fallbacks for
 * a half-written result, and two screens that could disagree about it.
 */
export function readResult(id: string, data: Record<string, unknown>): ReportResult {
  const analysis = data.analysis as Record<string, unknown> | undefined;
  return {
    id,
    variableId: String(data.variableId ?? id),
    rawName: String(data.rawName ?? ''),
    value: (data.value as number | null) ?? null,
    rawValue: String(data.rawValue ?? ''),
    unit: (data.unit as string | null) ?? null,
    referenceRange: (data.referenceRange as ReferenceRange) ?? {
      low: null,
      high: null,
      text: null,
      source: 'unavailable',
    },
    // An unrecognised status must never render as normal — `unknown` is the
    // honest fallback and is a real, displayable state.
    status: (data.status as ResultStatus) ?? 'unknown',
    confidence: (data.confidence as ExtractionConfidence) ?? 'low',
    sourcePage: (data.sourcePage as number | null) ?? null,
    observedAt: (data.observedAt as Timestamp | undefined) ?? null,
    analysis: analysis
      ? {
          text: String(analysis.text ?? ''),
          provider: String(analysis.provider ?? ''),
          model: String(analysis.model ?? ''),
          promptVersion: String(analysis.promptVersion ?? ''),
          contentUsedForTraining: analysis.contentUsedForTraining === true,
          generatedAt: String(analysis.generatedAt ?? ''),
        }
      : null,
  };
}

export function formatTimestamp(
  value: Timestamp | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const date = value?.toDate?.();
  if (!date) return '—';
  return formatLongDate(date, locale);
}
