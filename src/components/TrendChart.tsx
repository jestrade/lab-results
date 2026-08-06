import { useId } from 'react';

import type { ResultStatus, VariableSeries } from '@/domain/types';
import { formatReferenceRange, seriesName } from '@/domain/variables';
import { intlTag } from '@/i18n/dates';
import { useI18n } from '@/i18n/useI18n';
import type { Locale } from '@/domain/locales';

const STATUS_COLOUR: Record<ResultStatus, string> = {
  normal: 'var(--color-accent)',
  low: 'var(--color-accent)',
  high: 'var(--feedback-warning-ink)',
  critical: 'var(--chart-point-critical)',
  unknown: 'var(--color-neutral-500)',
};

export interface TrendChartProps {
  series: VariableSeries;
  /** Window to draw, so several charts share one time axis. */
  from: number;
  to: number;
  height?: number;
}

/**
 * One variable's history over time (KAN-46, KAN-47).
 *
 * Draws the reference band behind the line, because a value means nothing
 * without the band it was measured against — and the band is the report's own,
 * never a remembered one.
 *
 * The accessible alternative is a real table, not a sentence. A sentence can
 * say "rose from 4.4 to 6.3"; only the table lets someone who cannot see the
 * chart read the same numbers the sighted reader is reading (spec §60,
 * KAN-53).
 */
export function TrendChart({ series, from, to, height = 180 }: TrendChartProps) {
  const titleId = useId();
  const { t, locale } = useI18n();
  const width = 640;
  const pad = { top: 16, right: 16, bottom: 26, left: 44 };

  const points = series.points
    .map((point) => ({ value: point.value, at: point.observedAt.toDate().getTime() }))
    .filter((point) => point.at >= from && point.at <= to)
    .sort((a, b) => a.at - b.at);

  const range = formatReferenceRange(series.referenceRange, locale);
  const { low, high } = series.referenceRange;

  // The y-axis must cover both the values and the reference band, or a result
  // sitting outside the band would be drawn as if it were inside it.
  const candidates = [
    ...points.map((point) => point.value),
    ...(typeof low === 'number' ? [low] : []),
    ...(typeof high === 'number' ? [high] : []),
  ];

  if (points.length === 0 || candidates.length === 0) {
    return (
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        {t('chart.noMeasurements')}
      </p>
    );
  }

  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = max - min || Math.abs(max) || 1;
  const yMin = min - span * 0.15;
  const yMax = max + span * 0.15;

  const x = (at: number) =>
    pad.left + ((at - from) / Math.max(1, to - from)) * (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top + (1 - (value - yMin) / (yMax - yMin)) * (height - pad.top - pad.bottom);

  const unit = series.unit ? ` ${series.unit}` : '';
  // Named from the catalog, like the visible heading. A text alternative that
  // calls the chart something other than what the page calls it leaves a
  // screen-reader user unable to tell which chart they are on.
  const name = seriesName(series, locale);
  const summary = t(points.length === 1 ? 'chart.summaryOne' : 'chart.summaryMany', {
    name,
    count: points.length,
    firstDate: formatDate(points[0]!.at, locale),
    lastDate: formatDate(points[points.length - 1]!.at, locale),
    firstValue: `${points[0]!.value}${unit}`,
    lastValue: `${points[points.length - 1]!.value}${unit}`,
    range: range.text ?? t('chart.rangeNotStated'),
  });

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{summary}</title>

        {typeof low === 'number' && typeof high === 'number' ? (
          <rect
            x={pad.left}
            y={y(high)}
            width={width - pad.left - pad.right}
            height={Math.max(1, y(low) - y(high))}
            fill="var(--chart-band)"
          />
        ) : null}

        {[low, high].map((bound) =>
          typeof bound === 'number' ? (
            <g key={bound}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(bound)}
                y2={y(bound)}
                stroke="var(--chart-band-edge)"
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              <text x={pad.left - 6} y={y(bound) + 4} fontSize="10" textAnchor="end" fill="var(--color-text-muted)">
                {bound}
              </text>
            </g>
          ) : null,
        )}

        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={height - pad.bottom}
          y2={height - pad.bottom}
          stroke="var(--chart-axis)"
          strokeWidth="1"
        />

        {points.length > 1 ? (
          <polyline
            points={points.map((point) => `${x(point.at)},${y(point.value)}`).join(' ')}
            fill="none"
            stroke="var(--chart-line)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {points.map((point, index) => {
          // Only the newest point's status is known for certain; earlier ones
          // are drawn plainly rather than assigned a status they may not have
          // had against their own report's range.
          const isLatest = index === points.length - 1;
          const colour = isLatest ? STATUS_COLOUR[series.latestStatus] : 'var(--chart-line)';
          return (
            <circle
              key={point.at}
              cx={x(point.at)}
              cy={y(point.value)}
              r={isLatest ? 5 : 3.5}
              fill={isLatest ? colour : 'var(--panel-bg)'}
              stroke={colour}
              strokeWidth="2"
            />
          );
        })}

        {/* The latest value, on the chart. Without it the only numbers visible
            are the range bounds, and "where am I now" is the question people
            open this page with. Earlier points stay unlabelled — the table
            below carries those, and labelling all of them collides. */}
        <text
          x={x(points[points.length - 1]!.at)}
          y={y(points[points.length - 1]!.value) - 11}
          fontSize="11"
          fontWeight="600"
          textAnchor="end"
          fill="var(--color-text)"
        >
          {points[points.length - 1]!.value}
          {unit}
        </text>

        <text x={pad.left} y={height - 8} fontSize="10" fill="var(--color-text-muted)">
          {formatDate(from, locale)}
        </text>
        <text x={width - pad.right} y={height - 8} fontSize="10" textAnchor="end" fill="var(--color-text-muted)">
          {formatDate(to, locale)}
        </text>
      </svg>

      {/* The equivalent, not a summary of it. */}
      <details className="chart-data">
        <summary>
          {t(points.length === 1 ? 'chart.showTableOne' : 'chart.showTableMany', {
            count: points.length,
          })}
        </summary>
        <table className="table">
          <caption className="sr-only">{t('chart.tableCaption', { name })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('chart.date')}</th>
              <th scope="col" style={{ textAlign: 'right' }}>
                {t('chart.value')}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.at}>
                <td>{formatDate(point.at, locale)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {point.value}
                  {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/**
 * Formatted in UTC, deliberately.
 *
 * A report's date is stored as UTC midnight of the day the laboratory printed
 * on it — a calendar date, not an instant. Rendering that in the reader's local
 * zone moves a 1 March report to 28 February for everyone west of UTC, which
 * on a month-granularity axis puts the point in the wrong month.
 */
function formatDate(at: number, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(at));
}
