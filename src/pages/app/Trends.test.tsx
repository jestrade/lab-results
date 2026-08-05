import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import type { VariableSeries } from '@/domain/types';
import type * as VariablesModule from '@/services/variables';
import { Trends } from './Trends';

const subscribeToVariableSeries = vi.hoisted(() => vi.fn());

vi.mock('@/services/variables', async (importOriginal) => {
  const actual = await importOriginal<typeof VariablesModule>();
  return { ...actual, subscribeToVariableSeries };
});

function stamp(iso: string) {
  return { toDate: () => new Date(iso), toMillis: () => new Date(iso).getTime() } as never;
}

/** Three points, well spread, rising — enough for a direction. */
const potassium: VariableSeries = {
  variableId: 'potassium',
  canonicalName: 'Potassium',
  aliases: ['K'],
  category: 'electrolytes',
  unit: 'mmol/L',
  latestValue: 6.3,
  latestRawValue: '6.3',
  latestStatus: 'critical',
  latestObservedAt: stamp('2026-07-12T00:00:00Z'),
  referenceRange: { low: 3.5, high: 5.1, text: null, source: 'laboratory' },
  resultCount: 3,
  trend: 'increasing',
  points: [
    { value: 4.4, observedAt: stamp('2026-03-01T00:00:00Z') },
    { value: 5.2, observedAt: stamp('2026-05-18T00:00:00Z') },
    { value: 6.3, observedAt: stamp('2026-07-12T00:00:00Z') },
  ],
};

const ldl: VariableSeries = {
  variableId: 'ldl-cholesterol',
  canonicalName: 'LDL Cholesterol',
  aliases: [],
  category: 'lipid_profile',
  unit: 'mg/dL',
  latestValue: 142,
  latestRawValue: '142',
  latestStatus: 'high',
  latestObservedAt: stamp('2026-07-12T00:00:00Z'),
  referenceRange: { low: null, high: 100, text: '< 100', source: 'laboratory' },
  resultCount: 3,
  trend: 'increasing',
  points: [
    { value: 118, observedAt: stamp('2026-03-01T00:00:00Z') },
    { value: 130, observedAt: stamp('2026-05-18T00:00:00Z') },
    { value: 142, observedAt: stamp('2026-07-12T00:00:00Z') },
  ],
};

/** Two points — plotted, but no direction may be claimed. */
const tsh: VariableSeries = {
  variableId: 'tsh',
  canonicalName: 'TSH',
  aliases: [],
  category: 'thyroid',
  unit: 'mIU/L',
  latestValue: 2.1,
  latestRawValue: '2.1',
  latestStatus: 'normal',
  latestObservedAt: stamp('2026-07-12T00:00:00Z'),
  referenceRange: { low: 0.4, high: 4.0, text: null, source: 'laboratory' },
  resultCount: 2,
  trend: 'insufficient_data',
  points: [
    { value: 1.8, observedAt: stamp('2026-05-18T00:00:00Z') },
    { value: 2.1, observedAt: stamp('2026-07-12T00:00:00Z') },
  ],
};

function emit(series: VariableSeries[]) {
  act(() => {
    (subscribeToVariableSeries.mock.calls.at(-1)?.[1] as (s: VariableSeries[]) => void)(series);
  });
}

function emitError() {
  act(() => {
    (subscribeToVariableSeries.mock.calls.at(-1)?.[2] as (e: Error) => void)(new Error('offline'));
  });
}

function renderPage() {
  return renderWithProviders(<Trends />, { auth: signedInAuth(), route: '/trends' });
}

describe('Trends', () => {
  beforeEach(() => {
    subscribeToVariableSeries.mockReset();
    subscribeToVariableSeries.mockReturnValue(() => {});
  });

  it('subscribes for the signed-in user', () => {
    renderPage();
    expect(subscribeToVariableSeries).toHaveBeenCalledWith(
      'test-uid',
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('shows the empty state only once the list is known to be empty', async () => {
    renderPage();
    expect(screen.queryByText(/nothing to chart yet/i)).not.toBeInTheDocument();
    emit([]);
    expect(await screen.findByText(/nothing to chart yet/i)).toBeInTheDocument();
  });

  it('preselects variables that have enough history to show a direction', async () => {
    renderPage();
    emit([potassium, tsh]);

    // Potassium has three points and opens charted; TSH has two and does not.
    expect(await screen.findByRole('heading', { name: 'Potassium', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'TSH', level: 2 })).not.toBeInTheDocument();
  });

  it('charts each variable separately rather than on one axis', async () => {
    renderPage();
    emit([potassium, ldl]);

    // Two headings, two charts. Millimoles and milligrams never share a scale:
    // an overlay would need a normalised unit that is on neither report.
    await screen.findByRole('heading', { name: 'Potassium', level: 2 });
    expect(screen.getByRole('heading', { name: 'LDL Cholesterol', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('lets a variable be added and removed from the comparison', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([potassium, tsh]);

    const toggle = await screen.findByRole('button', { name: 'TSH', pressed: false });
    await user.click(toggle);
    expect(screen.getByRole('heading', { name: 'TSH', level: 2 })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'TSH', pressed: true }));
    expect(screen.queryByRole('heading', { name: 'TSH', level: 2 })).not.toBeInTheDocument();
  });

  it('drops points outside the chosen period without dropping the variable', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([
      {
        ...potassium,
        points: [
          { value: 4.4, observedAt: stamp('2019-01-01T00:00:00Z') },
          { value: 5.2, observedAt: stamp('2026-05-18T00:00:00Z') },
          { value: 6.3, observedAt: stamp('2026-07-12T00:00:00Z') },
        ],
      },
    ]);

    // All time: three measurements in the table alternative.
    await user.click(await screen.findByRole('button', { name: /all time/i }));
    expect(screen.getByText(/show the 3 measurements as a table/i)).toBeInTheDocument();

    // Last 12 months: the 2019 point falls outside, the chart still stands.
    await user.click(screen.getByRole('button', { name: /last 12 months/i }));
    expect(screen.getByText(/show the 2 measurements as a table/i)).toBeInTheDocument();
  });

  it('refuses to show a direction for fewer than three measurements', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([tsh]);

    await user.click(await screen.findByRole('button', { name: 'TSH', pressed: false }));

    // Two measurements make a line, not a trend. The page says so in words
    // rather than quietly drawing something that reads as a finding.
    expect(screen.getByText(/2 measurements so far/i)).toBeInTheDocument();
    expect(screen.getByText(/needs at least 3/i)).toBeInTheDocument();
  });

  it('never describes a direction as good or bad', async () => {
    renderPage();
    emit([potassium, ldl]);

    await screen.findByRole('heading', { name: 'Potassium', level: 2 });
    // Whether a rising value is welcome is a clinical question this product
    // does not answer (spec §15, §43).
    expect(document.body.textContent).not.toMatch(/improv|worsen|better|concerning|alarming/i);
  });

  it('gives every chart a table of the same numbers', async () => {
    renderPage();
    emit([potassium]);

    const chart = await screen.findByRole('img', {
      name: /Potassium: 3 measurements from Mar 2026 to Jul 2026/i,
    });
    expect(chart).toBeInTheDocument();

    // The alternative is the data, not a summary of it — someone who cannot
    // see the chart reads the same values a sighted reader does.
    const table = screen.getByRole('table', { name: /potassium measurements/i });
    expect(within(table).getByText('4.4 mmol/L')).toBeInTheDocument();
    expect(within(table).getByText('5.2 mmol/L')).toBeInTheDocument();
    expect(within(table).getByText('6.3 mmol/L')).toBeInTheDocument();
  });

  it('states the reference range came from the report', async () => {
    renderPage();
    emit([potassium]);
    expect(await screen.findByText(/Range 3.5–5.1/)).toBeInTheDocument();
  });

  it('surfaces a load failure instead of an empty page', async () => {
    renderPage();
    emitError();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your variables/i);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderPage();
    emit([potassium, ldl, tsh]);
    await screen.findByRole('heading', { name: 'Potassium', level: 2 });
    await expectNoA11yViolations(container);
  });
});
