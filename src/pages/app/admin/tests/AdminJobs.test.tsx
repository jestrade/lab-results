import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import { MAX_RETRIES, STALE_PROCESSING_MS, type JobRow } from '@/domain/adminJobs';
import type * as AdminJobsModule from '@/services/adminJobs';
import { AdminJobs } from '../AdminJobs';

const subscribeToJobs = vi.hoisted(() => vi.fn());
const retryJob = vi.hoisted(() => vi.fn(() => Promise.resolve('processed')));

vi.mock('@/services/adminJobs', async (importOriginal) => {
  const actual = await importOriginal<typeof AdminJobsModule>();
  return { ...actual, subscribeToJobs, retryJob };
});

const MINUTE = 60_000;

function stamp(msAgo: number) {
  const at = Date.now() - msAgo;
  return { toMillis: () => at, toDate: () => new Date(at) } as never;
}

function makeJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    reportId: 'report-1',
    ownerId: 'owner-1',
    status: 'processing',
    uploadedAt: stamp(2 * MINUTE),
    startedAt: stamp(2 * MINUTE),
    attempts: 0,
    lastRetryAt: null,
    failure: null,
    ...overrides,
  };
}

const stalled = makeJob({
  reportId: 'report-stalled',
  startedAt: stamp(STALE_PROCESSING_MS + MINUTE),
  uploadedAt: stamp(STALE_PROCESSING_MS + 2 * MINUTE),
});

const failed = makeJob({
  reportId: 'report-failed',
  ownerId: 'owner-2',
  status: 'failed',
  attempts: 1,
  failure: { code: 'extraction/rate-limited', message: 'Our AI provider was rate limited.' },
});

function emit(jobs: JobRow[]) {
  (subscribeToJobs.mock.calls.at(-1)?.[1] as (rows: JobRow[]) => void)(jobs);
}

function fail() {
  (subscribeToJobs.mock.calls.at(-1)?.[2] as (error: Error) => void)(new Error('denied'));
}

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderPage(route = '/admin/jobs') {
  return renderWithProviders(
    <>
      <AdminJobs />
      <Search />
    </>,
    { auth: signedInAuth({ role: 'admin', isAdmin: true }), route },
  );
}

/** The row for one report, found by the id the first cell carries. */
function rowFor(reportId: string) {
  return screen.getByText(reportId).closest('tr') as HTMLElement;
}

beforeEach(() => {
  subscribeToJobs.mockReset();
  subscribeToJobs.mockReturnValue(() => {});
  retryJob.mockClear();
  retryJob.mockResolvedValue('processed');
});

describe('AdminJobs', () => {
  it('lists jobs oldest attempt first, since that is where triage starts', async () => {
    const { container } = renderPage();
    emit([makeJob(), stalled, failed]);

    const rows = await screen.findAllByRole('row');
    // Header first, then the oldest attempt.
    expect(within(rows[1]!).getByText('report-stalled')).toBeInTheDocument();

    await expectNoA11yViolations(container);
  });

  it('tells a run that is merely slow apart from one that lost its worker', async () => {
    renderPage();
    emit([makeJob(), stalled]);

    await screen.findByText('report-1');
    expect(within(rowFor('report-1')).getByText('Running')).toBeInTheDocument();
    expect(within(rowFor('report-stalled')).getByText('Stalled')).toBeInTheDocument();

    // Said at the top as well, because nothing else in the system reports it:
    // the account holder is looking at a spinner, not an error.
    expect(
      screen.getByText('1 job has been running longer than a run can take.'),
    ).toBeInTheDocument();
  });

  it('shows how long an in-flight job has been running', async () => {
    renderPage();
    emit([makeJob({ startedAt: stamp(4 * MINUTE + 12_000) })]);

    await screen.findByText('report-1');
    // The seconds are not pinned: the clock moves between the stamp and the
    // render, and a test that demanded an exact second would fail on a slow
    // machine rather than on a broken figure.
    expect(within(rowFor('report-1')).getByText(/^4 min \d+ s$/)).toBeInTheDocument();
  });

  it('does not invent a duration for a run that failed', async () => {
    renderPage();
    emit([failed]);

    await screen.findByText('report-failed');
    // The pipeline records no finishing time for a failed run, so the cell
    // says so rather than showing the ever-growing time since it started.
    expect(within(rowFor('report-failed')).getByText('Not recorded')).toBeInTheDocument();
  });

  it('names the failure in the reader’s language, and keeps the code beside it', async () => {
    renderPage();
    emit([failed]);

    await screen.findByText('report-failed');
    const row = rowFor('report-failed');
    // The catalog's sentence, not the English one the pipeline stored on the
    // document — and the code as well, because that is what an operator greps
    // for when several jobs died the same way.
    expect(within(row).getByText(/over its request limit/i)).toBeInTheDocument();
    expect(within(row).getByText('extraction/rate-limited')).toBeInTheDocument();
    expect(within(row).queryByText(failed.failure!.message)).toBeNull();
  });

  it('shows no file name, laboratory or result anywhere on the screen', async () => {
    renderPage();
    emit([makeJob(), failed]);

    await screen.findByText('report-1');
    // The row type cannot carry them (see `JobRow`); this is the screen-level
    // statement of the same promise.
    expect(screen.queryByText(/\.pdf/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/mg\/dL/);
  });

  it('reprocesses a stranded job and reports what actually happened', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([failed]);

    await user.click(await screen.findByRole('button', { name: 'Reprocess report report-failed' }));

    expect(retryJob).toHaveBeenCalledWith('report-failed');
    expect(await screen.findByText('Report report-failed finished processing.')).toBeInTheDocument();
  });

  it('says so when the second attempt failed too, rather than announcing success', async () => {
    const user = userEvent.setup();
    retryJob.mockResolvedValue('failed');
    renderPage();
    emit([failed]);

    await user.click(await screen.findByRole('button', { name: 'Reprocess report report-failed' }));

    expect(await screen.findByText('Report report-failed failed again.')).toBeInTheDocument();
  });

  it('passes the server’s own refusal through to the operator', async () => {
    const user = userEvent.setup();
    retryJob.mockRejectedValue(
      Object.assign(new Error('This report was retried a moment ago. Give it a minute.'), {
        code: 'functions/resource-exhausted',
        message: 'This report was retried a moment ago. Give it a minute.',
      }),
    );
    renderPage();
    emit([failed]);

    await user.click(await screen.findByRole('button', { name: 'Reprocess report report-failed' }));

    expect(
      await screen.findByText('This report was retried a moment ago. Give it a minute.'),
    ).toBeInTheDocument();
  });

  it('offers no button where the server would refuse, and says why', async () => {
    renderPage();
    emit([
      makeJob(),
      makeJob({
        reportId: 'report-scanned',
        status: 'failed',
        failure: { code: 'extraction/no-text-layer', message: 'Scanned.' },
      }),
      makeJob({ reportId: 'report-spent', status: 'failed', attempts: MAX_RETRIES }),
    ]);

    await screen.findByText('report-1');
    expect(within(rowFor('report-1')).getByText(/within the time a run can take/i)).toBeInTheDocument();
    expect(
      within(rowFor('report-scanned')).getByText('A second reading would fail the same way.'),
    ).toBeInTheDocument();
    expect(
      within(rowFor('report-spent')).getByText(`Retried ${MAX_RETRIES} times without success.`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reprocess report report-spent/ })).toBeNull();
  });

  it('filters by state, and keeps the choice in the address bar', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeJob(), stalled, failed]);

    await user.click(await screen.findByRole('button', { name: /^Failed/ }));

    expect(screen.getByTestId('search').textContent).toBe('?state=failed');
    expect(screen.getByText('report-failed')).toBeInTheDocument();
    expect(screen.queryByText('report-stalled')).toBeNull();
  });

  it('reads the filter back out of the address bar', async () => {
    renderPage('/admin/jobs?state=stalled');
    emit([makeJob(), stalled, failed]);

    expect(await screen.findByText('report-stalled')).toBeInTheDocument();
    expect(screen.queryByText('report-1')).toBeNull();
  });

  it('searches the report id, the account and the failure code', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeJob(), failed]);

    await user.type(await screen.findByLabelText('Search jobs'), 'owner-2');

    await waitFor(() => expect(screen.queryByText('report-1')).toBeNull());
    expect(screen.getByText('report-failed')).toBeInTheDocument();
  });

  it('counts each state on the chip that filters to it', async () => {
    renderPage();
    emit([makeJob(), stalled, failed]);

    // Stalled is a subset of in-flight, not a fourth bucket.
    expect(await screen.findByRole('button', { name: 'All (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In flight (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stalled (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Failed (1)' })).toBeInTheDocument();
  });

  it('says the queue is empty rather than showing an empty table', async () => {
    renderPage();
    emit([]);

    expect(await screen.findByText('Nothing in the queue')).toBeInTheDocument();
  });

  it('reports a refused read instead of an empty queue', async () => {
    renderPage();
    fail();

    expect(
      await screen.findByText('The processing queue could not be loaded.'),
    ).toBeInTheDocument();
    // Not "nothing is stuck" — a refused query and a healthy queue are
    // different statements, and only one of them is good news.
    expect(screen.queryByText('Nothing in the queue')).toBeNull();
  });
});
