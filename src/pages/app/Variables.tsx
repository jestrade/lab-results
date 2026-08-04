import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { ButtonLink } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Field, TextInput } from '@/components/Field';
import { Skeleton } from '@/components/Skeleton';
import { Sparkline } from '@/components/Sparkline';
import { ResultStatusBadge } from '@/components/StatusBadge';
import { isOutOfRange } from '@/domain/status';
import type { VariableCategory, VariableSeries } from '@/domain/types';
import {
  CATEGORY_LABEL,
  describeSparkline,
  groupByCategory,
  matchesQuery,
  summariseSeries,
} from '@/domain/variables';
import { subscribeToVariableSeries } from '@/services/variables';

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

  const [series, setSeries] = useState<VariableSeries[] | null>(null);
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
      () => setError('We could not load your variables. Check your connection and try again.'),
    );
  }, [user]);

  // Memoised because `series ?? []` would mint a fresh array on every render
  // while the subscription is still pending, invalidating every memo below it.
  const all = useMemo(() => series ?? [], [series]);

  const outOfRangeCount = useMemo(
    () => all.filter((entry) => isOutOfRange(entry.latestStatus)).length,
    [all],
  );

  /** Categories the user actually has results in — not the whole catalog. */
  const availableCategories = useMemo(() => {
    const present = new Set(all.map((entry) => entry.category));
    return [...present];
  }, [all]);

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

  const groups = useMemo(() => groupByCategory(visible), [visible]);
  const hasFilters = query.trim() !== '' || category !== 'all' || outOfRangeOnly;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">
            {series === null
              ? 'Loading'
              : `${all.length} variable${all.length === 1 ? '' : 's'} tracked`}
          </div>
          <h1>Laboratory variables</h1>
        </div>
        <div className="spacer" />
        <div style={{ width: 240 }}>
          <Field label="Search">
            {(props) => (
              <TextInput
                {...props}
                type="search"
                placeholder="Search a test or alias"
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
        <div className="variable-grid" role="status" aria-label="Loading variables">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} height={148} radius="var(--r-card)" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon="flask"
          title="No variables tracked yet"
          action={
            <ButtonLink to="/upload" variant="primary" icon="upload-simple">
              Upload a report
            </ButtonLink>
          }
        >
          Once a report has been processed, every test on it appears here with its latest value and
          how it has moved over time.
        </EmptyState>
      ) : (
        <>
          <div className="variable-filters">
            <div role="group" aria-label="Filter by category" className="variable-chips">
              <button
                type="button"
                className="chip"
                aria-pressed={category === 'all'}
                onClick={() => setCategory('all')}
              >
                All categories
              </button>
              {availableCategories.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="chip"
                  aria-pressed={category === option}
                  onClick={() => setCategory(option)}
                >
                  {CATEGORY_LABEL[option]}
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
              Outside range only ({outOfRangeCount})
            </button>
          </div>

          {groups.length === 0 ? (
            <EmptyState icon="funnel" title="Nothing matches">
              No tracked variable matches those filters.
            </EmptyState>
          ) : (
            groups.map((group) => (
              <section key={group.category} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{group.label}</h2>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {group.series.length} variable{group.series.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="variable-grid">
                  {group.series.map((entry) => (
                    <VariableCard key={entry.variableId} series={entry} />
                  ))}
                </div>
              </section>
            ))
          )}

          {hasFilters ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Showing {visible.length} of {all.length} variables.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

function VariableCard({ series }: { series: VariableSeries }) {
  const outOfRange = isOutOfRange(series.latestStatus);

  return (
    <Link
      to={`/variables/${series.variableId}`}
      className="variable-card"
      data-status={series.latestStatus}
      data-flagged={outOfRange || undefined}
      // The card is one link; without this the accessible name would be the
      // concatenation of every number on it.
      aria-label={`${series.canonicalName}, ${series.latestRawValue || series.latestValue}${
        series.unit ? ` ${series.unit}` : ''
      }`}
    >
      <div className="variable-card-head">
        <span className="card-title">{series.canonicalName}</span>
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

      <Sparkline series={series} description={describeSparkline(series)} />

      <div className="card-meta">{summariseSeries(series)}</div>
    </Link>
  );
}
