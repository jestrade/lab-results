import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { toAuthErrorMessage, type AuthErrorMessage } from '@/auth/authErrors';
import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Checkbox, Field, TextInput } from '@/components/Field';
import { GoogleButton } from '@/components/GoogleButton';
import { PasswordInput } from '@/components/PasswordInput';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Trans } from '@/i18n/Trans';
import { useI18n } from '@/i18n/useI18n';
import type { MessageKey } from '@/i18n/messages';

const ASIDE_POINTS: { icon: string; title: MessageKey; body: MessageKey }[] = [
  { icon: 'file-pdf', title: 'signIn.aside.uploadTitle', body: 'signIn.aside.uploadBody' },
  { icon: 'chart-line-up', title: 'signIn.aside.trackTitle', body: 'signIn.aside.trackBody' },
  { icon: 'sparkle', title: 'signIn.aside.contextTitle', body: 'signIn.aside.contextBody' },
];

interface LocationState {
  from?: { pathname: string };
}

export function SignIn() {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, locale } = useI18n();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<AuthErrorMessage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  // Guards stash the page the user was trying to reach; send them back there.
  const destination = (location.state as LocationState | null)?.from?.pathname ?? '/dashboard';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      navigate(destination, { replace: true });
    } catch (caught) {
      setError(toAuthErrorMessage(caught, locale));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setGooglePending(true);
    try {
      await signInWithGoogle();
      navigate(destination, { replace: true });
    } catch (caught) {
      setError(toAuthErrorMessage(caught, locale));
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <AuthLayout
      heading={t('signIn.asideHeading')}
      points={ASIDE_POINTS.map((point) => ({
        icon: point.icon,
        title: t(point.title),
        body: t(point.body),
      }))}
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div>
          <h2>{t('common.signIn')}</h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
            <Trans
              id="signIn.newHere"
              values={{ link: <Link to="/register">{t('signIn.createAccountLink')}</Link> }}
            />
          </p>
        </div>

        <GoogleButton
          onClick={handleGoogle}
          label={t('signIn.continueWithGoogle')}
          loading={googlePending}
        />

        <div className="divider-text">{t('signIn.orEmail')}</div>

        {error ? (
          <Alert tone="danger" live>
            {error.message}
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Field
          label={t('signIn.password')}
          aside={
            <Link to="/forgot-password" style={{ fontSize: 12 }}>
              {t('signIn.forgotPassword')}
            </Link>
          }
        >
          {(props) => (
            <PasswordInput
              {...props}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        {/* Firebase persists the session in local storage by default, which is
            what "keep me signed in" means here. Unticking it is handled by the
            session-persistence work in KAN-2's follow-up; the control is shown
            because the design specifies it and it reflects current behaviour. */}
        <Checkbox defaultChecked name="persist">
          {t('signIn.keepSignedIn')}
        </Checkbox>

        <Button
          type="submit"
          variant="primary"
          block
          loading={submitting}
          loadingLabel={t('signIn.signingIn')}
          style={{ height: 48, fontSize: 15 }}
        >
          {t('common.signIn')}
        </Button>

        <p className="legal-note">
          <Trans
            id="signIn.legal"
            values={{
              terms: <Link to="/legal/terms">{t('public.legal.terms')}</Link>,
              privacy: <Link to="/legal/privacy">{t('public.legal.privacy')}</Link>,
              ai: <Link to="/legal/ai-processing">{t('public.legal.aiProcessing')}</Link>,
            }}
          />
        </p>
      </form>
    </AuthLayout>
  );
}
