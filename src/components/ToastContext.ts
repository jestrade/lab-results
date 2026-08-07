import { createContext } from 'react';

import type { AlertTone } from './Alert';

export interface Toast {
  id: string;
  tone: AlertTone;
  message: string;
}

export interface ToastContextValue {
  toasts: Toast[];
  /** Shows a toast. Returns its id so a long-running one can be dismissed. */
  push: (message: string, tone?: AlertTone) => string;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
