import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import type { Report, ReportStatus } from '@/domain/types';
import type * as ReportsListModule from '@/services/reportsList';
import { Reports } from './Reports';

const subscribeToReports = vi.hoisted(() => vi.fn());
const deleteReport = vi.hoisted(() => vi.fn());
const getReportDownloadUrl = vi.hoisted(() => vi.fn());

vi.mock('@/services/reportsList', async (importOriginal) => {
  // Keep the real formatters and predicates — those are behaviour under test.
  const actual = await importOriginal<typeof ReportsListModule>();
  return { ...actual, subscribeToReports, deleteReport, getReportDownloadUrl };
});

function stamp(iso: string) {
  const date = new Date(iso);
  return { toDate: () => date, toMillis: () => date.getTime() } as never;
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'r1',
    ownerId: 'test-uid',
    storagePath: 'users/test-uid/reports/r1/panel.pdf',
    originalFileName: 'quest-panel-2026-07-12.pdf',
    fileSize: 1_887_437,
    contentHash: 'abc',
    status: 'processed' as ReportStatus,
    reportDate: stamp('2026-07-12T00:00:00Z'),
    laboratoryName: 'Quest Diagnostics',
    userLabel: null,
    pageCount: 3,
    resultCount: 24,
    outOfRangeCount: 5,
    warnings: [],
    uploadedAt: stamp('2026-07-12T09:00:00Z'),
    processedAt: stamp('2026-07-12T09:02:00Z'),
    supersededBy: null,
    version: 1,
    ...overrides,
  };
}

/** Drives the subscription the page opened, as Firestore would. */
function emit(reports: Report[]) {
  const onChange = subscribeToReports.mock.calls.at(-1)?.[1] as (r: Report[]) => void;
  onChange(reports);
}

function renderPage() {
  return renderWithProviders(<Reports />, { auth: signedInAuth(), route: '/reports' });
}

describe('Reports', () => {
  beforeEach(() => {
    subscribeToReports.mockReset();
    subscribeToReports.mockReturnValue(() => {});
    deleteReport.mockReset();
    getReportDownloadUrl.mockReset();
  });

  it('subscribes for the signed-in user only', () => {
    renderPage();
    expect(subscribeToReports).toHaveBeenCalledWith(
      'test-uid',
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('shows a loading state before the first snapshot arrives', () => {
    renderPage();
    // Not an empty state — "you have no reports" is a claim we cannot yet make.
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByText(/no reports yet/i)).not.toBeInTheDocument();
  });

  it('shows the empty state once we know the list is genuinely empty', async () => {
    renderPage();
    emit([]);
    expect(await screen.findByText(/no reports yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /upload your first report/i })).toBeInTheDocument();
  });

  it('lists reports with their status, counts and provenance', async () => {
    renderPage();
    emit([makeReport()]);

    const row = (await screen.findByText('quest-panel-2026-07-12.pdf')).closest('tr')!;
    expect(within(row).getByText('Processed')).toBeInTheDocument();
    expect(within(row).getByText('24')).toBeInTheDocument();
    expect(within(row).getByText('5')).toBeInTheDocument();
    expect(within(row).getByText(/Quest Diagnostics · 3 pages/)).toBeInTheDocument();
  });

  it('summarises the collection in the header', async () => {
    renderPage();
    emit([makeReport(), makeReport({ id: 'r2', resultCount: 21 })]);
    expect(await screen.findByText('2 reports · 45 results')).toBeInTheDocument();
  });

  it('marks a row whose date came from the upload, not the laboratory', async () => {
    renderPage();
    emit([makeReport({ reportDate: null, status: 'processing' })]);
    // Showing the upload date unlabelled would imply the lab printed it.
    expect(await screen.findByText('upload date')).toBeInTheDocument();
  });

  it('surfaces the reason a report failed', async () => {
    renderPage();
    emit([
      makeReport({
        status: 'failed',
        warnings: [{ code: 'encrypted', message: 'Password-protected — upload an unprotected copy' }],
      }),
    ]);
    expect(await screen.findByText(/password-protected/i)).toBeInTheDocument();
  });

  it('filters by status, counting queued and uploaded as processing', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([
      makeReport({ id: 'a', originalFileName: 'done.pdf', status: 'processed' }),
      makeReport({ id: 'b', originalFileName: 'queued.pdf', status: 'queued' }),
    ]);

    await screen.findByText('done.pdf');
    await user.click(screen.getByRole('radio', { name: 'Processing' }));

    // A user reading "Processing" means "in flight"; queued is our word.
    expect(screen.getByText('queued.pdf')).toBeInTheDocument();
    expect(screen.queryByText('done.pdf')).not.toBeInTheDocument();
  });

  it('explains an empty filter differently from an empty account', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeReport({ status: 'processed' })]);

    await screen.findByText('quest-panel-2026-07-12.pdf');
    await user.click(screen.getByRole('radio', { name: 'Failed' }));

    expect(screen.getByText(/nothing matches this filter/i)).toBeInTheDocument();
    expect(screen.queryByText(/no reports yet/i)).not.toBeInTheDocument();
  });

  it('offers details only for reports that have results', async () => {
    renderPage();
    emit([
      makeReport({ id: 'a', originalFileName: 'done.pdf', status: 'processed' }),
      makeReport({ id: 'b', originalFileName: 'working.pdf', status: 'processing' }),
    ]);

    const doneRow = (await screen.findByText('done.pdf')).closest('tr')!;
    const workingRow = screen.getByText('working.pdf').closest('tr')!;

    expect(within(doneRow).getByRole('link', { name: /view details/i })).toHaveAttribute(
      'href',
      '/reports/a',
    );
    expect(within(workingRow).queryByRole('link', { name: /view details/i })).toBeNull();
  });

  it('confirms before deleting, and says what will be lost', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeReport()]);

    await user.click(await screen.findByRole('button', { name: /delete/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/disappear from your trends/i)).toBeInTheDocument();
    // Deleting health data must never be a single misclick.
    expect(deleteReport).not.toHaveBeenCalled();
  });

  it('deletes only after confirmation and reports the space freed', async () => {
    const user = userEvent.setup();
    deleteReport.mockResolvedValue(undefined);
    renderPage();
    emit([makeReport()]);

    await user.click(await screen.findByRole('button', { name: /delete/i }));
    await user.click(screen.getByRole('button', { name: /delete permanently/i }));

    await waitFor(() =>
      expect(deleteReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' })),
    );
    expect(await screen.findByText(/1\.8 MB of your storage freed/i)).toBeInTheDocument();
  });

  it('keeps the report when the user backs out', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeReport()]);

    await user.click(await screen.findByRole('button', { name: /delete/i }));
    await user.click(screen.getByRole('button', { name: /keep it/i }));

    expect(deleteReport).not.toHaveBeenCalled();
  });

  it('tells the user when a delete fails rather than pretending it worked', async () => {
    const user = userEvent.setup();
    deleteReport.mockRejectedValue(new Error('network'));
    renderPage();
    emit([makeReport()]);

    await user.click(await screen.findByRole('button', { name: /delete/i }));
    await user.click(screen.getByRole('button', { name: /delete permanently/i }));

    expect(await screen.findByText(/could not be deleted/i)).toBeInTheDocument();
  });

  it('reports a subscription failure instead of showing an empty list', async () => {
    renderPage();
    const onError = subscribeToReports.mock.calls.at(-1)?.[2] as (e: Error) => void;
    onError(new Error('permission-denied'));

    // An error rendered as "no reports" would read as data loss.
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your reports/i);
  });

  it('has no serious accessibility violations', async () => {
    const { container } = renderPage();
    emit([makeReport(), makeReport({ id: 'r2', originalFileName: 'scan0043.pdf', status: 'failed' })]);
    await screen.findByText('quest-panel-2026-07-12.pdf');
    await expectNoA11yViolations(container);
  });
});
