/**
 * Reading tracked laboratory variables (KAN-45).
 *
 * `users/{uid}/variableSeries` is written exclusively by the trend engine
 * (KAN-11) and is read-only to the client — see `firestore.rules`. Until that
 * engine exists the collection is empty, and the page shows its empty state
 * rather than inventing anything.
 *
 * The one thing the user may do to it is remove it, and even that goes through
 * a callable rather than a client delete — see `clearVariableData` below.
 */

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { getDb, getFunctionsClient } from '@/lib/firebase';
import {
  categoryCatalog,
  readCategory,
  type CategoryCatalog,
} from '@/domain/categories';
import { readTranslated, readTranslatedOptional } from '@/domain/locales';
import type { LabVariable, VariableOrigin } from '@/domain/types';
import type {
  ReferenceRange,
  ResultStatus,
  TrendDirection,
  VariableCategory,
  VariablePoint,
  VariableSeries,
} from '@/domain/types';

/**
 * The canonical catalog (KAN-8), read once and kept.
 *
 * ── Why this is fetched rather than subscribed ───────────────────────────
 *
 * Every other read in this file is an `onSnapshot`, because the user's own
 * results change while they watch. The catalog does not: it is reference data
 * that only an import, a backfill or an admin can alter, and holding eighty
 * document listeners open on every page that names a variable would be a
 * standing cost for an event that happens a few times a year.
 *
 * Cached for the session for the same reason. A page navigation should not
 * re-read eighty documents to draw the same chip list.
 */
let catalogCache: Promise<Map<string, LabVariable>> | null = null;

export function fetchVariableCatalog(): Promise<Map<string, LabVariable>> {
  catalogCache ??= getDocs(collection(getDb(), 'variables'))
    .then((snapshot) => {
      const entries = new Map<string, LabVariable>();
      for (const doc of snapshot.docs) entries.set(doc.id, toVariable(doc.id, doc.data()));
      return entries;
    })
    .catch((error) => {
      // A failed fetch must not be cached as a permanent empty catalog — the
      // pages fall back to the names denormalised onto each series, and the
      // next navigation retries.
      catalogCache = null;
      throw error;
    });

  return catalogCache;
}

/** Test seam, and the way an admin edit becomes visible without a reload. */
export function clearVariableCatalogCache(): void {
  catalogCache = null;
  categoriesCache = null;
}

/**
 * The category catalog (KAN-8), on exactly the same terms.
 *
 * Eighteen-odd documents that change when an admin adds a panel, read by every
 * page that draws a group heading or a filter chip. Fetched rather than
 * subscribed, and cached for the session, for the reasons above.
 *
 * A failed read is not cached and is not fatal. `NO_CATEGORIES` groups by raw
 * id and labels each heading from the id itself, so a reader whose network
 * dropped one request sees a tidy-ish grid rather than an empty one.
 */
let categoriesCache: Promise<CategoryCatalog> | null = null;

export function fetchVariableCategories(): Promise<CategoryCatalog> {
  categoriesCache ??= getDocs(collection(getDb(), 'variableCategories'))
    .then((snapshot) =>
      categoryCatalog(snapshot.docs.map((doc) => readCategory(doc.id, doc.data()))),
    )
    .catch((error) => {
      categoriesCache = null;
      throw error;
    });

  return categoriesCache;
}

function toVariable(id: string, data: Record<string, unknown>): LabVariable {
  const canonicalName = String(data.canonicalName ?? id);

  return {
    id,
    canonicalName,
    names: readTranslated(data.names, canonicalName),
    descriptions: readTranslatedOptional(data.descriptions),
    aliases: (data.aliases as string[] | undefined) ?? [],
    category: (data.category as LabVariable['category']) ?? 'other',
    defaultUnit: (data.defaultUnit as string | null) ?? null,
    origin: (data.origin as VariableOrigin) ?? 'discovered',
    needsEnrichment: data.needsEnrichment === true,
    createdAt: data.createdAt as LabVariable['createdAt'],
  };
}

/**
 * The word the callable demands before it removes anything.
 *
 * One constant, named on both sides, rather than a literal in the browser and
 * another in `functions/src/clearVariables.ts` that can drift apart silently.
 */
export const CLEAR_CONFIRMATION = 'CLEAR';

export interface ClearSummary {
  /** Series documents removed — one per tracked variable. */
  cleared: number;
}

/**
 * Removes every tracked variable and its history for the signed-in user.
 *
 * A callable, not a client delete: `firestore.rules` denies the browser any
 * write to `variableSeries`, deliberately, so that a value on a card is always
 * something the pipeline computed rather than something a client could have
 * put there. The whole workflow — including why this is all-or-nothing rather
 * than per report — lives in `functions/src/clearVariables.ts`.
 *
 * The subscription in `subscribeToVariableSeries` empties the grid on its own
 * once the deletes land; the returned count is for the sentence that tells the
 * user what just happened.
 */
export async function clearVariableData(): Promise<ClearSummary> {
  const call = httpsCallable<{ confirmation: string }, ClearSummary>(
    getFunctionsClient(),
    'clearVariableData',
  );
  const { data } = await call({ confirmation: CLEAR_CONFIRMATION });
  return data;
}

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

/**
 * One tracked variable, live (KAN-46).
 *
 * A document listener rather than a filter over the collection subscription:
 * the variable page needs one series, and reading the other forty to find it
 * would be forty documents on every snapshot. `null` means the user has no
 * history for this variable — a real, displayable state, and the one a
 * hand-typed or stale link lands on.
 */
export function subscribeToVariableSeriesEntry(
  userId: string,
  variableId: string,
  onChange: (series: VariableSeries | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getDb(), 'users', userId, 'variableSeries', variableId),
    (snapshot) =>
      onChange(snapshot.exists() ? toSeries(snapshot.id, snapshot.data()) : null),
    (error) => onError?.(error),
  );
}

function toSeries(id: string, data: Record<string, unknown>): VariableSeries {
  const canonicalName = String(data.canonicalName ?? id);

  return {
    variableId: id,
    canonicalName,
    // Series written before the catalog existed have no `names` map. Falling
    // back to the canonical name shows the laboratory's own wording rather
    // than a blank card — the same choice the pipeline makes for a variable
    // it has not enriched yet.
    names: readTranslated(data.names, canonicalName),
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
