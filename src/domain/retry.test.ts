import { describe, expect, it } from 'vitest';

import { MAX_RETRIES, STALE_PROCESSING_MS, canRetryReport, isPermanentFailure } from './retry';
import type { Report, ReportStatus, ReportWarning } from './types';

/**
 * This module decides whether the user is shown a way out of a failed report.
 * Getting it wrong in one direction offers a button that the server refuses;
 * in the other it strands a report with no recourse but a second upload, which
 * costs the user an operation from their monthly allowance.
 */

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);

function stamp(ms: number) {
  return { toMillis: () => ms, toDate: () => new Date(ms) } as never;
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'r1',
    ownerId: 'u1',
    storagePath: 'users/u1/reports/r1/panel.pdf',
    originalFileName: 'panel.pdf',
    fileSize: 1000,
    contentHash: 'abc',
    status: 'failed' as ReportStatus,
    reportDate: null,
    laboratoryName: null,
    userLabel: null,
    pageCount: null,
    resultCount: null,
    outOfRangeCount: null,
    warnings: [],
    uploadedAt: stamp(NOW - 60_000),
    processedAt: null,
    supersededBy: null,
    version: 1,
    ...overrides,
  };
}

const warning = (code: string): ReportWarning => ({ code, message: 'x' });

describe('isPermanentFailure', () => {
  it('is true where a second reading of the same file cannot help', () => {
    expect(isPermanentFailure([warning('extraction/no-text-layer')])).toBe(true);
    expect(isPermanentFailure([warning('extraction/unreadable')])).toBe(true);
    expect(isPermanentFailure([warning('quota/per-user-storage')])).toBe(true);
  });

  it('is false for a missing consent, which the user can go and give', () => {
    expect(isPermanentFailure([warning('consent/ai-processing-missing')])).toBe(false);
  });

  it('is false for a provider that was merely having a bad minute', () => {
    expect(isPermanentFailure([warning('extraction/rate-limited')])).toBe(false);
    expect(isPermanentFailure([])).toBe(false);
  });
});

describe('canRetryReport', () => {
  it('offers a retry for a transient failure', () => {
    expect(canRetryReport(makeReport({ warnings: [warning('extraction/timeout')] }), NOW)).toBe(
      true,
    );
  });

  it('offers a retry once consent has been given', () => {
    const report = makeReport({ warnings: [warning('consent/ai-processing-missing')] });
    expect(canRetryReport(report, NOW)).toBe(true);
  });

  it('does not offer one where the file itself is the problem', () => {
    const report = makeReport({ warnings: [warning('extraction/no-text-layer')] });
    expect(canRetryReport(report, NOW)).toBe(false);
  });

  it('leaves a working run alone', () => {
    const report = makeReport({
      status: 'processing',
      processingStartedAt: stamp(NOW - STALE_PROCESSING_MS + 1000),
    });
    expect(canRetryReport(report, NOW)).toBe(false);
  });

  it('offers a retry for a run whose worker is long gone', () => {
    const report = makeReport({
      status: 'processing',
      processingStartedAt: stamp(NOW - STALE_PROCESSING_MS),
    });
    expect(canRetryReport(report, NOW)).toBe(true);
  });

  it('falls back to the upload time for a report never picked up', () => {
    // The finalize trigger can fire before the browser writes the report
    // record, and nothing retries it — this is the only way out of that.
    const fresh = makeReport({ status: 'uploaded', uploadedAt: stamp(NOW - 5_000) });
    expect(canRetryReport(fresh, NOW)).toBe(false);

    const stranded = makeReport({
      status: 'uploaded',
      uploadedAt: stamp(NOW - STALE_PROCESSING_MS),
    });
    expect(canRetryReport(stranded, NOW)).toBe(true);
  });

  it('never offers one for a report that worked', () => {
    expect(canRetryReport(makeReport({ status: 'processed' }), NOW)).toBe(false);
    // Partially processed is deliberately excluded: retrying would delete
    // results the user can already read, for a re-read that may do worse.
    expect(canRetryReport(makeReport({ status: 'partially_processed' }), NOW)).toBe(false);
  });

  it('stops at the attempt cap', () => {
    const nearly = makeReport({ retryCount: MAX_RETRIES - 1 });
    expect(canRetryReport(nearly, NOW)).toBe(true);
    expect(canRetryReport(makeReport({ retryCount: MAX_RETRIES }), NOW)).toBe(false);
  });
});
