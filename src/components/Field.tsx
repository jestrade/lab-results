/**
 * Form primitives (KAN-39, KAN-25).
 *
 * The accessible-form pattern lives here rather than in each page: label tied
 * to control by id, error text wired through `aria-describedby`, `aria-invalid`
 * set on the control, and the error announced politely when it appears. Pages
 * that use `<Field>` get all of that without having to remember it.
 */

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { Icon } from './Icon';

export interface FieldProps {
  label: ReactNode;
  /** Validation message. Its presence is what marks the control invalid. */
  error?: string | null;
  /** Always-visible guidance shown under the control. */
  hint?: ReactNode;
  /** Rendered on the label row, right-aligned — e.g. a "Forgot password?" link. */
  aside?: ReactNode;
  children: (props: {
    id: string;
    'aria-invalid': boolean | undefined;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}

export function Field({ label, error, hint, aside, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="field">
      {aside ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <label htmlFor={id} style={{ flex: 1 }}>
            {label}
          </label>
          {aside}
        </div>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}

      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}

      {hint ? (
        <div id={hintId} style={{ fontSize: 12, marginTop: 5 }} className="muted">
          {hint}
        </div>
      ) : null}

      {error ? (
        <div
          id={errorId}
          role="alert"
          style={{
            fontSize: 12,
            marginTop: 5,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            color: 'var(--feedback-danger-ink)',
          }}
        >
          <Icon name="warning-circle" size={14} />
          {error}
        </div>
      ) : null}
    </div>
  );
}

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

export function TextInput({ className, ...rest }: TextInputProps) {
  return <input {...rest} className={['input', className].filter(Boolean).join(' ')} />;
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  children: ReactNode;
}

/**
 * Broadsheet styles checkboxes by hiding the native input and painting a
 * sibling `.dot`. The input itself stays in the DOM and in the tab order, so
 * it is still a real checkbox to the keyboard and to assistive tech — only its
 * pixels are replaced.
 */
export function Checkbox({ children, className, ...rest }: CheckboxProps) {
  return (
    <label className={['radio', 'checkbox', className].filter(Boolean).join(' ')}>
      <input type="checkbox" {...rest} />
      <span className="dot" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}
