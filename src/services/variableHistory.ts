/**
 * One variable's measurements, gathered from the reports they were printed on
 * (KAN-14, KAN-46).
 *
 * ── Why this is a query per report and not a collection-group query ───────
 *
 * The obvious shape is one `collectionGroup('results')` query filtered by
 * `variableId`, and there is even an index for it. It cannot be used from the
 * browser as things stand, for two independent reasons:
 *
 *   A result document carries no `ownerId`. A collection-group query has no
 *   parent path to constrain, so there would be nothing to filter by and
 *   nothing for the rules to decide from — the query would ask for every
 *   user's results and be refused, correctly.
 *
 *   `firestore.rules` grants results at `/reports/{id}/results/{id}`, which is
 *   a path rule and does not apply to collection-group reads. Making it apply
 *   means opening `/{path=**}/results/{id}`, which is a widening of access
 *   that should not be a side effect of building a page.
 *
 * So the history is assembled the way the data model actually supports: the
 * user's own reports are listed — an indexed, owner-constrained query the app
 * already makes — and each is asked what it holds for this one variable. Every
 * read stays inside documents the reader owns, and no rule changes.
 *
 * The cost is one small query per report, bounded by `MAX_REPORTS_SCANNED`.
 * When a user has more reports than that, the page says which stretch of time
 * it read rather than presenting a partial history as a complete one.
 */

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';

import { getDb } from '@/lib/firebase';
import { MAX_REPORTS_SCANNED, type VariableMeasurement } from '@/domain/variableDetail';
import type { Report } from '@/domain/types';
import { readResult } from './reportDetails';

export interface VariableHistory {
  measurements: VariableMeasurement[];
  /** Reports actually read. Shown when it is fewer than the user has. */
  reportsScanned: number;
  /** True when the ceiling was hit and older reports went unread. */
  truncated: boolean;
}

/**
 * Statuses that can hold extracted results.
 *
 * A queued or failed report has no `results` subcollection to ask about, and
 * asking anyway would spend a read per report to learn nothing.
 */
const READABLE_STATUSES: ReadonlySet<Report['status']> = new Set([
  'processed',
  'partially_processed',
]);

export interface ReportDoc {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Which of the fetched reports are worth a query, and whether any were left.
 *
 * Separated from the fetch because both halves are decisions rather than
 * plumbing: skipping a report that cannot hold results saves a read, and
 * `truncated` is what stops a partial history from being presented as a
 * complete one. One more document than the ceiling is fetched, which is how
 * "there are older ones" is learned without a second count query.
 */
export function selectReports(docs: ReportDoc[]): { scanned: ReportDoc[]; truncated: boolean } {
  const readable = docs.filter((entry) =>
    READABLE_STATUSES.has(entry.data.status as Report['status']),
  );

  return {
    scanned: readable.slice(0, MAX_REPORTS_SCANNED),
    truncated: docs.length > MAX_REPORTS_SCANNED,
  };
}

export async function fetchVariableHistory(
  ownerId: string,
  variableId: string,
): Promise<VariableHistory> {
  const snapshot = await getDocs(
    query(
      collection(getDb(), 'reports'),
      where('ownerId', '==', ownerId),
      orderBy('uploadedAt', 'desc'),
      limit(MAX_REPORTS_SCANNED + 1),
    ),
  );

  const { scanned, truncated } = selectReports(
    snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() as Record<string, unknown> })),
  );

  const perReport = await Promise.all(
    scanned.map(async (report) => {
      const results = await getDocs(
        query(
          collection(getDb(), 'reports', report.id, 'results'),
          where('variableId', '==', variableId),
        ),
      );

      return results.docs.map((entry) =>
        readMeasurement(report, entry.id, entry.data()),
      );
    }),
  );

  return {
    measurements: perReport
      .flat()
      .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime()),
    reportsScanned: scanned.length,
    truncated,
  };
}

/**
 * One stored result, joined to the report it was printed on.
 *
 * Exported for the same reason `selectReports` is: the fallback chain on
 * `observedAt` below is a decision about how to handle documents written
 * before the pipeline stored it, and a decision worth testing.
 */
export function readMeasurement(
  { id: reportId, data: report }: ReportDoc,
  resultId: string,
  data: Record<string, unknown>,
): VariableMeasurement {
  const result = readResult(resultId, data);
  const reportDate = (report.reportDate as Timestamp | null)?.toDate?.() ?? null;

  return {
    // Result ids are index-prefixed *within* a report, so they collide across
    // reports. The pair is what is actually unique.
    id: `${reportId}/${resultId}`,
    reportId,
    reportFileName: String(report.originalFileName ?? ''),
    reportDate,
    laboratoryName: (report.laboratoryName as string | null) ?? null,
    // The result's own instant when it has one. Results written before the
    // pipeline stored it fall back to the report's date, and to the upload
    // when even that is missing — a measurement with no place on the time axis
    // could not be drawn at all.
    observedAt:
      result.observedAt?.toDate?.() ??
      reportDate ??
      (report.uploadedAt as Timestamp | undefined)?.toDate?.() ??
      new Date(0),
    rawName: result.rawName,
    value: result.value,
    rawValue: result.rawValue,
    unit: result.unit,
    referenceRange: result.referenceRange,
    status: result.status,
    confidence: result.confidence,
    analysis: result.analysis,
  };
}
