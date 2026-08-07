import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { toAuthErrorMessage } from '@/auth/authErrors';
import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Trans } from '@/i18n/Trans';
import { useI18n } from '@/i18n/useI18n';

const RESEND_SECONDS = 45;

export function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const { t, locale } = useI18n();

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  function startCooldown() {
    setCooldown(RESEND_SECONDS);
    const timer = window.setInterval(() => {
      setCooldown((remaining) => {
        if (remaining <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
  }

  function isUserNotFound(caught: unknown): boolean {
    return (
      typeof caught === 'object' &&
      caught !== null &&
      'code' in caught &&
      (caught as { code: string }).code === 'auth/user-not-found'
    );
  }

  async function sendLink() {
    setError(null);
    setSubmitting(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
      startCooldown();
    } catch (caught) {
      // `auth/user-not-found` would confirm whether an address is registered,
      // so an unknown address is treated exactly like a known one. Only real
      // faults — a malformed address, rate limiting, no network — surface.
      if (isUserNotFound(caught)) {
        setSent(true);
        startCooldown();
      } else {
        setError(toAuthErrorMessage(caught, locale).message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await sendLink();
  }

  if (sent) {
    return (
      <AuthLayout heading={t('signIn.asideHeading')}>
        <div className="auth-form">
          <div className="kicker">{t('forgot.sentKicker')}</div>
          <Icon name="paper-plane-tilt" size={44} className="empty-state-icon" />
          <div>
            <h2>{t('forgot.sentHeading')}</h2>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.7 }}>
              <Trans
                id="forgot.sentBody"
                values={{
                  email: <strong style={{ color: 'var(--color-text)' }}>{email}</strong>,
                }}
              />
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              disabled={cooldown > 0}
              loading={submitting}
              loadingLabel={t('forgot.sending')}
              onClick={() => void sendLink()}
            >
              {cooldown > 0
                ? t('forgot.resendIn', { seconds: String(cooldown).padStart(2, '0') })
                : t('forgot.resend')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSent(false);
                setEmail('');
              }}
            >
              {t('forgot.differentEmail')}
            </Button>
          </div>
          <p className="legal-note">{t('forgot.noConfirm')}</p>
          <Link to="/sign-in" style={{ fontSize: 13 }}>
            {t('forgot.backToSignIn')}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout heading={t('signIn.asideHeading')}>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="kicker">{t('forgot.kicker')}</div>
        <div>
          <h2>{t('forgot.heading')}</h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
            {t('forgot.lede')}
          </p>
        </div>

        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}

        <Field label={t('signIn.email')}>
          {(props) => (
            <TextInput
              {...props}
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder={t('register.emailPlaceholder')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Button
          type="submit"
          variant="primary"
          block
          loading={submitting}
          loadingLabel={t('forgot.sending')}
          style={{ height: 46 }}
        >
          {t('forgot.sendLink')}
        </Button>

        <Link to="/sign-in" style={{ fontSize: 13 }}>
          {t('forgot.backToSignIn')}
        </Link>
      </form>
    </AuthLayout>
  );
}
