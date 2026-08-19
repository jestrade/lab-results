import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';

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

/**
 * Reports the query string the page has put in the address bar.
 *
 * The filters are held in the URL and nowhere else, so this is what the
 * assertions about persistence actually have to read — the rendered grid says
 * what is on screen now, not what a refresh would bring back.
 */
function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function search() {
  return screen.getByTestId('search').textContent;
}

function renderPage(route = '/variables') {
  return renderWithProviders(
    <>
      <Variables />
      <Search />
    </>,
    { auth: signedInAuth(), route },
  );
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

  describe('time window', () => {
    /** Last measured two and a half years before the newest card on the page. */
    const stale = makeSeries({
      variableId: 'ferritin',
      canonicalName: 'Ferritin',
      latestObservedAt: stamp('2024-01-15T00:00:00Z'),
      resultCount: 1,
      points: [{ value: 40, observedAt: stamp('2024-01-15T00:00:00Z') }],
    });

    it('shows everything until a window is chosen', async () => {
      renderPage();
      emit([makeSeries(), stale]);

      // A grid that opened narrowed would be hiding results before the reader
      // knew a window existed.
      expect(await screen.findByRole('link', { name: /hemoglobin/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /ferritin/i })).toBeInTheDocument();
    });

    it('drops a variable whose newest result predates the window', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([makeSeries(), stale]);
      await screen.findByRole('link', { name: /ferritin/i });

      await user.click(screen.getByRole('button', { name: /last 12 months/i }));

      expect(screen.getByRole('link', { name: /hemoglobin/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /ferritin/i })).not.toBeInTheDocument();
    });

    it('counts what the window left, in the line that reports the filtering', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([makeSeries(), stale]);
      await screen.findByRole('link', { name: /ferritin/i });

      await user.click(screen.getByRole('button', { name: /last 12 months/i }));

      // The heading still counts what the account tracks; this line is what
      // explains why one of them is not on screen.
      expect(screen.getByText(/showing 1 of 2 variables/i)).toBeInTheDocument();
      expect(screen.getByText(/2 variables tracked/i)).toBeInTheDocument();
    });

    it('narrows the sparkline to the window, count and all', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([
        makeSeries({
          resultCount: 2,
          points: [
            { value: 13.8, observedAt: stamp('2024-01-15T00:00:00Z') },
            { value: 14.2, observedAt: stamp('2026-07-12T00:00:00Z') },
          ],
        }),
      ]);
      await screen.findByRole('link', { name: /hemoglobin/i });
      expect(screen.getByText(/2 results/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /last 12 months/i }));

      // "2 results" under a line drawn from one measurement would be the card
      // counting history the window has excluded.
      expect(screen.getByText(/1 result\b/i)).toBeInTheDocument();
    });

    it('counts only the flagged variables inside the window', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([
        potassium,
        makeSeries({
          variableId: 'ldl',
          canonicalName: 'LDL',
          latestStatus: 'high',
          latestObservedAt: stamp('2024-01-15T00:00:00Z'),
          points: [{ value: 180, observedAt: stamp('2024-01-15T00:00:00Z') }],
        }),
      ]);
      expect(await screen.findByRole('button', { name: /outside range only \(2\)/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /last 12 months/i }));

      // A count that included cards the window removed would not match the
      // grid it sits above.
      expect(screen.getByRole('button', { name: /outside range only \(1\)/i })).toBeInTheDocument();
    });
  });

  describe('ordering', () => {
    it('groups by panel until asked to do otherwise', async () => {
      renderPage();
      emit([potassium, makeSeries()]);
      await screen.findByRole('link', { name: /hemoglobin/i });

      expect((await screen.findAllByRole('heading', { level: 2 })).length).toBeGreaterThan(0);
    });

    it('drops the panel headings when the order no longer follows them', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([potassium, makeSeries()]);
      await screen.findByRole('link', { name: /hemoglobin/i });

      await user.click(screen.getByRole('button', { name: /most recent first/i }));

      // Category headings over a list that is no longer in category order
      // would be labels that lie. Every card is still on the page.
      expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /potassium/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /hemoglobin/i })).toBeInTheDocument();
    });

    it('orders by worst status without hiding anything', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([makeSeries(), potassium]);
      await screen.findByRole('link', { name: /hemoglobin/i });

      await user.click(screen.getByRole('button', { name: /outside range first/i }));

      const cards = screen
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
        .filter((href) => href?.startsWith('/variables/'));
      expect(cards).toEqual(['/variables/potassium', '/variables/hemoglobin']);
    });

    it('keeps the ordering when a filter narrows the grid', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([potassium, makeSeries()]);
      await screen.findByRole('link', { name: /hemoglobin/i });

      await user.click(screen.getByRole('button', { name: /most recent first/i }));
      await user.type(screen.getByLabelText(/search/i), 'Potassium');

      expect(screen.getByRole('link', { name: /potassium/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /hemoglobin/i })).not.toBeInTheDocument();
    });

    it('says nothing matches rather than showing an empty grid', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([makeSeries()]);
      await screen.findByRole('link', { name: /hemoglobin/i });

      await user.click(screen.getByRole('button', { name: /most recent first/i }));
      await user.type(screen.getByLabelText(/search/i), 'zzzz');

      expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
    });
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
    /** Opens the actions menu and presses the item inside it. */
    async function openClearDialog(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: /^actions$/i }));
      await user.click(screen.getByRole('button', { name: /clear variable data/i }));
    }

    it('offers the control only once there is something to remove', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([]);
      await screen.findByText(/no variables tracked yet/i);
      // An account with nothing tracked gets the empty state, not a menu whose
      // only item would delete nothing.
      expect(screen.queryByRole('button', { name: /^actions$/i })).not.toBeInTheDocument();

      emit([makeSeries()]);
      await user.click(await screen.findByRole('button', { name: /^actions$/i }));
      expect(screen.getByRole('button', { name: /clear variable data/i })).toBeInTheDocument();
    });

    it('keeps the destructive control behind the menu until it is opened', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([makeSeries()]);

      // Shut, the panel is not in the DOM at all — not merely hidden. A
      // hidden panel leaves this button in the tab order, and the one control
      // that erases every tracked value is the last one a keyboard reader
      // should land on without having asked for it.
      expect(await screen.findByRole('button', { name: /^actions$/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      expect(screen.queryByRole('button', { name: /clear variable data/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^actions$/i }));
      expect(screen.getByRole('button', { name: /^actions$/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(screen.getByRole('button', { name: /clear variable data/i })).toBeInTheDocument();
    });

    it('closes the menu when the dialog it opened takes over', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([makeSeries()]);
      await openClearDialog(user);

      // The dialog outlives the panel that opened it: rendered inside, it
      // would unmount in the same click that summoned it.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /clear variable data/i })).not.toBeInTheDocument();
    });

    it('asks before removing anything, and says what survives', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([potassium, makeSeries()]);

      await openClearDialog(user);

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

      await openClearDialog(user);
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

      await openClearDialog(user);
      await user.click(screen.getByRole('button', { name: /clear everything/i }));

      expect(await screen.findByText(/could not be cleared/i)).toBeInTheDocument();
      // The dialog stays open, so the retry is one click rather than three.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  /**
   * The filters live in the query string, so the grid survives a refresh, a
   * back button and a pasted link. Every test here is about that URL, not
   * about the filtering itself — which the blocks above already cover.
   */
  describe('filters in the URL', () => {
    it('leaves the address bar alone until something is filtered', async () => {
      renderPage();
      emit([potassium, makeSeries()]);
      await screen.findByRole('link', { name: /hemoglobin/i });

      // An untouched page is a bare /variables. A URL spelling out every
      // default is noise in the place the user is most likely to copy.
      expect(search()).toBe('');
    });

    it('opens on the filters the URL asks for', async () => {
      renderPage('/variables?category=electrolytes');
      emit([potassium, makeSeries()]);

      expect(await screen.findByRole('link', { name: /potassium/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /hemoglobin/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Electrolytes' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('opens on the sort, search and window the URL asks for', async () => {
      renderPage('/variables?q=potassium&sort=recent&period=12m&flagged=1');
      emit([potassium, makeSeries()]);

      await screen.findByRole('link', { name: /potassium/i });
      expect(screen.getByLabelText(/search/i)).toHaveValue('potassium');
      expect(screen.getByRole('button', { name: /most recent first/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: /last 12 months/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: /outside range only/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('writes each control to the query string as it is used', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([potassium, makeSeries()]);
      await screen.findByRole('link', { name: /hemoglobin/i });

      await user.click(screen.getByRole('button', { name: 'Electrolytes' }));
      expect(search()).toBe('?category=electrolytes');

      await user.click(screen.getByRole('button', { name: /last 12 months/i }));
      await user.click(screen.getByRole('button', { name: /outside range first/i }));
      await user.click(screen.getByRole('button', { name: /outside range only/i }));

      const params = new URLSearchParams(search() ?? '');
      expect(Object.fromEntries(params)).toEqual({
        category: 'electrolytes',
        period: '12m',
        sort: 'flagged',
        flagged: '1',
      });
    });

    it('carries the search box into the URL', async () => {
      const user = userEvent.setup();
      renderPage();
      emit([potassium, makeSeries()]);
      await screen.findByRole('link', { name: /hemoglobin/i });

      await user.type(screen.getByLabelText(/search/i), 'Hgb');

      expect(search()).toBe('?q=Hgb');
    });

    it('drops a filter from the URL when it is turned off again', async () => {
      const user = userEvent.setup();
      renderPage('/variables?category=electrolytes&flagged=1');
      emit([potassium, makeSeries()]);
      await screen.findByRole('link', { name: /potassium/i });

      await user.click(screen.getByRole('button', { name: /outside range only/i }));
      await user.click(screen.getByRole('button', { name: /all categories/i }));

      // Back to the URL it would have had if neither had ever been pressed —
      // not a trail of the filters the reader has since undone.
      expect(search()).toBe('');
    });

    it('shows the same grid after a refresh', async () => {
      const user = userEvent.setup();
      const { unmount } = renderPage();
      emit([potassium, makeSeries()]);
      await screen.findByRole('link', { name: /hemoglobin/i });

      await user.click(screen.getByRole('button', { name: 'Electrolytes' }));
      await user.click(screen.getByRole('button', { name: /most recent first/i }));
      const url = `/variables${search()}`;

      // What a reload is: the page mounted again at the URL it left behind,
      // with nothing carried over in memory.
      unmount();
      renderPage(url);
      emit([potassium, makeSeries()]);

      expect(await screen.findByRole('link', { name: /potassium/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /hemoglobin/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /most recent first/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('renders the page rather than an error when the URL is nonsense', async () => {
      renderPage('/variables?category=made_up&sort=zzz&period=99y');
      emit([potassium, makeSeries()]);

      // A stale link or a hand-edited address bar should land the reader on
      // the unfiltered grid, not on a broken page.
      expect(await screen.findByRole('link', { name: /hemoglobin/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /potassium/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /all categories/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });

  it('has no serious accessibility violations', async () => {
    const { container } = renderPage();
    emit([potassium, makeSeries()]);
    await screen.findByRole('link', { name: /hemoglobin/i });
    await expectNoA11yViolations(container);
  });
});
