import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import type { VariableSeries } from '@/domain/types';
import type * as VariablesModule from '@/services/variables';
import { Variables } from './Variables';

const subscribeToVariableSeries = vi.hoisted(() => vi.fn());
const clearVariableData = vi.hoisted(() => vi.fn());
// The page joins each series to the catalog for its display name and group.
// Stubbed empty so these tests exercise the fallback path: the names the trend
// engine denormalised onto each series, which is what a user sees before the
// catalog has anything to say about their variables.
const fetchVariableCatalog = vi.hoisted(() => vi.fn(() => Promise.resolve(new Map())));

vi.mock('@/services/variables', async (importOriginal) => {
  const actual = await importOriginal<typeof VariablesModule>();
  return { ...actual, subscribeToVariableSeries, fetchVariableCatalog, clearVariableData };
});

function stamp(iso: string) {
  return { toDate: () => new Date(iso), toMillis: () => new Date(iso).getTime() } as never;
}

function makeSeries(overrides: Partial<VariableSeries> = {}): VariableSeries {
  return {
    variableId: 'hemoglobin',
    canonicalName: 'Hemoglobin',
    aliases: ['Hgb'],
    category: 'complete_blood_count',
    unit: 'g/dL',
    latestValue: 14.2,
    latestRawValue: '14.2',
    latestStatus: 'normal',
    latestObservedAt: stamp('2026-07-12T00:00:00Z'),
    referenceRange: { low: 13, high: 17, text: null, source: 'laboratory' },
    resultCount: 5,
    trend: 'stable',
    points: [
      { value: 13.8, observedAt: stamp('2024-03-01T00:00:00Z') },
      { value: 14.2, observedAt: stamp('2026-07-12T00:00:00Z') },
    ],
    ...overrides,
  };
}

const potassium = makeSeries({
  variableId: 'potassium',
  canonicalName: 'Potassium',
  aliases: ['K'],
  category: 'electrolytes',
  unit: 'mmol/L',
  latestValue: 6.3,
  latestRawValue: '6.3',
  latestStatus: 'critical',
  referenceRange: { low: 3.5, high: 5.1, text: null, source: 'laboratory' },
  trend: 'increasing',
  points: [
    { value: 4.4, observedAt: stamp('2024-03-01T00:00:00Z') },
    { value: 5.2, observedAt: stamp('2025-11-18T00:00:00Z') },
    { value: 6.3, observedAt: stamp('2026-07-12T00:00:00Z') },
  ],
});

function emit(series: VariableSeries[]) {
  (subscribeToVariableSeries.mock.calls.at(-1)?.[1] as (s: VariableSeries[]) => void)(series);
}

function renderPage() {
  return renderWithProviders(<Variables />, { auth: signedInAuth(), route: '/variables' });
}

describe('Variables', () => {
  beforeEach(() => {
    subscribeToVariableSeries.mockReset();
    subscribeToVariableSeries.mockReturnValue(() => {});
    clearVariableData.mockReset();
  });

  it('subscribes for the signed-in user', () => {
    renderPage();
    expect(subscribeToVariableSeries).toHaveBeenCalledWith(
      'test-uid',
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('shows a loading state rather than claiming the list is empty', () => {
    renderPage();
    expect(screen.getByRole('status', { name: /loading variables/i })).toBeInTheDocument();
    expect(screen.queryByText(/no variables tracked yet/i)).not.toBeInTheDocument();
  });

  it('shows the empty state once the list is known to be empty', async () => {
    renderPage();
    emit([]);
    expect(await screen.findByText(/no variables tracked yet/i)).toBeInTheDocument();
  });

  it('renders a card with value, unit, status and summary', async () => {
    renderPage();
    emit([makeSeries()]);

    const card = await screen.findByRole('link', { name: /hemoglobin/i });
    expect(within(card).getByText('14.2')).toBeInTheDocument();
    expect(within(card).getByText('g/dL')).toBeInTheDocument();
    expect(within(card).getByText('Normal')).toBeInTheDocument();
    expect(within(card).getByText('Range 13–17 · 5 results · Stable')).toBeInTheDocument();
    expect(card).toHaveAttribute('href', '/variables/hemoglobin');
  });

  it('gives the sparkline a text alternative', async () => {
    renderPage();
    emit([potassium]);
    // A chart with no words is simply missing for anyone who cannot see it.
    expect(
      await screen.findByRole('img', {
        name: /Potassium rose from 4.4 mmol\/L to 6.3 mmol\/L across 3 measurements/i,
      }),
    ).toBeInTheDocument();
  });

  it('shows a non-numeric result verbatim instead of coercing it', async () => {
    renderPage();
    emit([
      makeSeries({
        variableId: 'nitrites',
        canonicalName: 'Nitrites',
        category: 'urinalysis',
        unit: null,
        latestValue: null,
        latestRawValue: 'Negative',
        latestStatus: 'normal',
        points: [],
      }),
    ]);
    expect(await screen.findByText('Negative')).toBeInTheDocument();
  });

  it('says when there is not enough data for a trend', async () => {
    renderPage();
    emit([makeSeries({ points: [], resultCount: 1, trend: 'insufficient_data' })]);
    expect(await screen.findByText(/not enough data for a trend/i)).toBeInTheDocument();
  });

  it('groups by category in a fixed order', async () => {
    renderPage();
    emit([potassium, makeSeries()]);

    const headings = (await screen.findAllByRole('heading', { level: 2 })).map(
      (heading) => heading.textContent,
    );
    // Fixed, not alphabetical — a variable stays where the user last saw it.
    expect(headings).toEqual(['Complete blood count', 'Electrolytes']);
  });

  it('searches by canonical name and by alias', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([potassium, makeSeries()]);
    await screen.findByRole('link', { name: /hemoglobin/i });

    const search = screen.getByLabelText(/search/i);
    await user.type(search, 'Hgb');

    // Users search for the name printed on their report, not ours.
    expect(screen.getByRole('link', { name: /hemoglobin/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /potassium/i })).not.toBeInTheDocument();
  });

  it('filters to a category', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([potassium, makeSeries()]);
    await screen.findByRole('link', { name: /hemoglobin/i });

    await user.click(screen.getByRole('button', { name: 'Electrolytes' }));

    expect(screen.getByRole('link', { name: /potassium/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /hemoglobin/i })).not.toBeInTheDocument();
  });

  it('only offers categories the user actually has results in', async () => {
    renderPage();
    emit([makeSeries()]);
    await screen.findByRole('link', { name: /hemoglobin/i });

    // Showing the whole catalog would offer a dozen filters that all yield
    // nothing.
    expect(screen.getByRole('button', { name: 'Complete blood count' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thyroid' })).not.toBeInTheDocument();
  });

  it('filters to out-of-range results and counts them', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([potassium, makeSeries()]);
    await screen.findByRole('link', { name: /hemoglobin/i });

    const toggle = screen.getByRole('button', { name: /outside range only \(1\)/i });
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /potassium/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /hemoglobin/i })).not.toBeInTheDocument();
  });

  it('distinguishes an empty filter from an empty account', async () => {
    const user = userEvent.setup();
    renderPage();
    emit([makeSeries()]);
    await screen.findByRole('link', { name: /hemoglobin/i });

    await user.type(screen.getByLabelText(/search/i), 'zzzz');

    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
    expect(screen.queryByText(/no variables tracked yet/i)).not.toBeInTheDocument();
  });

  it('reports a load failure instead of showing an empty grid', async () => {
    renderPage();
    (subscribeToVariableSeries.mock.calls.at(-1)?.[2] as (e: Error) => void)(new Error('denied'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your variables/i);
  });

  describe('clearing the tracked data', () => {
    it('offers the control only once there is something to remove', async () => {
      renderPage();
      emit([]);
      await screen.findByText(/no variables tracked yet/i);
      // An account with nothing tracked gets the empty state, not a button
      // that would delete nothing.
      expect(screen.queryByRole('button', { name: /clear variable data/i })).not.toBeInTheDocument();

      emit([makeSeries()]);
      expect(
        await screen.findByRole('button', { name: /clear variable data/i }),
      ).toBeInTheDocument();
    });

    it('asks before removing anything, and says what survives', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([potassium, makeSeries()]);

      await user.click(await screen.findByRole('button', { name: /clear variable data/i }));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/all 2 tracked variables/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
      // Someone agreeing to this should know their reports are still there.
      expect(within(dialog).getByText(/reports and the results on each/i)).toBeInTheDocument();
      // Deleting health data is never one misclick.
      expect(clearVariableData).not.toHaveBeenCalled();
    });

    it('clears after confirmation and says how much went', async () => {
      const user = userEvent.setup();
      clearVariableData.mockResolvedValue({ cleared: 2 });
      renderPage();
      emit([potassium, makeSeries()]);

      await user.click(await screen.findByRole('button', { name: /clear variable data/i }));
      await user.click(screen.getByRole('button', { name: /clear everything/i }));

      await waitFor(() => expect(clearVariableData).toHaveBeenCalledTimes(1));
      // The grid empties from the subscription; the toast is what tells the
      // user the silence is the feature working rather than a failed load.
      expect(await screen.findByText(/2 variables cleared/i)).toBeInTheDocument();
    });

    it('keeps the data and says so when the call fails', async () => {
      const user = userEvent.setup();
      clearVariableData.mockRejectedValue(new Error('offline'));
      renderPage();
      emit([makeSeries()]);

      await user.click(await screen.findByRole('button', { name: /clear variable data/i }));
      await user.click(screen.getByRole('button', { name: /clear everything/i }));

      expect(await screen.findByText(/could not be cleared/i)).toBeInTheDocument();
      // The dialog stays open, so the retry is one click rather than three.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('has no serious accessibility violations', async () => {
    const { container } = renderPage();
    emit([potassium, makeSeries()]);
    await screen.findByRole('link', { name: /hemoglobin/i });
    await expectNoA11yViolations(container);
  });
});
