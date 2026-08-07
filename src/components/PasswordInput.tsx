import { useState, type InputHTMLAttributes } from 'react';

import { useT } from '@/i18n/useI18n';
import { Icon } from './Icon';

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * A password field with a reveal toggle.
 *
 * The toggle is a real `<button>` with an accessible name that changes with
 * its state, not an icon glued on top of the input — a sighted mouse user and
 * a keyboard user get the same control.
 */
export function PasswordInput({ className, ...rest }: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  const t = useT();

  return (
    <div style={{ position: 'relative' }}>
      <input
        {...rest}
        type={revealed ? 'text' : 'password'}
        className={['input', className].filter(Boolean).join(' ')}
        style={{ paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={() => setRevealed((current) => !current)}
        aria-pressed={revealed}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 0,
          cursor: 'pointer',
          padding: 6,
          lineHeight: 1,
          color: 'var(--color-text-muted)',
        }}
      >
        <Icon name={revealed ? 'eye-slash' : 'eye'} size={18} />
        <span className="sr-only">{t(revealed ? 'password.hide' : 'password.show')}</span>
      </button>
    </div>
  );
}
