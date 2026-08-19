import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type * as ReportsModule from '@/services/reports';
import type * as ReportsListModule from '@/services/reportsList';
import type { Report } from '@/domain/types';
import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import { Upload } from '../Upload';

const uploadReport = vi.hoisted(() => vi.fn());
const hashFile = vi.hoisted(() => vi.fn(async (_file: File) => 'hash-a'));
const fetchDuplicateCandidates = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
const quotaState = vi.hoisted(() => ({ value: null as unknown }));
const consentState = vi.hoisted(() => ({ value: null as unknown }));
const grantConsent = vi.hoisted(() => vi.fn());

// jsdom implements neither, and the preview dialog is built on both. Installed
// as mocks rather than as a polyfill so the revoke can be asserted: a blob URL
// that is never released holds the whole file for the life of the page.
const objectUrls = vi.hoisted(() => ({
  create: vi.fn(() => 'blob:preview-url'),
  revoke: vi.fn(),
}));

// Consent is a live Firestore subscription; stub at the hook so these tests
// stay about the page.
vi.mock('@/hooks/useAiConsent', () => ({
  useAiConsent: () => consentState.value,
}));

// The quota hook is a live Firestore subscription; stub it at the hook so the
// page's behaviour is what gets tested, not the SDK.
vi.mock('@/hooks/useStorageQuota', () => ({
  useStorageQuota: () => quotaState.value,
}));

vi.mock('@/services/reports', async (importOriginal) => {
  // Keep the real validation and formatting — those are the parts under test.
  const actual = await importOriginal<typeof ReportsModule>();
  return { ...actual, uploadReport, hashFile };
});

// The duplicate pre-check reads the user's existing reports (KAN-28). Stubbed
// at the service so these tests exercise the page, not Firestore; the matching
// itself is covered by src/domain/duplicates.test.ts.
vi.mock('@/services/reportsList', async (importOriginal) => {
  const actual = await importOriginal<typeof ReportsListModule>();
  return { ...actual, fetchDuplicateCandidates };
});

function drop(...files: File[]) {
  const zone = screen.getByRole('button', { name: /drag your laboratory pdfs/i })
    .parentElement as HTMLElement;
  fireEvent.drop(zone, { dataTransfer: { files, types: ['Files'] } });
}

/** Every row's own upload button — the page has no batch button (KAN-3). */
function startButtons() {
  return screen.queryAllByRole('button', { name: /^upload file — /i });
}

/**
 * Dates every staged file and presses each row's upload button — the steps a
 * real user now takes between choosing files and them being sent (KAN-3).
 *
 * A helper rather than repetition through twenty tests, because those tests
 * are about what happens *after* an upload starts. The tests that are about
 * the date field itself do these steps by hand.
 */
async function dateAndUpload(date = '2026-07-12') {
  const fields = screen.queryAllByLabelText(/date these tests were taken/i);
  for (const input of fields) {
    fireEvent.change(input, { target: { value: date } });
  }

  // Re-queried each time rather than pressed from one list: a pressed row
  // leaves `draft` and takes its button out of the document with it. Bounded
  // by the number of fields so a row that refuses its own date cannot spin
  // this into an endless loop.
  for (let pressed = 0; pressed < fields.length; pressed += 1) {
    const [next] = startButtons();
    if (!next) break;
    await act(async () => {
      fireEvent.click(next);
    });
  }
}

function stamp(iso: string) {
  const date = new Date(iso);
  return { toDate: () => date, toMillis: () => date.getTime() } as never;
}

function existingReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'r1',
    ownerId: 'test-uid',
    storagePath: 'users/test-uid/reports/r1/panel.pdf',
    originalFileName: 'panel.pdf',
    fileSize: 1_800_000,
    contentHash: 'hash-a',
    status: 'processed',
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

const MB = 1024 * 1024;
const PER_USER = 400 * MB;

function makeQuota(overrides: Record<string, unknown> = {}) {
  const usedBytes = (overrides.usedBytes as number | undefined) ?? 0;
  const uploadsUsed = (overrides.uploadsUsed as number | undefined) ?? 0;
  const remaining = Math.max(0, PER_USER - usedBytes);
  return {
    loading: false,
    usage: { storageBytes: usedBytes, uploadsThisMonth: uploadsUsed, uploadPeriod: '2026-08' },
    system: { storageBytes: 0, uploadsDisabled: false },
    storage: {
      usedBytes,
      limitBytes: PER_USER,
      remainingBytes: remaining,
      fraction: usedBytes / PER_USER,
      isWarning: usedBytes / PER_USER >= 0.8,
      isFull: remaining <= 0,
    },
    uploads: { used: uploadsUsed, limit: 400, remaining: Math.max(0, 400 - uploadsUsed) },
    systemStorage: {
      usedBytes: 0,
      limitBytes: 4 * 1024 * MB,
      remainingBytes: 4 * 1024 * MB,
      fraction: 0,
      isWarning: false,
      isFull: false,
    },
    uploadsDisabled: false,
    ...overrides,
  };
}

function makeConsent(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    granted: false,
    grant: grantConsent,
    saving: false,
    error: null,
    ...overrides,
  };
}

function pdf(name = 'panel.pdf', size = 1_800_000): File {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('Upload', () => {
  // Braces matter: an arrow that *returns* the mock would hand Vitest a
  // teardown hook, which it then calls after the test — invoking the mock with
  // no arguments.
  beforeEach(() => {
    uploadReport.mockReset();
    grantConsent.mockReset();
    hashFile.mockReset();
    hashFile.mockResolvedValue('hash-a');
    fetchDuplicateCandidates.mockReset();
    fetchDuplicateCandidates.mockResolvedValue([]);
    objectUrls.create.mockClear();
    objectUrls.revoke.mockClear();
    URL.createObjectURL = objectUrls.create;
    URL.revokeObjectURL = objectUrls.revoke;
    quotaState.value = makeQuota();
    // Granted by default: most tests are about upload behaviour, and the gate
    // has its own tests below.
    consentState.value = makeConsent({ granted: true });
  });

  it('uploads an accepted PDF for the signed-in user', async () => {
    uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

    renderWithProviders(<Upload />, { auth: signedInAuth() });
    drop(pdf());
    await dateAndUpload('2026-07-12');

    await waitFor(() => expect(uploadReport).toHaveBeenCalled());
    expect(uploadReport).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'test-uid' }));
    expect(await screen.findByText(/report stored/i)).toBeInTheDocument();
  });

  it('rejects a non-PDF without contacting Storage', async () => {
    renderWithProviders(<Upload />, { auth: signedInAuth() });
    drop(new File(['x'], 'results.docx', { type: 'application/msword' }));

    expect(await screen.findByText(/isn't a PDF/i)).toBeInTheDocument();
    expect(uploadReport).not.toHaveBeenCalled();
  });

  it('rejects an oversized file without contacting Storage', async () => {
    renderWithProviders(<Upload />, { auth: signedInAuth() });
    drop(pdf('huge.pdf', 26 * 1024 * 1024));

    expect(await screen.findByText(/over the 25 MB limit/i)).toBeInTheDocument();
    expect(uploadReport).not.toHaveBeenCalled();
  });

  it('blocks uploading until the email address is verified', () => {
    renderWithProviders(<Upload />, { auth: signedInAuth({ isEmailVerified: false }) });

    expect(screen.getByText(/verify your email before uploading/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /uploading is not available yet/i })).toBeDisabled();
  });

  it('reports a failed upload on its own row, and says nothing was stored', async () => {
    uploadReport.mockReturnValue({
      done: Promise.reject(new Error('network')),
      cancel: vi.fn(),
    });

    renderWithProviders(<Upload />, { auth: signedInAuth() });
    drop(pdf());
    await dateAndUpload();

    expect(await screen.findByText(/nothing was stored/i)).toBeInTheDocument();
    // A failure must not be reported as a success anywhere on the page.
    expect(screen.queryByText(/report stored/i)).not.toBeInTheDocument();
  });

  it('exposes upload progress as a labelled progressbar', async () => {
    let reportProgress: ((percent: number) => void) | undefined;
    uploadReport.mockImplementation(({ onProgress }: { onProgress: (n: number) => void }) => {
      reportProgress = onProgress;
      return { done: new Promise<string>(() => {}), cancel: vi.fn() };
    });

    renderWithProviders(<Upload />, { auth: signedInAuth() });
    drop(pdf());
    await dateAndUpload();

    await waitFor(() => expect(reportProgress).toBeDefined());
    // The SDK would call this from outside React; act() lets the resulting
    // state update flush before we assert on it.
    await act(async () => reportProgress!(62));

    const bar = await screen.findByRole('progressbar');
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '62'));
  });

  it('shows how much of the storage allowance is used', () => {
    quotaState.value = makeQuota({ usedBytes: 100 * MB });
    renderWithProviders(<Upload />, { auth: signedInAuth() });

    const meter = screen.getByRole('meter', { name: /storage used/i });
    expect(meter).toHaveAttribute('value', String(100 * MB));
    expect(meter).toHaveAttribute('max', String(PER_USER));
  });

  it('refuses an upload that would exceed the per-user quota, without contacting Storage', async () => {
    quotaState.value = makeQuota({ usedBytes: PER_USER - 1 * MB });
    renderWithProviders(<Upload />, { auth: signedInAuth() });

    drop(pdf('big.pdf', 5 * MB));

    expect(await screen.findByText(/delete a report you no longer need/i)).toBeInTheDocument();
    expect(uploadReport).not.toHaveBeenCalled();
  });

  it('disables the dropzone and explains why when storage is full', () => {
    quotaState.value = makeQuota({ usedBytes: PER_USER });
    renderWithProviders(<Upload />, { auth: signedInAuth() });

    expect(
      screen.getByRole('button', { name: /your storage is full/i }),
    ).toBeDisabled();
  });

  it('stops uploads when the service-wide kill switch is on', async () => {
    quotaState.value = makeQuota({ uploadsDisabled: true });
    renderWithProviders(<Upload />, { auth: signedInAuth() });

    expect(screen.getByText(/uploads are paused/i)).toBeInTheDocument();
    expect(uploadReport).not.toHaveBeenCalled();
  });

  it('refuses once the monthly upload allowance is spent', async () => {
    quotaState.value = makeQuota({ uploadsUsed: 400 });
    renderWithProviders(<Upload />, { auth: signedInAuth() });

    expect(
      screen.getByRole('button', { name: /used all your uploads for this month/i }),
    ).toBeDisabled();
  });

  it('warns before the allowance runs out, while there is still room to act', () => {
    quotaState.value = makeQuota({ usedBytes: 340 * MB });
    renderWithProviders(<Upload />, { auth: signedInAuth() });

    expect(screen.getByText(/running low on space/i)).toBeInTheDocument();
    // Still usable — a warning, not a block.
    expect(screen.getByRole('button', { name: /drag your laboratory pdfs/i })).toBeEnabled();
  });

  it('will not let a user upload before agreeing to AI processing', () => {
    // A Google sign-up never sees the registration form, so it arrives having
    // agreed to nothing about its report text going to a third-party model.
    consentState.value = makeConsent({ granted: false });
    renderWithProviders(<Upload />, { auth: signedInAuth() });

    expect(screen.getByText(/before your first upload/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /agree to ai processing before uploading/i }),
    ).toBeDisabled();
  });

  it('names the provider and does not oversell the redaction', () => {
    consentState.value = makeConsent({ granted: false });
    renderWithProviders(<Upload />, { auth: signedInAuth() });

    // Consent is only meaningful if it says what actually happens.
    expect(screen.getByText(/Google Gemini/)).toBeInTheDocument();
    expect(screen.getByText(/not full anonymisation/i)).toBeInTheDocument();
    expect(screen.getByText(/names written in the document are not reliably removable/i))
      .toBeInTheDocument();
    expect(screen.getByText(/used to improve their products/i)).toBeInTheDocument();
  });

  it('records consent when the user agrees', async () => {
    const user = userEvent.setup();
    consentState.value = makeConsent({ granted: false });
    renderWithProviders(<Upload />, { auth: signedInAuth() });

    await user.click(screen.getByRole('button', { name: /i understand and agree/i }));
    expect(grantConsent).toHaveBeenCalled();
  });

  it('hides the gate once consent is on record', () => {
    renderWithProviders(<Upload />, { auth: signedInAuth() });
    expect(screen.queryByText(/before your first upload/i)).not.toBeInTheDocument();
  });

  describe('the report date (KAN-3)', () => {
    it('sends nothing until the user presses upload', async () => {
      uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf());

      // The row is on the page, the file is not on its way. That gap is the
      // whole feature: it is where the date gets asked for.
      expect(await screen.findByText('panel.pdf')).toBeInTheDocument();
      expect(uploadReport).not.toHaveBeenCalled();
    });

    it('asks for the date of each chosen file', async () => {
      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('january.pdf'), pdf('february.pdf'));

      // Per file, not once for the batch: two reports dropped together are
      // routinely from two different days.
      expect(await screen.findAllByLabelText(/date these tests were taken/i)).toHaveLength(2);
    });

    it('refuses to upload a file with no date, and says so on its row', async () => {
      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf());

      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: /^upload file — panel\.pdf$/i }));
      });

      expect(screen.getByText(/choose the date these tests were taken/i)).toBeInTheDocument();
      expect(uploadReport).not.toHaveBeenCalled();
    });

    it('refuses a date that has not happened yet', async () => {
      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf());

      const field = await screen.findByLabelText(/date these tests were taken/i);
      fireEvent.change(field, { target: { value: '2999-01-01' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^upload file — panel\.pdf$/i }));
      });

      expect(screen.getByText(/has not happened yet/i)).toBeInTheDocument();
      expect(uploadReport).not.toHaveBeenCalled();
    });

    it('gives every staged file its own upload button', async () => {
      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('january.pdf'), pdf('february.pdf'));

      await screen.findAllByLabelText(/date these tests were taken/i);
      // Named per file, not "Upload 2 files": each button sends the one row it
      // sits on, and a screen reader has to be able to tell them apart.
      expect(startButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
        'Upload file — january.pdf',
        'Upload file — february.pdf',
      ]);
    });

    it('sends the dated file without waiting for the undated one', async () => {
      uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('january.pdf'), pdf('february.pdf'));

      const fields = await screen.findAllByLabelText(/date these tests were taken/i);
      fireEvent.change(fields[0]!, { target: { value: '2026-01-31' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^upload file — january\.pdf$/i }));
      });

      // One button, one file. The empty field on the other row is that row's
      // business, and holding January back for it would be the batch button's
      // behaviour under a different shape.
      await waitFor(() => expect(uploadReport).toHaveBeenCalledTimes(1));
      expect((uploadReport.mock.calls[0]![0] as { file: File }).file.name).toBe('january.pdf');
      expect(
        screen.getByRole('button', { name: /^upload file — february\.pdf$/i }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/choose the date these tests were taken/i)).not.toBeInTheDocument();
    });

    it('sends the declared date as UTC midnight of that day', async () => {
      uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf());
      await dateAndUpload('2026-06-01');

      await waitFor(() => expect(uploadReport).toHaveBeenCalled());
      // Not local midnight: a 1 June report has to stay 1 June for a reader
      // west of UTC, on the row and on every chart it feeds.
      const { reportDate } = uploadReport.mock.calls[0]![0] as { reportDate: Date };
      expect(reportDate.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    });

    it('keeps each file on its own date', async () => {
      uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('january.pdf'), pdf('february.pdf'));

      const fields = await screen.findAllByLabelText(/date these tests were taken/i);
      fireEvent.change(fields[0]!, { target: { value: '2026-01-31' } });
      fireEvent.change(fields[1]!, { target: { value: '2026-02-28' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^upload file — january\.pdf$/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^upload file — february\.pdf$/i }));
      });

      await waitFor(() => expect(uploadReport).toHaveBeenCalledTimes(2));
      const sent = uploadReport.mock.calls.map((call) => {
        const options = call[0] as { file: File; reportDate: Date };
        return [options.file.name, options.reportDate.toISOString().slice(0, 10)];
      });
      expect(sent).toEqual([
        ['january.pdf', '2026-01-31'],
        ['february.pdf', '2026-02-28'],
      ]);
    });

    it('does not ask for a date on a file it has already refused', async () => {
      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(new File(['x'], 'notes.docx', { type: 'application/msword' }));

      expect(await screen.findByText(/isn't a PDF/i)).toBeInTheDocument();
      // Nothing is going to be uploaded, so there is nothing to date.
      expect(screen.queryByLabelText(/date these tests were taken/i)).not.toBeInTheDocument();
      expect(startButtons()).toHaveLength(0);
    });
  });

  describe('reading the date off the report (KAN-3)', () => {
    it('frames the chosen PDF without sending it anywhere', async () => {
      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf());

      await act(async () => {
        fireEvent.click(
          await screen.findByRole('button', { name: /^preview the pdf of panel\.pdf$/i }),
        );
      });

      // The bytes are already in the page. Looking at the report to find the
      // date printed on it must not require uploading it first — that is the
      // order this page exists to reverse.
      expect(screen.getByTitle(/original pdf of panel\.pdf/i)).toHaveAttribute(
        'src',
        'blob:preview-url',
      );
      expect(uploadReport).not.toHaveBeenCalled();
    });

    it('releases the file when the dialog closes', async () => {
      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf());

      await act(async () => {
        fireEvent.click(
          await screen.findByRole('button', { name: /^preview the pdf of panel\.pdf$/i }),
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
      });

      // Unrevoked, the blob pins the file until the page is left — and this
      // page is built to be dropped nine reports at a time.
      expect(objectUrls.revoke).toHaveBeenCalledWith('blob:preview-url');
    });

    it('offers the preview on every staged row', async () => {
      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('january.pdf'), pdf('february.pdf'));

      await screen.findAllByLabelText(/date these tests were taken/i);
      expect(screen.queryAllByRole('button', { name: /^preview the pdf of /i })).toHaveLength(2);
    });

    it('does not offer a preview of a file it has already refused', async () => {
      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(new File(['x'], 'notes.docx', { type: 'application/msword' }));

      expect(await screen.findByText(/isn't a PDF/i)).toBeInTheDocument();
      // There is no PDF to frame, and the row is not going anywhere.
      expect(screen.queryAllByRole('button', { name: /^preview the pdf of /i })).toHaveLength(0);
    });
  });

  describe('several files at once', () => {
    it('queues every dropped file and uploads them one at a time', async () => {
      const finish: ((id: string) => void)[] = [];
      uploadReport.mockImplementation(() => ({
        done: new Promise<string>((resolve) => finish.push(resolve)),
        cancel: vi.fn(),
      }));

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('january.pdf'), pdf('february.pdf'), pdf('march.pdf'));
      await dateAndUpload();

      expect(await screen.findByText('january.pdf')).toBeInTheDocument();
      expect(screen.getByText('february.pdf')).toBeInTheDocument();
      expect(screen.getByText('march.pdf')).toBeInTheDocument();

      // One at a time: the quota pre-flight and the duplicate check both
      // reason about what is already in the account, and neither can do that
      // while three transfers race each other.
      await waitFor(() => expect(uploadReport).toHaveBeenCalledTimes(1));
      expect(await screen.findAllByText(/waiting its turn/i)).toHaveLength(2);

      await act(async () => finish[0]!('report-1'));
      await waitFor(() => expect(uploadReport).toHaveBeenCalledTimes(2));
    });

    it('reports the batch once every file has landed', async () => {
      uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('january.pdf'), pdf('february.pdf'));
      await dateAndUpload();

      expect(await screen.findByText(/2 reports stored/i)).toBeInTheDocument();
      expect(uploadReport).toHaveBeenCalledTimes(2);
    });

    it('refuses the file that breaks the allowance and keeps the ones that fit', async () => {
      // Checking each file against the *current* usage would clear both and
      // fail the second one only after a full transfer.
      quotaState.value = makeQuota({ usedBytes: 396 * MB });
      uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('fits.pdf', 3 * MB), pdf('does-not-fit.pdf', 3 * MB));

      expect(await screen.findByText(/delete a report you no longer need/i)).toBeInTheDocument();
      await dateAndUpload();
      await waitFor(() => expect(uploadReport).toHaveBeenCalledTimes(1));
      expect(uploadReport).toHaveBeenCalledWith(
        expect.objectContaining({ file: expect.objectContaining({ name: 'fits.pdf' }) }),
      );
    });

    it('keeps the good files when one of them is not a PDF', async () => {
      uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('panel.pdf'), new File(['x'], 'notes.docx', { type: 'application/msword' }));

      expect(await screen.findByText(/isn't a PDF/i)).toBeInTheDocument();
      await dateAndUpload();
      await waitFor(() => expect(uploadReport).toHaveBeenCalledTimes(1));
    });
  });

  describe('duplicate detection (KAN-28)', () => {
    it('asks before uploading a file that is already in the account', async () => {
      fetchDuplicateCandidates.mockResolvedValue([existingReport()]);
      uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('panel.pdf'));
      await dateAndUpload();

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(/may already exist/i);
      expect(dialog).toHaveTextContent(/continue uploading it/i);
      // Nothing is sent while the question is open — and nothing is ever
      // deleted or merged on the strength of a guess (spec §40.2).
      expect(uploadReport).not.toHaveBeenCalled();
    });

    it('uploads anyway when the user says to', async () => {
      const user = userEvent.setup();
      fetchDuplicateCandidates.mockResolvedValue([existingReport()]);
      uploadReport.mockReturnValue({ done: Promise.resolve('report-2'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('panel.pdf'));
      await dateAndUpload();

      await user.click(await screen.findByRole('button', { name: /upload it anyway/i }));

      // The second copy is created normally: the warning never blocks.
      await waitFor(() => expect(uploadReport).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(/report stored/i)).toBeInTheDocument();
    });

    it('skips the file when the user declines, and moves on to the next one', async () => {
      const user = userEvent.setup();
      // Only the first file is a duplicate; the second is a different report
      // with a different hash, name and size.
      hashFile.mockImplementation(async (file: File) =>
        file.name === 'panel.pdf' ? 'hash-a' : 'hash-b',
      );
      fetchDuplicateCandidates.mockImplementation(async () => [existingReport()]);
      uploadReport.mockReturnValue({ done: Promise.resolve('report-2'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('panel.pdf'), pdf('thyroid.pdf', 402_118));
      await dateAndUpload();

      await user.click(await screen.findByRole('button', { name: /do not upload it/i }));

      expect(
        await screen.findByText(/you chose to keep the copy you already have/i),
      ).toBeInTheDocument();
      // Declining one file must not abandon the rest of the batch.
      await waitFor(() => expect(uploadReport).toHaveBeenCalledTimes(1));
      expect(uploadReport).toHaveBeenCalledWith(
        expect.objectContaining({ file: expect.objectContaining({ name: 'thyroid.pdf' }) }),
      );
    });

    it('stays quiet for a report that is genuinely new', async () => {
      fetchDuplicateCandidates.mockResolvedValue([
        existingReport({ contentHash: 'hash-b', originalFileName: 'thyroid.pdf', fileSize: 9 }),
      ]);
      uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('panel.pdf'));
      await dateAndUpload();

      await waitFor(() => expect(uploadReport).toHaveBeenCalled());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('uploads rather than blocking when the check itself fails', async () => {
      // The check is a courtesy. A user whose report list will not load must
      // still be able to upload their results.
      fetchDuplicateCandidates.mockRejectedValue(new Error('offline'));
      uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('panel.pdf'));
      await dateAndUpload();

      await waitFor(() => expect(uploadReport).toHaveBeenCalled());
    });

    it('passes the hash it already computed to the upload', async () => {
      uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

      renderWithProviders(<Upload />, { auth: signedInAuth() });
      drop(pdf('panel.pdf'));
      await dateAndUpload();

      // Hashing a 25 MB PDF twice on the main thread would be pure repeated
      // work for the same string.
      await waitFor(() =>
        expect(uploadReport).toHaveBeenCalledWith(
          expect.objectContaining({ contentHash: 'hash-a' }),
        ),
      );
      expect(hashFile).toHaveBeenCalledTimes(1);
    });
  });

  it('has no serious accessibility violations', async () => {
    const { container } = renderWithProviders(<Upload />, { auth: signedInAuth() });
    await expectNoA11yViolations(container);
  });

  it('has no serious accessibility violations with a file waiting for its date', async () => {
    // The date field is a required control that appears after an interaction,
    // which is exactly the kind of thing that ships unlabelled.
    const { container } = renderWithProviders(<Upload />, { auth: signedInAuth() });
    drop(pdf());
    await screen.findByLabelText(/date these tests were taken/i);
    await expectNoA11yViolations(container);
  });
});
