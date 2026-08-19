/**
 * Finishing the catalog entries the upload could not (KAN-8, KAN-15).
 *
 * When a report prints a test the catalog has never seen, `resolveVariables`
 * creates a placeholder and `pipeline.ts` immediately asks the AI provider to
 * complete it. That call is deliberately best-effort: it runs *after* the
 * user's values are stored, so a slow or failing provider costs them a card
 * headed "Ferritina" rather than a missing result.
 *
 * What was missing is what happens next. `enrichChunk` catches its own
 * failures, logs them and returns — and nothing ever tried again. A rate limit
 * at the wrong moment, a response that failed to parse, a provider outage: any
 * of them left a placeholder that stayed a placeholder for good. Eighty-five
 * of them accumulated in this project before anyone noticed, and the only
 * remedy was a human running `backfill-variables.mjs` by hand.
 *
 * This is that remedy, on a schedule. Nothing about the upload path changes —
 * the immediate attempt still happens, because most of the time it works and a
 * reader should not wait an hour for their card to read properly. This makes
 * the failure temporary instead of permanent.
 *
 * ── Why a schedule and not a Firestore trigger ───────────────────────────
 *
 * An `onDocumentCreated` over `variables/{id}` would fire once per new test,
 * and a first upload commonly introduces thirty at once — thirty concurrent
 * functions each making its own AI call for one name. `ENRICHMENT_CHUNK`
 * exists precisely because that question is cheaper asked twelve at a time,
 * and a trigger would defeat it. A sweep also bounds the spend: it decides how
 * much to ask for, where a trigger's volume is decided by whatever somebody
 * uploaded.
 *
 * ── On consent ───────────────────────────────────────────────────────────
 *
 * The pipeline refuses to send anything without the account's AI-processing
 * consent, and that gate is not repeated here because this sends something
 * different. A catalog document holds a test name — "Ferritina", "BASOFILOS %"
 * — in a collection every signed-in user can read. It carries no value, no
 * range, no date and no owner. By the time an entry reaches this sweep it is
 * reference data about a laboratory's vocabulary, not a fact about the person
 * whose report first mentioned it.
 */

import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';

import { REGION } from '../region';
import { enrichVariables, MAX_ENRICHMENT_BATCH, type EnrichmentTarget } from './enrichment';

/**
 * How many entries one run will attempt.
 *
 * Two chunks, not the four `MAX_ENRICHMENT_BATCH` would allow, and the reason
 * is the failure that is actually common: the free tier answers 503 under
 * load, the provider retries, and a chunk that would take 15 seconds takes
 * 198. Four of those overruns the 540-second function timeout and the run is
 * killed part-way — losing the work already done and telling nobody why.
 *
 * Two chunks is under 400 seconds even in that state, and the sweep runs every
 * hour: a backlog of forty drains in a morning rather than in one run that
 * might not finish. It also bounds the query, which would otherwise read four
 * hundred flagged documents to enrich a couple of dozen.
 */
export const SWEEP_LIMIT = Math.min(24, MAX_ENRICHMENT_BATCH);

export interface SweepSummary {
  /** Entries found still carrying the flag. */
  pending: number;
  /** Entries this run completed. Lower than `pending` when a chunk failed. */
  enriched: number;
}

/**
 * Completes as many flagged entries as one run allows.
 *
 * Exported separately from the schedule so it can be tested, and so a future
 * admin control can run it on demand without waiting for the hour.
 */
export async function sweepPendingVariables(
  limit: number = SWEEP_LIMIT,
): Promise<SweepSummary> {
  const snapshot = await getFirestore()
    .collection('variables')
    .where('needsEnrichment', '==', true)
    .limit(limit)
    .get();

  if (snapshot.empty) return { pending: 0, enriched: 0 };

  const targets: EnrichmentTarget[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    // The name the laboratory printed, which is what the placeholder stored
    // and the only thing the model has to work from.
    rawName: String(doc.data().canonicalName ?? doc.id),
  }));

  const enriched = await enrichVariables(targets);

  // Both numbers, always. "Completed 12" alone hides that 36 were left, and
  // the gap between them is the only signal that the provider is refusing
  // work — a sweep that keeps finding the same backlog is a sweep that is
  // failing quietly.
  logger.info('Catalog sweep finished', { pending: targets.length, enriched });

  return { pending: targets.length, enriched };
}

export const enrichCatalogBacklog = onSchedule(
  {
    region: REGION,
    // Hourly, at 25 past — off the hour so it does not queue behind every
    // other scheduled job in the project. Hourly rather than daily because
    // this is the path that makes a failed enrichment temporary, and a reader
    // should not spend a day looking at a card headed in the wrong language.
    schedule: '25 * * * *',
    timeZone: 'Etc/UTC',
    memory: '512MiB',
    timeoutSeconds: 540,
    // The provider's own rate limiting is the expected failure, and it is
    // better answered by the next hour's run than by an immediate retry into
    // the same limit.
    retryCount: 0,
  },
  async () => {
    const summary = await sweepPendingVariables();
    if (summary.pending === 0) {
      logger.debug('Catalog sweep: nothing pending');
      return;
    }
    if (summary.enriched === 0) {
      // Distinguished from "nothing to do" on purpose: this is the shape of a
      // provider that is down, out of quota, or returning unparseable JSON,
      // and it should be findable in the logs without reading every line.
      logger.warn('Catalog sweep completed nothing', { pending: summary.pending });
    }
  },
);
