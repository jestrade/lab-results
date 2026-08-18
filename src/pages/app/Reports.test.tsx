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
const retryReport = vi.hoisted(() => vi.fn());
const deleteReports = vi.hoisted(() => vi.fn());

vi.mock('@/services/reportsList', async (importOriginal) => {
  // Keep the real formatters and predicates — those are behaviour under test.
  const actual = await importOriginal<typeof ReportsListModule>();
  return {
    ...actual,
    subscribeToReports,
    deleteReport,
    deleteReports,
    getReportDownloadUrl,
    retryReport,
  };
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
  return renderWithProviders(<Reports />, { auth: signedInAuth(), route: '/files' });
}

describe('Reports', () => {
  beforeEach(() => {
    subscribeToReports.mockReset();
    subscribeToReports.mockReturnValue(() => {});
    deleteReport.mockReset();
    getReportDownloadUrl.mockReset();
    retryReport.mockReset();
    deleteReports.mockReset();
  });

  it('is titled "Files", matching the /files route and the sidebar', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Files');
  });

  it('is titled "Archivos" in Spanish', () => {
    renderWithProviders(<Reports />, {
      auth: signedInAuth(),
      route: '/files',
      locale: 'es',
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Archivos');
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
      '/files/a',
    );
    expect(within(workingRow).queryByRole('link', { name: /view details/i })).toBeNull();
  });

  it('offers a retry only where a second attempt could work', async () => {
    renderPage();
    emit([
      makeReport({
        id: 'a',
        originalFileName: 'timeout.pdf',
        status: 'failed',
        warnings: [{ code: 'extraction/timeout', message: 'The model timed out.' }],
      }),
      makeReport({
        id: 'b',
        originalFileName: 'scan.pdf',
        status: 'failed',
        warnings: [{ code: 'extraction/no-text-layer', message: 'This looks like a scan.' }],
      }),
      makeReport({ id: 'c', originalFileName: 'done.pdf', status: 'processed' }),
    ]);

    const transient = (await screen.findByText('timeout.pdf')).closest('tr')!;
    expect(within(transient).getByRole('button', { name: /retry processing/i })).toBeInTheDocument();

    // Re-reading a scan produces the same scan; offering a button that cannot
    // help is worse than not offering one.
    const scanned = screen.getByText('scan.pdf').closest('tr')!;
    expect(within(scanned).queryByRole('button', { name: /retry processing/i })).toBeNull();

    const done = screen.getByText('done.pdf').closest('tr')!;
    expect(within(done).queryByRole('button', { name: /retry processing/i })).toBeNull();
  });

  it('reprocesses the stored file rather than asking for another upload', async () => {
    const user = userEvent.setup();
    retryReport.mockResolvedValue('processed');
    renderPage();
    emit([
      makeReport({
        status: 'failed',
        warnings: [{ code: 'consent/ai-processing-missing', message: 'You have not agreed.' }],
      }),
    ]);

    await user.click(await screen.findByRole('button', { name: /retry processing/i }));

    await waitFor(() => expect(retryReport).toHaveBeenCalledWith('r1'));
    expect(await screen.findByText(/processing finished/i)).toBeInTheDocument();
  });

  it('does not call a second failure a success', async () => {
    const user = userEvent.setup();
    retryReport.mockResolvedValue('failed');
    renderPage();
    emit([
      makeReport({
        status: 'failed',
        warnings: [{ code: 'extraction/timeout', message: 'The model timed out.' }],
      }),
    ]);

    await user.click(await screen.findByRole('button', { name: /retry processing/i }));

    expect(await screen.findByText(/could not be processed this time either/i)).toBeInTheDocument();
  });

  it('shows the server’s reason when it refuses to retry', async () => {
    const user = userEvent.setup();
    retryReport.mockRejectedValue({
      code: 'functions/resource-exhausted',
      message: 'This report has already been retried 3 times.',
    });
    renderPage();
    emit([
      makeReport({
        status: 'failed',
        warnings: [{ code: 'extraction/timeout', message: 'The model timed out.' }],
      }),
    ]);

    await user.click(await screen.findByRole('button', { name: /retry processing/i }));

    // The server phrased that sentence for the user; passing it through beats
    // replacing it with a generic failure.
    expect(await screen.findByText(/already been retried 3 times/i)).toBeInTheDocument();
  });

  it('marks a possible duplicate in words, not by colour alone (KAN-28)', async () => {
    renderPage();
    emit([
      makeReport({ duplicateOf: 'r9' }),
      makeReport({ id: 'r2', originalFileName: 'thyroid.pdf' }),
    ]);

    // One tag, on the flagged row only — and that row is still listed like any
    // other. Nothing is hidden or removed on a suspicion (spec §40.2).
    expect(await screen.findByText(/possible duplicate/i)).toBeInTheDocument();
    expect(screen.getAllByText(/possible duplicate/i)).toHaveLength(1);
    expect(screen.getByText('thyroid.pdf')).toBeInTheDocument();
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

  // ── Selecting several reports (KAN-43) ──────────────────────────────

  /** Ticks the checkbox belonging to a named report. */
  async function select(user: ReturnType<typeof userEvent.setup>, file: string) {
    await user.click(await screen.findByRole('checkbox', { name: `Select ${file}` }));
  }

  const second = makeReport({
    id: 'r2',
    originalFileName: 'scan0043.pdf',
    storagePath: 'users/test-uid/reports/r2/scan0043.pdf',
    fileSize: 500_000,
    reportDate: stamp('2026-03-02T00:00:00Z'),
  });

  it('offers no bulk action until something is selected', async () => {
    renderPage();
    emit([makeReport(), second]);

    await screen.findByText('quest-panel-2026-07-12.pdf');
    expect(screen.queryByRole('button', { name: /delete selected/i })).not.toBeInTheDocument();
  });

  it('counts what is selected, and the space it would free', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeReport(), second]);

    await select(user, 'quest-panel-2026-07-12.pdf');
    expect(await screen.findByText(/1 report selected/)).toBeInTheDocument();

    await select(user, 'scan0043.pdf');
    // 1,887,437 + 500,000 bytes, summed rather than counted.
    expect(await screen.findByText(/2 reports selected · 2\.3 MB/)).toBeInTheDocument();
  });

  it('selects and clears every row from the header checkbox', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeReport(), second]);

    const all = await screen.findByRole('checkbox', { name: /select every report shown/i });
    await user.click(all);
    expect(await screen.findByText(/2 reports selected/)).toBeInTheDocument();

    await user.click(all);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /delete selected/i })).not.toBeInTheDocument(),
    );
  });

  it('names every report in the confirmation rather than only counting them', async () => {
    // A count alone asks the reader to trust that their ticks landed where they
    // think they did. Deleting health records is not the place for that.
    const user = userEvent.setup();
    renderPage();
    emit([makeReport(), second]);

    await user.click(await screen.findByRole('checkbox', { name: /select every report shown/i }));
    await user.click(screen.getByRole('button', { name: /delete selected/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('quest-panel-2026-07-12.pdf')).toBeInTheDocument();
    expect(within(dialog).getByText('scan0043.pdf')).toBeInTheDocument();
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(deleteReports).not.toHaveBeenCalled();
  });

  it('deletes the selection only after confirmation', async () => {
    const user = userEvent.setup();
    const chosen = [makeReport(), second];
    deleteReports.mockResolvedValue({ deleted: chosen, failed: [] });
    renderPage();
    emit(chosen);

    await user.click(await screen.findByRole('checkbox', { name: /select every report shown/i }));
    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    await user.click(screen.getByRole('button', { name: /delete 2 permanently/i }));

    await waitFor(() => expect(deleteReports).toHaveBeenCalledTimes(1));
    expect(deleteReports.mock.calls[0]![0].map((report: Report) => report.id)).toEqual([
      'r1',
      'r2',
    ]);
    expect(await screen.findByText(/2 reports deleted/)).toBeInTheDocument();
  });

  it('does not call a partial delete a complete one', async () => {
    // Two services, no shared transaction: seven of nine is a real outcome,
    // and reporting it as success would be a lie about someone's records.
    const user = userEvent.setup();
    const chosen = [makeReport(), second];
    deleteReports.mockResolvedValue({ deleted: [chosen[0]!], failed: [chosen[1]!] });
    renderPage();
    emit(chosen);

    await user.click(await screen.findByRole('checkbox', { name: /select every report shown/i }));
    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    await user.click(screen.getByRole('button', { name: /delete 2 permanently/i }));

    expect(await screen.findByText(/1 report deleted/)).toBeInTheDocument();
    expect(await screen.findByText(/1 could not be deleted/)).toBeInTheDocument();
    // The survivor stays selected, so retrying is one click rather than a hunt.
    expect(await screen.findByText(/1 report selected/)).toBeInTheDocument();
  });

  it('never carries a selection past the filter it was made under', async () => {
    // The bar must not offer to delete a report the reader can no longer see.
    const user = userEvent.setup();
    renderPage();
    emit([makeReport(), makeReport({ id: 'r3', originalFileName: 'failed.pdf', status: 'failed' })]);

    await select(user, 'failed.pdf');
    expect(await screen.findByText(/1 report selected/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Processed' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /delete selected/i })).not.toBeInTheDocument(),
    );
  });

  it('drops selected reports that have gone away underneath the reader', async () => {
    // Another tab deletes one, or the pipeline removes it. A stale id would
    // let the bar promise to delete two and remove one.
    const user = userEvent.setup();
    renderPage();
    emit([makeReport(), second]);

    await user.click(await screen.findByRole('checkbox', { name: /select every report shown/i }));
    expect(await screen.findByText(/2 reports selected/)).toBeInTheDocument();

    emit([makeReport()]);
    expect(await screen.findByText(/1 report selected/)).toBeInTheDocument();
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
