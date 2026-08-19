/**
 * The processing queue, as an administrator sees it (KAN-20, KAN-51).
 *
 * A "job" here is not a document of its own. It is a report that the pipeline
 * has started and not finished — `uploaded`, `queued` and `processing` — or one
 * it gave up on. `firestore.rules` puts `reports` at the top level precisely so
 * an admin can query across owners without reading into anybody's subtree, and
 * this screen is the query that needed it.
 *
 * ── What a row is allowed to carry ────────────────────────────────────────
 *
 * A report id, an owner uid, a status, three timestamps, an attempt count and
 * the failure code. No file name, no laboratory, no page count, and — as
 * everywhere else in the console — no result. The omissions are the type, not
 * a habit: an operator triaging a stuck queue needs to know that a job has been
 * running for forty minutes and which account to tell, and does not need to
 * know that the file was called `hiv-panel-march.pdf`. `originalFileName` is on
 * the document this row is read from and deliberately not on the row.
 *
 * ── Why nothing here says how long a failed job took ──────────────────────
 *
 * The pipeline stamps `processingStartedAt` when it claims a report and
 * `processedAt` only when it succeeds (`functions/src/pipeline.ts`). A failed
 * run therefore has a start and no end, so its duration is not a number this
 * system holds. `jobElapsedMs` returns null for it rather than the time since
 * the start, which would be a figure that kept growing for a job that is over.
 */

import type { Timestamp } from 'firebase/firestore';

import { readPage } from './pagination';
import { canRetryReport, MAX_RETRIES, STALE_PROCESSING_MS } from './retry';
import type { ReportStatus, ReportWarning } from './types';

export { MAX_RETRIES, STALE_PROCESSING_MS };

/** Statuses where work was started and never finished. Mirrors `retry.ts`. */
export const IN_FLIGHT_STATUSES: readonly ReportStatus[] = ['uploaded', 'queued', 'processing'];

/** Every status this screen is about — what the subscription queries for. */
export const JOB_STATUSES: readonly ReportStatus[] = [...IN_FLIGHT_STATUSES, 'failed'];

/**
 * One row of the job list.
 *
 * `failure` is the first warning and not the array. The pipeline writes the
 * reason it gave up as a single-element list, and the retry policy judges that
 * one entry (`isPermanentFailure`); a row holding the rest would be holding
 * text nothing on this screen reads.
 */
export interface JobRow {
  reportId: string;
  ownerId: string;
  status: ReportStatus;
  /** When the file arrived. Every report has one — `firestore.rules` requires it on create. */
  uploadedAt: Timestamp | null;
  /** When the current attempt was claimed. Absent on a report that predates the field. */
  startedAt: Timestamp | null;
  /** Retries spent, on top of the automatic first run. */
  attempts: number;
  lastRetryAt: Timestamp | null;
  failure: ReportWarning | null;
}

/** Reads a report document into a row, keeping only what the console shows. */
export function toJobRow(reportId: string, data: Record<string, unknown>): JobRow {
  const warnings = (data.warnings as ReportWarning[] | undefined) ?? [];

  return {
    reportId,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
    status: (data.status as ReportStatus) ?? 'uploaded',
    uploadedAt: (data.uploadedAt as Timestamp | undefined) ?? null,
    startedAt: (data.processingStartedAt as Timestamp | undefined) ?? null,
    attempts: Number(data.retryCount ?? 0),
    lastRetryAt: (data.lastRetryAt as Timestamp | undefined) ?? null,
    failure: warnings[0] ?? null,
  };
}

/**
 * What the row is doing right now.
 *
 * `stalled` is not a status any document carries: it is an in-flight report
 * whose attempt began longer ago than a run can possibly take. The trigger is
 * declared `retry: false` and times out at 540 seconds, so anything still in
 * flight past `staleAfterMinutes` has lost its worker and will never finish on
 * its own. Telling that apart from "slow" is the reason this screen exists.
 */
export type JobState = 'waiting' | 'running' | 'stalled' | 'failed';

export function jobState(job: JobRow, now: number = Date.now()): JobState {
  if (job.status === 'failed') return 'failed';
  if (isStalled(job, now)) return 'stalled';
  return job.status === 'processing' ? 'running' : 'waiting';
}

/** When the current attempt began: the claim stamp, or the upload it followed. */
export function jobStartedAtMs(job: JobRow): number | null {
  return job.startedAt?.toMillis?.() ?? job.uploadedAt?.toMillis?.() ?? null;
}

/**
 * How long this job has been in flight, or null when the question has no
 * answer — see the header note on failed runs.
 *
 * A report with no timestamp at all also answers null rather than zero. Those
 * predate `processingStartedAt`; treating them as having just started would
 * hide the oldest stuck jobs behind a duration of a few seconds.
 */
export function jobElapsedMs(job: JobRow, now: number = Date.now()): number | null {
  if (job.status === 'failed') return null;
  const startedAt = jobStartedAtMs(job);
  if (startedAt === null) return null;
  return Math.max(0, now - startedAt);
}

/**
 * An in-flight job past the point where its worker could still be alive.
 *
 * A missing start stamp counts as stalled, exactly as `retryDecision` treats
 * it server-side: an in-flight status with no timestamp is the stuck case this
 * screen is here to find, not a job to give the benefit of the doubt.
 */
export function isStalled(job: JobRow, now: number = Date.now()): boolean {
  if (!IN_FLIGHT_STATUSES.includes(job.status)) return false;
  const startedAt = jobStartedAtMs(job);
  return startedAt === null || now - startedAt >= STALE_PROCESSING_MS;
}

/**
 * Whether to offer the retry button for this job.
 *
 * The same policy the owner's own file list uses, over the same config, and
 * the server re-checks it before spending a single AI call. The console gets no
 * exemption: an admin pressing retry runs the identical pipeline at the
 * identical cost, so the identical budget applies (`functions/src/retry.ts`).
 */
export function canRetryJob(job: JobRow, now: number = Date.now()): boolean {
  return canRetryReport(
    {
      status: job.status,
      warnings: job.failure ? [job.failure] : [],
      retryCount: job.attempts,
      processingStartedAt: job.startedAt,
      uploadedAt: job.uploadedAt,
    },
    now,
  );
}

/**
 * Why the button is absent, when it is absent for a reason worth stating.
 *
 * Three of them, and they call for different actions from whoever is reading:
 * wait, look at the file, or stop retrying it. An empty cell would leave an
 * operator clicking a button that is not there.
 */
export type NoRetryReason = 'running' | 'permanent' | 'exhausted' | null;

export function noRetryReason(job: JobRow, now: number = Date.now()): NoRetryReason {
  if (canRetryJob(job, now)) return null;
  if (IN_FLIGHT_STATUSES.includes(job.status)) return 'running';
  if (job.attempts >= MAX_RETRIES) return 'exhausted';
  return 'permanent';
}

export type JobStateFilter = 'all' | 'inFlight' | 'stalled' | 'failed';

export interface JobFilters {
  query: string;
  state: JobStateFilter;
  /** Which page of the filtered list is on screen — see `adminUsers`. */
  page: number;
}

const STATE_FILTERS: readonly JobStateFilter[] = ['all', 'inFlight', 'stalled', 'failed'];

/**
 * Filters live in the address bar, as they do on every other list in this app.
 * "The stalled jobs" is then a link an operator can paste into the incident
 * they are already writing.
 */
export function readFilters(params: URLSearchParams): JobFilters {
  const state = params.get('state');

  return {
    query: params.get('q') ?? '',
    state: STATE_FILTERS.includes(state as JobStateFilter) ? (state as JobStateFilter) : 'all',
    page: readPage(params),
  };
}

export function filterParams(filters: JobFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('q', filters.query);
  if (filters.state !== 'all') params.set('state', filters.state);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

export function hasActiveFilters(filters: JobFilters): boolean {
  return filters.query.trim() !== '' || filters.state !== 'all';
}

/**
 * The jobs a set of filters selects.
 *
 * Search matches the report id, the owner uid and the failure code, and those
 * are the three strings an operator arrives holding: a Cloud Logging line names
 * the report, a support ticket names the account, and "how many jobs died on
 * extraction/rate-limited" is the question an outage asks.
 */
export function filterJobs(
  jobs: readonly JobRow[],
  filters: JobFilters,
  now: number = Date.now(),
): JobRow[] {
  const query = filters.query.trim().toLowerCase();

  return jobs.filter((job) => {
    const state = jobState(job, now);
    if (filters.state === 'failed' && state !== 'failed') return false;
    if (filters.state === 'stalled' && state !== 'stalled') return false;
    if (filters.state === 'inFlight' && state === 'failed') return false;
    if (!query) return true;

    return [job.reportId, job.ownerId, job.failure?.code ?? ''].some((field) =>
      field.toLowerCase().includes(query),
    );
  });
}

/**
 * Oldest attempt first.
 *
 * The opposite of every other list in this console, and deliberately: the
 * newest account is the interesting one, while the newest job is the one that
 * is probably fine. A queue is triaged from its oldest entry, which is the one
 * that has been failing or hanging the longest.
 */
export function sortJobs(jobs: readonly JobRow[]): JobRow[] {
  return [...jobs].sort((left, right) => {
    // A job with no timestamp sorts to the top rather than the bottom: it is
    // by definition one of the oldest documents in the collection, and it is
    // the shape `isStalled` already refuses to give the benefit of the doubt.
    const a = jobStartedAtMs(left) ?? 0;
    const b = jobStartedAtMs(right) ?? 0;
    return a - b;
  });
}

export interface JobCounts {
  all: number;
  inFlight: number;
  stalled: number;
  failed: number;
}

/**
 * How many jobs are in each state, for the filter chips.
 *
 * On the chips rather than in a row of cards above them, because the count and
 * the control that shows you those rows are one thing: "failed 3" that cannot
 * be clicked is a figure an operator then has to go and find.
 */
export function jobCounts(jobs: readonly JobRow[], now: number = Date.now()): JobCounts {
  const counts: JobCounts = { all: jobs.length, inFlight: 0, stalled: 0, failed: 0 };

  for (const job of jobs) {
    const state = jobState(job, now);
    if (state === 'failed') counts.failed += 1;
    else counts.inFlight += 1;
    // Stalled is a subset of in-flight, not a fourth bucket — the chip says
    // "of the jobs that are running, these have lost their worker".
    if (state === 'stalled') counts.stalled += 1;
  }

  return counts;
}

export interface DurationParts {
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * A span of milliseconds as whole units, for the sentence the page composes.
 *
 * Split here rather than formatted here: "4m 12s" reads differently in the two
 * languages this app is written in, and a domain module that returned a string
 * would be deciding word order on the translator's behalf.
 */
export function durationParts(ms: number): DurationParts {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
