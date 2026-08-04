import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { toAuthErrorMessage } from '@/auth/authErrors';
import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { AuthLayout } from '@/layouts/AuthLayout';

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
      setError(toAuthErrorMessage(caught).message);
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
    <AuthLayout heading="One last step before your first upload.">
      <div className="auth-form">
        <div className="kicker">Email verification</div>
        <Icon name="seal-check" size={44} className="empty-state-icon" />
        <div>
          <h2>Verify your email to upload</h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.7 }}>
            We sent a link to <strong style={{ color: 'var(--color-text)' }}>{user?.email}</strong>. You
            can look around until then, but uploading a report needs a verified address.
          </p>
        </div>

        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}
        {sent ? <Alert tone="success">Verification email sent. It may take a minute to arrive.</Alert> : null}
        {stillUnverified ? (
          <Alert tone="warning" live>
            That address is still unverified. Open the link in the email, then try again.
          </Alert>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={handleResend}>
            Resend verification email
          </Button>
          <Button
            variant="secondary"
            onClick={handleContinue}
            loading={checking}
            loadingLabel="Checking…"
          >
            I have verified — continue
          </Button>
        </div>

        <Alert tone="info">
          Accounts created with Google are verified automatically — no email step.
        </Alert>

        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            Look around first
          </Button>
          <Button variant="ghost" onClick={() => void signOutUser()}>
            Sign out
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
