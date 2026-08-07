import { Icon } from './Icon';

export interface SpinnerProps {
  label?: string;
  size?: number;
}

/** An indeterminate busy indicator that announces itself. */
export function Spinner({ label = 'Loading', size = 20 }: SpinnerProps) {
  return (
    <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Icon name="circle-notch" size={size} spin />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Used by route guards while the persisted session is still resolving. */
export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        gap: 12,
      }}
    >
      <Spinner label={label} size={32} />
    </div>
  );
}
