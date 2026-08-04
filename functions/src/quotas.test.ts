import { describe, expect, it } from 'vitest';

import { currentUploadPeriod, parseReportPath } from './quotas';

describe('parseReportPath', () => {
  it('extracts the owner and report from a metered path', () => {
    expect(parseReportPath('users/abc123/reports/rep_1/panel.pdf')).toEqual({
      userId: 'abc123',
      reportId: 'rep_1',
    });
  });

  it('ignores anything outside users/{uid}/reports/', () => {
    // Metering a path we do not own would corrupt a user's counter, so the
    // matcher is deliberately strict rather than forgiving.
    expect(parseReportPath('exports/abc123/data.zip')).toBeNull();
    expect(parseReportPath('users/abc123/avatar.png')).toBeNull();
    expect(parseReportPath('users/abc123/reports/rep_1/nested/panel.pdf')).toBeNull();
    expect(parseReportPath('users//reports/rep_1/panel.pdf')).toBeNull();
  });
});

describe('currentUploadPeriod', () => {
  it('formats as zero-padded UTC year-month', () => {
    expect(currentUploadPeriod(new Date('2026-08-04T12:00:00Z'))).toBe('2026-08');
    expect(currentUploadPeriod(new Date('2026-01-31T23:59:59Z'))).toBe('2026-01');
  });

  it('uses UTC, not local time', () => {
    // 31 Jan 23:00 UTC is already 1 Feb in Sydney. Keying on local time would
    // give a user a fresh monthly allowance simply for travelling.
    expect(currentUploadPeriod(new Date('2026-01-31T23:00:00Z'))).toBe('2026-01');
  });
});
