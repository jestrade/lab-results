import type { ReactNode } from 'react';

import { Icon } from './Icon';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const TONE_ICON: Record<AlertTone, string> = {
  info: 'ph-info',
  success: 'ph-check-circle',
  warning: 'ph-warning',
  danger: 'ph-warning-circle',
};

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  /**
   * Announce the alert when it appears. Use for errors that result from
   * something the user just did — a rejected sign-in, a failed upload — so a
   * screen-reader user hears it without having to go looking.
   */
  live?: boolean;
  actions?: ReactNode;
}

export function Alert({ tone = 'info', title, children, live = false, actions }: AlertProps) {
  return (
    <div
      className="alert"
      data-tone={tone}
      role={live ? 'alert' : undefined}
      aria-live={live ? 'assertive' : undefined}
    >
      <Icon name={TONE_ICON[tone]} className="alert-icon" />
      <div>
        {title ? <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div> : null}
        <p>{children}</p>
        {actions ? <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>{actions}</div> : null}
      </div>
    </div>
  );
}
