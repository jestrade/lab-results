import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { ButtonLink } from '@/components/Button';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { ResultStatusBadge, TrendBadge } from '@/components/StatusBadge';
import { TrendChart } from '@/components/TrendChart';
import type { VariableSeries } from '@/domain/types';
import { MIN_POINTS_FOR_TREND, summariseSeries } from '@/domain/variables';
import { subscribeToVariableSeries } from '@/services/variables';

/**
 * Trend analysis (KAN-47).
 *
 * ── Why these are stacked charts and not one overlay ──────────────────────
 *
 * The board says "compare variables", and the obvious reading is one chart
 * with several lines on it. That loses here. Potassium is millimoles per litre
 * in a band 1.6 wide; LDL is milligrams per decilitre in a band a hundred
 * wide. On a shared axis one of them is a flat line at the bottom, and the
 * only way out is to normalise both into "percent of their own range" — a
 * derived number that looks like a measurement, invites comparison between two
 * quantities that are not comparable, and appears nowhere on the user's report.
 *
 * Stacked charts on a shared time axis answer the question the overlay was
 * for — did these move together? — without inventing a unit. Each keeps its
 * own scale, its own reference band, and the numbers the laboratory printed.
 */

type Period = '12m' | '3y' | 'all';

const PERIODS: { id: Period; label: string; months: number | null }[] = [
  { id: '12m', label: 'Last 12 months', months: 12 },
  { id: '3y', label: 'Last 3 years', months: 36 },
  { id: 'all', label: 'All time', months: null },
];

/** Charts shown before the user picks — enough to be useful, few enough to scan. */
const PRESELECT_LIMIT = 3;

export function Trends() {
  const { user } = useAuth();

  const [series, setSeries] = useState<VariableSeries[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period>('3y');

  useEffect(() => {
    if (!user) return;
    return subscribeToVariableSeries(
      user.uid,
      (next) => {
        setSeries(next);
        setError(null);
        // Open on something rather than on an empty frame: the variables that
        // actually have enough history to show a direction.
        setSelected((current) =>
          current.length > 0
            ? current
            : next
                .filter((entry) => entry.points.length >= MIN_POINTS_FOR_TREND)
                .slice(0, PRESELECT_LIMIT)
                .map((entry) => entry.variableId),
        );
      },
      () => setError('We could not load your variables. Check your connection and try again.'),
    );
  }, [user]);

  const all = useMemo(() => series ?? [], [series]);

  // One window for every chart on the page — the whole point of stacking them.
  const { from, to } = useMemo(() => {
    const now = Date.now();
    const months = PERIODS.find((option) => option.id === period)?.months ?? null;

    const observed = all.flatMap((entry) =>
      entry.points.map((point) => point.observedAt.toDate().getTime()),
    );
    const earliest = observed.length > 0 ? Math.min(...observed) : now;
    const latest = observed.length > 0 ? Math.max(...observed) : now;

    if (months === null) return { from: earliest, to: latest };

    const cutoff = new Date(latest);
    cutoff.setMonth(cutoff.getMonth() - months);
    // Never start after the earliest measurement: a window wider than the
    // history should show the history, not an empty stretch of axis.
    return { from: Math.max(earliest, cutoff.getTime()), to: latest };
  }, [all, period]);

  const chosen = all.filter((entry) => selected.includes(entry.variableId));

  function toggle(variableId: string) {
    setSelected((current) =>
      current.includes(variableId)
        ? current.filter((id) => id !== variableId)
        : [...current, variableId],
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Compare variables</div>
          <h1>Trend analysis</h1>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {series === null ? (
        <Skeleton height={240} radius="var(--r-card)" />
      ) : all.length === 0 ? (
        <EmptyState
          icon="chart-line"
          title="Nothing to chart yet"
          action={
            <ButtonLink to="/upload" variant="primary" icon="upload-simple">
              Upload a report
            </ButtonLink>
          }
        >
          Once a report has been processed, every test on it can be charted here. A direction needs
          at least {MIN_POINTS_FOR_TREND} measurements of the same test.
        </EmptyState>
      ) : (
        <>
          <div className="trend-controls">
            <div>
              <div className="kicker-quiet" id="trend-variables-label">
                Variables
              </div>
              <div
                role="group"
                aria-labelledby="trend-variables-label"
                className="variable-chips"
              >
                {all.map((entry) => (
                  <button
                    key={entry.variableId}
                    type="button"
                    className="chip"
                    aria-pressed={selected.includes(entry.variableId)}
                    onClick={() => toggle(entry.variableId)}
                  >
                    {entry.canonicalName}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="kicker-quiet" id="trend-period-label">
                Period
              </div>
              <div role="group" aria-labelledby="trend-period-label" className="variable-chips">
                {PERIODS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="chip"
                    aria-pressed={period === option.id}
                    onClick={() => setPeriod(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {chosen.length === 0 ? (
            <EmptyState icon="chart-line" title="Choose a variable">
              Pick one or more tests above to chart them over time.
            </EmptyState>
          ) : (
            <>
              <p className="muted trend-note">
                Each chart keeps its own scale and its own reference range, so the values stay the
                ones printed on your reports. They share a time axis, so you can read them against
                each other.
              </p>

              {chosen.map((entry) => (
                <section key={entry.variableId} className="trend-card">
                  <div className="trend-card-head">
                    <h2>{entry.canonicalName}</h2>
                    <ResultStatusBadge status={entry.latestStatus} />
                    <TrendBadge trend={entry.trend} />
                  </div>
                  <p className="muted trend-card-meta">{summariseSeries(entry)}</p>

                  {entry.points.length < MIN_POINTS_FOR_TREND ? (
                    <Alert tone="info">
                      {entry.points.length} measurement{entry.points.length === 1 ? '' : 's'} so
                      far. A direction needs at least {MIN_POINTS_FOR_TREND}, so none is shown —
                      the measurements themselves are still plotted.
                    </Alert>
                  ) : null}

                  <TrendChart series={entry} from={from} to={to} />
                </section>
              ))}

              <DisclaimerBanner />
            </>
          )}
        </>
      )}
    </>
  );
}
