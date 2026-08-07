import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import type { LabVariable, VariableSeries } from '@/domain/types';
import type { VariableMeasurement } from '@/domain/variableDetail';
import type * as RouterModule from 'react-router-dom';
import type * as VariablesModule from '@/services/variables';
import type * as HistoryModule from '@/services/variableHistory';
import { VariableDetails } from './VariableDetails';

const subscribeToVariableSeriesEntry = vi.hoisted(() => vi.fn());
const fetchVariableCatalog = vi.hoisted(() => vi.fn(() => Promise.resolve(new Map())));
const fetchVariableHistory = vi.hoisted(() => vi.fn());

vi.mock('@/services/variables', async (importOriginal) => {
  const actual = await importOriginal<typeof VariablesModule>();
  return { ...actual, subscribeToVariableSeriesEntry, fetchVariableCatalog };
});
vi.mock('@/services/variableHistory', async (importOriginal) => {
  const actual = await importOriginal<typeof HistoryModule>();
  return { ...actual, fetchVariableHistory };
});
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return { ...actual, useParams: () => ({ variableId: 'glucose' }) };
});

function stamp(iso: string) {
  const date = new Date(iso);
  return { toDate: () => date, toMillis: () => date.getTime() } as never;
}

const series: VariableSeries = {
  variableId: 'glucose',
  canonicalName: 'Glucose',
  names: { en: 'Glucose', es: 'Glucosa' },
  aliases: ['Glucosa en ayunas'],
  category: 'glucose_metabolism',
  unit: 'mg/dL',
  latestValue: 118,
  latestRawValue: '118',
  latestStatus: 'high',
  latestObservedAt: stamp('2026-06-01T00:00:00Z'),
  referenceRange: { low: 70, high: 99, text: null, source: 'laboratory' },
  resultCount: 3,
  trend: 'increasing',
  points: [
    { value: 91, observedAt: stamp('2025-06-01T00:00:00Z') },
    { value: 104, observedAt: stamp('2026-01-15T00:00:00Z') },
    { value: 118, observedAt: stamp('2026-06-01T00:00:00Z') },
  ],
};

function measurement(overrides: Partial<VariableMeasurement> = {}): VariableMeasurement {
  return {
    id: 'r1/000-glucose',
    reportId: 'r1',
    reportFileName: 'june.pdf',
    reportDate: new Date('2026-06-01T00:00:00Z'),
    laboratoryName: 'Labcorp',
    observedAt: new Date('2026-06-01T00:00:00Z'),
    rawName: 'Glucosa',
    value: 118,
    rawValue: '118',
    unit: 'mg/dL',
    referenceRange: { low: 70, high: 99, text: null, source: 'laboratory' },
    status: 'high',
    confidence: 'high',
    analysis: null,
    ...overrides,
  };
}

/** Three measurements, rising, each on its own report. */
const history = [
  measurement({
    id: 'r3/000-glucose',
    reportId: 'r3',
    reportFileName: 'june-2025.pdf',
    observedAt: new Date('2025-06-01T00:00:00Z'),
    value: 91,
    rawValue: '91',
    status: 'normal',
  }),
  measurement({
    id: 'r2/000-glucose',
    reportId: 'r2',
    reportFileName: 'january.pdf',
    observedAt: new Date('2026-01-15T00:00:00Z'),
    value: 104,
    rawValue: '104',
  }),
  measurement(),
];

function renderPage() {
  return renderWithProviders(<VariableDetails />, {
    auth: signedInAuth(),
    route: '/variables/glucose',
  });
}

/** Pushes a series into the page's subscription, as Firestore would. */
function emit(next: VariableSeries | null) {
  act(() => {
    (
      subscribeToVariableSeriesEntry.mock.calls.at(-1)?.[2] as (
        value: VariableSeries | null,
      ) => void
    )(next);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  subscribeToVariableSeriesEntry.mockReturnValue(() => {});
  fetchVariableCatalog.mockResolvedValue(new Map());
  fetchVariableHistory.mockResolvedValue({
    measurements: history,
    reportsScanned: 3,
    truncated: false,
  });
});

describe('VariableDetails', () => {
  it('leads with the latest measured value, its status and its range', async () => {
    renderPage();
    emit(series);

    expect(await screen.findByRole('heading', { level: 1, name: 'Glucose' })).toBeInTheDocument();

    const hero = screen.getByRole('region', { name: 'Latest result' });
    expect(within(hero).getByText('118')).toBeInTheDocument();
    expect(within(hero).getByText('mg/dL')).toBeInTheDocument();
    // The range beside the value, because a value without one means nothing.
    expect(within(hero).getByText('70–99')).toBeInTheDocument();
    expect(within(hero).getByText(/Measured 1 June 2026/)).toBeInTheDocument();
  });

  it('summarises the change in words, not only as a chart', async () => {
    // The only form of the chart available to a screen reader, and the
    // fastest read on the page for everyone else (spec §60).
    renderPage();
    emit(series);

    const summary = await screen.findByText(/Latest Glucose: 118 mg\/dL/);
    expect(summary).toHaveTextContent('up from 104 mg/dL');
  });

  it('never dresses movement up as improvement or deterioration', async () => {
    renderPage();
    emit(series);

    await screen.findByText(/Latest Glucose/);
    expect(document.body.textContent).not.toMatch(/improv|worsen|better|healthier/i);
  });

  it('lists every measurement with the report it came from', async () => {
    renderPage();
    emit(series);

    const table = await screen.findByRole('table', {
      name: /Every measurement of Glucose/,
    });
    const rows = within(table).getAllByRole('row');
    // Three measurements plus the header row.
    expect(rows).toHaveLength(4);

    // Newest first, and each row links to the report that printed it.
    expect(within(rows[1]!).getByRole('link', { name: 'june.pdf' })).toHaveAttribute(
      'href',
      '/reports/r1',
    );
    expect(within(rows[3]!).getByRole('link', { name: 'june-2025.pdf' })).toHaveAttribute(
      'href',
      '/reports/r3',
    );
  });

  it('shows each measurement against its own report’s range, not the newest one', async () => {
    // A laboratory that changes its reference interval must not have its old
    // results re-judged by the new one — the table states what each report
    // actually said.
    fetchVariableHistory.mockResolvedValue({
      measurements: [
        measurement({
          id: 'r9/000-glucose',
          reportId: 'r9',
          observedAt: new Date('2024-01-01T00:00:00Z'),
          value: 100,
          rawValue: '100',
          status: 'normal',
          referenceRange: { low: 65, high: 110, text: null, source: 'laboratory' },
        }),
        measurement(),
      ],
      reportsScanned: 2,
      truncated: false,
    });

    renderPage();
    emit(series);

    const table = await screen.findByRole('table', { name: /Every measurement/ });
    expect(within(table).getByText('65–110')).toBeInTheDocument();
    expect(within(table).getByText('70–99')).toBeInTheDocument();
  });

  it('opens a point to reveal the report behind it', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(series);

    const points = await screen.findAllByRole('button', { name: /Glucose on/ });
    expect(points).toHaveLength(3);

    await user.click(points[2]!);

    // The measurement's own detail, and the way to the evidence for it.
    const tip = await screen.findByText('1 June 2026').then((node) => node.parentElement!);
    expect(within(tip).getByText('118')).toBeInTheDocument();
    expect(within(tip).getByRole('link', { name: /june\.pdf/ })).toHaveAttribute(
      'href',
      '/reports/r1',
    );
  });

  it('opens a point from the keyboard as well as the mouse', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(series);

    const points = await screen.findAllByRole('button', { name: /Glucose on/ });
    points[0]!.focus();
    await user.keyboard('{Enter}');

    const tip = await screen.findByText('1 June 2025').then((node) => node.parentElement!);
    expect(within(tip).getByRole('link', { name: /june-2025\.pdf/ })).toHaveAttribute(
      'href',
      '/reports/r3',
    );
  });

  it('names each point for a screen reader', async () => {
    renderPage();
    emit(series);

    const points = await screen.findAllByRole('button', { name: /Glucose on/ });
    // Date, value and status — the same three facts the sighted reader gets
    // from position, height and colour.
    expect(points[2]).toHaveAccessibleName(/Glucose on 1 June 2026: 118 mg\/dL, High/);
  });

  it('writes the newest value on the plot', async () => {
    renderPage();
    emit(series);

    await screen.findAllByRole('button', { name: /Glucose on/ });

    // Carried over from the chart on the deleted /trends page. Without it the
    // only numbers on the plot are the range bounds, and "where am I now" can
    // only be answered by hovering — which is no answer on a touchscreen.
    const svg = document.querySelector('.variable-chart svg')!;
    expect(svg.textContent).toContain('118 mg/dL');
  });

  it('says what the chart is measuring against, and what a direction is not', async () => {
    renderPage();
    emit(series);

    // The note that sat under the same charts on /trends. A page that shows a
    // direction badge has to say that a direction is movement, not a verdict.
    expect(await screen.findByText(/not a judgement about your health/i)).toBeInTheDocument();
  });

  it('narrows the period without losing the page', async () => {
    // Note the counts are compared as numbers: an assertion that fails while
    // holding SVG elements crashes the reporter trying to print them.
    const user = userEvent.setup();
    fetchVariableHistory.mockResolvedValue({
      measurements: [
        measurement({
          id: 'r9/000-glucose',
          reportId: 'r9',
          observedAt: new Date('2024-01-01T00:00:00Z'),
          value: 88,
          rawValue: '88',
          status: 'normal',
        }),
        ...history.slice(1),
      ],
      reportsScanned: 3,
      truncated: false,
    });

    renderPage();
    emit(series);

    await screen.findAllByRole('button', { name: /Glucose on/ });
    await user.click(screen.getByRole('button', { name: 'Last 12 months' }));

    // January 2024 is outside a twelve-month window ending June 2026; the
    // other two measurements stay, and so does the rest of the page.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Glucose on/ }).length).toBe(2),
    );
    expect(screen.getByRole('table', { name: /Every measurement/ })).toBeInTheDocument();
  });

  it('draws a single measurement without collapsing', async () => {
    // One point means a zero-width time window — the arithmetic that spreads
    // points across the axis divides by it.
    fetchVariableHistory.mockResolvedValue({
      measurements: [measurement()],
      reportsScanned: 1,
      truncated: false,
    });

    renderPage();
    emit(series);

    expect(await screen.findAllByRole('button', { name: /Glucose on/ })).toHaveLength(1);
    expect(screen.getByText(/first measurement/)).toBeInTheDocument();
  });

  it('can hide and restore the reference band', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    emit(series);

    await screen.findAllByRole('button', { name: /Glucose on/ });
    const toggle = screen.getByRole('button', { name: 'Reference range' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelectorAll('rect[fill="var(--chart-band)"]')).toHaveLength(0);
  });

  it('lists non-numeric results verbatim instead of charting them', async () => {
    // "Negative" is a result, not missing data, and it has no place on a
    // numeric axis.
    fetchVariableHistory.mockResolvedValue({
      measurements: [
        measurement({ value: null, rawValue: 'Negative', status: 'normal', unit: null }),
      ],
      reportsScanned: 1,
      truncated: false,
    });

    renderPage();
    emit(series);

    const reported = await screen
      .findByRole('heading', { name: 'Reported values' })
      .then((node) => node.closest('section')!);
    expect(within(reported).getByText('Negative')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Glucose on/ })).not.toBeInTheDocument();
    expect(screen.getByText(/None of these results is a number/)).toBeInTheDocument();
  });

  it('labels machine-written commentary as machine-written', async () => {
    fetchVariableHistory.mockResolvedValue({
      measurements: [
        measurement({
          analysis: {
            text: 'This result sits above the range printed on your report.',
            provider: 'google',
            model: 'gemini-2.0-flash',
            promptVersion: 'v3',
            contentUsedForTraining: false,
            generatedAt: '2026-06-02T00:00:00Z',
          },
        }),
      ],
      reportsScanned: 1,
      truncated: false,
    });

    renderPage();
    emit(series);

    expect(
      await screen.findByText('This result sits above the range printed on your report.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/AI-generated · not medical advice/)).toBeInTheDocument();
  });

  it('marks an unreviewed catalog explanation as unreviewed', async () => {
    // An entry the pipeline invented from a name on someone's report has had
    // no human review, and a plausible paragraph about the wrong test is worse
    // than no paragraph at all.
    const entry: LabVariable = {
      id: 'glucose',
      canonicalName: 'Glucose',
      names: { en: 'Glucose' },
      descriptions: { en: 'Sugar circulating in the blood.' },
      aliases: [],
      category: 'glucose_metabolism',
      defaultUnit: 'mg/dL',
      origin: 'discovered',
      needsEnrichment: false,
      createdAt: stamp('2026-01-01T00:00:00Z'),
    };
    fetchVariableCatalog.mockResolvedValue(new Map([['glucose', entry]]));

    renderPage();
    emit(series);

    expect(await screen.findByText('Sugar circulating in the blood.')).toBeInTheDocument();
    expect(screen.getByText(/not reviewed by a person/)).toBeInTheDocument();
  });

  it('says when the history was assembled from only part of the reports', async () => {
    fetchVariableHistory.mockResolvedValue({
      measurements: history,
      reportsScanned: 50,
      truncated: true,
    });

    renderPage();
    emit(series);

    expect(await screen.findByText(/50 most recent processed reports/)).toBeInTheDocument();
  });

  it('keeps the measured header when the history cannot be read', async () => {
    // The header comes from the series document, which loaded. Blanking the
    // page over the part that failed would hide numbers that are still good.
    fetchVariableHistory.mockRejectedValue(new Error('offline'));

    renderPage();
    emit(series);

    expect(await screen.findByText(/history below is incomplete/)).toBeInTheDocument();
    expect(screen.getByText('118')).toBeInTheDocument();
  });

  it('offers a way back when the variable is not tracked', async () => {
    renderPage();
    emit(null);

    expect(await screen.findByText('Nothing tracked for this test')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to variables' })).toHaveAttribute(
      'href',
      '/variables',
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = renderPage();
    emit(series);

    await screen.findByRole('table', { name: /Every measurement/ });
    await expectNoA11yViolations(container);
  });
});
