import type { ReactNode } from 'react';

import { Icon } from './Icon';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon = 'ph-tray', title, children, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <Icon name={icon} className="empty-state-icon" />
      <div className="empty-state-title">{title}</div>
      {children ? <p className="empty-state-body">{children}</p> : null}
      {action}
    </div>
  );
}
