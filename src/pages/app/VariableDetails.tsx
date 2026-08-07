import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { ButtonLink } from '@/components/Button';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { Skeleton, SkeletonTable } from '@/components/Skeleton';
import { ConfidenceTag, ResultStatusBadge, TrendBadge } from '@/components/StatusBadge';
import { VariableChart } from '@/components/VariableChart';
import { translateOptional, type Locale } from '@/domain/locales';
import {
  categoryLabel,
  formatReferenceRange,
  MIN_POINTS_FOR_TREND,
  monthsFor,
  PERIODS,
  seriesName,
  timeWindow,
  type Period,
} from '@/domain/variables';
import {
  describeChange,
  latestAnalysed,
  splitMeasurements,
  type VariableMeasurement,
} from '@/domain/variableDetail';
import type { LabVariable, VariableSeries } from '@/domain/types';
import { formatObservedDate, formatObservedLongDate } from '@/i18n/dates';
import type { I18nContextValue } from '@/i18n/I18nContext';
import { useI18n } from '@/i18n/useI18n';
import { fetchVariableCatalog, subscribeToVariableSeriesEntry } from '@/services/variables';
import { fetchVariableHistory, type VariableHistory } from '@/services/variableHistory';

/**
 * One laboratory variable, in full (KAN-14, KAN-46).
 *
 * ── What this page is arranged around ─────────────────────────────────────
 *
 * Three kinds of statement share this screen, and the whole layout exists to
 * keep them apart:
 *
 *   what the laboratory measured — the values, their units, their ranges and
 *   the reports they were printed on;
 *   what this application computed — a direction of travel, and nothing more;
 *   what a language model wrote — the explanation of the test and the
 *   commentary on the latest result.
 *
 * The first is the record. The second is arithmetic over the record, and says
 * so. The third is neither, and is boxed, labelled and dated so that it can
 * never be mistaken for either. Blurring those three is the failure this
 * product cannot afford, so nothing here is styled to look like anything else.
 *
 * ── Where the numbers come from ───────────────────────────────────────────
 *
 * The header reads the series document, which the trend engine maintains and
 * the client cannot write. Everything below the header reads the results on
 * the reports themselves, because a series point is a value and an instant and
 * this page has to answer "measured against what, and on which report" for
 * every one of them. See `services/variableHistory.ts` for why that is a query
 * per report rather than one query across all of them.
 */

export function VariableDetails() {
  const { variableId } = useParams<{ variableId: string }>();
  const { user } = useAuth();
  const { t, locale } = useI18n();

  // `undefined` is "still loading" and `null` is "this user tracks nothing by
  // that id" — two states that must not share a rendering.
  const [series, setSeries] = useState<VariableSeries | null | undefined>(undefined);
  const [entry, setEntry] = useState<LabVariable | null>(null);
  const [history, setHistory] = useState<VariableHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [period, setPeriod] = useState<Period>('all');
  const [showRange, setShowRange] = useState(true);

  useEffect(() => {
    if (!user || !variableId) return;
    return subscribeToVariableSeriesEntry(user.uid, variableId, setSeries, () =>
      setError(t('variable.loadFailed')),
    );
  }, [user, variableId, t]);

  // The catalog supplies the name and the explanation. Its absence costs the
  // reader the explanation, never the page — the series carries a usable name.
  useEffect(() => {
    if (!variableId) return;
    let live = true;
    fetchVariableCatalog()
      .then((catalog) => {
        if (live) setEntry(catalog.get(variableId) ?? null);
      })
      .catch(() => {
        // Already null. The heading falls back to the denormalised name.
      });
    return () => {
      live = false;
    };
  }, [variableId]);

  useEffect(() => {
    if (!user || !variableId) return;
    let live = true;
    setHistory(null);
    setHistoryError(null);
    fetchVariableHistory(user.uid, variableId)
      .then((result) => {
        if (live) setHistory(result);
      })
      .catch(() => {
        if (live) setHistoryError(t('variable.historyFailed'));
      });
    return () => {
      live = false;
    };
  }, [user, variableId, t]);

  const measurements = useMemo(() => history?.measurements ?? [], [history]);
  const { numeric, qualitative } = useMemo(
    () => splitMeasurements(measurements),
    [measurements],
  );

  const name = useMemo(() => {
    if (entry) return entry.names[locale] ?? entry.canonicalName;
    if (series) return seriesName(series, locale);
    return variableId ?? '';
  }, [entry, series, locale, variableId]);

  const { from, to } = useMemo(
    () =>
      timeWindow(
        numeric.map((measurement) => measurement.observedAt.getTime()),
        monthsFor(period),
        Date.now(),
      ),
    [numeric, period],
  );

  if (error) {
    return (
      <Alert tone="danger" live>
        {error}
      </Alert>
    );
  }

  if (series === undefined) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Skeleton height={120} radius="var(--r-card)" />
        <Skeleton height={280} radius="var(--r-card)" />
      </div>
    );
  }

  if (series === null) {
    return (
      <EmptyState
        icon="flask"
        title={t('variable.missingTitle')}
        action={
          <ButtonLink to="/variables" variant="primary">
            {t('variable.backToVariables')}
          </ButtonLink>
        }
      >
        {t('variable.missingBody')}
      </EmptyState>
    );
  }

  const range = formatReferenceRange(series.referenceRange, locale);
  const analysed = latestAnalysed(measurements);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">
            <ButtonLink to="/variables" variant="ghost">
              <Icon name="arrow-left" size={13} /> {t('nav.variables')}
            </ButtonLink>
          </div>
          <h1>{name}</h1>
        </div>
        <div className="spacer" />
        <ResultStatusBadge status={series.latestStatus} describe />
        <TrendBadge trend={series.trend} />
      </div>

      {/* ── what the laboratory measured, most recently ───────────────────── */}
      <section className="variable-hero" aria-label={t('variable.currentHeading')}>
        <div>
          <div className="kicker-quiet">{t('variable.currentHeading')}</div>
          <div className="variable-hero-value">
            {/* Verbatim. "Negative" and "<0.01" are results, and rewriting
                either into a number would misreport what the laboratory said. */}
            <span className="variable-hero-number">
              {series.latestRawValue || series.latestValue}
            </span>
            {series.unit ? <span className="variable-hero-unit">{series.unit}</span> : null}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {t('variable.lastMeasured', {
              date: formatObservedLongDate(series.latestObservedAt.toDate(), locale),
            })}
          </div>
        </div>

        <dl className="variable-hero-facts">
          <Fact label={t('detail.col.range')} value={range.text ?? t('detail.notStated')} note={range.note} />
          <Fact label={t('variable.categoryLabel')} value={categoryLabel(series.category, locale)} />
          <Fact
            label={t('variable.measuredLabel')}
            value={t(series.resultCount === 1 ? 'variable.measuredOne' : 'variable.measuredMany', {
              count: series.resultCount,
            })}
          />
        </dl>
      </section>

      {historyError ? <Alert tone="warning">{historyError}</Alert> : null}

      {/* ── the history, charted ──────────────────────────────────────────── */}
      <section className="trend-card">
        <div className="trend-card-head">
          <h2>{t('variable.historyHeading')}</h2>
          <div className="spacer" />
          <div role="group" aria-label={t('period.label')} className="variable-chips">
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
          {/* Hiding the band is a reading aid, not a correction: the values do
              not change, only what they are drawn against. */}
          <button
            type="button"
            className="chip"
            aria-pressed={showRange}
            onClick={() => setShowRange((current) => !current)}
          >
            {t('variable.showRange')}
          </button>
        </div>

        {history === null && !historyError ? (
          <Skeleton height={220} radius="var(--r-card)" />
        ) : numeric.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {t(qualitative.length > 0 ? 'variable.noNumeric' : 'chart.noMeasurements')}
          </p>
        ) : (
          <>
            {/* The chart's equivalent in words, visible rather than hidden:
                it is the fastest read on the page for everyone, and the only
                one available to a reader who cannot see the plot. */}
            <p className="variable-change">{describeChange(name, numeric, locale)}</p>

            <VariableChart
              name={name}
              points={numeric}
              from={from}
              to={to}
              showRange={showRange}
            />

            {numeric.length < MIN_POINTS_FOR_TREND ? (
              <Alert tone="info">
                {t(numeric.length === 1 ? 'variable.tooFewOne' : 'variable.tooFewMany', {
                  count: numeric.length,
                  min: MIN_POINTS_FOR_TREND,
                })}
              </Alert>
            ) : null}

            {/* What the chart is and is not. It sat under the same charts on
                /trends, and it belongs next to a plot with a direction badge
                above it: the scale is this variable's own, the band is the one
                its own reports printed, and a direction is movement rather
                than a verdict. */}
            <p className="muted trend-note">{t('variable.chartNote')}</p>
          </>
        )}

        {history?.truncated ? (
          <p className="faint" style={{ margin: 0, fontSize: 12 }}>
            {t('variable.historyTruncated', { count: history.reportsScanned })}
          </p>
        ) : null}
      </section>

      {/* ── results that were never numbers ───────────────────────────────── */}
      {qualitative.length > 0 ? (
        <section className="trend-card">
          <div className="trend-card-head">
            <h2>{t('variable.qualitativeHeading')}</h2>
          </div>
          <p className="muted trend-card-meta">{t('variable.qualitativeBody')}</p>
          <ol className="variable-qualitative">
            {qualitative.map((measurement) => (
              <li key={measurement.id}>
                <span className="variable-qualitative-date">
                  {formatObservedDate(measurement.observedAt, locale)}
                </span>
                <span className="variable-qualitative-value">{measurement.rawValue || '—'}</span>
                <ResultStatusBadge status={measurement.status} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="variable-panels">
        {/* ── what the test is ──────────────────────────────────────────────
            Reference content about the test itself, not about this reader's
            result — which is why it sits apart from both the chart and the
            commentary below it. */}
        <section className="trend-card">
          <div className="trend-card-head">
            <h2>{t('variable.explanationHeading')}</h2>
          </div>
          <Explanation entry={entry} locale={locale} t={t} />
          {series.aliases.length > 0 ? (
            <p className="faint" style={{ margin: 0, fontSize: 12 }}>
              {t('variable.aliases', { names: series.aliases.join(', ') })}
            </p>
          ) : null}
        </section>

        {/* ── what a model wrote about this reader's result ─────────────────
            Same treatment as on the report page, deliberately: one visual
            language for machine-generated commentary, everywhere it appears. */}
        <section className="trend-card">
          <div className="trend-card-head">
            <h2>{t('variable.analysisHeading')}</h2>
          </div>
          {analysed?.analysis ? (
            <div className="result-analysis">
              <div className="result-analysis-head">
                <Icon name="sparkle" size={14} />
                {t('detail.aiGenerated')}
              </div>
              {/* Generated server-side, in English — see the note in
                  `functions/src/ai/prompts.ts`. */}
              <p>{analysed.analysis.text}</p>
              <div className="faint" style={{ fontSize: 11 }}>
                {t('variable.analysisOf', {
                  date: formatObservedDate(analysed.observedAt, locale),
                })}
                {' · '}
                {t('detail.promptVersion', {
                  model: analysed.analysis.model,
                  version: analysed.analysis.promptVersion,
                })}
              </div>
            </div>
          ) : history === null && !historyError ? (
            <Skeleton height={72} radius="var(--r-card)" />
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {t('variable.analysisMissing')}
            </p>
          )}
        </section>
      </div>

      {/* ── every measurement, as a table ─────────────────────────────────── */}
      <section className="trend-card">
        <div className="trend-card-head">
          <h2>{t('variable.tableHeading')}</h2>
        </div>

        {history === null && !historyError ? (
          <SkeletonTable rows={4} columns={5} />
        ) : measurements.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {t('variable.tableEmpty')}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <caption className="sr-only">{t('variable.tableCaption', { name })}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('variable.col.date')}</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    {t('detail.col.value')}
                  </th>
                  <th scope="col">{t('detail.col.unit')}</th>
                  <th scope="col">{t('detail.col.range')}</th>
                  <th scope="col">{t('detail.col.status')}</th>
                  <th scope="col">{t('variable.col.report')}</th>
                </tr>
              </thead>
              <tbody>
                {/* Newest first: the table is read as "what happened lately",
                    while the chart is read left to right as "what happened". */}
                {[...measurements].reverse().map((measurement) => (
                  <MeasurementRow
                    key={measurement.id}
                    measurement={measurement}
                    locale={locale}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DisclaimerBanner />
    </>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div>
      <dt className="kicker-quiet">{label}</dt>
      <dd style={{ margin: 0, fontSize: 14 }}>
        {value}
        {note ? <div className="faint" style={{ fontSize: 11 }}>{note}</div> : null}
      </dd>
    </div>
  );
}

/**
 * The catalog's explanation of the test.
 *
 * An entry the pipeline created from a name on someone's report has had no
 * human review, and the spec requires that to be visible rather than implied:
 * a plausible paragraph about the wrong test is worse than no paragraph.
 */
function Explanation({
  entry,
  locale,
  t,
}: {
  entry: LabVariable | null;
  locale: Locale;
  t: I18nContextValue['t'];
}) {
  const description = translateOptional(entry?.descriptions, locale);

  if (!description) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {t('variable.explanationMissing')}
      </p>
    );
  }

  return (
    <>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>{description}</p>
      {entry?.origin === 'discovered' ? (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          <Icon name="info" size={13} /> {t('variable.explanationUnreviewed')}
        </p>
      ) : null}
    </>
  );
}

/**
 * `locale` and `t` are passed down rather than read from context again: this
 * renders once per measurement, and a decade of bloodwork should not mean
 * twenty context subscriptions.
 */
function MeasurementRow({
  measurement,
  locale,
  t,
}: {
  measurement: VariableMeasurement;
  locale: Locale;
  t: I18nContextValue['t'];
}) {
  const range = formatReferenceRange(measurement.referenceRange, locale);

  return (
    <tr>
      <th scope="row" style={{ textAlign: 'left', fontWeight: 500, textTransform: 'none', fontSize: 14, letterSpacing: 0 }}>
        {formatObservedDate(measurement.observedAt, locale)}
      </th>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {measurement.rawValue || '—'}
      </td>
      <td className="muted">{measurement.unit ?? '—'}</td>
      <td>
        {/* Each row's own range, not the newest one. Re-judging an old result
            by today's interval would rewrite what the report actually said. */}
        {range.text ?? <span className="muted">{t('detail.notStated')}</span>}
        {range.note ? (
          <div className="faint" style={{ fontSize: 11 }}>
            {range.note}
          </div>
        ) : null}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <ResultStatusBadge status={measurement.status} />
          <ConfidenceTag confidence={measurement.confidence} />
        </div>
      </td>
      <td>
        <Link to={`/reports/${measurement.reportId}`}>
          {measurement.reportFileName || t('variable.openReport')}
        </Link>
      </td>
    </tr>
  );
}
