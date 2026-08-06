import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';

import type { Locale } from '@/domain/locales';
import type { NumericMeasurement } from '@/domain/variableDetail';
import { formatReferenceRange } from '@/domain/variables';
import { present, RESULT_STATUS } from '@/domain/status';
import { formatObservedDate, formatObservedLongDate } from '@/i18n/dates';
import { useI18n } from '@/i18n/useI18n';
import { Button } from './Button';
import { Icon } from './Icon';
import { ResultStatusBadge } from './StatusBadge';

/**
 * One variable's measurements over time, interactively (KAN-14, KAN-46).
 *
 * ── How this differs from `TrendChart` ────────────────────────────────────
 *
 * `TrendChart` draws a series: a value and an instant per point, one reference
 * band, no interaction. It is the right thing on /trends, where several charts
 * are stacked and read as a group.
 *
 * This one draws *measurements*, which carry the rest of what a report said
 * about each value — the range it was measured against, the status it was
 * given, the document it came from. Three consequences follow, and they are
 * the reason this is a separate component rather than a flag on that one:
 *
 *   The band is stepped, not constant. Each point is drawn against its own
 *   report's range, so a laboratory that changed its reference interval shows
 *   as a step in the band rather than silently re-judging old results by
 *   today's numbers.
 *
 *   Each point is operable. Focusing or hovering one opens what that report
 *   said; activating it pins that open so the link to the report can be
 *   reached — by keyboard as well as by mouse.
 *
 *   The window can be narrowed by dragging across the plot. The period buttons
 *   beside the chart do the same thing without a pointer, which is what keeps
 *   the drag an accelerator rather than the only way in.
 */

export interface VariableChartProps {
  name: string;
  /** Every numeric measurement; the chart draws the ones in the window. */
  points: NumericMeasurement[];
  /** The period chosen on the page. Zoom narrows within it. */
  from: number;
  to: number;
  /** Whether the reference band is drawn. Toggled by the page. */
  showRange?: boolean;
  height?: number;
}

const WIDTH = 640;
const PAD = { top: 18, right: 18, bottom: 28, left: 46 };

/** Below this a drag is a click that moved, not a selection. */
const MIN_DRAG_PX = 6;

export function VariableChart({
  name,
  points,
  from,
  to,
  showRange = true,
  height = 220,
}: VariableChartProps) {
  const { t, locale } = useI18n();
  const labelId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState<{ from: number; to: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);

  // A new period is a new question. Keeping a zoom from the previous one would
  // leave "Last 12 months" showing three weeks of it with no way to tell.
  useEffect(() => {
    setZoom(null);
    setActive(null);
    setPinned(false);
  }, [from, to]);

  const view = zoom ?? { from, to };

  const visible = useMemo(
    () =>
      points
        .map((point) => ({ point, at: point.observedAt.getTime() }))
        .filter((entry) => entry.at >= view.from && entry.at <= view.to)
        .sort((a, b) => a.at - b.at),
    [points, view.from, view.to],
  );

  /**
   * The band, one segment per measurement.
   *
   * A segment runs halfway to its neighbours, so the change from one range to
   * the next lands between the two points it separates rather than on either
   * of them.
   */
  const bands = useMemo(
    () =>
      visible.map((entry, index) => {
        const previous = visible[index - 1];
        const next = visible[index + 1];
        return {
          from: previous ? (previous.at + entry.at) / 2 : view.from,
          to: next ? (entry.at + next.at) / 2 : view.to,
          low: entry.point.referenceRange.low,
          high: entry.point.referenceRange.high,
        };
      }),
    [visible, view.from, view.to],
  );

  // The axis has to cover the values *and* every bound drawn beside them, or a
  // result sitting outside its range would be drawn as though it were inside.
  const candidates = [
    ...visible.map((entry) => entry.point.value),
    ...(showRange
      ? bands.flatMap((band) =>
          [band.low, band.high].filter((bound): bound is number => typeof bound === 'number'),
        )
      : []),
  ];

  const summary = useMemo(() => {
    if (visible.length === 0) return t('chart.noMeasurements');
    const unit = visible[0]!.point.unit ? ` ${visible[0]!.point.unit}` : '';
    return t(visible.length === 1 ? 'chart.summaryOne' : 'chart.summaryMany', {
      name,
      count: visible.length,
      firstDate: formatObservedDate(new Date(visible[0]!.at), locale),
      lastDate: formatObservedDate(new Date(visible.at(-1)!.at), locale),
      firstValue: `${visible[0]!.point.value}${unit}`,
      lastValue: `${visible.at(-1)!.point.value}${unit}`,
      range:
        formatReferenceRange(visible.at(-1)!.point.referenceRange, locale).text ??
        t('chart.rangeNotStated'),
    });
  }, [visible, name, locale, t]);

  if (visible.length === 0 || candidates.length === 0) {
    return (
      <div className="variable-chart">
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {t('chart.noMeasurements')}
        </p>
        {zoom ? <ResetZoom onReset={() => setZoom(null)} label={t('variableChart.resetZoom')} /> : null}
      </div>
    );
  }

  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = max - min || Math.abs(max) || 1;
  const yMin = min - span * 0.15;
  const yMax = max + span * 0.15;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  // A single measurement has no interval to spread across; it is drawn in the
  // middle of the window rather than pinned to whichever edge the arithmetic
  // would put it on.
  const flat = view.to - view.from <= 0;
  const x = (at: number) =>
    flat ? PAD.left + plotWidth / 2 : PAD.left + ((at - view.from) / (view.to - view.from)) * plotWidth;
  const y = (value: number) => PAD.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

  /** Client x → the instant under the pointer, or null when unmeasurable. */
  function timeAt(clientX: number): number | null {
    const box = svgRef.current?.getBoundingClientRect();
    // jsdom and a chart that has not been laid out both report zero width.
    if (!box || box.width === 0) return null;
    const viewX = ((clientX - box.left) / box.width) * WIDTH;
    const ratio = (viewX - PAD.left) / plotWidth;
    return view.from + Math.min(1, Math.max(0, ratio)) * (view.to - view.from);
  }

  function handlePointerDown(event: PointerEvent<SVGRectElement>) {
    if (event.button !== 0) return;
    const at = timeAt(event.clientX);
    if (at === null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ from: at, to: at });
  }

  function handlePointerMove(event: PointerEvent<SVGRectElement>) {
    if (!drag) return;
    const at = timeAt(event.clientX);
    if (at === null) return;
    setDrag({ ...drag, to: at });
  }

  function handlePointerUp(event: PointerEvent<SVGRectElement>) {
    if (!drag) return;
    const box = svgRef.current?.getBoundingClientRect();
    const pixels = box
      ? (Math.abs(x(drag.to) - x(drag.from)) / WIDTH) * box.width
      : 0;
    setDrag(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    // A short drag is a misfired click. Zooming on it would move the chart
    // under someone who was trying to open a point.
    if (pixels < MIN_DRAG_PX) return;
    setZoom({ from: Math.min(drag.from, drag.to), to: Math.max(drag.from, drag.to) });
  }

  function open(index: number) {
    setActive(index);
    setPinned(true);
    // Focus follows, so the report link inside is the next thing Tab reaches
    // rather than the next point along.
    requestAnimationFrame(() => tooltipRef.current?.focus());
  }

  function close(returnFocusTo?: number) {
    setPinned(false);
    setActive(null);
    if (returnFocusTo !== undefined) {
      svgRef.current
        ?.querySelector<SVGGElement>(`[data-point="${returnFocusTo}"]`)
        ?.focus();
    }
  }

  const activePoint = active !== null ? visible[active] : undefined;
  const latestBand = bands.at(-1);

  return (
    <div className="variable-chart">
      <div
        className="variable-chart-plot"
        onPointerLeave={() => {
          if (!pinned) setActive(null);
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${height}`}
          style={{ width: '100%', height: 'auto', touchAction: 'pan-y' }}
          // Not `role="img"`: that would hide the points from assistive
          // technology, and the points are the interactive part of this chart.
          role="group"
          aria-labelledby={labelId}
        >
          <title id={labelId}>{summary}</title>

          {showRange
            ? bands.map((band, index) => (
                <g key={`band-${index}`}>
                  {typeof band.low === 'number' && typeof band.high === 'number' ? (
                    <rect
                      x={x(band.from)}
                      y={y(band.high)}
                      width={Math.max(0, x(band.to) - x(band.from))}
                      height={Math.max(1, y(band.low) - y(band.high))}
                      fill="var(--chart-band)"
                    />
                  ) : null}
                  {[band.low, band.high].map((bound, edge) =>
                    typeof bound === 'number' ? (
                      <line
                        key={edge}
                        x1={x(band.from)}
                        x2={x(band.to)}
                        y1={y(bound)}
                        y2={y(bound)}
                        stroke="var(--chart-band-edge)"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                      />
                    ) : null,
                  )}
                </g>
              ))
            : null}

          {/* Bounds are labelled from the newest measurement's range only.
              Labelling every segment's would stack numbers on top of each
              other the moment a laboratory changed its interval. */}
          {showRange && latestBand
            ? [latestBand.low, latestBand.high].map((bound, edge) =>
                typeof bound === 'number' ? (
                  <text
                    key={edge}
                    x={PAD.left - 6}
                    y={y(bound) + 4}
                    fontSize="10"
                    textAnchor="end"
                    fill="var(--color-text-muted)"
                  >
                    {bound}
                  </text>
                ) : null,
              )
            : null}

          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={height - PAD.bottom}
            y2={height - PAD.bottom}
            stroke="var(--chart-axis)"
            strokeWidth="1"
          />

          {visible.length > 1 ? (
            <polyline
              points={visible.map((entry) => `${x(entry.at)},${y(entry.point.value)}`).join(' ')}
              fill="none"
              stroke="var(--chart-line)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {/* The drag surface sits under the points so it never swallows a
              click meant for one. */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => setDrag(null)}
          />

          {drag ? (
            <rect
              x={Math.min(x(drag.from), x(drag.to))}
              y={PAD.top}
              width={Math.abs(x(drag.to) - x(drag.from))}
              height={plotHeight}
              fill="var(--chart-band-edge)"
              opacity="0.25"
              pointerEvents="none"
            />
          ) : null}

          {visible.map((entry, index) => {
            const status = entry.point.status;
            const colour =
              status === 'critical'
                ? 'var(--chart-point-critical)'
                : status === 'high' || status === 'low'
                  ? 'var(--feedback-warning-ink)'
                  : 'var(--chart-line)';
            const isActive = active === index;

            return (
              <g
                key={entry.point.id}
                data-point={index}
                data-active={isActive || undefined}
                className="variable-chart-point"
                role="button"
                tabIndex={0}
                aria-label={t('variableChart.pointLabel', {
                  name,
                  date: formatObservedLongDate(new Date(entry.at), locale),
                  value: entry.point.unit
                    ? `${entry.point.value} ${entry.point.unit}`
                    : String(entry.point.value),
                  status: present(RESULT_STATUS[status], locale).label,
                })}
                aria-expanded={isActive && pinned}
                onPointerEnter={() => {
                  if (!pinned) setActive(index);
                }}
                onFocus={() => {
                  if (!pinned) setActive(index);
                }}
                onClick={() => open(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open(index);
                  }
                }}
              >
                {/* An invisible target, because a 5px circle is not a hit area
                    a finger or a shaky hand can land on. */}
                <circle cx={x(entry.at)} cy={y(entry.point.value)} r={14} fill="transparent" />
                <circle
                  cx={x(entry.at)}
                  cy={y(entry.point.value)}
                  r={isActive ? 6 : 4}
                  fill={isActive ? colour : 'var(--panel-bg)'}
                  stroke={colour}
                  strokeWidth="2"
                />
              </g>
            );
          })}

          <text x={PAD.left} y={height - 8} fontSize="10" fill="var(--color-text-muted)">
            {formatObservedDate(new Date(view.from), locale)}
          </text>
          <text
            x={WIDTH - PAD.right}
            y={height - 8}
            fontSize="10"
            textAnchor="end"
            fill="var(--color-text-muted)"
          >
            {formatObservedDate(new Date(view.to), locale)}
          </text>
        </svg>

        {activePoint ? (
          <div
            ref={tooltipRef}
            className="variable-chart-tip"
            data-pinned={pinned || undefined}
            tabIndex={-1}
            style={{
              left: `${(x(activePoint.at) / WIDTH) * 100}%`,
              top: `${(y(activePoint.point.value) / height) * 100}%`,
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') close(active ?? undefined);
            }}
          >
            <div className="variable-chart-tip-date">
              {formatObservedLongDate(new Date(activePoint.at), locale)}
            </div>
            <div className="variable-chart-tip-value">
              {activePoint.point.rawValue || activePoint.point.value}
              {activePoint.point.unit ? (
                <span className="variable-chart-tip-unit">{activePoint.point.unit}</span>
              ) : null}
            </div>
            <ResultStatusBadge status={activePoint.point.status} />
            <div className="faint" style={{ fontSize: 11 }}>
              {rangeLine(activePoint.point, locale, t)}
            </div>
            {/* The report is the evidence for the number above it, so the way
                to it is part of the answer rather than a nicety. */}
            <Link to={`/reports/${activePoint.point.reportId}`} className="variable-chart-tip-link">
              <Icon name="file-text" size={13} />{' '}
              {activePoint.point.reportFileName || t('variableChart.openReport')}
            </Link>
          </div>
        ) : null}
      </div>

      <div className="variable-chart-foot">
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {t('variableChart.zoomHint')}
        </p>
        {zoom ? <ResetZoom onReset={() => setZoom(null)} label={t('variableChart.resetZoom')} /> : null}
      </div>
    </div>
  );
}

function ResetZoom({ onReset, label }: { onReset: () => void; label: string }) {
  return (
    <Button variant="ghost" icon="arrows-out-simple" onClick={onReset}>
      {label}
    </Button>
  );
}

/** "Range on this report 3.5–5.1 · general reference, not lab-specific". */
function rangeLine(
  point: NumericMeasurement,
  locale: Locale,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const range = formatReferenceRange(point.referenceRange, locale);
  if (!range.text) return t('variableChart.noRangeOnReport');
  return [t('variableChart.rangeOnReport', { range: range.text }), range.note]
    .filter(Boolean)
    .join(' · ');
}
