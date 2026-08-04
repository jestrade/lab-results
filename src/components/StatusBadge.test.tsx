import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RESULT_STATUS } from '@/domain/status';
import type { ResultStatus } from '@/domain/types';
import { ConfidenceTag, ReportStatusBadge, ResultStatusBadge } from './StatusBadge';

const ALL_STATUSES = Object.keys(RESULT_STATUS) as ResultStatus[];

describe('ResultStatusBadge', () => {
  it.each(ALL_STATUSES)('renders "%s" with a visible text label, not colour alone', (status) => {
    render(<ResultStatusBadge status={status} />);
    // The label being present in the accessible text is the whole requirement:
    // strip the colour and the pill still says what it means.
    expect(screen.getByText(RESULT_STATUS[status].label)).toBeInTheDocument();
  });

  it('marks the icon decorative so it is not announced twice', () => {
    const { container } = render(<ResultStatusBadge status="critical" />);
    const icon = container.querySelector('i');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes the status to CSS without encoding meaning in the class name', () => {
    const { container } = render(<ResultStatusBadge status="high" />);
    expect(container.querySelector('.status-pill')).toHaveAttribute('data-status', 'high');
  });

  it('adds the longer explanation for screen readers when asked to describe', () => {
    render(<ResultStatusBadge status="critical" describe />);
    expect(screen.getByText(/may require prompt medical attention/i)).toBeInTheDocument();
  });
});

describe('ReportStatusBadge', () => {
  it('names partial processing explicitly rather than calling it done', () => {
    render(<ReportStatusBadge status="partially_processed" />);
    expect(screen.getByText('Partially processed')).toBeInTheDocument();
  });
});

describe('ConfidenceTag', () => {
  it('flags a low-confidence extraction', () => {
    render(<ConfidenceTag confidence="low" />);
    expect(screen.getByText('Low confidence')).toBeInTheDocument();
  });

  it('stays silent for high confidence, which is the expected case', () => {
    const { container } = render(<ConfidenceTag confidence="high" />);
    expect(container).toBeEmptyDOMElement();
  });
});
