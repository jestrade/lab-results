import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { toAuthErrorMessage } from '@/auth/authErrors';
import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { AuthLayout } from '@/layouts/AuthLayout';

const RESEND_SECONDS = 45;

export function ForgotPassword() {
  const { sendPasswordReset } = useAuth();

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
        setError(toAuthErrorMessage(caught).message);
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
      <AuthLayout heading="Your laboratory results, finally in one place.">
        <div className="auth-form">
          <div className="kicker">Link sent</div>
          <Icon name="paper-plane-tilt" size={44} className="empty-state-icon" />
          <div>
            <h2>Check your email</h2>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.7 }}>
              If an account exists for <strong style={{ color: 'var(--color-text)' }}>{email}</strong>, a
              reset link is on its way. The link expires in one hour.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              disabled={cooldown > 0}
              loading={submitting}
              loadingLabel="Sending…"
              onClick={() => void sendLink()}
            >
              {cooldown > 0 ? `Resend in 0:${String(cooldown).padStart(2, '0')}` : 'Resend link'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSent(false);
                setEmail('');
              }}
            >
              Use a different email
            </Button>
          </div>
          <p className="legal-note">We don&rsquo;t confirm whether an address is registered.</p>
          <Link to="/sign-in" style={{ fontSize: 13 }}>
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout heading="Your laboratory results, finally in one place.">
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="kicker">Forgot password</div>
        <div>
          <h2>Reset your password</h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
            Enter the email you signed up with and we&rsquo;ll send a link to set a new password.
          </p>
        </div>

        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}

        <Field label="Email address">
          {(props) => (
            <TextInput
              {...props}
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
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
          loadingLabel="Sending…"
          style={{ height: 46 }}
        >
          Send reset link
        </Button>

        <Link to="/sign-in" style={{ fontSize: 13 }}>
          Back to sign in
        </Link>
      </form>
    </AuthLayout>
  );
}
