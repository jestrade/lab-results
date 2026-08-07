import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface CommonProps {
  variant?: ButtonVariant;
  /** Phosphor icon name rendered before the label. */
  icon?: string;
  block?: boolean;
  children: ReactNode;
  className?: string;
}

export interface ButtonProps
  extends CommonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  /** Shows a spinner, disables the control and announces the busy state. */
  loading?: boolean;
  loadingLabel?: string;
}

function classesFor({ variant = 'secondary', block, className }: CommonProps): string {
  return ['btn', `btn-${variant}`, block ? 'btn-block' : '', className]
    .filter(Boolean)
    .join(' ');
}

export function Button({
  variant = 'secondary',
  icon,
  block,
  className,
  loading = false,
  loadingLabel,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classesFor({ variant, block, className, children })}
      // A loading button must not be clickable, but it must stay in the tab
      // order so focus is not dumped to the top of the page mid-submit.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Icon name="circle-notch" size={16} spin /> : icon ? <Icon name={icon} size={16} /> : null}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

export interface ButtonLinkProps extends CommonProps {
  to: string;
  /**
   * Overrides the accessible name. Use when several links share the same
   * visible label and only context distinguishes them — a row of "View
   * details" links, say. Keep the visible text as a prefix of the label, or
   * voice control ("click view details") stops working (WCAG 2.5.3).
   */
  'aria-label'?: string;
}

/** A router link wearing the button's clothes — still a link to assistive tech. */
export function ButtonLink({
  to,
  variant = 'secondary',
  icon,
  block,
  className,
  children,
  'aria-label': ariaLabel,
}: ButtonLinkProps) {
  return (
    <Link to={to} className={classesFor({ variant, block, className, children })} aria-label={ariaLabel}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </Link>
  );
}
