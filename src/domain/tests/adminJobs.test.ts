import { describe, expect, it } from 'vitest';

import {
  canRetryJob,
  durationParts,
  filterJobs,
  filterParams,
  hasActiveFilters,
  isStalled,
  jobCounts,
  IN_FLIGHT_STATUSES,
  JOB_STATUSES,
  jobElapsedMs,
  jobState,
  noRetryReason,
  readFilters,
  sortJobs,
  toJobRow,
  MAX_RETRIES,
  STALE_PROCESSING_MS,
  type JobRow,
} from '../adminJobs';
import type { ReportStatus } from '../types';

const NOW = Date.UTC(2026, 7, 18, 12, 0, 0);
const ago = (ms: number) => stamp(NOW - ms);

function stamp(ms: number) {
  return { toMillis: () => ms, toDate: () => new Date(ms) } as never;
}

function makeJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    reportId: 'r1',
    ownerId: 'u1',
    status: 'processing',
    uploadedAt: ago(60_000),
    startedAt: ago(30_000),
    attempts: 0,
    lastRetryAt: null,
    failure: null,
    ...overrides,
  };
}

const MINUTES = 60_000;

describe('toJobRow', () => {
  it('keeps the identifiers and the timing, and nothing about the file', () => {
    const row = toJobRow('r9', {
      ownerId: 'u9',
      status: 'failed',
      originalFileName: 'march-hiv-panel.pdf',
      laboratoryName: 'Laboratorio Central',
      resultCount: 24,
      uploadedAt: ago(9 * MINUTES),
      processingStartedAt: ago(8 * MINUTES),
      retryCount: 2,
      warnings: [{ code: 'extraction/timeout', message: 'It timed out.' }],
    });

    expect(row).toEqual({
      reportId: 'r9',
      ownerId: 'u9',
      status: 'failed',
      uploadedAt: expect.anything(),
      startedAt: expect.anything(),
      attempts: 2,
      lastRetryAt: null,
      failure: { code: 'extraction/timeout', message: 'It timed out.' },
    });
    // The point of the row's shape, asserted rather than trusted: nothing on
    // this screen may carry a file name, a laboratory or a result count.
    expect(Object.keys(row)).not.toContain('originalFileName');
    expect(JSON.stringify(row)).not.toContain('hiv');
  });

  it('reads a document with none of the optional fields', () => {
    const row = toJobRow('r1', { ownerId: 'u1', status: 'uploaded' });

    expect(row.attempts).toBe(0);
    expect(row.startedAt).toBeNull();
    expect(row.failure).toBeNull();
  });

  it('keeps only the warning the pipeline stopped on', () => {
    const row = toJobRow('r1', {
      status: 'failed',
      warnings: [
        { code: 'extraction/rate-limited', message: 'first' },
        { code: 'extraction/unknown', message: 'second' },
      ],
    });

    expect(row.failure).toEqual({ code: 'extraction/rate-limited', message: 'first' });
  });
});

describe('jobState', () => {
  it('separates waiting from running', () => {
    expect(jobState(makeJob({ status: 'uploaded' }), NOW)).toBe('waiting');
    expect(jobState(makeJob({ status: 'queued' }), NOW)).toBe('waiting');
    expect(jobState(makeJob({ status: 'processing' }), NOW)).toBe('running');
  });

  it('calls an in-flight job stalled once no worker could still be alive', () => {
    const job = makeJob({ startedAt: ago(STALE_PROCESSING_MS + 1000) });
    expect(jobState(job, NOW)).toBe('stalled');
  });

  it('gives a job that is merely slow the benefit of the doubt', () => {
    const job = makeJob({ startedAt: ago(STALE_PROCESSING_MS - 1000) });
    expect(jobState(job, NOW)).toBe('running');
  });

  it('treats an in-flight job with no timestamp as stalled', () => {
    // Documents that predate `processingStartedAt`. An in-flight status with
    // no start time is precisely the stuck case this screen exists to find.
    const job = makeJob({ startedAt: null, uploadedAt: null });
    expect(isStalled(job, NOW)).toBe(true);
  });

  it('never calls a failed job stalled, however old', () => {
    const job = makeJob({ status: 'failed', startedAt: ago(30 * 24 * 3600_000) });
    expect(jobState(job, NOW)).toBe('failed');
    expect(isStalled(job, NOW)).toBe(false);
  });
});

describe('jobElapsedMs', () => {
  it('measures from the claim, falling back to the upload', () => {
    expect(jobElapsedMs(makeJob({ startedAt: ago(90_000) }), NOW)).toBe(90_000);
    expect(jobElapsedMs(makeJob({ startedAt: null, uploadedAt: ago(5000) }), NOW)).toBe(5000);
  });

  it('refuses to invent a duration for a run that failed', () => {
    // The pipeline stamps `processedAt` only on success, so a failed run has a
    // start and no end. Time-since-start would keep growing for a job that is
    // over — a figure that looks like a measurement and is not one.
    expect(jobElapsedMs(makeJob({ status: 'failed' }), NOW)).toBeNull();
  });

  it('answers null rather than zero when there is no timestamp at all', () => {
    expect(jobElapsedMs(makeJob({ startedAt: null, uploadedAt: null }), NOW)).toBeNull();
  });
});

describe('canRetryJob', () => {
  const failed = makeJob({
    status: 'failed',
    failure: { code: 'extraction/timeout', message: 'It timed out.' },
  });

  it('offers a retry for a failure a second attempt could survive', () => {
    expect(canRetryJob(failed, NOW)).toBe(true);
    expect(noRetryReason(failed, NOW)).toBeNull();
  });

  it('offers a retry for a job that has lost its worker', () => {
    const stalled = makeJob({ startedAt: ago(STALE_PROCESSING_MS + 1000) });
    expect(canRetryJob(stalled, NOW)).toBe(true);
  });

  it('says to wait while a run is still inside the time it can take', () => {
    const running = makeJob({ startedAt: ago(60_000) });
    expect(canRetryJob(running, NOW)).toBe(false);
    expect(noRetryReason(running, NOW)).toBe('running');
  });

  it('refuses a failure the same bytes would reproduce', () => {
    const scanned = makeJob({
      status: 'failed',
      failure: { code: 'extraction/no-text-layer', message: 'Scanned.' },
    });
    expect(canRetryJob(scanned, NOW)).toBe(false);
    expect(noRetryReason(scanned, NOW)).toBe('permanent');
  });

  it('stops at the attempt cap, which an admin does not get to raise', () => {
    const spent = makeJob({ ...failed, attempts: MAX_RETRIES });
    expect(canRetryJob(spent, NOW)).toBe(false);
    expect(noRetryReason(spent, NOW)).toBe('exhausted');
  });
});

describe('filterJobs', () => {
  const waiting = makeJob({ reportId: 'r-wait', status: 'uploaded', startedAt: ago(1000) });
  const running = makeJob({ reportId: 'r-run', startedAt: ago(2 * MINUTES) });
  const stalled = makeJob({ reportId: 'r-stall', startedAt: ago(STALE_PROCESSING_MS + 1000) });
  const failed = makeJob({
    reportId: 'r-fail',
    ownerId: 'u-other',
    status: 'failed',
    failure: { code: 'extraction/rate-limited', message: 'Rate limited.' },
  });
  const all = [waiting, running, stalled, failed];

  const filters = (over: Partial<Parameters<typeof filterJobs>[1]> = {}) => ({
    query: '',
    state: 'all' as const,
    page: 1,
    ...over,
  });

  it('selects by state, with stalled a subset of what is in flight', () => {
    expect(filterJobs(all, filters({ state: 'failed' }), NOW)).toEqual([failed]);
    expect(filterJobs(all, filters({ state: 'stalled' }), NOW)).toEqual([stalled]);
    expect(filterJobs(all, filters({ state: 'inFlight' }), NOW)).toEqual([
      waiting,
      running,
      stalled,
    ]);
  });

  it('searches the three identifiers an operator arrives holding', () => {
    expect(filterJobs(all, filters({ query: 'r-stall' }), NOW)).toEqual([stalled]);
    expect(filterJobs(all, filters({ query: 'u-other' }), NOW)).toEqual([failed]);
    expect(filterJobs(all, filters({ query: 'rate-limited' }), NOW)).toEqual([failed]);
  });

  it('counts each state, and counts a stalled job in both buckets it is in', () => {
    expect(jobCounts(all, NOW)).toEqual({ all: 4, inFlight: 3, stalled: 1, failed: 1 });
  });
});

describe('sortJobs', () => {
  it('puts the oldest attempt first — the queue is triaged from its head', () => {
    const newest = makeJob({ reportId: 'new', startedAt: ago(MINUTES) });
    const oldest = makeJob({ reportId: 'old', startedAt: ago(40 * MINUTES) });
    const middle = makeJob({ reportId: 'mid', startedAt: ago(10 * MINUTES) });

    expect(sortJobs([newest, oldest, middle]).map((job) => job.reportId)).toEqual([
      'old',
      'mid',
      'new',
    ]);
  });

  it('sorts a job with no timestamp to the top rather than the bottom', () => {
    const dateless = makeJob({ reportId: 'none', startedAt: null, uploadedAt: null });
    const dated = makeJob({ reportId: 'dated', startedAt: ago(MINUTES) });

    expect(sortJobs([dated, dateless])[0]?.reportId).toBe('none');
  });
});

describe('filters in the address bar', () => {
  it('round-trips, and ignores a state nothing knows about', () => {
    const params = filterParams({ query: 'r-1', state: 'stalled', page: 3 });
    expect(params.toString()).toBe('q=r-1&state=stalled&page=3');
    expect(readFilters(params)).toEqual({ query: 'r-1', state: 'stalled', page: 3 });

    expect(readFilters(new URLSearchParams('state=melted')).state).toBe('all');
    expect(readFilters(new URLSearchParams()).page).toBe(1);
  });

  it('leaves a defaulted filter out of the query string', () => {
    expect(filterParams({ query: '  ', state: 'all', page: 1 }).toString()).toBe('');
    expect(hasActiveFilters({ query: '  ', state: 'all', page: 1 })).toBe(false);
    expect(hasActiveFilters({ query: '', state: 'failed', page: 1 })).toBe(true);
  });
});

describe('durationParts', () => {
  it('splits into whole units, leaving the wording to the catalogs', () => {
    expect(durationParts(45_000)).toEqual({ hours: 0, minutes: 0, seconds: 45 });
    expect(durationParts(4 * MINUTES + 12_000)).toEqual({ hours: 0, minutes: 4, seconds: 12 });
    expect(durationParts(3 * 3600_000 + 7 * MINUTES)).toEqual({ hours: 3, minutes: 7, seconds: 0 });
  });

  it('never counts backwards', () => {
    expect(durationParts(-5000)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('the statuses this screen queries for', () => {
  it('is every unfinished status, and no finished one', () => {
    // The list the subscription passes to an `in` filter. A status added to
    // the pipeline and forgotten here is a class of job that never appears in
    // the console at all, which is the failure this screen cannot have.
    const settled: ReportStatus[] = ['processed', 'partially_processed'];

    expect([...JOB_STATUSES]).toEqual(['uploaded', 'queued', 'processing', 'failed']);
    expect([...IN_FLIGHT_STATUSES]).toEqual(['uploaded', 'queued', 'processing']);
    for (const status of settled) expect(JOB_STATUSES).not.toContain(status);
  });
});
