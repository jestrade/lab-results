import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button, ButtonLink } from '@/components/Button';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { ResultStatusBadge, TrendBadge } from '@/components/StatusBadge';
import { TrendChart } from '@/components/TrendChart';
import type { LabVariable, VariableSeries } from '@/domain/types';
import {
  groupByCategory,
  MIN_POINTS_FOR_TREND,
  seriesName,
  summariseSeries,
  timeWindow,
  withCatalog,
} from '@/domain/variables';
import { useI18n } from '@/i18n/useI18n';
import type { MessageKey } from '@/i18n/messages';
import { fetchVariableCatalog, subscribeToVariableSeries } from '@/services/variables';

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

const PERIODS: { id: Period; label: MessageKey; months: number | null }[] = [
  { id: '12m', label: 'trends.period.12m', months: 12 },
  { id: '3y', label: 'trends.period.3y', months: 36 },
  { id: 'all', label: 'trends.period.all', months: null },
];

/** Charts shown before the user picks — enough to be useful, few enough to scan. */
const PRESELECT_LIMIT = 3;

export function Trends() {
  const { user } = useAuth();
  const { t, locale } = useI18n();

  const [series, setSeries] = useState<VariableSeries[] | null>(null);
  const [catalog, setCatalog] = useState<Map<string, LabVariable> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period>('3y');

  // The catalog supplies the names and the groupings. Its absence is not an
  // error worth showing: the series carry a usable fallback name, so a failed
  // fetch costs the reader tidier labels, not the page.
  useEffect(() => {
    let live = true;
    fetchVariableCatalog()
      .then((entries) => {
        // An empty catalog and no catalog produce identical output — both
        // fall back to the names on each series — so storing one would be a
        // render that changes nothing.
        if (live && entries.size > 0) setCatalog(entries);
      })
      .catch(() => {
        // Already null. The picker falls back to the denormalised names.
      });
    return () => {
      live = false;
    };
  }, []);

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
      () => setError(t('variables.loadFailed')),
    );
  }, [user, t]);

  /**
   * The user's series, named and categorised from the catalog.
   *
   * The list is still driven by what this user has results for — a chart of a
   * variable they have never been tested for would be an empty frame — but
   * every label on it now comes from the catalog rather than from whatever
   * their laboratory printed.
   */
  const all = useMemo(() => withCatalog(series ?? [], catalog), [series, catalog]);

  /** Chips grouped into panels, in the same fixed order as /variables. */
  const groups = useMemo(() => groupByCategory(all, locale), [all, locale]);

  // One window for every chart on the page — the whole point of stacking them.
  // Shared with the variable page (KAN-46), so "last 12 months" cannot come to
  // mean two different stretches of time on the two screens.
  const { from, to } = useMemo(
    () =>
      timeWindow(
        all.flatMap((entry) => entry.points.map((point) => point.observedAt.toDate().getTime())),
        PERIODS.find((option) => option.id === period)?.months ?? null,
        Date.now(),
      ),
    [all, period],
  );

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
          <div className="kicker">{t('trends.kicker')}</div>
          <h1>{t('nav.trends')}</h1>
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
          title={t('trends.emptyTitle')}
          action={
            <ButtonLink to="/upload" variant="primary" icon="upload-simple">
              {t('common.uploadReport')}
            </ButtonLink>
          }
        >
          {t('trends.emptyBody', { min: MIN_POINTS_FOR_TREND })}
        </EmptyState>
      ) : (
        <>
          <div className="trend-controls">
            <div>
              <div className="trend-variables-head">
                <div className="kicker-quiet" id="trend-variables-label">
                  {t('trends.variables')}
                </div>
                <span className="muted trend-selected-count" aria-live="polite">
                  {t('trends.selectedCount', { selected: selected.length, total: all.length })}
                </span>
                {selected.length > 0 ? (
                  <Button variant="ghost" onClick={() => setSelected([])}>
                    {t('trends.clear')}
                  </Button>
                ) : null}
              </div>

              {/* Grouped by panel rather than listed flat. Fifty-odd chips in
                  one run is a wall of text with no landmarks — under "Complete
                  blood count" and "Urinalysis" the same chips become
                  navigable, and the order matches the /variables page so a
                  test sits where the reader last saw it. Each group is its own
                  labelled group for assistive technology, so the panel name is
                  announced rather than being a visual grouping only. */}
              <div className="trend-variable-groups" aria-labelledby="trend-variables-label">
                {groups.map((group) => (
                  <div key={group.category} className="trend-variable-group">
                    <div className="trend-group-head">
                      <span className="trend-group-label">{group.label}</span>
                      <span className="muted trend-group-count">{group.series.length}</span>
                    </div>
                    <div
                      role="group"
                      aria-label={group.label}
                      className="variable-chips"
                    >
                      {group.series.map((entry) => (
                        <button
                          key={entry.variableId}
                          type="button"
                          className="chip"
                          aria-pressed={selected.includes(entry.variableId)}
                          onClick={() => toggle(entry.variableId)}
                        >
                          {seriesName(entry, locale)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="kicker-quiet" id="trend-period-label">
                {t('trends.period')}
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
                    {t(option.label)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {chosen.length === 0 ? (
            <EmptyState icon="chart-line" title={t('trends.chooseTitle')}>
              {t('trends.chooseBody')}
            </EmptyState>
          ) : (
            <>
              <p className="muted trend-note">{t('trends.note')}</p>

              {chosen.map((entry) => (
                <section key={entry.variableId} className="trend-card">
                  <div className="trend-card-head">
                    <h2>{seriesName(entry, locale)}</h2>
                    <ResultStatusBadge status={entry.latestStatus} />
                    <TrendBadge trend={entry.trend} />
                  </div>
                  <p className="muted trend-card-meta">{summariseSeries(entry, locale)}</p>

                  {entry.points.length < MIN_POINTS_FOR_TREND ? (
                    <Alert tone="info">
                      {t(
                        entry.points.length === 1 ? 'trends.tooFewOne' : 'trends.tooFewMany',
                        { count: entry.points.length, min: MIN_POINTS_FOR_TREND },
                      )}
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
