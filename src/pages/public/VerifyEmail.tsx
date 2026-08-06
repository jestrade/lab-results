import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { toAuthErrorMessage } from '@/auth/authErrors';
import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Trans } from '@/i18n/Trans';
import { useI18n } from '@/i18n/useI18n';

/**
 * Email verification gate (KAN-1).
 *
 * Verification is only required to *upload*; a new user can look around
 * beforehand. That is why this page offers "I have verified — continue"
 * rather than trapping the session: it re-reads the ID token on demand,
 * because Firebase does not push the verified flag to an open tab.
 */
export function VerifyEmail() {
  const { user, isEmailVerified, resendVerification, refresh, signOutUser } = useAuth();
  const navigate = useNavigate();
  const { t, locale } = useI18n();

  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [stillUnverified, setStillUnverified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    setError(null);
    try {
      await resendVerification();
      setSent(true);
    } catch (caught) {
      setError(toAuthErrorMessage(caught, locale).message);
    }
  }

  async function handleContinue() {
    setChecking(true);
    setStillUnverified(false);
    try {
      await refresh();
      if (isEmailVerified) navigate('/upload', { replace: true });
      else setStillUnverified(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <AuthLayout heading={t('verify.asideHeading')}>
      <div className="auth-form">
        <div className="kicker">{t('verify.kicker')}</div>
        <Icon name="seal-check" size={44} className="empty-state-icon" />
        <div>
          <h2>{t('verify.heading')}</h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.7 }}>
            <Trans
              id="verify.body"
              values={{
                email: <strong style={{ color: 'var(--color-text)' }}>{user?.email}</strong>,
              }}
            />
          </p>
        </div>

        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}
        {sent ? <Alert tone="success">{t('verify.sent')}</Alert> : null}
        {stillUnverified ? (
          <Alert tone="warning" live>
            {t('verify.stillUnverified')}
          </Alert>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={handleResend}>
            {t('verify.resend')}
          </Button>
          <Button
            variant="secondary"
            onClick={handleContinue}
            loading={checking}
            loadingLabel={t('verify.checking')}
          >
            {t('verify.continue')}
          </Button>
        </div>

        <Alert tone="info">{t('verify.googleNote')}</Alert>

        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            {t('verify.lookAround')}
          </Button>
          <Button variant="ghost" onClick={() => void signOutUser()}>
            {t('common.signOut')}
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
