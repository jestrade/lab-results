import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { act, fireEvent } from '@testing-library/react';

import type * as ReportsModule from '@/services/reports';
import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import { Upload } from './Upload';

const uploadReport = vi.hoisted(() => vi.fn());

vi.mock('@/services/reports', async (importOriginal) => {
  // Keep the real validation and formatting — those are the parts under test.
  const actual = await importOriginal<typeof ReportsModule>();
  return { ...actual, uploadReport };
});

function drop(file: File) {
  const zone = screen.getByRole('button', { name: /drag your laboratory pdf/i })
    .parentElement as HTMLElement;
  fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } });
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
  });

  it('uploads an accepted PDF for the signed-in user', async () => {
    uploadReport.mockReturnValue({ done: Promise.resolve('report-1'), cancel: vi.fn() });

    renderWithProviders(<Upload />, { auth: signedInAuth() });
    drop(pdf());

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

  it('reports a failed upload as failed, and says nothing was stored', async () => {
    uploadReport.mockReturnValue({
      done: Promise.reject(new Error('network')),
      cancel: vi.fn(),
    });

    renderWithProviders(<Upload />, { auth: signedInAuth() });
    drop(pdf());

    expect(await screen.findByText(/upload failed/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing was stored/i)).toBeInTheDocument();
  });

  it('exposes upload progress as a labelled progressbar', async () => {
    let reportProgress: ((percent: number) => void) | undefined;
    uploadReport.mockImplementation(({ onProgress }: { onProgress: (n: number) => void }) => {
      reportProgress = onProgress;
      return { done: new Promise<string>(() => {}), cancel: vi.fn() };
    });

    renderWithProviders(<Upload />, { auth: signedInAuth() });
    drop(pdf());

    await waitFor(() => expect(reportProgress).toBeDefined());
    // The SDK would call this from outside React; act() lets the resulting
    // state update flush before we assert on it.
    await act(async () => reportProgress!(62));

    const bar = await screen.findByRole('progressbar');
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '62'));
  });

  it('has no serious accessibility violations', async () => {
    const { container } = renderWithProviders(<Upload />, { auth: signedInAuth() });
    await expectNoA11yViolations(container);
  });
});
