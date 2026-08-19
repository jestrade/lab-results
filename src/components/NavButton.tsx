import { useTransition, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, type ButtonVariant } from './Button';
import { useDelayedPending } from '@/hooks/useDelayedPending';
import { useT } from '@/i18n/useI18n';

export interface NavButtonProps {
  to: string;
  variant?: ButtonVariant;
  icon?: string;
  block?: boolean;
  children: ReactNode;
}

/**
 * A button that navigates, and admits it when the navigation takes a moment.
 *
 * The auth entry points — "Sign in", "Create free account" — used to be plain
 * links. Clicking one is a synchronous render today, so the honest amount of
 * loading to show is none, and this shows none: `useDelayedPending` holds the
 * spinner back until the wait has lasted long enough to be worth reading, and
 * an instant navigation never gets there.
 *
 * What it does give is the click landing somewhere. `startTransition` marks the
 * navigation non-urgent, so React keeps this button interactive and reports
 * `isPending` while the next screen renders — which is what turns a slow route
 * into a spinner *by itself*, without anybody remembering to add one when
 * these routes are eventually code-split.
 *
 * A real `<button>` rather than a styled link, because that is what it now is:
 * something that runs a transition. Anything that should behave like a link —
 * middle-click, copy address, open in a new tab — should stay a `ButtonLink`.
 */
export function NavButton({ to, variant = 'secondary', icon, block, children }: NavButtonProps) {
  const navigate = useNavigate();
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const showSpinner = useDelayedPending(isPending);

  return (
    <Button
      variant={variant}
      icon={icon}
      block={block}
      loading={showSpinner}
      loadingLabel={t('common.loading')}
      onClick={() => startTransition(() => navigate(to))}
    >
      {children}
    </Button>
  );
}
