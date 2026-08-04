/**
 * Reading tracked laboratory variables (KAN-45).
 *
 * `users/{uid}/variableSeries` is written exclusively by the trend engine
 * (KAN-11) and is read-only to the client — see `firestore.rules`. Until that
 * engine exists the collection is empty, and the page shows its empty state
 * rather than inventing anything.
 */

import { collection, onSnapshot, type Timestamp, type Unsubscribe } from 'firebase/firestore';

import { getDb } from '@/lib/firebase';
import type {
  ReferenceRange,
  ResultStatus,
  TrendDirection,
  VariableCategory,
  VariablePoint,
  VariableSeries,
} from '@/domain/types';

export function subscribeToVariableSeries(
  userId: string,
  onChange: (series: VariableSeries[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getDb(), 'users', userId, 'variableSeries'),
    (snapshot) => onChange(snapshot.docs.map((entry) => toSeries(entry.id, entry.data()))),
    (error) => onError?.(error),
  );
}

function toSeries(id: string, data: Record<string, unknown>): VariableSeries {
  return {
    variableId: id,
    canonicalName: String(data.canonicalName ?? id),
    aliases: (data.aliases as string[] | undefined) ?? [],
    category: (data.category as VariableCategory) ?? 'other',
    unit: (data.unit as string | null) ?? null,
    latestValue: (data.latestValue as number | null) ?? null,
    latestRawValue: String(data.latestRawValue ?? ''),
    // An unrecognised status must not silently render as normal. `unknown` is
    // the honest fallback and is a real, displayable state.
    latestStatus: (data.latestStatus as ResultStatus) ?? 'unknown',
    latestObservedAt: data.latestObservedAt as Timestamp,
    referenceRange: (data.referenceRange as ReferenceRange) ?? {
      low: null,
      high: null,
      text: null,
      source: 'unavailable',
    },
    resultCount: Number(data.resultCount ?? 0),
    trend: (data.trend as TrendDirection) ?? 'insufficient_data',
    points: (data.points as VariablePoint[] | undefined) ?? [],
  };
}
