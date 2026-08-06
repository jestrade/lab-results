import { describe, expect, it } from 'vitest';

import { MAX_REPORTS_SCANNED } from '@/domain/variableDetail';
import { readMeasurement, selectReports, type ReportDoc } from './variableHistory';

function stamp(iso: string) {
  const date = new Date(iso);
  return { toDate: () => date, toMillis: () => date.getTime() };
}

function reportDoc(overrides: Record<string, unknown> = {}, id = 'r1'): ReportDoc {
  return {
    id,
    data: {
      ownerId: 'u1',
      originalFileName: 'march.pdf',
      status: 'processed',
      reportDate: stamp('2026-03-01T00:00:00Z'),
      uploadedAt: stamp('2026-03-05T00:00:00Z'),
      laboratoryName: 'Labcorp',
      ...overrides,
    },
  };
}

const result = {
  variableId: 'glucose',
  rawName: 'Glucosa',
  value: 118,
  rawValue: '118',
  unit: 'mg/dL',
  referenceRange: { low: 70, high: 99, text: null, source: 'laboratory' },
  status: 'high',
  confidence: 'high',
  observedAt: stamp('2026-03-01T00:00:00Z'),
};

describe('selectReports', () => {
  it('skips reports that cannot hold results', () => {
    // A queued or failed report has no results subcollection. Querying it
    // anyway costs a read per report to learn nothing.
    const { scanned } = selectReports([
      reportDoc({ status: 'processed' }, 'a'),
      reportDoc({ status: 'partially_processed' }, 'b'),
      reportDoc({ status: 'failed' }, 'c'),
      reportDoc({ status: 'queued' }, 'd'),
      reportDoc({ status: 'uploaded' }, 'e'),
    ]);

    expect(scanned.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('reports nothing left behind when everything fitted', () => {
    expect(selectReports([reportDoc()]).truncated).toBe(false);
  });

  it('flags the history as partial when there were more reports than the ceiling', () => {
    // The extra document is fetched precisely so this can be known. Silently
    // dropping it would present a partial history as a complete one.
    const docs = Array.from({ length: MAX_REPORTS_SCANNED + 1 }, (_, index) =>
      reportDoc({}, `r${index}`),
    );
    const { scanned, truncated } = selectReports(docs);

    expect(scanned).toHaveLength(MAX_REPORTS_SCANNED);
    expect(truncated).toBe(true);
  });

  it('judges truncation by the fetch window, not by how many were readable', () => {
    // Fifty processed reports plus one failed one fills the window, so nothing
    // fetched was dropped — but a fifty-second report may exist that was never
    // asked for. "Partial" here means "there may be more", and claiming a
    // complete history on the strength of a full page would be a guess.
    const docs = [
      ...Array.from({ length: MAX_REPORTS_SCANNED }, (_, index) => reportDoc({}, `r${index}`)),
      reportDoc({ status: 'failed' }, 'failed'),
    ];
    const { scanned, truncated } = selectReports(docs);

    expect(scanned).toHaveLength(MAX_REPORTS_SCANNED);
    expect(truncated).toBe(true);
  });
});

describe('readMeasurement', () => {
  it('joins the value to the report that printed it', () => {
    const measurement = readMeasurement(reportDoc(), '000-glucose', result);

    expect(measurement).toMatchObject({
      // Result ids repeat across reports; the pair is what is unique.
      id: 'r1/000-glucose',
      reportId: 'r1',
      reportFileName: 'march.pdf',
      value: 118,
      status: 'high',
    });
    expect(measurement.observedAt.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('keeps a non-numeric result as the laboratory wrote it', () => {
    const measurement = readMeasurement(reportDoc(), '000-blood', {
      ...result,
      value: null,
      rawValue: 'Negative',
      unit: null,
    });

    expect(measurement.value).toBeNull();
    expect(measurement.rawValue).toBe('Negative');
  });

  it('falls back to the report date when the result carries no instant', () => {
    // Results written before the pipeline stored `observedAt` would otherwise
    // have no place on the time axis and could not be drawn at all.
    const { observedAt, ...withoutInstant } = result;
    expect(observedAt).toBeDefined();

    const measurement = readMeasurement(reportDoc(), '000-glucose', withoutInstant);
    expect(measurement.observedAt.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('falls back to the upload when the report has no date either', () => {
    const { observedAt, ...withoutInstant } = result;
    expect(observedAt).toBeDefined();

    const measurement = readMeasurement(
      reportDoc({ reportDate: null }),
      '000-glucose',
      withoutInstant,
    );

    expect(measurement.observedAt.toISOString()).toBe('2026-03-05T00:00:00.000Z');
  });

  it('never renders an unrecognised status as normal', () => {
    // `unknown` is a real, displayable state; treating a status we cannot read
    // as "normal" would be an assertion about someone's blood.
    const measurement = readMeasurement(reportDoc(), '000-glucose', {
      ...result,
      status: undefined,
    });

    expect(measurement.status).toBe('unknown');
  });
});
