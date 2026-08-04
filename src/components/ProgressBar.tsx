export interface ProgressBarProps {
  /** 0–100. Omit for an indeterminate bar. */
  value?: number;
  label: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const clamped = value === undefined ? undefined : Math.max(0, Math.min(100, value));

  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={clamped === undefined ? undefined : 0}
      aria-valuemax={clamped === undefined ? undefined : 100}
      aria-valuetext={clamped === undefined ? 'Working' : `${clamped}%`}
    >
      <div className="progress-fill" style={{ width: `${clamped ?? 100}%` }} />
    </div>
  );
}
