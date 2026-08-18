import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button, ButtonLink } from '@/components/Button';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { EmptyState } from '@/components/EmptyState';
import { Field, TextInput } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { Skeleton } from '@/components/Skeleton';
import { Sparkline } from '@/components/Sparkline';
import { ResultStatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/useToast';
import { Trans } from '@/i18n/Trans';
import { useI18n } from '@/i18n/useI18n';
import type { I18nContextValue } from '@/i18n/I18nContext';
import type { Locale } from '@/domain/locales';
import { isOutOfRange } from '@/domain/status';
import type { LabVariable, VariableSeries } from '@/domain/types';
import {
  categoryLabel,
  describeSparkline,
  filterParams,
  groupByCategory,
  hasActiveFilters,
  matchesQuery,
  monthsFor,
  PERIODS,
  readFilters,
  seriesInWindow,
  seriesName,
  sortSeries,
  SORTS,
  summariseSeries,
  timeWindow,
  withCatalog,
  type VariableFilters,
} from '@/domain/variables';
import {
  clearVariableData,
  fetchVariableCatalog,
  subscribeToVariableSeries,
} from '@/services/variables';

/**
 * Laboratory variables (KAN-45).
 *
 * One card per test the user has a result for, grouped by category. The card
 * answers "where is this now, and which way has it been going" — the detail
 * page (KAN-46) answers everything else.
 *
 * This reads `users/{uid}/variableSeries`, which the trend engine (KAN-11)
 * populates. Until Phase 2 extraction and Phase 3 trends exist, the collection
 * is empty and this page shows its empty state. That is deliberate: the
 * alternative is deriving trends in the browser from raw results, which would
 * put the classification logic in two places and let them disagree.
 *
 * ── Why the filters live in the URL ───────────────────────────────────────
 *
 * Every control on this page writes to the query string, and the query string
 * is the only place their state is kept. Nothing is mirrored into React state,
 * because two copies of "which category is selected" is two things that can
 * disagree — and the one the address bar shows would be the one that loses.
 *
 * What that buys, in the order people hit it: a refresh keeps the view; the
 * back button undoes a filter instead of leaving the page; and a narrowed grid
 * can be bookmarked or sent to someone, which is the difference between "look
 * at your potassium" and a link that opens on it.
 */

export function Variables() {
  const { user } = useAuth();
  const { t, locale } = useI18n();

  const [series, setSeries] = useState<VariableSeries[] | null>(null);
  const [catalog, setCatalog] = useState<Map<string, LabVariable> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const { query, category, outOfRangeOnly, sort, period } = useMemo(
    () => readFilters(searchParams),
    [searchParams],
  );

  /**
   * Writes one control's change back to the address bar.
   *
   * `replace` rather than push, because these are adjustments to one view
   * rather than moves between views. Pushing would put an entry in the history
   * for every keystroke in the search box, and leave the back button needing a
   * dozen presses to get out of a page the user typed one word into.
   */
  const updateFilters = useCallback(
    (change: Partial<VariableFilters>) => {
      setSearchParams(
        (current) => filterParams({ ...readFilters(current), ...change }),
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!user) return;
    return subscribeToVariableSeries(
      user.uid,
      (next) => {
        setSeries(next);
        setError(null);
      },
      () => setError(t('variables.loadFailed')),
    );
  }, [user, t]);

  // Names and categories come from the catalog, not from the copy the trend
  // engine denormalised onto each series — see `withCatalog`. Without this the
  // same test is headed differently here and on /trends.
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
        // Already null. The grid falls back to the denormalised names.
      });
    return () => {
      live = false;
    };
  }, []);

  // Memoised because `series ?? []` would mint a fresh array on every render
  // while the subscription is still pending, invalidating every memo below it.
  const all = useMemo(() => withCatalog(series ?? [], catalog), [series, catalog]);

  /**
   * The window the period chips select.
   *
   * Anchored on the newest measurement in the account, not on today — the same
   * arithmetic the variable page uses, so "last 12 months" is one stretch of
   * time across both screens. Anchoring on today would empty the grid for
   * anyone who has not uploaded since last year, which is the reader most in
   * need of seeing what they do have.
   */
  const { from, to } = useMemo(
    () =>
      timeWindow(
        all.flatMap((entry) =>
          entry.points.map((point) => point.observedAt?.toMillis?.() ?? 0).filter(Boolean),
        ),
        monthsFor(period),
        Date.now(),
      ),
    [all, period],
  );

  /**
   * Every tracked variable, as it looks through the chosen window.
   *
   * `all` stays the account's full list — the heading counts what is tracked,
   * not what is currently on screen — and this is what the grid is built from.
   */
  const inWindow = useMemo(() => {
    if (period === 'all') return all;
    return all
      .map((entry) => seriesInWindow(entry, from, to))
      .filter((entry): entry is (typeof all)[number] => entry !== null);
  }, [all, period, from, to]);

  const outOfRangeCount = useMemo(
    () => inWindow.filter((entry) => isOutOfRange(entry.latestStatus)).length,
    [inWindow],
  );

  /**
   * Categories the user actually has results in — not the whole catalog.
   *
   * Ordered by `CATEGORY_ORDER` via `groupByCategory` below rather than by
   * first appearance, so the filter chips sit in the same order as the
   * sections they scroll to.
   */
  const availableCategories = useMemo(() => {
    const present = new Set(inWindow.map((entry) => entry.category));
    return groupByCategory(inWindow, locale)
      .map((group) => group.category)
      .filter((category) => present.has(category));
  }, [inWindow, locale]);

  const visible = useMemo(
    () =>
      inWindow.filter(
        (entry) =>
          matchesQuery(entry, query) &&
          (category === 'all' || entry.category === category) &&
          (!outOfRangeOnly || isOutOfRange(entry.latestStatus)),
      ),
    [inWindow, query, category, outOfRangeOnly],
  );

  const groups = useMemo(() => groupByCategory(visible, locale), [visible, locale]);
  /** The flat orderings. Only read when `sort` is not `category`. */
  const ordered = useMemo(() => sortSeries(visible, sort, locale), [visible, sort, locale]);
  const hasFilters = hasActiveFilters({ query, category, outOfRangeOnly, sort, period });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">
            {series === null
              ? t('reports.loading')
              : t(all.length === 1 ? 'variables.trackedOne' : 'variables.trackedMany', {
                  count: all.length,
                })}
          </div>
          <h1>{t('nav.variables')}</h1>
        </div>
        <div className="spacer" />
        <div style={{ width: 240 }}>
          <Field label={t('variables.search')}>
            {(props) => (
              <TextInput
                {...props}
                type="search"
                placeholder={t('variables.searchPlaceholder')}
                value={query}
                onChange={(event) => updateFilters({ query: event.target.value })}
              />
            )}
          </Field>
        </div>
        {/* In the header rather than at the foot of the page. An account with
            a hundred tracked variables scrolls for a long time, and a control
            for removing them all that only exists past the last card is a
            control the user cannot find. It stays a secondary button beside
            the search field — reachable, not inviting. */}
        {all.length > 0 ? <ClearDataButton count={all.length} t={t} /> : null}
      </div>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {series === null ? (
        <div className="variable-grid" role="status" aria-label={t('variables.loadingLabel')}>
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} height={148} radius="var(--r-card)" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon="flask"
          title={t('variables.emptyTitle')}
          action={
            <ButtonLink to="/upload" variant="primary" icon="upload-simple">
              {t('common.uploadReport')}
            </ButtonLink>
          }
        >
          {t('variables.emptyBody')}
        </EmptyState>
      ) : (
        <>
          <div className="variable-filters">
            <div role="group" aria-label={t('variables.filterCategory')} className="variable-chips">
              <button
                type="button"
                className="chip"
                aria-pressed={category === 'all'}
                onClick={() => updateFilters({ category: 'all' })}
              >
                {t('variables.allCategories')}
              </button>
              {availableCategories.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="chip"
                  aria-pressed={category === option}
                  onClick={() => updateFilters({ category: option })}
                >
                  {categoryLabel(option, locale)}
                </button>
              ))}
            </div>

            {/* The time window, beside the panel filters because it narrows the
                same grid: a period answers "what has been measured lately",
                which is a filter on the cards and not only a scale for the
                sparklines on them. A card whose newest result predates the
                window is removed rather than drawn with a value from outside
                it — showing a 2023 number under "last 12 months" would be the
                card misrepresenting itself. */}
            <div role="group" aria-label={t('period.label')} className="variable-chips">
              {PERIODS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="chip"
                  aria-pressed={period === option.id}
                  onClick={() => updateFilters({ period: option.id })}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>

            <div className="spacer" />

            {/* Ordering, not filtering: every card stays on the page whichever
                of these is pressed. A hundred tests cannot be read by
                scrolling, and the two questions people arrive with — what came
                back in my last report, and what is outside its range — are
                both answered by moving cards to the top rather than by hiding
                the rest. */}
            <div role="group" aria-label={t('variables.sortBy')} className="variable-chips">
              {SORTS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="chip"
                  aria-pressed={sort === option.id}
                  onClick={() => updateFilters({ sort: option.id })}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="chip"
              aria-pressed={outOfRangeOnly}
              onClick={() => updateFilters({ outOfRangeOnly: !outOfRangeOnly })}
            >
              {t('variables.outOfRangeOnly', { count: outOfRangeCount })}
            </button>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon="funnel" title={t('variables.noMatchTitle')}>
              {t('variables.noMatchBody')}
            </EmptyState>
          ) : sort === 'category' ? (
            groups.map((group) => (
              <section key={group.category} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{group.label}</h2>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {t(
                      group.series.length === 1
                        ? 'variables.groupCountOne'
                        : 'variables.groupCountMany',
                      { count: group.series.length },
                    )}
                  </span>
                </div>

                <div className="variable-grid">
                  {group.series.map((entry) => (
                    <VariableCard key={entry.variableId} series={entry} locale={locale} t={t} />
                  ))}
                </div>
              </section>
            ))
          ) : (
            /* Flat, and deliberately without headings: the point of these two
               orderings is that the panel a test belongs to is not what the
               reader is sorting by, and category headings over a list that no
               longer follows them would be labels that lie. */
            <div className="variable-grid">
              {ordered.map((entry) => (
                <VariableCard key={entry.variableId} series={entry} locale={locale} t={t} />
              ))}
            </div>
          )}

          {hasFilters ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {t('variables.showing', { visible: visible.length, total: all.length })}
            </p>
          ) : null}

          {/* The dashboard used to be the page that greeted a signed-in user,
              and it carried this. This page inherits both jobs: it is the
              first thing seen after signing in, and it shows classified
              values — "Alto", "Bajo" — which is exactly the reading the
              disclaimer exists to qualify. Same position as /trends and the
              variable detail page. */}
          <DisclaimerBanner />
        </>
      )}
    </>
  );
}

/**
 * Removing the tracked history (KAN-45).
 *
 * ── Why this control has to exist ─────────────────────────────────────────
 *
 * The values on the cards above are a per-variable history the pipeline folds
 * every processed report into. Deleting a report deletes the PDF and the record
 * pointing at it, and nothing else: a series point carries a value and an
 * instant, never the report it came from (see `updateSeries` in the pipeline),
 * so there is nothing to unwind. Without this the user is left looking at
 * numbers from a report they deleted, with no way to remove them.
 *
 * ── Why it is all-or-nothing ──────────────────────────────────────────────
 *
 * For the same reason. A per-report undo would need attribution the stored
 * points do not have, and offering one that quietly worked only for uploads
 * made after today would be worse than the honest blunt instrument. The dialog
 * therefore says exactly what goes and what stays, and the confirmation is a
 * separate deliberate click — deleting health data is never one misclick.
 *
 * ── Why the explanation lives in the dialog ───────────────────────────────
 *
 * It used to sit in a section under the grid, with the reasoning above it as
 * body text. On an account tracking a hundred variables that section is several
 * screens down, which made the one control for removing them all the hardest
 * thing on the page to find. The button moved into the header; the sentences
 * that justified it moved into the dialog, which is where someone deciding
 * actually reads them.
 */
function ClearDataButton({ count, t }: { count: number; t: I18nContextValue['t'] }) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleClear() {
    setClearing(true);
    try {
      const { cleared } = await clearVariableData();
      // The subscription empties the grid on its own; the toast is what tells
      // the user the silence is the feature working rather than a failed load.
      push(
        t(cleared === 1 ? 'variables.clearedOne' : 'variables.clearedMany', { count: cleared }),
        'success',
      );
      setOpen(false);
    } catch {
      push(t('variables.clearFailed'), 'danger');
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      <Button variant="secondary" icon="trash" onClick={() => setOpen(true)}>
        {t('variables.clearButton')}
      </Button>

      <Modal
        open={open}
        onClose={() => (clearing ? undefined : setOpen(false))}
        title={t('variables.clearTitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={clearing}>
              {t('variables.clearCancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleClear()}
              loading={clearing}
              loadingLabel={t('variables.clearing')}
            >
              {t('variables.clearConfirm')}
            </Button>
          </>
        }
      >
        {/* Why the numbers are still here after the reports were deleted.
            Without it the dialog answers "what will this do" but not "why do
            I need it", which is the question that brought the user here. */}
        <p className="muted" style={{ fontSize: 13 }}>
          {t('variables.clearIntro')}
        </p>
        <p>
          <Trans
            id="variables.clearBody"
            values={{ count, emphasis: <strong>{t('variables.clearBodyEmphasis')}</strong> }}
          />
        </p>
        {/* What survives is as much a part of an informed decision as what
            does not: someone agreeing to this should know their reports are
            still there. */}
        <p style={{ marginBottom: 0 }}>{t('variables.clearKeeps')}</p>
      </Modal>
    </>
  );
}

function VariableCard({
  series,
  locale,
  t,
}: {
  series: VariableSeries;
  locale: Locale;
  t: I18nContextValue['t'];
}) {
  const outOfRange = isOutOfRange(series.latestStatus);
  const name = seriesName(series, locale);

  return (
    <Link
      to={`/variables/${series.variableId}`}
      className="variable-card"
      data-status={series.latestStatus}
      data-flagged={outOfRange || undefined}
      // The card is one link; without this the accessible name would be the
      // concatenation of every number on it.
      aria-label={t('variables.cardLabel', {
        name,
        value: `${series.latestRawValue || series.latestValue}${
          series.unit ? ` ${series.unit}` : ''
        }`,
      })}
    >
      <div className="variable-card-head">
        <span className="card-title">{name}</span>
        <ResultStatusBadge status={series.latestStatus} />
      </div>

      <div className="variable-card-value">
        {/* Non-numeric results ("Negative", "Trace") are shown verbatim — the
            spec forbids coercing them into a number they never were. */}
        <span className="variable-card-number">
          {series.latestValue ?? series.latestRawValue}
        </span>
        {series.unit ? <span className="variable-card-unit">{series.unit}</span> : null}
      </div>

      <Sparkline series={series} description={describeSparkline(series, locale)} />

      <div className="card-meta">{summariseSeries(series, locale)}</div>
    </Link>
  );
}
