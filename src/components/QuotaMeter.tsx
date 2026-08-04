import { formatBytes, type QuotaState } from '@/domain/quotas';
import { Icon } from './Icon';

export interface QuotaMeterProps {
  label: string;
  state: QuotaState;
  /** Shown under the bar, e.g. "12 of 400 uploads used this month". */
  detail?: string;
  compact?: boolean;
}

/**
 * Storage quota meter (spec §79).
 *
 * A `<meter>` element rather than a styled `<div>`: the browser and assistive
 * tech already understand "a measurement within a known range", including the
 * notion of a value being in its high/optimum band, and re-implementing that
 * with ARIA would be strictly worse.
 *
 * The visible text carries the numbers too — the fill level is reinforcement,
 * never the only way to read the value.
 */
export function QuotaMeter({ label, state, detail, compact = false }: QuotaMeterProps) {
  const tone = state.isFull ? 'danger' : state.isWarning ? 'warning' : 'normal';
  const percent = Math.round(state.fraction * 100);

  return (
    <div className="quota-meter" data-tone={tone} data-compact={compact || undefined}>
      <div className="quota-meter-head">
        <span className="quota-meter-label">
          {state.isFull || state.isWarning ? (
            <Icon name={state.isFull ? 'warning-octagon' : 'warning'} size={14} />
          ) : null}
          {label}
        </span>
        <span className="quota-meter-value">
          {formatBytes(state.usedBytes)} of {formatBytes(state.limitBytes)}
        </span>
      </div>

      <meter
        className="quota-meter-bar"
        min={0}
        max={state.limitBytes}
        value={state.usedBytes}
        low={state.limitBytes * 0.8}
        high={state.limitBytes * 0.95}
        optimum={0}
        aria-label={`${label}: ${percent}% used`}
      >
        {percent}%
      </meter>

      <div className="quota-meter-detail">
        {detail ??
          (state.isFull
            ? 'Full. Delete a report you no longer need to free space.'
            : `${formatBytes(state.remainingBytes)} remaining`)}
      </div>
    </div>
  );
}
