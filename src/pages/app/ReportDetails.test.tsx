import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import type { Report } from '@/domain/types';
import type * as RouterModule from 'react-router-dom';
import type * as DetailsModule from '@/services/reportDetails';
import type * as ReportsListModule from '@/services/reportsList';
import type { ReportResult } from '@/services/reportDetails';
import { ReportDetails } from './ReportDetails';

const subscribeToReport = vi.hoisted(() => vi.fn());
const subscribeToResults = vi.hoisted(() => vi.fn());
const retryReport = vi.hoisted(() => vi.fn());

vi.mock('@/services/reportDetails', async (importOriginal) => {
  const actual = await importOriginal<typeof DetailsModule>();
  return { ...actual, subscribeToReport, subscribeToResults };
});
vi.mock('@/services/reportsList', async (importOriginal) => {
  // The real `retryErrorMessage` stays — deciding which server errors are fit
  // to show a user is behaviour, not plumbing.
  const actual = await importOriginal<typeof ReportsListModule>();
  return { ...actual, retryReport };
});
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return { ...actual, useParams: () => ({ reportId: 'r1' }) };
});

function stamp(iso: string) {
  const d = new Date(iso);
  return { toDate: () => d, toMillis: () => d.getTime() } as never;
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'r1',
    ownerId: 'test-uid',
    storagePath: 'users/test-uid/reports/r1/panel.pdf',
    originalFileName: 'labcorp_mar2026.pdf',
    fileSize: 2_516_582,
    contentHash: 'abc',
    status: 'processed',
    reportDate: stamp('2026-03-03T00:00:00Z'),
    laboratoryName: 'Labcorp',
    userLabel: null,
    pageCount: 4,
    resultCount: 3,
    outOfRangeCount: 1,
    warnings: [],
    uploadedAt: stamp('2026-03-05T00:00:00Z'),
    processedAt: stamp('2026-03-05T00:02:00Z'),
    supersededBy: null,
    version: 1,
    ...overrides,
  };
}

function makeResult(overrides: Partial<ReportResult> = {}): ReportResult {
  return {
    id: '000-hemoglobin',
    variableId: '000-hemoglobin',
    rawName: 'Hemoglobin',
    value: 13.9,
    rawValue: '13.9',
    unit: 'g/dL',
    referenceRange: { low: 12, high: 16, text: null, source: 'laboratory' },
    status: 'normal',
    confidence: 'high',
    sourcePage: null,
    observedAt: stamp('2026-03-03T00:00:00Z'),
    analysis: null,
    ...overrides,
  };
}

const emitReport = (r: Report | null) =>
  (subscribeToReport.mock.calls.at(-1)?.[1] as (v: Report | null) => void)(r);
const emitResults = (r: ReportResult[]) =>
  (subscribeToResults.mock.calls.at(-1)?.[1] as (v: ReportResult[]) => void)(r);

const render = () =>
  renderWithProviders(<ReportDetails />, { auth: signedInAuth(), route: '/reports/r1' });

describe('ReportDetails', () => {
  beforeEach(() => {
    subscribeToReport.mockReset().mockReturnValue(() => {});
    subscribeToResults.mockReset().mockReturnValue(() => {});
  });

  it('shows each value exactly as the laboratory printed it', async () => {
    render();
    emitReport(makeReport());
    emitResults([
      makeResult(),
      makeResult({
        id: '001-nitrites',
        rawName: 'Nitrites',
        value: null,
        rawValue: 'Negative',
        unit: null,
        referenceRange: { low: null, high: null, text: 'Negative', source: 'laboratory' },
      }),
    ]);

    // Reformatting a value would misreport what the report said, and this page
    // exists to be compared against the paper.
    expect(await screen.findByText('13.9')).toBeInTheDocument();
    // "Negative" is both this result's value and its reference range, so the
    // assertion is scoped to the value cell rather than the row.
    const nitritesRow = screen.getByRole('row', { name: /nitrites/i });
    const cells = within(nitritesRow).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Negative');
  });

  it('shows the range each result was reported with', async () => {
    render();
    emitReport(makeReport());
    emitResults([makeResult()]);
    expect(await screen.findByText('12–16')).toBeInTheDocument();
  });

  it('labels a general range as not lab-specific', async () => {
    render();
    emitReport(makeReport());
    emitResults([
      makeResult({ referenceRange: { low: 12, high: 16, text: null, source: 'general' } }),
    ]);
    expect(await screen.findByText(/not lab-specific/i)).toBeInTheDocument();
  });

  it('says when no range was available rather than leaving it blank', async () => {
    render();
    emitReport(makeReport());
    emitResults([
      makeResult({
        status: 'unknown',
        referenceRange: { low: null, high: null, text: null, source: 'unavailable' },
      }),
    ]);
    expect(await screen.findByText('Not stated')).toBeInTheDocument();
  });

  it('flags a low-confidence extraction', async () => {
    render();
    emitReport(makeReport());
    emitResults([makeResult({ confidence: 'low' })]);
    expect(await screen.findByText('Low confidence')).toBeInTheDocument();
  });

  it('puts the §46 notice up front when a result is critical', async () => {
    render();
    emitReport(makeReport());
    emitResults([makeResult({ id: '000-k', rawName: 'Potassium', status: 'critical' })]);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/may require prompt medical attention/i);
    expect(alert).toHaveTextContent(/contact your healthcare provider/i);
  });

  it('explains a partially processed report in the spec wording', async () => {
    render();
    emitReport(makeReport({ status: 'partially_processed' }));
    emitResults([makeResult()]);
    expect(
      await screen.findByText(/some values could not be reliably identified/i),
    ).toBeInTheDocument();
  });

  it('marks AI commentary as AI-generated and not medical advice', async () => {
    render();
    emitReport(makeReport());
    emitResults([
      makeResult({
        status: 'low',
        analysis: {
          text: 'This value is below the range on this report.',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          promptVersion: '1.0.0',
          contentUsedForTraining: true,
          generatedAt: '2026-03-05T00:02:00Z',
        },
      }),
    ]);

    // The distinction between what the lab printed and what a model wrote is
    // the one this product cannot afford to blur.
    expect(await screen.findByText(/AI-generated · not medical advice/i)).toBeInTheDocument();
    expect(screen.getByText(/gemini-2.5-flash · prompt 1.0.0/)).toBeInTheDocument();
  });

  it('carries the medical disclaimer', async () => {
    render();
    emitReport(makeReport());
    emitResults([makeResult()]);
    expect(await screen.findByLabelText(/medical disclaimer/i)).toBeInTheDocument();
  });

  it('distinguishes still-processing from nothing-extracted', async () => {
    render();
    emitReport(makeReport({ status: 'processing' }));
    emitResults([]);
    expect(await screen.findByText(/still processing/i)).toBeInTheDocument();
    expect(screen.getByText(/extraction is still running/i)).toBeInTheDocument();
  });

  it('explains a report that does not exist', async () => {
    render();
    emitReport(null);
    expect(await screen.findByText(/that report does not exist/i)).toBeInTheDocument();
  });

  it('surfaces why a failed report failed', async () => {
    render();
    emitReport(
      makeReport({
        status: 'failed',
        warnings: [{ code: 'extraction/no-text-layer', message: 'This looks like a scanned report.' }],
      }),
    );
    emitResults([]);
    expect(await screen.findByText(/looks like a scanned report/i)).toBeInTheDocument();
  });

  it('offers to reprocess a report that failed for a passing reason', async () => {
    const user = userEvent.setup();
    retryReport.mockResolvedValue(undefined);
    render();
    emitReport(
      makeReport({
        status: 'failed',
        warnings: [
          { code: 'consent/ai-processing-missing', message: 'You have not agreed to AI processing.' },
        ],
      }),
    );
    emitResults([]);

    await user.click(await screen.findByRole('button', { name: /try processing again/i }));
    expect(retryReport).toHaveBeenCalledWith('r1');
  });

  it('stops offering once the attempts are spent, and says so', async () => {
    render();
    emitReport(
      makeReport({
        status: 'failed',
        retryCount: 3,
        warnings: [{ code: 'extraction/timeout', message: 'The model timed out.' }],
      }),
    );
    emitResults([]);

    await screen.findByText(/model timed out/i);
    expect(screen.queryByRole('button', { name: /try processing again/i })).toBeNull();
    // A button that has quietly disappeared is a bug report; a sentence
    // explaining that the attempts are spent is an answer.
    expect(screen.getByText(/retried 3 times without success/i)).toBeInTheDocument();
  });

  it('offers a way out of a report stuck mid-processing', async () => {
    render();
    // Its worker died long ago. The trigger does not retry itself, so without
    // this the page says "still processing" for as long as anyone looks.
    emitReport(
      makeReport({
        status: 'processing',
        processingStartedAt: stamp('2026-03-05T00:00:00Z'),
      }),
    );
    emitResults([]);

    expect(await screen.findByRole('button', { name: /try processing again/i })).toBeInTheDocument();
  });

  it('leaves a report that is genuinely still working alone', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-03-05T00:01:00Z'));
    render();
    emitReport(
      makeReport({ status: 'processing', processingStartedAt: stamp('2026-03-05T00:00:00Z') }),
    );
    emitResults([]);

    await screen.findByText(/still processing/i);
    // A minute in is not stuck, and a retry here would kill a live run.
    expect(screen.queryByRole('button', { name: /try processing again/i })).toBeNull();
    now.mockRestore();
  });

  it('has no serious accessibility violations', async () => {
    const { container } = render();
    emitReport(makeReport());
    emitResults([makeResult(), makeResult({ id: '001-k', rawName: 'Potassium', status: 'high' })]);
    await screen.findByText('Hemoglobin');
    await expectNoA11yViolations(container);
  });
});
