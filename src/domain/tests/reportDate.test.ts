import { describe, expect, it } from 'vitest';

import {
  checkReportDate,
  EARLIEST_REPORT_YEAR,
  localToday,
  parseReportDate,
  toIsoDate,
} from '../reportDate';

describe('parseReportDate', () => {
  it('reads a calendar day as UTC midnight', () => {
    const date = parseReportDate('2026-06-01')!;
    // The whole point: a report dated 1 June stays 1 June for a reader in
    // Lima, not 31 May.
    expect(date.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('refuses a day that does not exist', () => {
    // `Date.UTC` would roll this into 3 March without saying so.
    expect(parseReportDate('2026-02-31')).toBeNull();
  });

  it('refuses anything that is not an ISO day', () => {
    for (const value of ['', '12/07/2026', '2026-7-1', 'yesterday']) {
      expect(parseReportDate(value), value).toBeNull();
    }
  });

  it('round-trips through toIsoDate', () => {
    expect(toIsoDate(parseReportDate('1998-12-31')!)).toBe('1998-12-31');
  });
});

describe('localToday', () => {
  it('reads the wall calendar, not UTC', () => {
    // 22:30 on 19 August in a zone two hours ahead is still 19 August at
    // home even though UTC has not got there yet — and vice versa. Building
    // the Date from local parts is what this asserts.
    const now = new Date(2026, 7, 19, 22, 30);
    expect(localToday(now)).toBe('2026-08-19');
  });
});

describe('checkReportDate', () => {
  it('accepts a day in the past', () => {
    expect(checkReportDate('2026-07-12', '2026-08-19')).toBeNull();
  });

  it('accepts today', () => {
    // Blood drawn this morning is the common case, not an edge one.
    expect(checkReportDate('2026-08-19', '2026-08-19')).toBeNull();
  });

  it('names an empty value as missing, because the field is required', () => {
    expect(checkReportDate('', '2026-08-19')).toBe('required');
    expect(checkReportDate('   ', '2026-08-19')).toBe('required');
  });

  it('refuses a date after today', () => {
    expect(checkReportDate('2026-08-20', '2026-08-19')).toBe('future');
  });

  it('refuses a slipped keystroke rather than filing it in the year 202', () => {
    expect(checkReportDate('0202-07-14', '2026-08-19')).toBe('tooOld');
    expect(EARLIEST_REPORT_YEAR).toBe(1900);
  });

  it('reports a malformed value separately from a missing one', () => {
    expect(checkReportDate('2026-02-31', '2026-08-19')).toBe('malformed');
  });
});
