import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { present, RESULT_STATUS } from '@/domain/status';
import type { ResultStatus } from '@/domain/types';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ConfidenceTag, ReportStatusBadge, ResultStatusBadge } from '../StatusBadge';

const ALL_STATUSES = Object.keys(RESULT_STATUS) as ResultStatus[];

describe('ResultStatusBadge', () => {
  it.each(ALL_STATUSES)('renders "%s" with a visible text label, not colour alone', (status) => {
    renderWithProviders(<ResultStatusBadge status={status} />);
    // The label being present in the accessible text is the whole requirement:
    // strip the colour and the pill still says what it means.
    expect(screen.getByText(present(RESULT_STATUS[status], 'en').label)).toBeInTheDocument();
  });

  it.each(ALL_STATUSES)('keeps the text label in Spanish for "%s"', (status) => {
    // The non-colour carrier has to survive translation. A status that falls
    // back to an English label is still readable; one that renders blank puts
    // the meaning back into the colour alone, which is the thing this
    // component exists to prevent.
    renderWithProviders(<ResultStatusBadge status={status} />, { locale: 'es' });
    expect(screen.getByText(present(RESULT_STATUS[status], 'es').label)).toBeInTheDocument();
  });

  it('marks the icon decorative so it is not announced twice', () => {
    const { container } = renderWithProviders(<ResultStatusBadge status="critical" />);
    const icon = container.querySelector('i');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes the status to CSS without encoding meaning in the class name', () => {
    const { container } = renderWithProviders(<ResultStatusBadge status="high" />);
    expect(container.querySelector('.status-pill')).toHaveAttribute('data-status', 'high');
  });

  it('adds the longer explanation for screen readers when asked to describe', () => {
    renderWithProviders(<ResultStatusBadge status="critical" describe />);
    expect(screen.getByText(/may require prompt medical attention/i)).toBeInTheDocument();
  });
});

describe('ReportStatusBadge', () => {
  it('names partial processing explicitly rather than calling it done', () => {
    renderWithProviders(<ReportStatusBadge status="partially_processed" />);
    expect(screen.getByText('Partially processed')).toBeInTheDocument();
  });

  it('does the same in Spanish', () => {
    renderWithProviders(<ReportStatusBadge status="partially_processed" />, { locale: 'es' });
    expect(screen.getByText('Procesado parcialmente')).toBeInTheDocument();
  });
});

describe('ConfidenceTag', () => {
  it('flags a low-confidence extraction', () => {
    renderWithProviders(<ConfidenceTag confidence="low" />);
    expect(screen.getByText('Low confidence')).toBeInTheDocument();
  });

  it('stays silent for high confidence, which is the expected case', () => {
    const { container } = renderWithProviders(<ConfidenceTag confidence="high" />);
    // Asserts the component rendered no pill, rather than that the container
    // is empty — the providers put their own live regions in it.
    expect(container.querySelector('.status-pill')).toBeNull();
  });
});
