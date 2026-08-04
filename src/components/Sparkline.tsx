import { sparklinePath } from '@/domain/variables';
import type { ResultStatus, VariableSeries } from '@/domain/types';

const STATUS_STROKE: Record<ResultStatus, string> = {
  normal: 'var(--color-neutral-700)',
  low: 'var(--color-accent)',
  high: 'var(--feedback-warning-ink)',
  critical: 'var(--chart-point-critical)',
  unknown: 'var(--color-neutral-500)',
};

export interface SparklineProps {
  series: VariableSeries;
  /** Sentence read in place of the chart. Required — see below. */
  description: string;
  height?: number;
}

/**
 * A thumbnail of one variable's history (KAN-45).
 *
 * `description` is not optional, and the SVG carries it as `role="img"` with an
 * `aria-label`. A chart with no text equivalent is simply missing for anyone
 * who cannot see it, and the spec (§60) and KAN-53 both require the
 * alternative. Making the prop mandatory is cheaper than remembering.
 *
 * Deliberately unlabelled otherwise: no axes, no gridlines, no values. At
 * 120x32 those would be unreadable, and a chart that looks precise but is not
 * invites conclusions the data cannot support. Precision lives on the variable
 * detail page.
 */
export function Sparkline({ series, description, height = 32 }: SparklineProps) {
  const points = sparklinePath(series);

  if (points.length === 0) {
    return (
      <div className="sparkline-empty" style={{ height }}>
        Not enough data for a trend
      </div>
    );
  }

  const width = 120;
  const pad = 4;
  const toX = (x: number) => pad + x * (width - pad * 2);
  const toY = (y: number) => pad + y * (height - pad * 2);
  const stroke = STATUS_STROKE[series.latestStatus];
  const last = points[points.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height }}
      role="img"
      aria-label={description}
    >
      <polyline
        points={points.map((point) => `${toX(point.x)},${toY(point.y)}`).join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={toX(last.x)} cy={toY(last.y)} r="3" fill={stroke} />
    </svg>
  );
}
