import { describe, expect, it } from 'vitest';

import { CONFIDENCE, isOutOfRange, REPORT_STATUS, RESULT_STATUS, TREND } from './status';
import type { ReportStatus, ResultStatus } from './types';

/**
 * These tests enforce the rule that makes the status system accessible: every
 * status must carry a text label as well as an icon, so nothing depends on
 * colour or on the glyph alone (spec §60, KAN-25, KAN-53).
 */
describe('status presentation', () => {
  const tables = { RESULT_STATUS, REPORT_STATUS, TREND, CONFIDENCE };

  for (const [name, table] of Object.entries(tables)) {
    describe(name, () => {
      it('gives every status a non-empty text label', () => {
        for (const [key, presentation] of Object.entries(table)) {
          expect(presentation.label, `${name}.${key}`).toBeTruthy();
        }
      });

      it('gives every status an icon and a longer description', () => {
        for (const [key, presentation] of Object.entries(table)) {
          expect(presentation.icon, `${name}.${key}`).toMatch(/^ph-/);
          expect(presentation.description.length, `${name}.${key}`).toBeGreaterThan(10);
        }
      });
    });
  }

  it('covers every ResultStatus in the union', () => {
    const expected: ResultStatus[] = ['low', 'normal', 'high', 'critical', 'unknown'];
    expect(Object.keys(RESULT_STATUS).sort()).toEqual([...expected].sort());
  });

  it('covers every ReportStatus in the union', () => {
    const expected: ReportStatus[] = [
      'uploaded',
      'queued',
      'processing',
      'processed',
      'partially_processed',
      'failed',
    ];
    expect(Object.keys(REPORT_STATUS).sort()).toEqual([...expected].sort());
  });

  it('describes the trend without judging it', () => {
    // The spec forbids implying that a direction is good or bad.
    const forbidden = /\b(good|bad|better|worse|improv|deteriorat|healthy|concerning)/i;
    for (const presentation of Object.values(TREND)) {
      expect(presentation.label).not.toMatch(forbidden);
      expect(presentation.description).not.toMatch(forbidden);
    }
  });
});

describe('isOutOfRange', () => {
  it('treats low, high and critical as out of range', () => {
    expect(isOutOfRange('low')).toBe(true);
    expect(isOutOfRange('high')).toBe(true);
    expect(isOutOfRange('critical')).toBe(true);
  });

  it('does not count normal or unknown as out of range', () => {
    // `unknown` means "we could not classify it", which is not the same as
    // "it is outside the range" — counting it would inflate the out-of-range
    // metric on the dashboard with values nobody has assessed.
    expect(isOutOfRange('normal')).toBe(false);
    expect(isOutOfRange('unknown')).toBe(false);
  });
});
