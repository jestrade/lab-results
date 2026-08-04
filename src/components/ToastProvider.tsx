/**
 * Transient notifications (KAN-39, KAN-25).
 *
 * The live region is rendered once, always present and always empty-or-not
 * rather than mounted on demand — a region that appears at the same moment as
 * its content is usually not announced at all. `role="status"` keeps
 * announcements polite; errors that must interrupt use `<Alert live>` at the
 * point of failure instead.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { Icon } from './Icon';
import { ToastContext, type Toast } from './ToastContext';
import type { AlertTone } from './Alert';

const DISMISS_AFTER_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: AlertTone = 'info') => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, tone, message }]);
      window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast" data-tone={toast.tone}>
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              type="button"
              className="toast-dismiss"
              onClick={() => dismiss(toast.id)}
            >
              <Icon name="x" size={14} />
              <span className="sr-only">Dismiss notification</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
