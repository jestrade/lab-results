import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button, ButtonLink } from '@/components/Button';
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
import type { LabVariable, VariableCategory, VariableSeries } from '@/domain/types';
import {
  categoryLabel,
  describeSparkline,
  groupByCategory,
  matchesQuery,
  seriesName,
  summariseSeries,
  withCatalog,
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
 */
export function Variables() {
  const { user } = useAuth();
  const { t, locale } = useI18n();

  const [series, setSeries] = useState<VariableSeries[] | null>(null);
  const [catalog, setCatalog] = useState<Map<string, LabVariable> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<VariableCategory | 'all'>('all');
  const [outOfRangeOnly, setOutOfRangeOnly] = useState(false);

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

  const outOfRangeCount = useMemo(
    () => all.filter((entry) => isOutOfRange(entry.latestStatus)).length,
    [all],
  );

  /**
   * Categories the user actually has results in — not the whole catalog.
   *
   * Ordered by `CATEGORY_ORDER` via `groupByCategory` below rather than by
   * first appearance, so the filter chips sit in the same order as the
   * sections they scroll to.
   */
  const availableCategories = useMemo(() => {
    const present = new Set(all.map((entry) => entry.category));
    return groupByCategory(all, locale)
      .map((group) => group.category)
      .filter((category) => present.has(category));
  }, [all, locale]);

  const visible = useMemo(
    () =>
      all.filter(
        (entry) =>
          matchesQuery(entry, query) &&
          (category === 'all' || entry.category === category) &&
          (!outOfRangeOnly || isOutOfRange(entry.latestStatus)),
      ),
    [all, query, category, outOfRangeOnly],
  );

  const groups = useMemo(() => groupByCategory(visible, locale), [visible, locale]);
  const hasFilters = query.trim() !== '' || category !== 'all' || outOfRangeOnly;

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
                onChange={(event) => setQuery(event.target.value)}
              />
            )}
          </Field>
        </div>
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
              {t('dashboard.uploadReport')}
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
                onClick={() => setCategory('all')}
              >
                {t('variables.allCategories')}
              </button>
              {availableCategories.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="chip"
                  aria-pressed={category === option}
                  onClick={() => setCategory(option)}
                >
                  {categoryLabel(option, locale)}
                </button>
              ))}
            </div>

            <div className="spacer" />

            <button
              type="button"
              className="chip"
              aria-pressed={outOfRangeOnly}
              onClick={() => setOutOfRangeOnly((current) => !current)}
            >
              {t('variables.outOfRangeOnly', { count: outOfRangeCount })}
            </button>
          </div>

          {groups.length === 0 ? (
            <EmptyState icon="funnel" title={t('variables.noMatchTitle')}>
              {t('variables.noMatchBody')}
            </EmptyState>
          ) : (
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
          )}

          {hasFilters ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {t('variables.showing', { visible: visible.length, total: all.length })}
            </p>
          ) : null}

          {/* Last on the page, and only when there is something to remove:
              the control that empties it should never be the first thing the
              eye lands on, and it has nothing to say to an account with no
              variables — that case gets the empty state above instead. */}
          <ClearDataSection count={all.length} t={t} />
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
 */
function ClearDataSection({ count, t }: { count: number; t: I18nContextValue['t'] }) {
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
      <div className="danger-zone">
        <h3>{t('variables.clearHeading')}</h3>
        <p className="muted">{t('variables.clearIntro')}</p>
        <div>
          <Button variant="secondary" icon="trash" onClick={() => setOpen(true)}>
            {t('variables.clearButton')}
          </Button>
        </div>
      </div>

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
