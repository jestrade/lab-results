/**
 * Reading the processing queue (KAN-20, KAN-51).
 *
 * One live query, across every owner. `firestore.rules` allows `list` on
 * `reports` to any signed-in user and leaves the filtering to the query itself
 * — rules cannot inspect a query — so a reader's own screens always constrain
 * by `ownerId` and this one, held behind `RequireRole`, does not.
 *
 * ── Why this reads reports rather than a jobs collection ──────────────────
 *
 * `firestore.rules` reserves `processingJobs/{jobId}` for pipeline telemetry,
 * and nothing writes it yet. Introducing that collection would mean the
 * pipeline writing a second document per report, kept in step with the first,
 * to hold facts the first already carries: the status, when the attempt was
 * claimed, how many have been spent, and why the last one stopped. Until there
 * is a fact about a run that does not belong on the report — per-stage timings,
 * token spend — the second document would only be a copy that can disagree.
 */

import {
  collection,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { getDb } from '@/lib/firebase';
import { JOB_STATUSES, toJobRow, type JobRow } from '@/domain/adminJobs';

/**
 * How many jobs one subscription carries before the admin asks for more.
 *
 * Larger than the account window, because of what these documents are: a
 * healthy system holds a handful of them at a time, and a window this size is
 * only ever filled when something has gone wrong across many accounts at once
 * — which is the moment the operator most needs to see the whole of it rather
 * than a page.
 */
export const JOB_PAGE_SIZE = 200;

/**
 * Jobs in flight and jobs that failed, live.
 *
 * Ordered by `uploadedAt`, which — unlike the account list next door — is safe
 * to order on here: `firestore.rules` requires it on create with
 * `request.resource.data.uploadedAt == request.time`, so no report can exist
 * without one, and a document Firestore would omit for lacking the field
 * cannot be created. Ordering descending puts the limit around the *newest*
 * jobs; the page then sorts what arrived oldest-first, because the oldest job
 * is the one being triaged (see `sortJobs`).
 *
 * The status filter is an `in` over four values, served by the existing
 * `status ASC, uploadedAt DESC` index in `firestore.indexes.json`.
 */
export function subscribeToJobs(
  count: number,
  onChange: (jobs: JobRow[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const jobs = query(
    collection(getDb(), 'reports'),
    where('status', 'in', [...JOB_STATUSES]),
    orderBy('uploadedAt', 'desc'),
    limitTo(count),
  );

  return onSnapshot(
    jobs,
    (snapshot) => onChange(snapshot.docs.map((entry) => toJobRow(entry.id, entry.data()))),
    (error) => onError?.(error),
  );
}

/**
 * Runs a stranded report through the pipeline again.
 *
 * The same callable the report's own owner uses, and deliberately not a second
 * one: the policy that decides whether a report may be reprocessed — the
 * attempt cap, the cooldown, the failures a second reading cannot fix — is
 * worth exactly one implementation. `functions/src/retry.ts` accepts an admin
 * caller for a report they do not own, records that in the audit log, and
 * applies every other rule unchanged.
 */
export { retryReport as retryJob, retryErrorMessage } from '@/services/reportsList';
